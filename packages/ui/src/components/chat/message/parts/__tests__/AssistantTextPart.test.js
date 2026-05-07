import { describe, expect, it } from 'bun:test';

import { shouldCommitTranslationState } from '../assistantTranslationState';

describe('AssistantTextPart translation state guards', () => {
  it('commits translation state only for the current cache key', () => {
    expect(shouldCommitTranslationState('message:part:settings:5:hello', 'message:part:settings:5:hello')).toBe(true);
    expect(shouldCommitTranslationState('message:part:settings:7:updated', 'message:part:settings:5:hello')).toBe(false);
    expect(shouldCommitTranslationState(undefined, 'message:part:settings:5:hello')).toBe(false);
  });
});
