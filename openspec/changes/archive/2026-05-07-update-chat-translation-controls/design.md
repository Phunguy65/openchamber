# Context

Chat translation is already implemented as a Settings > Chat feature with persisted settings, backend translation route validation, and in-place assistant text rendering. The current assistant text path automatically requests translation for finalized assistant text whenever translation is enabled and configured, which makes enabled translation equivalent to auto translation.

The requested change separates feature availability from automatic execution. Translation remains configured in Settings > Chat, but users can leave automatic translation off and invoke translation manually from the assistant message footer action row. The chat rendering path is performance-sensitive during streaming, so the manual control must not introduce broad subscriptions or repeated translation requests.

## Goals / Non-Goals

**Goals:**

- Mark chat translation as beta in Settings and in the chat action surface.
- Persist an `autoTranslate` setting as part of `chatTranslation`.
- Keep existing automatic behavior when `autoTranslate` is enabled.
- Default newly configured translation behavior to manual translation.
- Preserve automatic behavior for previously enabled configurations that do not yet contain `autoTranslate`.
- Add a manual translation action at the far right of the final assistant message footer action row.
- Preserve current loading, error, retry, translated/original toggle, cache keying, and finalized-text-only rules.

**Non-Goals:**

- Add a new translation backend, provider, or dependency.
- Translate user messages, reasoning, tool output, or non-text parts.
- Change the backend translation endpoint request/response contract beyond reading the existing persisted settings.
- Add shell-specific desktop behavior.

## Decisions

1. Add `autoTranslate?: boolean` instead of changing `enabled` semantics.

   `enabled` continues to mean that chat translation is available and configured. `autoTranslate` controls whether the UI automatically starts translation after assistant text finalizes. This avoids conflating feature availability with execution mode and keeps manual translation possible while the feature is enabled.

   Alternative considered: reinterpret `enabled` as auto translation and add a second manual-only feature flag. That would be more confusing because existing settings and backend validation already use `enabled` as the feature gate.

2. Use a soft migration for existing enabled configurations.

   If a persisted `chatTranslation` object has `enabled: true` and no `autoTranslate` field, the UI treats automatic translation as enabled. Newly created or explicitly updated settings default `autoTranslate` to `false`, so manual mode becomes the new default without surprising existing users.

   Alternative considered: make missing `autoTranslate` always false. That would satisfy the new default but would silently change behavior for users who already enabled translation.

3. Keep translation request state local to assistant text parts and expose manual triggering through narrow props/callbacks.

   The existing translation cache and state are localized in `AssistantTextPart`. Manual controls in the footer should trigger translation without moving high-frequency state into broad stores or making the message shell subscribe to large collections. The implementation should preserve streaming performance and only update the affected message/part state.

   Alternative considered: introduce a global translation store. That would make footer controls easier to coordinate but adds render fanout risk for a narrow per-message feature.

4. Place the manual action at the far right of the final assistant footer action row.

   The existing final assistant footer already contains message-level actions including Save as plan. Adding the manual translate action there keeps it discoverable near related message actions and matches the requested placement.

   Alternative considered: keep controls inline under each translated text part only. That preserves current locality but does not satisfy the requested placement beside Save as plan row controls.

5. Use existing theme, button, tooltip, switch, and i18n patterns.

   UI changes must use shared components, theme tokens, and localized strings. Beta text should reuse existing beta copy where possible and add specific action/settings labels where needed.

## Risks / Trade-offs

- Manual footer control may need to coordinate with one or more assistant text parts in a message -> Scope manual translation to assistant text content that the current message already considers exportable/copyable, and preserve per-part cache/state semantics where practical.
- Existing enabled settings without `autoTranslate` are ambiguous -> Treat only `enabled: true` plus missing field as legacy auto; all explicit `autoTranslate: false` settings remain manual.
- Adding footer state could widen render updates -> Keep translation state out of broad stores and avoid subscribing layout/shell components to high-frequency translation internals.
- Mobile footer space is limited -> Use compact icon button plus tooltip/aria text and place it at the requested far-right position.
