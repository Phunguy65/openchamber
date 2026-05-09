# MODIFIED Requirements

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
