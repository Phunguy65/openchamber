import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  DEFAULT_CHAT_TRANSLATION_PROMPT,
  buildChatTranslationPrompt,
  createCountingSemaphore,
  registerChatTranslationRoutes,
  translateWithOpenCode,
  validateChatTranslationRequest,
} from './routes.js';
import { registerCommonRequestMiddleware } from '../opencode/core-routes.js';

const enabledSettings = {
  enabled: true,
  targetLanguage: 'Vietnamese',
  providerID: 'anthropic',
  modelID: 'claude-sonnet-4',
};

const translationRequest = {
  ok: true,
  text: '**Hello**',
  targetLanguage: 'Vietnamese',
  providerID: 'anthropic',
  modelID: 'claude-sonnet-4',
  systemPrompt: 'Translate to Vietnamese.\n\nTarget language: Vietnamese',
};

const jsonResponse = (payload, init = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: vi.fn(async () => payload),
  text: vi.fn(async () => typeof payload === 'string' ? payload : JSON.stringify(payload)),
});

const expectSessionCreationRequest = (options) => {
  expect(options).toMatchObject({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      authorization: 'Bearer test-token',
    },
  });
  expect(JSON.parse(options.body)).toEqual({ title: 'Chat Translation' });
};

const createOpenCodeFetch = ({ messages, promptResponse = {}, sessionResponse = { id: 'translation-session' } }) => {
  const fetchImpl = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/session' && options.method === 'POST') {
      expectSessionCreationRequest(options);
      return jsonResponse(sessionResponse);
    }
    if (path === '/session/translation-session/prompt_async' && options.method === 'POST') {
      return jsonResponse(promptResponse);
    }
    if (path === '/session/translation-session/message' && options.method === 'GET') {
      const nextMessages = typeof messages === 'function' ? messages() : messages;
      return jsonResponse(nextMessages);
    }
    if (path === '/session/translation-session' && options.method === 'DELETE') {
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
  });

  return fetchImpl;
};

const assistantMessages = (parts) => ({
  data: [
    {
      info: {
        role: 'assistant',
        finish: 'stop',
      },
      parts,
    },
  ],
});

const translate = (overrides) => translateWithOpenCode({
  buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
  getOpenCodeAuthHeaders: () => ({ authorization: 'Bearer test-token' }),
  request: translationRequest,
  pollIntervalMs: 0,
  timeoutMs: 1,
  sleepImpl: vi.fn(async () => {}),
  ...overrides,
});

