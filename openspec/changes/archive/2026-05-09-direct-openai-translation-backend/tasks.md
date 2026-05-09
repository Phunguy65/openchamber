# Tasks

## 1. Backend: Replace translation function

- [x] 1.1 Add credential resolution function in `packages/web/server/lib/chat-translation/routes.js` that reads API key from `auth.json` via `getAuthEntry`/`normalizeAuthEntry` and base URL from `readConfigLayers().mergedConfig.provider[providerID]?.options?.baseURL`
- [x] 1.2 Replace `translateWithOpenCode` with `translateWithOpenAI` that constructs an OpenAI client and calls `chat.completions.create` with system message (prompt) and user message (source text)
- [x] 1.3 Remove all OpenCode session helpers (`createTemporarySession`, `sendTranslationPrompt`, `pollTranslatedText`, `deleteTemporarySession`, `buildOpenCodeRequestHeaders`, `parseOpenCodeJsonResponse`, `extractSessionID`, `extractFinishedAssistantText`, `buildTranslationUserPrompt`)
- [x] 1.4 Update `registerChatTranslationRoutes` to no longer accept `buildOpenCodeUrl`/`getOpenCodeAuthHeaders` and call `translateWithOpenAI` instead ← (verify: route handler returns same response shape, 400 on missing credentials with code `provider_not_configured`)

## 2. Route registration update

- [x] 2.1 Update `packages/web/server/lib/opencode/feature-routes-runtime.js` to remove `buildOpenCodeUrl` and `getOpenCodeAuthHeaders` from the `registerChatTranslationRoutes` call

## 3. UI: Default prompt display

- [x] 3.1 Add `DEFAULT_CHAT_TRANSLATION_PROMPT` constant to `packages/ui/src/components/sections/openchamber/ChatTranslationSettingsSection.tsx`
- [x] 3.2 Change textarea value from `settings.systemPrompt ?? ''` to `settings.systemPrompt || DEFAULT_CHAT_TRANSLATION_PROMPT` ← (verify: empty/undefined shows default, non-empty shows custom, clearing resets to default display)

## 4. Tests

- [x] 4.1 Update `packages/web/server/lib/chat-translation/routes.test.js` to mock OpenAI client instead of fetch/polling; test successful translation, missing credentials (400), and API error handling ← (verify: all existing test scenarios covered with new backend, no regressions)

## 5. Validation

- [x] 5.1 Run `bun run type-check` and fix any type errors
- [x] 5.2 Run `bun run lint` and fix any lint errors ← (verify: both commands pass cleanly)
