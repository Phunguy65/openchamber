# chat-translation Specification

## Purpose
TBD - created by archiving change add-chat-translation. Update Purpose after archive.
## Requirements
### Requirement: Translation settings

The system SHALL provide persisted chat translation settings that allow users to enable translation, choose a target language, choose an OpenCode provider/model, and override the translation system prompt.

#### Scenario: Translation settings are saved

-  **WHEN** the user updates translation enablement, target language, provider, model, or system prompt in Settings > Chat
-  **THEN** the system persists sanitized settings through the existing settings API

#### Scenario: Translation settings are unavailable or incomplete

-  **WHEN** translation is enabled but target language or provider/model configuration is missing
-  **THEN** the system SHALL not send translation requests and SHALL show a configuration state that explains what is missing

#### Scenario: Translation is disabled by default

-  **WHEN** existing users load the application without translation settings
-  **THEN** translation SHALL be disabled and chat messages SHALL render as original assistant text

### Requirement: Assistant text block translation

The system SHALL translate finalized assistant text blocks to the configured target language using the configured OpenCode provider/model.

#### Scenario: Finalized assistant text is translated

-  **WHEN** translation is enabled, configured, and an assistant text part has finalized content
-  **THEN** the system SHALL request a translation for that text part through the backend translation endpoint

#### Scenario: Streaming assistant text is not translated repeatedly

-  **WHEN** an assistant text part is still streaming or in cooldown
-  **THEN** the system SHALL not repeatedly invoke translation for streaming deltas

#### Scenario: Non-text content is excluded

-  **WHEN** a message part is a user message, reasoning part, tool output, or other non-assistant text content
-  **THEN** the system SHALL not request translation for that content

#### Scenario: Empty text is skipped

-  **WHEN** an assistant text part is empty or only whitespace
-  **THEN** the system SHALL not request translation for that part

### Requirement: Translation rendering

The system SHALL render assistant text blocks with an in-place toggle between translated and original content.

#### Scenario: Translated text replaces original view

-  **WHEN** a translation is available for an assistant text block
-  **THEN** the block SHALL display either translated text or original text in the same location, not both expanded together

#### Scenario: User toggles between translated and original

-  **WHEN** the user activates the translated/original toggle
-  **THEN** the system SHALL replace the displayed content in place without expand/collapse animation

#### Scenario: Original text remains available

-  **WHEN** translated text is displayed
-  **THEN** the user SHALL be able to switch back to the original assistant text

#### Scenario: Translation loading state

-  **WHEN** translation is pending for a finalized assistant text block
-  **THEN** the system SHALL keep the original text readable and show a localized loading indicator

#### Scenario: Translation error state

-  **WHEN** translation fails for an assistant text block
-  **THEN** the system SHALL keep the original text readable and show an inline error with a retry action

### Requirement: Translation prompt safety

The system SHALL use a default translation prompt that preserves code, markdown structure, and technical identifiers unless the user provides an override.

#### Scenario: Default prompt preserves code and structure

-  **WHEN** the backend builds a translation request without a custom system prompt
-  **THEN** the default prompt SHALL instruct the model to translate prose while preserving code fences, inline code, commands, URLs, file paths, markdown structure, and technical identifiers

#### Scenario: Custom prompt overrides default prompt

-  **WHEN** the user has configured a non-empty translation system prompt
-  **THEN** the backend SHALL use that prompt instead of the default translation prompt

### Requirement: Translation request robustness

The system SHALL handle translation request limits, stale settings, and retries deterministically.

#### Scenario: Translation result is keyed by settings

-  **WHEN** target language, provider, model, or system prompt changes
-  **THEN** previously cached translation results SHALL not be reused for new translation requests with different settings

#### Scenario: Retry uses current settings

-  **WHEN** the user retries a failed translation
-  **THEN** the retry SHALL use the current persisted translation settings

#### Scenario: Input exceeds allowed limits

-  **WHEN** the translation input or system prompt exceeds backend limits
-  **THEN** the backend SHALL reject the request with a deterministic error and the UI SHALL show the inline error state

