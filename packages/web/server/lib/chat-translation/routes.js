import OpenAI from 'openai';
import { readAuthFile } from '../opencode/auth.js';
import { readConfigLayers } from '../opencode/shared.js';
import { getAuthEntry, normalizeAuthEntry } from '../quota/utils/index.js';

export const CHAT_TRANSLATION_TEXT_MAX_LENGTH = 80_000;
export const CHAT_TRANSLATION_PROMPT_MAX_LENGTH = 20_000;
export const CHAT_TRANSLATION_FIELD_MAX_LENGTH = 160;
export const CHAT_TRANSLATION_API_KEY_MAX_LENGTH = 256;
export const CHAT_TRANSLATION_BASE_URL_MAX_LENGTH = 512;
export const CHAT_TRANSLATION_MODELS_LIMIT = 500;
export const CHAT_TRANSLATION_CONCURRENCY_LIMIT = 4;

export const CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; OpenChamber/1.0)',
  'x-stainless-lang': null,
  'x-stainless-os': null,
  'x-stainless-arch': null,
  'x-stainless-runtime': null,
  'x-stainless-runtime-version': null,
  'x-stainless-package-version': null,
};

export const DEFAULT_CHAT_TRANSLATION_PROMPT = `You are a technical translation engine. Translate only natural-language prose to the requested target language.
Preserve markdown structure exactly, including headings, lists, tables, blockquotes, links, and emphasis.
Do not translate or modify fenced code blocks, inline code, commands, URLs, file paths, environment variables, package names, class names, function names, identifiers, logs, diffs, or terminal output.
Return only the translated markdown with no explanations, prefaces, or suffixes.`;

const normalizeText = (value, maxLength) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
};

export const resolveChatTranslationLanguage = (settings) => {
  const target = normalizeText(settings?.targetLanguage, CHAT_TRANSLATION_FIELD_MAX_LENGTH);
  if (target === 'custom') {
    return normalizeText(settings?.customTargetLanguage, CHAT_TRANSLATION_FIELD_MAX_LENGTH);
  }
  return target;
};

export const buildChatTranslationPrompt = ({ targetLanguage, systemPrompt }) => {
  const prompt = normalizeText(systemPrompt, CHAT_TRANSLATION_PROMPT_MAX_LENGTH) ?? DEFAULT_CHAT_TRANSLATION_PROMPT;
  return `${prompt}\n\nTarget language: ${targetLanguage}`;
};

export const validateChatTranslationRequest = ({ text, settings }) => {
  if (!settings || settings.enabled !== true) {
    return { ok: false, status: 409, code: 'translation_disabled', message: 'Chat translation is disabled.' };
  }

  const targetLanguage = resolveChatTranslationLanguage(settings);
  if (!targetLanguage) {
    return { ok: false, status: 400, code: 'missing_target_language', message: 'Translation target language is required.' };
  }

  const providerID = normalizeText(settings.providerID, CHAT_TRANSLATION_FIELD_MAX_LENGTH);
  const modelID = normalizeText(settings.modelID, CHAT_TRANSLATION_FIELD_MAX_LENGTH);
  const apiKey = normalizeText(settings.apiKey, CHAT_TRANSLATION_API_KEY_MAX_LENGTH);
  const baseURL = normalizeText(settings.baseURL, CHAT_TRANSLATION_BASE_URL_MAX_LENGTH);
  const directCredentials = apiKey && baseURL ? { apiKey, baseURL } : null;

  if (!modelID) {
    return { ok: false, status: 400, code: 'missing_model', message: 'Translation model is required.' };
  }

  if (!providerID && !directCredentials) {
    return { ok: false, status: 400, code: 'missing_model', message: 'Translation provider is required when direct credentials are not configured.' };
  }

  const normalizedText = normalizeText(text, CHAT_TRANSLATION_TEXT_MAX_LENGTH);
  if (!normalizedText) {
    return { ok: false, status: 400, code: 'invalid_text', message: 'Translation text is required and must be within the length limit.' };
  }

  if (typeof settings.systemPrompt === 'string' && settings.systemPrompt.trim().length > CHAT_TRANSLATION_PROMPT_MAX_LENGTH) {
    return { ok: false, status: 400, code: 'prompt_too_long', message: 'Translation system prompt exceeds the length limit.' };
  }

  return {
    ok: true,
    text: normalizedText,
    targetLanguage,
    ...(providerID ? { providerID } : {}),
    modelID,
    ...(directCredentials ? { credentials: directCredentials } : {}),
    systemPrompt: buildChatTranslationPrompt({ targetLanguage, systemPrompt: settings.systemPrompt }),
  };
};

export const createCountingSemaphore = (limit) => {
  let active = 0;
  const queue = [];

  const release = () => {
    active -= 1;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    next(release);
  };

  return {
    acquire: () => new Promise((resolve) => {
      if (active < limit) {
        active += 1;
        resolve(release);
        return;
      }
      queue.push(resolve);
    }),
    get active() {
      return active;
    },
    get queued() {
      return queue.length;
    },
  };
};

