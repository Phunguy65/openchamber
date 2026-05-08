# Tasks

## 1. Settings Contract

- [x] 1.1 Add `autoTranslate` to the `ChatTranslationSettings` type.
- [x] 1.2 Sanitize and persist `autoTranslate` through existing settings handling without weakening validation.
- [x] 1.3 Implement soft legacy behavior so existing enabled settings without `autoTranslate` keep automatic translation, while new/explicit settings default to manual mode. ← (verify: `enabled: true` with missing `autoTranslate` remains auto, but explicit `autoTranslate: false` stays manual)

## 2. Settings UI and Localization

- [x] 2.1 Add a beta mark to the Settings > Chat translation section using existing beta label patterns and theme tokens.
- [x] 2.2 Add an Auto translate switch to the translation settings section and persist it with the existing settings API.
- [x] 2.3 Add or update localized labels, descriptions, aria labels, status text, and tooltips across all supported message dictionaries. ← (verify: no new user-facing hardcoded English appears in changed UI components)

## 3. Chat Translation Behavior

- [x] 3.1 Update assistant text translation triggering so automatic requests only start when auto translation is effectively enabled.
- [x] 3.2 Preserve current finalized-text-only, streaming skip, non-text skip, empty-text skip, loading, error, retry, and translated/original toggle behavior.
- [x] 3.3 Keep translation state narrow and avoid moving high-frequency translation state into broad shared stores. ← (verify: streaming assistant text does not repeatedly request translation or introduce broad render fanout)

## 4. Manual Footer Action

- [x] 4.1 Add a compact manual translation action at the far right of the final assistant message footer action row when translation is enabled, configured, manual mode is active, and finalized assistant text exists.
- [x] 4.2 Wire the footer action to request translation for the relevant finalized assistant text and reflect loading/error/translated-original state through existing inline translation UI.
- [x] 4.3 Hide the manual action when translation is disabled, unconfigured, auto translation is enabled, or no finalized assistant text is available.
- [x] 4.4 Mark the manual action surface as beta and make it keyboard operable with localized accessible names. ← (verify: action placement is after existing final-turn actions, including the Save as plan row controls, and remains usable on mobile)

## 5. Validation

- [x] 5.1 Add or update focused tests for settings sanitization and effective auto/manual translation mode behavior where existing test surfaces support it.
- [x] 5.2 Run `bun run type-check`.
- [x] 5.3 Run `bun run lint`. ← (verify: baseline validation passes with no type, lint, i18n, or theme-token regressions)
