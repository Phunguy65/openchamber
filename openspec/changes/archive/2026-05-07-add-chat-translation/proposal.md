# Why

OpenChamber currently shows assistant responses only in the language produced by the selected chat model. Users who prefer another reading language need a built-in way to translate assistant text blocks without changing the original assistant behavior or risking modifications to code/tool output.

## What Changes

- Add persisted chat translation settings under Settings > Chat.
- Allow users to enable or disable translation, choose a target language, select an OpenCode provider/model for translation, and override the default translation system prompt.
- Translate finalized assistant text blocks through a backend endpoint using the configured OpenCode model.
- Render either the translated text or the original text in place, replacing the current block view when toggled, with no expand/collapse animation.
- Preserve original text availability and show inline translation errors with a retry action.
- Do not translate user messages, reasoning parts, tool output, or code fences.

## Capabilities

### New Capabilities

- `chat-translation`: User-configurable translation of finalized assistant chat text blocks.

### Modified Capabilities

None.

## Impact

- Settings contract and persistence: `DesktopSettings`, `/api/config/settings`, settings sanitization and formatting.
- Settings UI: Chat settings page and i18n messages.
- Backend API: new translation route or route module that invokes OpenCode with the configured translation model.
- Chat rendering: assistant text block rendering, translation state, loading/error/retry controls, original/translated replace toggle.
- Tests: settings sanitization, translation request/prompt behavior, route error handling, and UI helper behavior where practical.
