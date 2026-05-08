import { afterEach, describe, expect, it } from 'bun:test';

import { shouldCommitTranslationState } from '../assistantTranslationState';
import { isAutoTranslationEffectivelyEnabled, isTranslationConfigured } from '../assistantTranslationSettings';
import { abortSessionTranslations, clearTranslationAbortControllers, registerAbortController } from '../assistantTranslationAbort';
import * as translationCache from '../translationCache';
import { cancelSession, clearTranslationQueue, scheduleTranslation } from '../translationQueue';

describe('AssistantTextPart translation state guards', () => {
  it('commits translation state only for the current cache key', () => {
    expect(shouldCommitTranslationState('message:part:settings:5:hello', 'message:part:settings:5:hello')).toBe(true);
    expect(shouldCommitTranslationState('message:part:settings:7:updated', 'message:part:settings:5:hello')).toBe(false);
    expect(shouldCommitTranslationState(undefined, 'message:part:settings:5:hello')).toBe(false);
  });
});

describe('AssistantTextPart translation settings guards', () => {
  const configuredSettings = {
    enabled: true,
    targetLanguage: 'Vietnamese',
    providerID: 'anthropic',
    modelID: 'claude-sonnet-4',
  };

  it('treats legacy enabled translation without autoTranslate as automatic', () => {
    expect(isTranslationConfigured(configuredSettings)).toBe(true);
    expect(isAutoTranslationEffectivelyEnabled(configuredSettings)).toBe(true);
  });

  it('preserves explicit manual mode', () => {
    expect(isTranslationConfigured({ ...configuredSettings, autoTranslate: false })).toBe(true);
    expect(isAutoTranslationEffectivelyEnabled({ ...configuredSettings, autoTranslate: false })).toBe(false);
  });
});

describe('translation cache LRU', () => {
  afterEach(() => {
    translationCache.clear();
  });

  it('evicts the least recently used entry when entry count exceeds the limit', () => {
    for (let index = 0; index < 200; index += 1) {
      translationCache.set(`key-${index}`, { status: 'success', translatedText: `value-${index}`, showOriginal: false });
    }

    translationCache.set('key-200', { status: 'success', translatedText: 'value-200', showOriginal: false });

    expect(translationCache.getEntryCount()).toBe(200);
    expect(translationCache.has('key-0')).toBe(false);
    expect(translationCache.has('key-200')).toBe(true);
  });

  it('refreshes LRU order on cache hit', () => {
    for (let index = 0; index < 200; index += 1) {
      translationCache.set(`key-${index}`, { status: 'success', translatedText: `value-${index}`, showOriginal: false });
    }

    expect(translationCache.get('key-0')?.translatedText).toBe('value-0');
    translationCache.set('key-200', { status: 'success', translatedText: 'value-200', showOriginal: false });

    expect(translationCache.has('key-0')).toBe(true);
    expect(translationCache.has('key-1')).toBe(false);
  });

  it('evicts entries when byte budget is exceeded', () => {
    translationCache.set('large-a', { status: 'success', translatedText: 'a'.repeat(3 * 1024 * 1024), showOriginal: false });
    translationCache.set('large-b', { status: 'success', translatedText: 'b'.repeat(3 * 1024 * 1024), showOriginal: false });

    expect(translationCache.getApproxBytesTotal()).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(translationCache.has('large-a')).toBe(false);
    expect(translationCache.has('large-b')).toBe(true);
  });

  it('preserves loading entries during eviction', () => {
    translationCache.set('loading', { status: 'loading', showOriginal: false });
    translationCache.set('complete', { status: 'success', translatedText: 'c'.repeat(3 * 1024 * 1024), showOriginal: false });
    translationCache.set('new', { status: 'success', translatedText: 'n'.repeat(3 * 1024 * 1024), showOriginal: false });

    expect(translationCache.has('loading')).toBe(true);
    expect(translationCache.has('complete')).toBe(false);
    expect(translationCache.has('new')).toBe(true);
  });
});

describe('translation in-flight deduplication', () => {
  afterEach(() => {
    translationCache.clear();
  });

  it('shares promises for the same key and keeps different keys independent', async () => {
    const promise = Promise.resolve('xin chao');
    let resolveOther;
    const otherPromise = new Promise((resolve) => {
      resolveOther = resolve;
    });

    translationCache.setInflight('same', promise);
    translationCache.setInflight('other', otherPromise);

    expect(translationCache.getInflight('same')).toBe(promise);
    expect(translationCache.getInflight('other')).toBe(otherPromise);

    await promise;
    await Promise.resolve();

    expect(translationCache.getInflight('same')).toBeUndefined();
    expect(translationCache.getInflight('other')).toBe(otherPromise);
    resolveOther('bonjour');
    await otherPromise;
  });

  it('clears rejected promises on completion', async () => {
    const promise = Promise.reject(new Error('failed'));
    translationCache.setInflight('failed', promise);

    await promise.catch(() => undefined);
    await Promise.resolve();

    expect(translationCache.getInflight('failed')).toBeUndefined();
  });
});

describe('translation stagger queue', () => {
  afterEach(() => {
    clearTranslationQueue();
  });

  it('schedules session requests with incremental delays', async () => {
    const calls = [];
    scheduleTranslation('session-a', 'key-1', () => calls.push('key-1'));
    scheduleTranslation('session-a', 'key-2', () => calls.push('key-2'));
    scheduleTranslation('session-a', 'key-3', () => calls.push('key-3'));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual(['key-1']);

    await new Promise((resolve) => setTimeout(resolve, 310));
    expect(calls).toEqual(['key-1', 'key-2']);

    await new Promise((resolve) => setTimeout(resolve, 310));
    expect(calls).toEqual(['key-1', 'key-2', 'key-3']);
  });

  it('cancels pending session timers', async () => {
    const calls = [];
    scheduleTranslation('session-a', 'key-1', () => calls.push('key-1'));
    scheduleTranslation('session-a', 'key-2', () => calls.push('key-2'));
    cancelSession('session-a');

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toEqual([]);
  });

  it('supports cancelling a single scheduled request', async () => {
    const calls = [];
    const cancel = scheduleTranslation('session-a', 'key-1', () => calls.push('key-1'));
    cancel();

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toEqual([]);
  });
});

describe('translation abort scoping', () => {
  afterEach(() => {
    clearTranslationAbortControllers();
  });

  it('keeps sibling translations running when one component unmounts', () => {
    const first = new AbortController();
    const second = new AbortController();
    const unregisterFirst = registerAbortController('session-a', first);
    registerAbortController('session-a', second);

    first.abort();
    unregisterFirst();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('aborts all in-flight translations for the previous session on session switch', () => {
    const first = new AbortController();
    const second = new AbortController();
    const nextSession = new AbortController();
    registerAbortController('session-a', first);
    registerAbortController('session-a', second);
    registerAbortController('session-b', nextSession);

    abortSessionTranslations('session-a');

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(nextSession.signal.aborted).toBe(false);
  });
});
