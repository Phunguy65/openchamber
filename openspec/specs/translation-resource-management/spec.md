# ADDED Requirements

## Requirement: Translation cache bounded eviction

The system SHALL maintain the frontend translation cache within bounded memory limits using LRU eviction with dual constraints: maximum 200 entries and maximum 10MB estimated byte budget.

### Scenario: Cache exceeds entry count limit

- **WHEN** the translation cache contains 200 entries and a new translation result is stored
- **THEN** the system SHALL evict the least recently used entry before inserting the new one

### Scenario: Cache exceeds byte budget limit

- **WHEN** the translation cache total estimated bytes exceeds 10MB and a new translation result is stored
- **THEN** the system SHALL evict least recently used entries until total bytes falls below 10MB

### Scenario: Cache access refreshes LRU position

- **WHEN** a cached translation is read (cache hit)
- **THEN** the system SHALL move that entry to the most recently used position

### Scenario: Cache eviction preserves in-progress translations

- **WHEN** eviction runs and an entry has status loading
- **THEN** the system SHALL skip that entry and evict the next oldest idle or completed entry

## Requirement: Hash-based cache key

The system SHALL use a hash-based key for translation cache entries instead of embedding the full original text in the key.

### Scenario: Cache key uses hash instead of full text

- **WHEN** a translation cache key is computed for a text part
- **THEN** the key SHALL use the format `sessionId:messageId:partId:settingsKey:textLength:textHash` where textHash is a 32-bit FNV-1a hash of the text content

### Scenario: Different texts produce different cache keys

- **WHEN** two text parts have identical session, message, part, and settings but different text content
- **THEN** the system SHALL produce different cache keys (via length + hash differentiation)

## Requirement: In-flight request deduplication

The system SHALL ensure that only one translation request is in-flight for a given cache key at any time.

### Scenario: Duplicate request while translation is in-flight

- **WHEN** a translation request is initiated for a cache key that already has an in-flight request
- **THEN** the system SHALL return the existing in-flight promise instead of creating a new request

### Scenario: In-flight tracking cleared on completion

- **WHEN** a translation request completes (success or error)
- **THEN** the system SHALL remove the in-flight entry so future requests for the same key can proceed

## Requirement: Staggered auto-translate scheduling

The system SHALL stagger auto-translate requests with incremental delay to prevent thundering herd when a session with many messages is opened.

### Scenario: Auto-translate fires for multiple messages on session open

- **WHEN** auto-translate is enabled and a session is opened with N finalized assistant text parts
- **THEN** the system SHALL schedule translation requests with 300ms incremental delay (request 1: immediate, request 2: +300ms, request 3: +600ms, etc.)

### Scenario: Stagger queue cleared on session switch

- **WHEN** the user switches to a different session while staggered translations are pending
- **THEN** the system SHALL cancel all pending staggered timers for the previous session

### Scenario: Manual translation bypasses stagger

- **WHEN** the user manually triggers translation for a specific message
- **THEN** the system SHALL execute the translation request immediately without stagger delay

## Requirement: Centralized translation settings

The system SHALL provide translation settings through a shared singleton hook instead of per-component independent fetches.

### Scenario: First subscriber triggers settings fetch

- **WHEN** the first component subscribes to translation settings
- **THEN** the system SHALL fetch settings once from the server

### Scenario: Subsequent subscribers receive cached settings

- **WHEN** additional components subscribe to translation settings after the initial fetch
- **THEN** the system SHALL return the cached settings without additional network requests

### Scenario: Settings update propagates to all subscribers

- **WHEN** the `openchamber:settings-synced` event fires with updated settings
- **THEN** all subscribed components SHALL receive the updated translation settings

## Requirement: Translation request abort on unmount

The system SHALL abort in-flight translation requests when the requesting component unmounts or the user switches sessions.

### Scenario: Component unmounts during translation

- **WHEN** an AssistantTextPart component unmounts while its translation request is in-flight
- **THEN** the system SHALL abort the fetch request via AbortController signal

### Scenario: Session switch aborts pending translations

- **WHEN** the user switches to a different session while translations are in-flight for the previous session
- **THEN** the system SHALL abort all in-flight translation requests for the previous session

### Scenario: Aborted request does not update cache

- **WHEN** a translation request is aborted
- **THEN** the system SHALL not store any result (success or error) in the translation cache for that request