const translationSemaphore = createCountingSemaphore(CHAT_TRANSLATION_CONCURRENCY_LIMIT);

export class ChatTranslationProviderNotConfiguredError extends Error {
  constructor(providerID) {
    super(`Translation provider ${providerID} is not configured.`);
    this.name = 'ChatTranslationProviderNotConfiguredError';
    this.status = 400;
    this.code = 'provider_not_configured';
  }
}

export const resolveChatTranslationProviderCredentials = (providerID, settings) => {
  const settingsApiKey = normalizeText(settings?.apiKey, CHAT_TRANSLATION_API_KEY_MAX_LENGTH);
  const settingsBaseURL = normalizeText(settings?.baseURL, CHAT_TRANSLATION_BASE_URL_MAX_LENGTH);
  if (settingsApiKey && settingsBaseURL) {
    return { apiKey: settingsApiKey, baseURL: settingsBaseURL };
  }

  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, [providerID]));
  const apiKey = normalizeText(entry?.key ?? entry?.token ?? entry?.access, CHAT_TRANSLATION_PROMPT_MAX_LENGTH);

  if (!apiKey) {
    throw new ChatTranslationProviderNotConfiguredError(providerID);
  }

  const layers = readConfigLayers();
  const configuredBaseURL = layers.mergedConfig?.provider?.[providerID]?.options?.baseURL;
  const baseURL = normalizeText(configuredBaseURL, CHAT_TRANSLATION_PROMPT_MAX_LENGTH);

  return {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  };
};

export const translateWithOpenAI = async ({ request, OpenAIClient = OpenAI }) => {
  const credentials = resolveChatTranslationProviderCredentials(request.providerID, request.credentials);
  const client = new OpenAIClient({
    ...credentials,
    defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
  });
  const completion = await client.chat.completions.create({
    model: request.modelID,
    messages: [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.text },
    ],
  });
  const translatedText = completion?.choices?.[0]?.message?.content?.trim();

  if (!translatedText) {
    throw new Error('OpenAI-compatible translation returned an empty response.');
  }

  return translatedText;
};

export const fetchChatTranslationModels = async ({ apiKey, baseURL, OpenAIClient = OpenAI }) => {
  const normalizedApiKey = normalizeText(apiKey, CHAT_TRANSLATION_API_KEY_MAX_LENGTH);
  const normalizedBaseURL = normalizeText(baseURL, CHAT_TRANSLATION_BASE_URL_MAX_LENGTH);
  if (!normalizedApiKey || !normalizedBaseURL) {
    const error = new Error('API key and base URL are required.');
    error.status = 400;
    error.code = 'missing_credentials';
    throw error;
  }

  const client = new OpenAIClient({
    apiKey: normalizedApiKey,
    baseURL: normalizedBaseURL,
    defaultHeaders: CHAT_TRANSLATION_OPENAI_DEFAULT_HEADERS,
  });
  const page = await client.models.list();
  const models = [];

  for await (const model of page) {
    if (typeof model?.id !== 'string' || model.id.trim().length === 0) {
      continue;
    }
    models.push({ id: model.id, owned_by: typeof model.owned_by === 'string' ? model.owned_by : undefined });
    if (models.length >= CHAT_TRANSLATION_MODELS_LIMIT) {
      break;
    }
  }

  return models;
};

export const extractTranslatedText = (payload) => {
  if (typeof payload?.text === 'string') return payload.text.trim();
  if (typeof payload?.message?.content === 'string') return payload.message.content.trim();
  if (Array.isArray(payload?.parts)) {
    return payload.parts
      .map((part) => typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
};

export const registerChatTranslationRoutes = (app, dependencies) => {
  const {
    readSettingsFromDiskMigrated,
    translate = translateWithOpenAI,
    fetchModels = fetchChatTranslationModels,
  } = dependencies;

  const jsonParser = dependencies.express?.json({ limit: '200kb' });
  app.post('/api/chat/translation/models', ...[jsonParser, async (req, res) => {
    try {
      const models = await fetchModels({
        apiKey: req.body?.apiKey,
        baseURL: req.body?.baseURL,
      });
      return res.json({ models });
    } catch (error) {
      if (error?.code === 'missing_credentials') {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      return res.status(502).json({ error: error?.message || 'Failed to fetch translation models', code: 'models_fetch_failed' });
    }
  }].filter(Boolean));

  const handlers = [jsonParser, async (req, res) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      const validation = validateChatTranslationRequest({
        text: req.body?.text,
        settings: settings?.chatTranslation,
      });

      if (!validation.ok) {
        return res.status(validation.status).json({ error: validation.message, code: validation.code });
      }

      const release = await translationSemaphore.acquire();
      let translatedText;
      try {
        translatedText = await translate({
          request: validation,
        });
      } finally {
        release();
      }

      return res.json({ translatedText });
    } catch (error) {
      console.error('[ChatTranslation] Translation failed:', error);
      if (error?.code === 'provider_not_configured') {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      return res.status(502).json({ error: error?.message || 'Translation failed', code: 'translation_failed' });
    }
  }].filter(Boolean);

  app.post('/api/chat/translate', ...handlers);
};
