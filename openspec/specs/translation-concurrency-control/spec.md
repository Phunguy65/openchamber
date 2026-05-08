# ADDED Requirements

## Requirement: Backend translation concurrency limit

The system SHALL limit the number of concurrent translation requests processed by the backend to a maximum of 4 simultaneous in-flight translations.

### Scenario: Translation request within concurrency limit

- **WHEN** fewer than 4 translation requests are currently in-flight and a new request arrives
- **THEN** the system SHALL process the request immediately

### Scenario: Translation request exceeds concurrency limit

- **WHEN** 4 translation requests are currently in-flight and a new request arrives
- **THEN** the system SHALL queue the request and process it when a slot becomes available (FIFO order)

### Scenario: Queued request inherits normal timeout behavior

- **WHEN** a queued translation request begins processing after waiting
- **THEN** the request SHALL use the standard polling timeout (120s) starting from when processing begins, not from when the request was received

## Requirement: Translation session cleanup logging

The system SHALL log temporary session deletion failures instead of silently swallowing them.

### Scenario: Session deletion fails after successful translation

- **WHEN** a translation completes successfully but the temporary session deletion fails
- **THEN** the system SHALL log a warning with the failure reason and still return the successful translation result

### Scenario: Session deletion fails after translation error

- **WHEN** a translation fails and the temporary session deletion also fails
- **THEN** the system SHALL log a warning for the deletion failure and propagate the original translation error

## Requirement: Translation endpoint body size limit

The system SHALL enforce a tightened body size limit of 200KB specifically for the translation endpoint.

### Scenario: Request body within limit

- **WHEN** a translation request body is 200KB or smaller
- **THEN** the system SHALL accept and process the request normally

### Scenario: Request body exceeds limit

- **WHEN** a translation request body exceeds 200KB
- **THEN** the system SHALL reject the request with a 413 status code before invoking translation logic