describe('chat translation backend', () => {
  it('builds a default prompt that preserves technical markdown content', () => {
    const prompt = buildChatTranslationPrompt({ targetLanguage: 'Vietnamese' });

    expect(prompt).toContain(DEFAULT_CHAT_TRANSLATION_PROMPT);
    expect(prompt).toContain('Target language: Vietnamese');
    expect(prompt).toContain('fenced code blocks');
    expect(prompt).toContain('inline code');
    expect(prompt).toContain('commands');
    expect(prompt).toContain('URLs');
    expect(prompt).toContain('file paths');
    expect(prompt).toContain('technical');
  });

  it('uses a custom prompt override when provided', () => {
    expect(buildChatTranslationPrompt({ targetLanguage: 'French', systemPrompt: 'Translate as a senior engineer.' })).toBe(
      'Translate as a senior engineer.\n\nTarget language: French'
    );
  });

  it('validates enabled settings and normalized request fields', () => {
    expect(validateChatTranslationRequest({ text: ' Hello ', settings: enabledSettings })).toMatchObject({
      ok: true,
      text: 'Hello',
      targetLanguage: 'Vietnamese',
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4',
    });
  });

  it('rejects disabled, unconfigured, and oversized translation requests', () => {
    expect(validateChatTranslationRequest({ text: 'Hello', settings: { enabled: false } })).toMatchObject({
      ok: false,
      code: 'translation_disabled',
    });
    expect(validateChatTranslationRequest({ text: 'Hello', settings: { enabled: true, targetLanguage: 'Vietnamese' } })).toMatchObject({
      ok: false,
      code: 'missing_model',
    });
    expect(validateChatTranslationRequest({ text: 'x'.repeat(80_001), settings: enabledSettings })).toMatchObject({
      ok: false,
      code: 'invalid_text',
    });
  });

  it('returns deterministic route errors without invoking translation when disabled', async () => {
    const handlers = new Map();
    const app = { post: (path, ...handlersForPath) => handlers.set(path, handlersForPath.at(-1)) };
    const translate = vi.fn();
    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: { enabled: false } }),
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      translate,
    });

    const status = vi.fn(() => res);
    const json = vi.fn(() => res);
    const res = { status, json };
    await handlers.get('/api/chat/translate')({ body: { text: 'Hello' } }, res);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ error: 'Chat translation is disabled.', code: 'translation_disabled' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('returns translated markdown from the route', async () => {
    const handlers = new Map();
    const app = { post: (path, ...handlersForPath) => handlers.set(path, handlersForPath.at(-1)) };
    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      translate: async () => '**Xin chào**',
    });

    const json = vi.fn(() => res);
    const res = { json };
    await handlers.get('/api/chat/translate')({ body: { text: '**Hello**' } }, res);

    expect(json).toHaveBeenCalledWith({ translatedText: '**Xin chào**' });
  });

  it('parses JSON bodies for /api/chat routes before validating translation text', async () => {
    const app = express();
    const translate = vi.fn(async ({ request: translationRequest }) => {
      expect(translationRequest.text).toBe('hello');
      return 'xin chao';
    });

    registerCommonRequestMiddleware(app, { express });
    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      express,
      translate,
    });

    const response = await request(app)
      .post('/api/chat/translate')
      .send({ text: 'hello' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ translatedText: 'xin chao' });
    expect(response.body.code).not.toBe('invalid_text');
    expect(translate).toHaveBeenCalledOnce();
  });

  it('rejects oversized translation bodies before invoking translation', async () => {
    const app = express();
    const translate = vi.fn(async () => 'xin chao');

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      express,
      translate,
    });

    const response = await request(app)
      .post('/api/chat/translate')
      .send({ text: 'x'.repeat(210 * 1024) });

    expect(response.status).toBe(413);
    expect(translate).not.toHaveBeenCalled();
  });

  it('limits semaphore acquisitions and resumes queued work in FIFO order', async () => {
    const semaphore = createCountingSemaphore(4);
    const firstReleases = await Promise.all([semaphore.acquire(), semaphore.acquire(), semaphore.acquire(), semaphore.acquire()]);
    const order = [];
    const fifth = semaphore.acquire().then((release) => {
      order.push('fifth');
      return release;
    });
    const sixth = semaphore.acquire().then((release) => {
      order.push('sixth');
      return release;
    });

    expect(semaphore.active).toBe(4);
    expect(semaphore.queued).toBe(2);

    firstReleases[0]();
    const fifthRelease = await fifth;
    expect(order).toEqual(['fifth']);
    expect(semaphore.active).toBe(4);
    expect(semaphore.queued).toBe(1);

    firstReleases[1]();
    const sixthRelease = await sixth;
    expect(order).toEqual(['fifth', 'sixth']);

    firstReleases[2]();
    firstReleases[3]();
    fifthRelease();
    sixthRelease();
    expect(semaphore.active).toBe(0);
  });

  it('releases semaphore slots after failed work', async () => {
    const semaphore = createCountingSemaphore(1);
    const release = await semaphore.acquire();
    const queued = semaphore.acquire();

    try {
      throw new Error('translation failed');
    } catch {
      release();
    }

    const nextRelease = await queued;
    expect(semaphore.active).toBe(1);
    expect(semaphore.queued).toBe(0);
    nextRelease();
  });

  it('creates a temporary session, prompts through prompt_async, polls messages, and returns assistant text', async () => {
    const fetchImpl = createOpenCodeFetch({
      messages: assistantMessages([{ type: 'text', text: '**Xin chào**' }]),
    });

    await expect(translate({ fetchImpl })).resolves.toBe('**Xin chào**');

    const requestedUrls = fetchImpl.mock.calls.map(([url]) => url);
    expect(requestedUrls).toEqual([
      'http://127.0.0.1:4096/session',
      'http://127.0.0.1:4096/session/translation-session/prompt_async',
      'http://127.0.0.1:4096/session/translation-session/message?limit=10',
      'http://127.0.0.1:4096/session/translation-session',
    ]);
    expect(requestedUrls.some((url) => url.includes('/experimental/translation'))).toBe(false);

    const [, sessionOptions] = fetchImpl.mock.calls[0];
    expectSessionCreationRequest(sessionOptions);

    const [, promptOptions] = fetchImpl.mock.calls[1];
    expect(promptOptions).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        authorization: 'Bearer test-token',
      },
    });
    expect(JSON.parse(promptOptions.body)).toEqual({
      model: {
        providerID: 'anthropic',
        modelID: 'claude-sonnet-4',
      },
      parts: [
        {
          type: 'text',
          text: 'Translate to Vietnamese.\n\nTarget language: Vietnamese\n\nSource markdown:\n**Hello**',
        },
      ],
    });
  });

  it('deletes the temporary session after success', async () => {
    const fetchImpl = createOpenCodeFetch({
      messages: assistantMessages([{ type: 'text', text: 'Xin chào' }]),
    });

    await translate({ fetchImpl });

    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4096/session/translation-session',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('tolerates cleanup deletion failure after a successful translation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path === '/session' && options.method === 'POST') {
        return jsonResponse({ id: 'translation-session' });
      }
      if (path === '/session/translation-session/prompt_async' && options.method === 'POST') {
        return jsonResponse({ ok: true });
      }
      if (path === '/session/translation-session/message' && options.method === 'GET') {
        return jsonResponse(assistantMessages([{ type: 'text', text: 'Xin chào' }]));
      }
      if (path === '/session/translation-session' && options.method === 'DELETE') {
        throw new Error('delete failed');
      }
      throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
    });

    await expect(translate({ fetchImpl })).resolves.toBe('Xin chào');
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4096/session/translation-session',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(warn).toHaveBeenCalledWith('[ChatTranslation] Session cleanup failed:', 'delete failed');
    warn.mockRestore();
  });

  it('attempts cleanup after prompt failure once a session exists', async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path === '/session' && options.method === 'POST') {
        return jsonResponse({ id: 'translation-session' });
      }
      if (path === '/session/translation-session/prompt_async' && options.method === 'POST') {
        return jsonResponse('prompt rejected', { ok: false, status: 500 });
      }
      if (path === '/session/translation-session' && options.method === 'DELETE') {
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
    });

    await expect(translate({ fetchImpl })).rejects.toThrow('OpenCode translation prompt submission failed (500): prompt rejected');
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4096/session/translation-session',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('attempts cleanup after poll failure once a session exists', async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path === '/session' && options.method === 'POST') {
        return jsonResponse({ id: 'translation-session' });
      }
      if (path === '/session/translation-session/prompt_async' && options.method === 'POST') {
        return jsonResponse({ ok: true });
      }
      if (path === '/session/translation-session/message' && options.method === 'GET') {
        return jsonResponse('poll failed', { ok: false, status: 503 });
      }
      if (path === '/session/translation-session' && options.method === 'DELETE') {
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected request: ${options.method || 'GET'} ${url}`);
    });

    await expect(translate({ fetchImpl })).rejects.toThrow('OpenCode translation message polling failed (503): poll failed');
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4096/session/translation-session',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('errors deterministically when assistant completes with empty text', async () => {
    const fetchImpl = createOpenCodeFetch({
      messages: assistantMessages([{ type: 'text', text: '   ' }]),
    });

    await expect(translate({ fetchImpl })).rejects.toThrow('OpenCode translation returned an empty response.');
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4096/session/translation-session',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('errors deterministically when assistant text never finalizes', async () => {
    let pollCount = 0;
    const fetchImpl = createOpenCodeFetch({
      messages: () => {
        pollCount += 1;
        return { data: [{ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'draft' }] }] };
      },
    });

    await expect(translate({
      fetchImpl,
      timeoutMs: 0,
      pollIntervalMs: 0,
      sleepImpl: vi.fn(async () => {}),
    })).rejects.toThrow('OpenCode translation timed out after 0ms.');
    expect(pollCount).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'http://127.0.0.1:4096/session/translation-session',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
