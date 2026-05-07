export const CHAT_TRANSLATION_TEXT_MAX_LENGTH = 80_000;
export const CHAT_TRANSLATION_PROMPT_MAX_LENGTH = 20_000;
export const CHAT_TRANSLATION_FIELD_MAX_LENGTH = 160;
export const CHAT_TRANSLATION_POLL_INTERVAL_MS = 1_000;
export const CHAT_TRANSLATION_TIMEOUT_MS = 120_000;

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
  if (!providerID || !modelID) {
    return { ok: false, status: 400, code: 'missing_model', message: 'Translation provider and model are required.' };
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
    providerID,
    modelID,
    systemPrompt: buildChatTranslationPrompt({ targetLanguage, systemPrompt: settings.systemPrompt }),
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CHAT_TRANSLATION_SESSION_TITLE = 'Chat Translation';

const buildOpenCodeRequestHeaders = (getOpenCodeAuthHeaders) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(getOpenCodeAuthHeaders ? getOpenCodeAuthHeaders() : {}),
});

const parseOpenCodeJsonResponse = async (response, action) => {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenCode translation ${action} failed (${response.status})${body ? `: ${body}` : ''}`);
  }

  return response.json().catch(() => null);
};

const extractSessionID = (payload) => {
  const id = payload?.id ?? payload?.data?.id ?? payload?.session?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : '';
};

const extractTextParts = (parts) => {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
};

const getAssistantMessages = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.message)) return payload.message;
  return [];
};

const extractFinishedAssistantText = (payload) => {
  const message = getAssistantMessages(payload).find((candidate) => {
    const info = candidate?.info ?? candidate;
    return info?.role === 'assistant' && info?.finish === 'stop';
  });

  if (!message) {
    return null;
  }

  return extractTextParts(message.parts ?? message.message?.parts ?? message.data?.parts);
};

const buildTranslationUserPrompt = (request) => `${request.systemPrompt}\n\nSource markdown:\n${request.text}`;

const createTemporarySession = async ({ fetchImpl, buildOpenCodeUrl, headers }) => {
  const response = await fetchImpl(buildOpenCodeUrl('/session'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: CHAT_TRANSLATION_SESSION_TITLE }),
  });
  const payload = await parseOpenCodeJsonResponse(response, 'session creation');
  const sessionID = extractSessionID(payload);
  if (!sessionID) {
    throw new Error('OpenCode translation session creation returned no session id.');
  }
  return sessionID;
};

const sendTranslationPrompt = async ({ fetchImpl, buildOpenCodeUrl, headers, sessionID, request }) => {
  const response = await fetchImpl(buildOpenCodeUrl(`/session/${encodeURIComponent(sessionID)}/prompt_async`), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: {
        providerID: request.providerID,
        modelID: request.modelID,
      },
      parts: [
        {
          type: 'text',
          text: buildTranslationUserPrompt(request),
        },
      ],
    }),
  });

  await parseOpenCodeJsonResponse(response, 'prompt submission');
};

const pollTranslatedText = async ({ fetchImpl, buildOpenCodeUrl, headers, sessionID, timeoutMs, pollIntervalMs, sleepImpl }) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetchImpl(buildOpenCodeUrl(`/session/${encodeURIComponent(sessionID)}/message?limit=10`), {
      method: 'GET',
      headers,
    });
    const payload = await parseOpenCodeJsonResponse(response, 'message polling');
    const translatedText = extractFinishedAssistantText(payload);

    if (translatedText !== null) {
      if (!translatedText) {
        throw new Error('OpenCode translation returned an empty response.');
      }
      return translatedText;
    }

    await sleepImpl(pollIntervalMs);
  }

  throw new Error(`OpenCode translation timed out after ${timeoutMs}ms.`);
};

const deleteTemporarySession = async ({ fetchImpl, buildOpenCodeUrl, headers, sessionID }) => {
  await fetchImpl(buildOpenCodeUrl(`/session/${encodeURIComponent(sessionID)}`), {
    method: 'DELETE',
    headers,
  });
};

export const translateWithOpenCode = async ({
  fetchImpl = fetch,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  request,
  timeoutMs = CHAT_TRANSLATION_TIMEOUT_MS,
  pollIntervalMs = CHAT_TRANSLATION_POLL_INTERVAL_MS,
  sleepImpl = sleep,
}) => {
  const headers = buildOpenCodeRequestHeaders(getOpenCodeAuthHeaders);
  let sessionID = '';

  try {
    sessionID = await createTemporarySession({ fetchImpl, buildOpenCodeUrl, headers });
    await sendTranslationPrompt({ fetchImpl, buildOpenCodeUrl, headers, sessionID, request });
    return await pollTranslatedText({ fetchImpl, buildOpenCodeUrl, headers, sessionID, timeoutMs, pollIntervalMs, sleepImpl });
  } finally {
    if (sessionID) {
      await deleteTemporarySession({ fetchImpl, buildOpenCodeUrl, headers, sessionID }).catch(() => {});
    }
  }
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
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    translate = translateWithOpenCode,
  } = dependencies;

  app.post('/api/chat/translate', async (req, res) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      const validation = validateChatTranslationRequest({
        text: req.body?.text,
        settings: settings?.chatTranslation,
      });

      if (!validation.ok) {
        return res.status(validation.status).json({ error: validation.message, code: validation.code });
      }

      const translatedText = await translate({
        buildOpenCodeUrl,
        getOpenCodeAuthHeaders,
        request: validation,
      });

      return res.json({ translatedText });
    } catch (error) {
      console.error('[ChatTranslation] Translation failed:', error);
      return res.status(502).json({ error: error?.message || 'Translation failed', code: 'translation_failed' });
    }
  });
};
