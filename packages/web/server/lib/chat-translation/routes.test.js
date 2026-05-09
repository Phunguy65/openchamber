import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const authMocks = {
  readAuthFile: vi.fn(),
  readConfigLayers: vi.fn(),
};

vi.mock('../opencode/auth.js', () => ({
  readAuthFile: authMocks.readAuthFile,
}));

vi.mock('../opencode/shared.js', () => ({
  readConfigLayers: authMocks.readConfigLayers,
}));

import {
  CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
  DEFAULT_CHAT_TRANSLATION_PROMPT,
  buildChatTranslationPrompt,
  createCountingSemaphore,
  fetchChatTranslationModels,
  registerChatTranslationRoutes,
  translateWithOpenAI,
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

const createOpenAIClient = (createImpl = vi.fn(async () => ({ choices: [{ message: { content: '**Xin chào**' } }] }))) => {
  const OpenAIClient = vi.fn().mockImplementation((options) => ({
    options,
    chat: { completions: { create: createImpl } },
  }));
  return { OpenAIClient, createImpl };
};

const createOpenAIModelsClient = (modelsListImpl) => {
  const OpenAIClient = vi.fn().mockImplementation((options) => ({
    options,
    models: { list: modelsListImpl },
  }));
  return { OpenAIClient, modelsListImpl };
};

describe('chat translation backend', () => {
  beforeEach(() => {
    authMocks.readAuthFile.mockReturnValue({ anthropic: { key: 'test-key' } });
    authMocks.readConfigLayers.mockReturnValue({
      mergedConfig: {
        provider: {
          anthropic: { options: { baseURL: 'https://api.example.test/v1' } },
        },
      },
    });
  });

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

  it('validates translation requests with direct credentials and optional providerID', () => {
    expect(validateChatTranslationRequest({
      text: ' Hello ',
      settings: {
        enabled: true,
        targetLanguage: 'Vietnamese',
        apiKey: ' settings-key ',
        baseURL: ' https://custom.example.test/v1 ',
        modelID: ' custom-model ',
      },
    })).toMatchObject({
      ok: true,
      text: 'Hello',
      targetLanguage: 'Vietnamese',
      modelID: 'custom-model',
      credentials: { apiKey: 'settings-key', baseURL: 'https://custom.example.test/v1' },
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

  it('fetches translation models with direct credentials', async () => {
    const app = express();
    const fetchModels = vi.fn(async ({ apiKey, baseURL }) => {
      expect(apiKey).toBe('test-key');
      expect(baseURL).toBe('https://custom.example.test/v1');
      return [{ id: 'model-a', owned_by: 'owner-a' }];
    });

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      express,
      fetchModels,
    });

    const response = await request(app)
      .post('/api/chat/translation/models')
      .send({ apiKey: 'test-key', baseURL: 'https://custom.example.test/v1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ models: [{ id: 'model-a', owned_by: 'owner-a' }] });
  });

  it('rejects model fetches with missing credentials', async () => {
    const app = express();

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      express,
    });

    const response = await request(app)
      .post('/api/chat/translation/models')
      .send({ apiKey: 'test-key' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'API key and base URL are required.', code: 'missing_credentials' });
  });

  it('returns models_fetch_failed when model listing fails', async () => {
    const app = express();

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      express,
      fetchModels: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
    });

    const response = await request(app)
      .post('/api/chat/translation/models')
      .send({ apiKey: 'test-key', baseURL: 'https://custom.example.test/v1' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'provider unavailable', code: 'models_fetch_failed' });
  });

  it('rejects oversized translation bodies before invoking translation', async () => {
    const app = express();
    const translate = vi.fn(async () => 'xin chao');

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
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

  it('calls the OpenAI-compatible chat completions API and returns assistant text', async () => {
    const { OpenAIClient, createImpl } = createOpenAIClient();

    await expect(translateWithOpenAI({ request: translationRequest, OpenAIClient })).resolves.toBe('**Xin chào**');

    expect(OpenAIClient).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://api.example.test/v1',
      defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
    });
    expect(createImpl).toHaveBeenCalledWith({
      model: 'claude-sonnet-4',
      messages: [
        { role: 'system', content: 'Translate to Vietnamese.\n\nTarget language: Vietnamese' },
        { role: 'user', content: '**Hello**' },
      ],
    });
  });

  it('uses settings-stored credentials for OpenAI-compatible chat completions', async () => {
    authMocks.readAuthFile.mockClear();
    const { OpenAIClient } = createOpenAIClient();

    await expect(translateWithOpenAI({
      request: {
        ...translationRequest,
        providerID: undefined,
        credentials: { apiKey: 'settings-key', baseURL: 'https://custom.example.test/v1' },
      },
      OpenAIClient,
    })).resolves.toBe('**Xin chào**');

    expect(OpenAIClient).toHaveBeenCalledWith({
      apiKey: 'settings-key',
      baseURL: 'https://custom.example.test/v1',
      defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
    });
    expect(authMocks.readAuthFile).not.toHaveBeenCalled();
  });

  it('falls back to auth.json when direct credentials are incomplete', async () => {
    const { OpenAIClient } = createOpenAIClient();

    await expect(translateWithOpenAI({
      request: {
        ...translationRequest,
        credentials: { apiKey: 'settings-key' },
      },
      OpenAIClient,
    })).resolves.toBe('**Xin chào**');

    expect(OpenAIClient).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://api.example.test/v1',
      defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
    });
  });

  it('lists OpenAI-compatible models and caps the response at 500 entries', async () => {
    const models = Array.from({ length: 501 }, (_, index) => ({ id: `model-${index}`, owned_by: `owner-${index}` }));
    const modelsListImpl = vi.fn(async () => models);
    const { OpenAIClient } = createOpenAIModelsClient(modelsListImpl);

    await expect(fetchChatTranslationModels({ apiKey: ' test-key ', baseURL: ' https://custom.example.test/v1 ', OpenAIClient })).resolves.toHaveLength(500);

    expect(OpenAIClient).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://custom.example.test/v1',
      defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
    });
    expect(modelsListImpl).toHaveBeenCalledOnce();
  });

  it('constructs the OpenAI-compatible client without baseURL when none is configured', async () => {
    authMocks.readConfigLayers.mockReturnValue({ mergedConfig: { provider: { anthropic: { options: {} } } } });
    const { OpenAIClient } = createOpenAIClient();

    await expect(translateWithOpenAI({ request: translationRequest, OpenAIClient })).resolves.toBe('**Xin chào**');

    expect(OpenAIClient).toHaveBeenCalledWith({
      apiKey: 'test-key',
      defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
    });
  });

  it('rejects missing provider credentials with provider_not_configured', async () => {
    authMocks.readAuthFile.mockReturnValue({});
    const { OpenAIClient } = createOpenAIClient();

    await expect(translateWithOpenAI({ request: translationRequest, OpenAIClient })).rejects.toMatchObject({
      status: 400,
      code: 'provider_not_configured',
    });
    expect(OpenAIClient).not.toHaveBeenCalled();
  });

  it('returns provider_not_configured from the route when credentials are missing', async () => {
    authMocks.readAuthFile.mockReturnValue({});
    const app = express();

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      express,
    });

    const response = await request(app)
      .post('/api/chat/translate')
      .send({ text: 'hello' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Translation provider anthropic is not configured.',
      code: 'provider_not_configured',
    });
  });

  it('returns translation_failed from the route when the provider API fails', async () => {
    const translate = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const app = express();

    registerChatTranslationRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ chatTranslation: enabledSettings }),
      express,
      translate,
    });

    const response = await request(app)
      .post('/api/chat/translate')
      .send({ text: 'hello' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'provider unavailable', code: 'translation_failed' });
  });
});
