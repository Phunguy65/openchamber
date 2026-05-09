# Context

The chat translation backend (`packages/web/server/lib/chat-translation/routes.js`) currently resolves credentials via `resolveChatTranslationProviderCredentials`, which reads API key from `~/.local/share/opencode/auth.json` and base URL from OpenCode's merged config. The settings UI uses the shared `ModelSelector` component which only shows models registered in OpenCode's provider system. Users cannot point translation at an arbitrary OpenAI-compatible endpoint without first configuring it in OpenCode's provider config.

The `openai` npm package (^4.79.0, already a dependency) provides `client.models.list()` which calls `GET /models` on the configured `baseURL` and returns a paginated list of `{id, object, created, owned_by}` objects. This works with any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, etc.).

## Goals / Non-Goals

**Goals:**

- Allow users to configure API key and base URL directly in translation settings
- Provide a model picker that fetches available models from the configured endpoint's `v1/models`
- Maintain backward compatibility: if no settings-stored credentials, fall back to auth.json resolution
- Keep the same `/api/chat/translate` HTTP contract

**Non-Goals:**

- Changing client-side translation cache, queue, abort, or concurrency logic
- Adding streaming support for translation
- Auto-detecting provider type from base URL
- Validating API key correctness at save time (only at fetch/translate time)
- Supporting non-OpenAI-compatible model listing formats

## Decisions

### 1. Credential resolution priority

**Decision**: `resolveChatTranslationProviderCredentials` accepts an optional `settings` parameter containing `apiKey` and `baseURL`. If both are present, use them directly. Otherwise, fall back to the existing auth.json + config resolution using `providerID`.

**Alternatives considered**:
- Always require settings-stored credentials (rejected: breaks existing users who have auth.json configured)
- Merge settings credentials with auth.json (rejected: confusing — partial override semantics are unclear)

**Rationale**: Clean priority chain. Settings-stored credentials are explicit user intent for translation. Fallback preserves backward compatibility.

### 2. Models endpoint design

**Decision**: Add `POST /api/chat/translation/models` that accepts `{apiKey, baseURL}` in the request body, constructs an OpenAI client, calls `client.models.list()`, collects all models via async iteration, and returns `{models: [{id, owned_by}]}`.

**Alternatives considered**:
- GET with query params (rejected: API key in URL is a security concern — appears in logs)
- Proxy the raw `/models` response (rejected: leaks unnecessary fields, no control over response shape)
- Client-side fetch directly to the endpoint (rejected: CORS issues with arbitrary endpoints)

**Rationale**: POST keeps credentials out of URLs. Server-side proxy avoids CORS. Returning only `id` and `owned_by` keeps the response minimal.

### 3. Settings storage for API key

**Decision**: Store `apiKey` in the same settings file (`~/.config/openchamber/settings.json`) alongside other translation settings. The field is sanitized with a max length of 256 characters.

**Alternatives considered**:
- Separate auth file for translation (rejected: over-engineering for a single key)
- Encrypt at rest (rejected: auth.json already stores keys in plaintext — same security model)

**Rationale**: Consistent with existing patterns. The settings file is user-local and has the same access permissions as auth.json.

### 4. Base URL max length and validation

**Decision**: `baseURL` is sanitized as a bounded string (max 512 characters). No URL format validation at persistence time — invalid URLs will fail at fetch time with a clear error.

**Rationale**: Users may use non-standard URL formats (e.g., Unix socket paths via adapters). Validation at use time provides better error messages than regex rejection at save time.

### 5. UI model fetch trigger

**Decision**: User clicks a "Fetch Models" button to trigger the models list request. The button is enabled only when both API key and base URL are non-empty. Results populate a Select dropdown. Loading and error states are shown inline.

**Alternatives considered**:
- Auto-fetch on debounced input change (rejected: fires requests while user is still typing the key)
- Combobox with manual text entry + fetch (rejected: more complex UI for minimal benefit)

**Rationale**: Explicit action avoids accidental requests with partial credentials. Simple dropdown is sufficient since model lists are typically small (<100 items).

### 6. providerID becomes optional

**Decision**: When `apiKey` and `baseURL` are stored in settings, `providerID` is no longer required for translation. The validation in `validateChatTranslationRequest` checks: if settings has `apiKey` + `baseURL`, skip `providerID` requirement. Otherwise, require `providerID` for fallback resolution.

**Rationale**: Direct credentials make provider identification unnecessary — the endpoint IS the provider.

## Risks / Trade-offs

- [API key in settings file] Stored in plaintext → Mitigation: Same security model as auth.json. File permissions are user-only. UI masks the input.
- [Models endpoint abuse] Could be used to probe arbitrary endpoints → Mitigation: Endpoint is local-only (same as all other settings APIs). Rate limiting via existing translation semaphore is not needed here since it's a one-shot fetch.
- [Large model lists] Some endpoints return hundreds of models → Mitigation: Cap at 500 models in the response. UI shows a searchable dropdown if list is large.
- [Endpoint compatibility] Not all endpoints implement `/models` → Mitigation: Clear error message when fetch fails. User can still type model ID manually as a fallback in the model field.
