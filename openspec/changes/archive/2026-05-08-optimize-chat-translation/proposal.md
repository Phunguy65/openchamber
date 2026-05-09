# Why

The chat translation feature stores translated text in an unbounded module-level Map with no eviction, no size limit, and full original text embedded in cache keys. When auto-translate is enabled and users work across multiple workspaces/sessions with many messages, this causes unbounded memory growth in the browser tab. Simultaneously, the backend has zero concurrency control — opening a session with 20 messages fires 20 parallel translation requests, each creating a temporary OpenCode session and polling for up to 120 seconds, overwhelming the local OpenCode server that also serves the user's real chat sessions.

## What Changes

- Add LRU eviction with dual constraints (entry count + byte budget) to the frontend translation cache
- Replace full-text cache keys with hash-based keys to eliminate redundant memory from key storage
- Add in-flight request deduplication so the same text part only has one active translation request
- Add staggered auto-translate scheduling (300ms incremental delay) to prevent thundering herd on session open
- Centralize translation settings into a shared hook instead of per-component fetch + listener
- Add AbortController support to cancel in-flight translations on unmount/session switch
- Add a backend semaphore (max 4 concurrent translations) to protect the OpenCode server
- Log session deletion failures instead of silently swallowing them
- Tighten the body parser limit for the translation endpoint to 200KB

## Capabilities

### New Capabilities

- `translation-resource-management`: LRU cache eviction, hash-based keys, in-flight deduplication, staggered scheduling, abort-on-unmount, and centralized settings for the frontend translation system
- `translation-concurrency-control`: Backend semaphore limiting concurrent translation requests, deletion failure logging, and tightened body parser

### Modified Capabilities

- `chat-translation`: The existing translation request robustness requirement gains additional scenarios for concurrency limiting, request cancellation, and cache eviction behavior

## Impact

- `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx` — major refactor of translation cache and hook
- `packages/ui/src/components/chat/message/MessageBody.tsx` — settings hook consolidation
- `packages/web/server/lib/chat-translation/routes.js` — semaphore, logging, body parser
- `packages/web/server/lib/chat-translation/routes.test.js` — new tests for concurrency behavior
- New utility files alongside AssistantTextPart for cache and queue modules
- No API contract changes (same `/api/chat/translate` request/response shape)
- No new dependencies required (semaphore and LRU are simple enough to implement inline)
