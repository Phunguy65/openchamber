# Tasks

## 1. Type and persistence layer

- [x] 1.1 Add `apiKey` and `baseURL` fields to `ChatTranslationSettings` type in `packages/ui/src/lib/desktop.ts`
- [x] 1.2 Update `sanitizeChatTranslationSettings` in `packages/ui/src/lib/persistence.ts` to validate `apiKey` (max 256) and `baseURL` (max 512)
- [x] 1.3 Update `normalizeChatTranslationSettings` in `packages/web/server/lib/opencode/settings-helpers.js` to sanitize `apiKey` (max 256) and `baseURL` (max 512) ← (verify: existing settings-helpers tests pass, new fields are trimmed and bounded correctly)

## 2. Backend: models endpoint

- [x] 2.1 Add `POST /api/chat/translation/models` handler in `packages/web/server/lib/chat-translation/routes.js` that accepts `{apiKey, baseURL}`, constructs OpenAI client, calls `client.models.list()`, returns `{models: [{id, owned_by}]}` capped at 500
- [x] 2.2 Handle missing credentials (400, `missing_credentials`) and fetch failures (502, `models_fetch_failed`)
- [x] 2.3 Register the new route in `registerChatTranslationRoutes` ← (verify: endpoint returns model list with valid credentials, rejects missing credentials, returns 502 on network failure)

## 3. Backend: credential resolution update

- [x] 3.1 Update `resolveChatTranslationProviderCredentials` to accept optional `settings` parameter with `apiKey` and `baseURL`; use them directly when both present, otherwise fall back to auth.json resolution
- [x] 3.2 Update `translateWithOpenAI` to pass settings-stored credentials from the request validation result
- [x] 3.3 Update `validateChatTranslationRequest` to skip `providerID` requirement when settings has `apiKey` + `baseURL`; pass credentials through in the validation result ← (verify: translation works with settings-stored credentials, falls back correctly when absent, providerID not required with direct credentials)

## 4. UI: settings section update

- [x] 4.1 Remove `ModelSelector` import and usage from `ChatTranslationSettingsSection.tsx`
- [x] 4.2 Add API Key masked input field with persist on change
- [x] 4.3 Add Base URL text input field with persist on change
- [x] 4.4 Add model selection area: combobox/select for model ID + "Fetch Models" button that calls `POST /api/chat/translation/models`
- [x] 4.5 Handle loading state, error state, and populate dropdown with fetched model IDs
- [x] 4.6 Support manual text entry for model ID as fallback when fetch fails ← (verify: UI shows all three fields, fetch populates dropdown, manual entry works, masked API key, persist on change)

## 5. Tests

- [x] 5.1 Add tests for `POST /api/chat/translation/models` endpoint (valid fetch, missing credentials, fetch failure) in `routes.test.js`
- [x] 5.2 Update existing `translateWithOpenAI` tests to cover settings-stored credentials path and fallback path
- [x] 5.3 Update `validateChatTranslationRequest` tests for optional providerID when direct credentials present ← (verify: all tests pass, no regressions in existing translation tests)

## 6. Validation

- [x] 6.1 Run `bun run type-check` and fix any type errors
- [x] 6.2 Run `bun run lint` and fix any lint errors ← (verify: both commands pass cleanly)
