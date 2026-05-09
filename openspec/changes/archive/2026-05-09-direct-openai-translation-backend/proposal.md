# Why

The chat translation backend currently routes through the OpenCode server session/prompt workflow — creating temporary sessions, polling for responses, and deleting sessions. This is heavyweight, adds latency, and couples translation to OpenCode server availability. Replacing it with a direct OpenAI-compatible API call simplifies the architecture, reduces latency, and removes the dependency on OpenCode session management for a simple completion task.

Additionally, the settings UI shows an empty textarea when no custom system prompt is saved, giving users no visibility into what prompt is actually being used for translation.

## What Changes

- Replace `translateWithOpenCode` (session create → prompt → poll → delete) with a direct `openai.chat.completions.create` call using the `openai` npm package (already a dependency).
- Resolve provider credentials (API key and base URL) from `~/.local/share/opencode/auth.json` and merged OpenCode config (`provider.<id>.options.baseURL`).
- Return 400 with code `provider_not_configured` when credentials cannot be resolved.
- Remove `buildOpenCodeUrl` and `getOpenCodeAuthHeaders` dependencies from the chat translation route registration.
- Display `DEFAULT_CHAT_TRANSLATION_PROMPT` as the textarea value in the settings UI when no custom prompt has been saved (duplicated as a UI constant).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `chat-translation`: Backend switches from OpenCode session workflow to direct OpenAI-compatible API; UI displays default prompt when no custom prompt is saved.

## Impact

- `packages/web/server/lib/chat-translation/routes.js` — backend translation function rewritten
- `packages/web/server/lib/opencode/feature-routes-runtime.js` — route registration simplified (fewer deps)
- `packages/ui/src/components/sections/openchamber/ChatTranslationSettingsSection.tsx` — textarea default value
- `packages/web/server/lib/chat-translation/routes.test.js` — tests updated for new backend
- No new dependencies (uses existing `openai` package)
- No breaking changes to the `/api/chat/translate` HTTP contract (same request/response shape)
