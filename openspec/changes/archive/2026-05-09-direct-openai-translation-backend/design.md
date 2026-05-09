# Context

The chat translation backend in `packages/web/server/lib/chat-translation/routes.js` currently uses `translateWithOpenCode` which creates a temporary OpenCode session, sends a prompt via `prompt_async`, polls for the assistant response, then deletes the session. This couples translation to the OpenCode server's session lifecycle and adds unnecessary latency and complexity for what is fundamentally a single completion call.

The `openai` npm package (`^4.79.0`) is already a dependency in `packages/web/package.json` and is used by the TTS service (`packages/web/server/lib/tts/service.js`). Provider credentials are stored in `~/.local/share/opencode/auth.json` with a well-established resolution pattern used by all quota providers.

## Goals / Non-Goals

**Goals:**

- Replace the session-based translation workflow with a single `openai.chat.completions.create` call
- Resolve provider API key and base URL from existing auth/config infrastructure
- Maintain the same HTTP contract (`POST /api/chat/translate` request/response shape)
- Display the default translation prompt in the settings UI textarea when no custom prompt is saved

**Non-Goals:**

- Changing the client-side translation cache, queue, abort, or concurrency logic
- Adding streaming support for translation responses
- Supporting providers that don't expose an OpenAI-compatible chat completions endpoint
- Changing the settings persistence format or validation logic

## Decisions

### 1. Credential resolution strategy

**Decision**: Read API key from `auth.json` using `getAuthEntry`/`normalizeAuthEntry` (same pattern as quota providers), then read base URL from `readConfigLayers().mergedConfig.provider[providerID]?.options?.baseURL`.

**Alternatives considered**:
- Pass credentials from the route handler (rejected: would require the route to know about auth internals)
- Use environment variables only (rejected: doesn't match existing multi-provider pattern)

**Rationale**: Reuses the exact same credential resolution that quota providers and TTS already use. No new patterns introduced.

### 2. OpenAI client construction

**Decision**: Construct a new `OpenAI` client per request with the resolved `apiKey` and `baseURL`. No client caching.

**Alternatives considered**:
- Cache clients per provider (rejected: API keys can change between requests; the overhead of constructing an OpenAI client is negligible compared to the network call)

**Rationale**: Simplicity. The TTS service caches its client because it only supports one provider (OpenAI). Translation supports arbitrary providers, making cache invalidation complex for minimal gain.

### 3. Message structure for translation

**Decision**: Send the built system prompt (with target language appended) as a `system` message, and the source text as a `user` message. This replaces the current approach of combining both into a single user message.

**Rationale**: Proper role separation gives the model clearer instruction boundaries. The `buildChatTranslationPrompt` function already produces the full system prompt with target language appended.

### 4. Default prompt in UI

**Decision**: Duplicate `DEFAULT_CHAT_TRANSLATION_PROMPT` as a constant in the UI component. Use it as the textarea `value` (not placeholder) when `settings.systemPrompt` is falsy.

**Alternatives considered**:
- Fetch from server endpoint (rejected: extra network request for a static string)
- Shared package (rejected: over-engineering for a single constant)

**Rationale**: The constant is static, changes only with code deploys, and the backend already falls back to it regardless of what the UI displays.

### 5. Error handling for missing credentials

**Decision**: Return HTTP 400 with `{ error: "...", code: "provider_not_configured" }` when the provider has no API key or base URL.

**Rationale**: Matches the spec requirement. 400 is appropriate because the user's configuration is incomplete (client error), not a server failure.

## Risks / Trade-offs

- [Provider compatibility] Not all providers may be fully OpenAI-compatible → Mitigation: The `openai` package handles most compatible APIs (Anthropic via proxy, OpenRouter, etc.). Users select their own provider/model, so incompatible providers will surface as clear API errors.
- [No client caching] Constructing a new client per request adds minor overhead → Mitigation: Negligible compared to the actual API call latency. Can add caching later if profiling shows it matters.
- [Duplicated constant] Default prompt exists in both server and UI → Mitigation: The backend always uses its own constant as fallback regardless of UI state. Drift between the two only affects what the user sees in settings, not translation behavior.
