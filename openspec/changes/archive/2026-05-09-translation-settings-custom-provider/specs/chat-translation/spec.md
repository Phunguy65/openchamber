# MODIFIED Requirements

## Requirement: Direct OpenAI-compatible translation backend

The translation backend SHALL call the configured provider directly using the `openai` npm package (OpenAI-compatible API) instead of routing through the OpenCode server session/prompt workflow.

### Scenario: Provider credentials resolved from settings-stored values

- **WHEN** a translation request is processed
- **AND** the persisted translation settings contain both `apiKey` and `baseURL`
- **THEN** the backend SHALL use the settings-stored `apiKey` and `baseURL` to construct the OpenAI client
- **AND** SHALL NOT attempt auth.json or OpenCode config resolution

### Scenario: Provider credentials fallback to OpenCode config

- **WHEN** a translation request is processed
- **AND** the persisted translation settings do NOT contain both `apiKey` and `baseURL`
- **THEN** the backend SHALL resolve the API key and base URL for the configured `providerID` from the OpenCode auth file (`~/.local/share/opencode/auth.json`) and merged config (`~/.config/opencode/config.json` provider options)
- **AND** SHALL construct an OpenAI client with the resolved `apiKey` and `baseURL`

### Scenario: Translation uses chat completions API

- **WHEN** the backend translates text
- **THEN** it SHALL call `openai.chat.completions.create` with the configured `modelID`, the system prompt as a system message, and the source text as a user message
- **AND** SHALL return the assistant response content as the translated text

### Scenario: Provider not configured

- **WHEN** neither settings-stored credentials nor auth.json credentials can be resolved
- **THEN** the backend SHALL reject the request with status 400 and code `provider_not_configured`

### Scenario: providerID not required with direct credentials

- **WHEN** the persisted translation settings contain both `apiKey` and `baseURL`
- **THEN** the backend SHALL NOT require `providerID` for request validation
- **AND** SHALL require only `modelID` and target language

## Requirement: Model discovery endpoint

The backend SHALL provide an endpoint to fetch available models from an OpenAI-compatible endpoint.

### Scenario: Fetch models with valid credentials

- **WHEN** a POST request is made to `/api/chat/translation/models` with `apiKey` and `baseURL` in the request body
- **THEN** the backend SHALL construct an OpenAI client with the provided credentials
- **AND** SHALL call `client.models.list()` to fetch available models
- **AND** SHALL return a JSON response `{models: [{id, owned_by}]}` with at most 500 entries

### Scenario: Fetch models with missing credentials

- **WHEN** a POST request is made to `/api/chat/translation/models` without `apiKey` or `baseURL`
- **THEN** the backend SHALL reject with status 400 and code `missing_credentials`

### Scenario: Fetch models endpoint failure

- **WHEN** the models list request to the remote endpoint fails (network error, auth error, endpoint not found)
- **THEN** the backend SHALL return status 502 with the error message and code `models_fetch_failed`

## Requirement: Translation settings with custom provider configuration

The translation settings SHALL allow users to configure API key, base URL, and model selection via the v1/models endpoint.

### Scenario: API key field persisted

- **WHEN** the user enters an API key in the translation settings
- **THEN** the system SHALL persist the value as `chatTranslation.apiKey` (max 256 characters, trimmed)
- **AND** the UI SHALL display the field as a masked/password input

### Scenario: Base URL field persisted

- **WHEN** the user enters a base URL in the translation settings
- **THEN** the system SHALL persist the value as `chatTranslation.baseURL` (max 512 characters, trimmed)

### Scenario: Model picker populated from endpoint

- **WHEN** the user clicks "Fetch Models" with non-empty API key and base URL
- **THEN** the UI SHALL call `POST /api/chat/translation/models` with the current API key and base URL
- **AND** SHALL populate a model dropdown with the returned model IDs
- **AND** SHALL show a loading state during the fetch
- **AND** SHALL show an inline error if the fetch fails

### Scenario: Model selected from fetched list

- **WHEN** the user selects a model from the fetched dropdown
- **THEN** the system SHALL persist the value as `chatTranslation.modelID`

### Scenario: Model ID manual entry fallback

- **WHEN** the model fetch fails or the user prefers manual entry
- **THEN** the model field SHALL accept direct text input for the model ID

### Scenario: Settings fields cleared

- **WHEN** the user clears the API key or base URL fields
- **THEN** the persisted value SHALL be removed (undefined)
- **AND** the backend SHALL fall back to auth.json credential resolution on next translation request
