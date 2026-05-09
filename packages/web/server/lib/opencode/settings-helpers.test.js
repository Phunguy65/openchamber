import { describe, expect, it } from 'vitest';

import { createSettingsHelpers } from './settings-helpers.js';

const createTestHelpers = () => createSettingsHelpers({
  normalizePathForPersistence: (value) => value,
  normalizeDirectoryPath: (value) => value,
  normalizeTunnelBootstrapTtlMs: (value) => value,
  normalizeTunnelSessionTtlMs: (value) => value,
  normalizeTunnelProvider: (value) => value,
  normalizeTunnelMode: (value) => value,
  normalizeOptionalPath: (value) => value,
  normalizeManagedRemoteTunnelHostname: (value) => value,
  normalizeManagedRemoteTunnelPresets: () => undefined,
  normalizeManagedRemoteTunnelPresetTokens: () => undefined,
  sanitizeTypographySizesPartial: () => undefined,
  normalizeStringArray: (input) => input,
  sanitizeModelRefs: () => undefined,
  sanitizeSkillCatalogs: () => undefined,
  sanitizeProjects: () => undefined,
});

describe('settings helpers', () => {
  it('accepts messageStreamTransport as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ messageStreamTransport: 'ws' })).toEqual({
      messageStreamTransport: 'ws',
    });
    expect(helpers.sanitizeSettingsUpdate({ messageStreamTransport: 'sse' })).toEqual({
      messageStreamTransport: 'sse',
    });
    expect(helpers.sanitizeSettingsUpdate({ messageStreamTransport: 'auto' })).toEqual({
      messageStreamTransport: 'auto',
    });
  });

  it('rejects invalid messageStreamTransport values', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ messageStreamTransport: 'websocket' })).toEqual({});
  });

  it('accepts desktopLanAccessEnabled as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ desktopLanAccessEnabled: true })).toEqual({
      desktopLanAccessEnabled: true,
    });
    expect(helpers.sanitizeSettingsUpdate({ desktopLanAccessEnabled: false })).toEqual({
      desktopLanAccessEnabled: false,
    });
  });

  it('accepts mobileKeyboardMode as a persisted shared setting', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: 'native' })).toEqual({
      mobileKeyboardMode: 'native',
    });
    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: 'resize-content' })).toEqual({
      mobileKeyboardMode: 'resize-content',
    });
    expect(helpers.sanitizeSettingsUpdate({ mobileKeyboardMode: ' resize-content ' })).toEqual({
      mobileKeyboardMode: 'resize-content',
    });
  });

  it('sanitizes chat translation settings and hides missing fields behind disabled defaults', () => {
    const helpers = createTestHelpers();

    expect(helpers.formatSettingsResponse({}).chatTranslation).toEqual({ enabled: false, autoTranslate: false });
    expect(helpers.sanitizeSettingsUpdate({
      chatTranslation: {
        enabled: true,
        autoTranslate: false,
        targetLanguage: ' Vietnamese ',
        customTargetLanguage: ' Technical Vietnamese ',
        providerID: ' anthropic ',
        modelID: ' claude-sonnet-4 ',
        systemPrompt: ' Translate carefully ',
      },
    })).toEqual({
      chatTranslation: {
        enabled: true,
        autoTranslate: false,
        targetLanguage: 'Vietnamese',
        customTargetLanguage: 'Technical Vietnamese',
        providerID: 'anthropic',
        modelID: 'claude-sonnet-4',
        systemPrompt: 'Translate carefully',
      },
    });
  });

  it('rejects invalid chat translation fields and oversized prompts', () => {
    const helpers = createTestHelpers();

    expect(helpers.sanitizeSettingsUpdate({
      chatTranslation: {
        enabled: 'true',
        autoTranslate: 'false',
        targetLanguage: '',
        providerID: 123,
        modelID: null,
        systemPrompt: 'x'.repeat(20_001),
      },
    })).toEqual({});
  });

  it('preserves legacy chat translation settings without forcing auto mode into persisted output', () => {
    const helpers = createTestHelpers();

    expect(helpers.formatSettingsResponse({ chatTranslation: { enabled: true } }).chatTranslation).toEqual({ enabled: true });
    expect(helpers.sanitizeSettingsUpdate({ chatTranslation: { enabled: true, autoTranslate: false } })).toEqual({
      chatTranslation: { enabled: true, autoTranslate: false },
    });
  });
});
