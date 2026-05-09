# MODIFIED Requirements

## Requirement: Direct OpenAI-compatible translation backend

The translation backend SHALL call the configured provider directly using the `openai` npm package (OpenAI-compatible API) instead of routing through the OpenCode server session/prompt workflow.

### Scenario: Provider credentials resolved from OpenCode config

- **WHEN** a translation request is processed
- **THEN** the backend SHALL resolve the API key and base URL for the configured `providerID` from the OpenCode auth file (`~/.local/share/opencode/auth.json`) and merged config (`~/.config/opencode/config.json` provider options)
- **AND** SHALL construct an OpenAI client with the resolved `apiKey` and `baseURL`

### Scenario: Translation uses chat completions API

- **WHEN** the backend translates text
- **THEN** it SHALL call `openai.chat.completions.create` with the configured `modelID`, the system prompt as a system message, and the source text as a user message
- **AND** SHALL return the assistant response content as the translated text

### Scenario: Provider not configured

- **WHEN** the resolved provider has no API key or base URL available
- **THEN** the backend SHALL reject the request with status 400 and code `provider_not_configured`

## Requirement: Default system prompt displayed in settings UI

The system prompt textarea in the chat translation settings SHALL display the default prompt text when no custom prompt has been saved.

### Scenario: No custom prompt saved

- **WHEN** the user has not set a custom system prompt (value is empty string or undefined)
- **THEN** the textarea SHALL display the `DEFAULT_CHAT_TRANSLATION_PROMPT` constant value as its content
- **AND** the placeholder text SHALL remain as helper text describing the field purpose

### Scenario: User clears the prompt

- **WHEN** the user clears the system prompt textarea completely
- **THEN** the persisted value SHALL be empty string
- **AND** the backend SHALL use `DEFAULT_CHAT_TRANSLATION_PROMPT` as the effective prompt (existing behavior preserved)

## Requirement: Translation request robustness

The system SHALL handle translation request limits, stale settings, auto/manual mode changes, retries, concurrency, cancellation, and cache eviction deterministically.

### Scenario: Translation result is keyed by settings

- **WHEN** target language, provider, model, system prompt, or effective translation mode changes
- **THEN** previously cached translation results SHALL not be reused for new translation requests with different settings or mode behavior

### Scenario: Retry uses current settings

- **WHEN** the user retries a failed translation
- **THEN** the retry SHALL use the current persisted translation settings

### Scenario: Input exceeds allowed limits

- **WHEN** the translation input or system prompt exceeds backend limits
- **THEN** the backend SHALL reject the request with a deterministic error and the UI SHALL show the inline error state

### Scenario: Concurrent translation requests are bounded

- **WHEN** multiple translation requests are initiated simultaneously
- **THEN** the backend SHALL process at most 4 concurrently and queue the remainder in FIFO order

### Scenario: Translation request cancelled on navigation

- **WHEN** the user navigates away from a session while translation requests are in-flight
- **THEN** the client SHALL abort pending requests and SHALL not store results from aborted requests in the cache

### Scenario: Cache eviction does not lose actively displayed translations

- **WHEN** the translation cache evicts entries due to size limits
- **THEN** entries with status loading SHALL be preserved until they complete or are aborted
