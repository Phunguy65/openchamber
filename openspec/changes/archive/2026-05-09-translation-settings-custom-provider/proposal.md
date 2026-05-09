# Why

The chat translation backend resolves credentials from OpenCode's `auth.json` and config files, tightly coupling translation to OpenCode's provider system. Users cannot configure a custom OpenAI-compatible endpoint (e.g., local LLM, OpenRouter, custom proxy) directly from the settings UI. The existing `ModelSelector` component only shows models known to OpenCode — there is no way to discover models from an arbitrary endpoint. Adding dedicated API key, base URL, and model picker fields (fetched via the standard `v1/models` endpoint) decouples translation from OpenCode's provider registry and gives users full control over their translation backend.

## What Changes

- Add `apiKey` and `baseURL` fields to `ChatTranslationSettings` type and persistence layer
- Add a backend endpoint `GET /api/chat/translation/models` that accepts API key + base URL, calls `openai.models.list()` via the SDK, and returns the available model list
- Replace the `ModelSelector` component in translation settings with dedicated inputs: masked API key, base URL text field, and a model dropdown populated on demand from the models endpoint
- Update `resolveChatTranslationProviderCredentials` to prefer settings-stored `apiKey`/`baseURL` over `auth.json` fallback resolution
- Update settings sanitizers (server and client) to validate the new fields
- Make `providerID` optional when direct credentials are provided

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `chat-translation`: Settings UI adds API key, base URL, and model picker (via v1/models); backend credential resolution prefers settings-stored credentials with auth.json fallback

## Impact

- `packages/ui/src/lib/desktop.ts` — type changes
- `packages/ui/src/lib/persistence.ts` — client sanitizer update
- `packages/ui/src/components/sections/openchamber/ChatTranslationSettingsSection.tsx` — UI rewrite of model selection area
- `packages/web/server/lib/chat-translation/routes.js` — new models endpoint, credential resolution update
- `packages/web/server/lib/opencode/settings-helpers.js` — server sanitizer update
- `packages/web/server/lib/chat-translation/routes.test.js` — new tests
- No new dependencies (uses existing `openai` package)
- No breaking changes to the `/api/chat/translate` HTTP contract
