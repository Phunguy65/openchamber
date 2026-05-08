# Why

Chat translation currently starts automatically whenever translation is enabled and configured. Users need clearer beta labeling and a separate auto-translation preference so translation can be available on demand without forcing every finalized assistant text block through automatic translation.

## What Changes

- Mark chat translation as a beta feature in both the Settings > Chat translation section and the chat translation action surface.
- Add a persisted `autoTranslate` chat translation setting.
- Preserve current automatic translation behavior when `autoTranslate` is enabled.
- Default newly configured translation behavior to manual translation through a chat footer action.
- Preserve automatic translation for existing enabled translation configurations that predate the new `autoTranslate` field.
- Add a manual translation toggle/action at the far right of the final assistant message footer action row, alongside the existing Save as plan row controls.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chat-translation`: Add beta labeling, auto/manual translation mode, existing-setting migration behavior, and a manual chat footer translation action.

## Impact

- OpenSpec capability: `openspec/specs/chat-translation/spec.md` and change delta spec.
- Settings contract and persistence: `ChatTranslationSettings`, settings sanitization, and settings update payloads.
- Settings UI: Chat translation section copy, beta badge, and Auto translate switch.
- Chat rendering: assistant text part translation trigger behavior and final assistant message footer actions.
- Localization: user-facing labels, descriptions, tooltips, aria labels, and status text for all supported dictionaries.
- Validation: TypeScript, linting, and focused tests where existing test surfaces support settings sanitization or translation behavior.
