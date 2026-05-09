# Tasks

## 1. Settings Contract

- [x] 1.1 Add translation settings fields to `DesktopSettings` with disabled-by-default semantics
- [x] 1.2 Sanitize and format translation settings in the server settings helpers with explicit type and length validation
- [x] 1.3 Ensure runtime settings loading handles missing translation fields as disabled without migration errors ← (verify: existing settings responses remain backward compatible and do not expose unsafe values)

## 2. Backend Translation API

- [x] 2.1 Add a focused backend translation route/module for assistant text block translation
- [x] 2.2 Build translation request validation for target language, provider/model, text length, and prompt length
- [x] 2.3 Implement default translation prompt construction that preserves markdown, code fences, inline code, commands, URLs, paths, and technical identifiers
- [x] 2.4 Invoke OpenCode using the configured provider/model and return translated markdown or deterministic errors
- [x] 2.5 Add tests for settings sanitization, prompt construction, invalid requests, disabled/missing configuration, and route error handling ← (verify: backend rejects unsafe/oversized inputs and never translates when disabled or unconfigured)

## 3. Settings UI

- [x] 3.1 Add a Translate settings section under Settings > Chat using existing settings page patterns and theme tokens
- [x] 3.2 Add controls for enablement, target language dropdown, custom language input, provider/model selection, and system prompt override
- [x] 3.3 Persist settings through the existing settings API and show loading/error/disabled/missing-configuration states
- [x] 3.4 Add localized settings strings and accessible labels for all controls ← (verify: controls are keyboard accessible, labeled, and use theme tokens without hardcoded colors)

## 4. Chat Translation Rendering

- [x] 4.1 Add localized translation state management keyed by session, message, part, and translation settings
- [x] 4.2 Trigger translation only for finalized assistant `text` parts and skip streaming, reasoning, tool output, non-text parts, and empty text
- [x] 4.3 Render translated/original content as a replace-in-place view with no expand/collapse animation
- [x] 4.4 Show original text while loading, inline error with Retry on failure, and use current settings for retries
- [x] 4.5 Avoid broad store subscriptions or hot-path render fanout in assistant message rendering ← (verify: streaming deltas do not trigger repeated translation requests or broad rerender cascades)

## 5. Validation

- [x] 5.1 Run targeted tests added for translation settings and backend translation behavior
- [x] 5.2 Run `bun run type-check`
- [x] 5.3 Run `bun run lint`
- [x] 5.4 Manually inspect translation UI behavior for disabled, missing configuration, loading, translated, original, error, and retry states ← (verify: UI replaces content in place when toggling original/translated and does not expand both versions)
