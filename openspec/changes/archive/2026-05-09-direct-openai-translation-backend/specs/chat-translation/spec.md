# MODIFIED Requirements

## Requirement: Direct OpenAI-compatible translation backend

The translation backend SHALL call the configured provider directly using the `openai` npm package (OpenAI-compatible API) instead of routing through the OpenCode server session/prompt workflow.

### Scenario: Provider credentials resolved from OpenCode config

- **WHEN** a translation request is processed
- **THEN** the backend SHALL resolve the API key for the configured `providerID` from the OpenCode auth file (`~/.local/share/opencode/auth.json`) using the `getAuthEntry`/`normalizeAuthEntry` pattern (checking `key`, `token`, and `access` fields)
- **AND** SHALL resolve the base URL from the merged OpenCode config (`readConfigLayers().mergedConfig.provider[providerID]?.options?.baseURL`)
- **AND** SHALL construct an OpenAI client with the resolved `apiKey` and `baseURL`

### Scenario: Translation uses chat completions API

- **WHEN** the backend translates text
- **THEN** it SHALL call `openai.chat.completions.create` with the configured `modelID`, the system prompt as a system message, and the source text as a user message
- **AND** SHALL return the assistant response content as the translated text

### Scenario: Provider not configured

- **WHEN** the resolved provider has no API key available in auth.json
- **THEN** the backend SHALL reject the request with status 400 and code `provider_not_configured`

### Scenario: Provider base URL not configured

- **WHEN** the resolved provider has no base URL in the merged config
- **THEN** the backend SHALL proceed without a base URL (the OpenAI client will use its default endpoint)
- **AND** this is acceptable for providers like OpenAI that use the standard endpoint

## Requirement: Default system prompt displayed in settings UI

The system prompt textarea in the chat translation settings SHALL display the default prompt text when no custom prompt has been saved.

### Scenario: No custom prompt saved

- **WHEN** the user has not set a custom system prompt (value is empty string or undefined)
- **THEN** the textarea SHALL display the `DEFAULT_CHAT_TRANSLATION_PROMPT` constant value as its content (not as placeholder text)
- **AND** the placeholder text SHALL remain as helper text describing the field purpose

### Scenario: User clears the prompt

- **WHEN** the user clears the system prompt textarea completely
- **THEN** the persisted value SHALL be empty string
- **AND** the backend SHALL use `DEFAULT_CHAT_TRANSLATION_PROMPT` as the effective prompt (existing behavior preserved)
- **AND** the textarea SHALL display the default prompt constant value again

### Scenario: User has a custom prompt

- **WHEN** the user has saved a non-empty custom system prompt
- **THEN** the textarea SHALL display the user's custom prompt as its value

## Requirement: Translation route registration simplified

The chat translation route registration SHALL no longer require `buildOpenCodeUrl` or `getOpenCodeAuthHeaders` dependencies.

### Scenario: Route registration dependencies

- **WHEN** `registerChatTranslationRoutes` is called
- **THEN** it SHALL only require `readSettingsFromDiskMigrated` as a dependency
- **AND** SHALL resolve provider credentials internally using `readAuthFile` and `readConfigLayers`
