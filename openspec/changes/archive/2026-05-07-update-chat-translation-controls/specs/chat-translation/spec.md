# MODIFIED Requirements

## Requirement: Translation settings

The system SHALL provide persisted chat translation settings that allow users to enable translation, choose whether translation runs automatically, choose a target language, choose an OpenCode provider/model, and override the translation system prompt.

### Scenario: Translation settings are saved

- **WHEN** the user updates translation enablement, auto translation, target language, provider, model, or system prompt in Settings > Chat
- **THEN** the system persists sanitized settings through the existing settings API

### Scenario: Translation settings are unavailable or incomplete

- **WHEN** translation is enabled but target language or provider/model configuration is missing
- **THEN** the system SHALL not send translation requests and SHALL show a configuration state that explains what is missing

### Scenario: Translation is disabled by default

- **WHEN** existing users load the application without translation settings
- **THEN** translation SHALL be disabled and chat messages SHALL render as original assistant text

### Scenario: Auto translation is disabled by default for new settings

- **WHEN** the user enables or configures chat translation for a settings object that does not already preserve legacy automatic behavior
- **THEN** auto translation SHALL be disabled unless the user explicitly enables Auto translate

### Scenario: Existing enabled translation preserves automatic behavior

- **WHEN** an existing persisted chat translation setting has translation enabled and no persisted auto translation preference
- **THEN** the system SHALL treat auto translation as enabled until the user explicitly saves an auto translation preference

### Scenario: Translation is marked beta in settings

- **WHEN** the system renders the Settings > Chat translation section
- **THEN** the section SHALL visibly mark chat translation as beta using the existing localized beta label pattern

## Requirement: Assistant text block translation

The system SHALL translate finalized assistant text blocks to the configured target language using the configured OpenCode provider/model when automatic translation is enabled or when the user invokes manual translation.

### Scenario: Finalized assistant text is automatically translated

- **WHEN** translation is enabled, configured, auto translation is effectively enabled, and an assistant text part has finalized content
- **THEN** the system SHALL request a translation for that text part through the backend translation endpoint

### Scenario: Finalized assistant text waits for manual translation

- **WHEN** translation is enabled, configured, auto translation is disabled, and an assistant text part has finalized content
- **THEN** the system SHALL render the original assistant text without sending a translation request until the user invokes manual translation

### Scenario: User manually translates finalized assistant text

- **WHEN** translation is enabled, configured, auto translation is disabled, and the user activates the message translation action for a finalized assistant text block
- **THEN** the system SHALL request a translation for that text block through the backend translation endpoint

### Scenario: Streaming assistant text is not translated repeatedly

- **WHEN** an assistant text part is still streaming or in cooldown
- **THEN** the system SHALL not repeatedly invoke translation for streaming deltas

### Scenario: Non-text content is excluded

- **WHEN** a message part is a user message, reasoning part, tool output, or other non-assistant text content
- **THEN** the system SHALL not request translation for that content

### Scenario: Empty text is skipped

- **WHEN** an assistant text part is empty or only whitespace
- **THEN** the system SHALL not request translation for that part

## Requirement: Translation rendering

The system SHALL render assistant text blocks with an in-place toggle between translated and original content and SHALL provide a manual translation action in the final assistant message footer when automatic translation is disabled.

### Scenario: Translated text replaces original view

- **WHEN** a translation is available for an assistant text block
- **THEN** the block SHALL display either translated text or original text in the same location, not both expanded together

### Scenario: User toggles between translated and original

- **WHEN** the user activates the translated/original toggle
- **THEN** the system SHALL replace the displayed content in place without expand/collapse animation

### Scenario: Original text remains available

- **WHEN** translated text is displayed
- **THEN** the user SHALL be able to switch back to the original assistant text

### Scenario: Translation loading state

- **WHEN** translation is pending for a finalized assistant text block
- **THEN** the system SHALL keep the original text readable and show a localized loading indicator

### Scenario: Translation error state

- **WHEN** translation fails for an assistant text block
- **THEN** the system SHALL keep the original text readable and show an inline error with a retry action

### Scenario: Manual translation action placement

- **WHEN** translation is enabled and configured for a final assistant message while automatic translation is disabled
- **THEN** the system SHALL render a manual translation action at the far right of the final assistant message footer action row, alongside the row that contains Save as plan

### Scenario: Manual translation action beta label

- **WHEN** the manual translation action is rendered
- **THEN** the action surface SHALL identify translation as beta using localized UI text

### Scenario: Manual translation action hidden when unavailable

- **WHEN** translation is disabled, unconfigured, the message has no finalized assistant text, or automatic translation is enabled
- **THEN** the system SHALL not render the manual translation action

### Scenario: Manual translation action accessibility

- **WHEN** the manual translation action is rendered
- **THEN** it SHALL provide a localized accessible name and keyboard-operable control semantics

## Requirement: Translation request robustness

The system SHALL handle translation request limits, stale settings, auto/manual mode changes, and retries deterministically.

### Scenario: Translation result is keyed by settings

- **WHEN** target language, provider, model, system prompt, or effective translation mode changes
- **THEN** previously cached translation results SHALL not be reused for new translation requests with different settings or mode behavior

### Scenario: Retry uses current settings

- **WHEN** the user retries a failed translation
- **THEN** the retry SHALL use the current persisted translation settings

### Scenario: Input exceeds allowed limits

- **WHEN** the translation input or system prompt exceeds backend limits
- **THEN** the backend SHALL reject the request with a deterministic error and the UI SHALL show the inline error state
