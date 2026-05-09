# Context

OpenChamber renders assistant message text in `AssistantTextPart` through markdown rendering, with message assembly handled by `MessageBody`. That path is performance-sensitive during streaming, so translation must not run on every delta or force broad store updates.

Settings are persisted through `/api/config/settings`, typed by `DesktopSettings`, and sanitized in `settings-helpers.js`. New translation settings must follow that pattern so web, desktop, and VS Code runtimes share the same contract.

## Goals / Non-Goals

**Goals:**

- Add a Chat settings section for translation enablement, target language, OpenCode provider/model selection, and system prompt override.
- Persist and sanitize all translation settings server-side.
- Translate finalized assistant text parts through backend OpenCode model invocation.
- Render translated/original text as a replace-in-place view with no expand/collapse animation.
- Preserve markdown rendering and original text availability.
- Provide loading, error, retry, disabled, and missing-configuration UI states.

**Non-Goals:**

- Translate user messages.
- Translate reasoning parts.
- Translate tool output.
- Translate code fences or alter code syntax.
- Add a new external translation service or dependency.
- Add E2E coverage for live LLM translation in the first implementation.

## Decisions

1. Store translation settings in the existing settings contract.

   Persist fields on `/api/config/settings` rather than local-only state. This follows existing settings patterns and keeps runtime behavior consistent across web, desktop, and VS Code bridges. Server sanitization must validate booleans, language strings, provider/model strings, and system prompt length.

2. Place the UI under Settings > Chat.

   Translation changes how assistant messages are displayed, so it belongs with chat rendering settings instead of Behavior. Behavior controls assistant instruction behavior during normal conversations, while translation is a post-processing display feature.

3. Translate only finalized assistant text parts.

   Translation must wait until a text part is finalized to avoid repeated LLM calls during streaming and to avoid render cascades in the message hot path. Reasoning, tool output, and non-text parts are excluded.

4. Use a backend translation endpoint.

   The UI sends the original assistant text and relevant identifiers to the backend. The backend reads sanitized settings, verifies translation is enabled and configured, builds the system prompt, invokes OpenCode with the selected provider/model, and returns translated markdown. This keeps model invocation and prompt policy server-side.

5. Preserve code fences and markdown structure.

   The default translation system prompt must instruct the translator to preserve code fences, inline code, file paths, commands, URLs, markdown structure, and technical identifiers. The UI still renders translated content through existing markdown rendering.

6. Replace in place between translated and original views.

   Each translated block shows either the translated markdown or original markdown at one time. Toggling changes the displayed content in the same block without expand/collapse animation. This matches the user's UX preference and prevents chat height from doubling by default.

7. Keep translation state narrow.

   Store translation results keyed by session/message/part and a settings-derived key. Avoid placing high-frequency or broad translation state into common stores consumed by shell/layout components. Translation requests should be deduplicated per key and skipped for empty text.

## Risks / Trade-offs

- LLM translation can be slow or costly → show the original immediately, translate asynchronously, and expose inline retry on failure.
- LLM can alter code or markdown → use a strict default system prompt and exclude code/tool/reasoning content from translation scope.
- Settings may reference a missing provider/model → disable translation calls for missing configuration and show a clear configuration state in UI.
- Translation state can cause render churn → trigger only after finalization and keep subscriptions localized to assistant text blocks.
- Translation may become stale after settings change → key cached results by translation settings so a language/model/prompt change creates new translation results.

## Migration Plan

Existing users default to translation disabled. Missing translation settings are treated as disabled with empty/default values. Rollback is safe because the new settings are optional and the chat renderer can fall back to original content.

## Open Questions

None.
