# Context

The chat translation feature (`packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx`) uses a module-level `Map<string, TranslationState>` as a translation cache. This cache has no eviction policy, no size limit, and embeds the full original text in each cache key. The backend route (`packages/web/server/lib/chat-translation/routes.js`) has no concurrency control — each request creates a temporary OpenCode session, polls for up to 120s, then deletes it. When auto-translate is enabled and a session with many messages is opened, all text parts fire translation requests simultaneously, creating a thundering herd against the local OpenCode server.

Current state:
- Frontend cache: unbounded Map, key = `sessionId:messageId:partId:settingsKey:textLength:fullText`
- Frontend settings: each `AssistantTextPart` and each `MessageBody` independently fetches `/api/config/settings` and adds its own event listener
- Backend: zero concurrency control, zero backpressure, silent deletion failure swallowing
- Client: no stagger, no abort, no in-flight dedup

## Goals / Non-Goals

**Goals:**

- Bound frontend translation cache memory to prevent unbounded growth across sessions/workspaces
- Eliminate redundant memory from full-text cache keys
- Prevent thundering herd when auto-translate fires for many messages simultaneously
- Protect the OpenCode server from being overwhelmed by concurrent translation sessions
- Reduce unnecessary network requests (settings fetches, duplicate translation requests)
- Cancel in-flight translations that are no longer needed (unmount, session switch)

**Non-Goals:**

- Batch translation API (combining multiple text parts into one backend request)
- Persisting translation cache to disk/localStorage
- Changing the polling mechanism to SSE or WebSocket
- Modifying OpenCode server internals or session limits
- Changing the translation API contract (request/response shape stays the same)

## Decisions

### 1. LRU cache with dual constraints

**Choice**: Implement a simple LRU using Map insertion order (same pattern as `packages/ui/src/sync/content-cache.ts`) with MAX_ENTRIES=200 and MAX_BYTES=10MB.

**Why over alternatives**:
- WeakMap: can't iterate or evict by policy; keys must be objects
- External LRU library: adds a dependency for a simple pattern already used in the codebase
- Single constraint (entries only): large text parts could still bloat memory within 200 entries

**Byte estimation**: `approxStringBytes(translatedText) + approxStringBytes(originalTextForErrorDisplay)`. The key itself is small after hashing.

### 2. Hash-based cache key using FNV-1a

**Choice**: Replace `textCacheKey(text)` from `${text.length}:${text}` to `${text.length}:${fnv1a32(text)}` where fnv1a32 is a simple 32-bit FNV-1a hash.

**Why FNV-1a over alternatives**:
- crypto.subtle.digest: async, overkill for cache key differentiation
- Simple length-only: collision risk too high for similar-length messages
- MD5/SHA: heavier than needed; we only need to distinguish text within the same session/message/part/settings combination
- FNV-1a 32-bit: fast, synchronous, zero dependencies, sufficient collision resistance given the composite key already includes sessionId+messageId+partId+settings

**Collision risk**: Negligible. The full key is `sessionId:messageId:partId:settingsKey:length:hash`. Two texts would need identical session, message, part, settings, length, AND hash to collide.

### 3. In-flight deduplication via promise Map

**Choice**: Module-level `Map<string, Promise<string>>` keyed by cache key. When a translation request starts, store the promise. Concurrent callers with the same key await the existing promise instead of firing a new request.

**Why over alternatives**:
- AbortController-only: prevents duplicate work but doesn't share results
- Semaphore at component level: doesn't help when multiple components mount with same key
- This is the standard in-flight dedup pattern already used in `useFileSearchStore.ts` and `useCommandsStore.ts`

### 4. Staggered scheduling with incremental delay

**Choice**: Global auto-translate queue. When auto-translate fires, requests are scheduled with 300ms incremental delay (request 1: immediate, request 2: +300ms, request 3: +600ms, etc.). The queue is cleared on session switch.

**Why 300ms over alternatives**:
- 0ms (no stagger): thundering herd, the current problem
- 100ms: still creates significant burst for 20+ messages
- 500ms: too slow — 20 messages would take 10s to start all translations
- 300ms: 20 messages spread over 6s, reasonable UX while protecting backend
- Concurrency-limited queue (e.g., max 3 parallel): more complex, harder to reason about timing

### 5. Centralized translation settings via shared singleton

**Choice**: Extract `useChatTranslationSettings` into a shared module that fetches once on first subscriber, caches the result, and updates via the existing `openchamber:settings-synced` event. All consumers (AssistantTextPart, MessageBody) use this shared hook.

**Why over alternatives**:
- Zustand store: overkill for a single settings object that changes rarely
- React context: would require provider placement, adds coupling
- Module-level singleton with event subscription: matches the existing `fetchWebSettings` pattern in `persistence.ts` which already has TTL cache and in-flight dedup

### 6. Backend semaphore (max 4 concurrent)

**Choice**: Simple counting semaphore wrapping `translateWithOpenCode`. When 4 translations are in-flight, additional requests queue (FIFO) until a slot opens. No timeout on the queue — the Express request timeout (120s polling) provides the upper bound.

**Why 4**:
- 2: too conservative, 20 messages would take 10+ minutes
- 4: balanced — with 300ms client stagger, the backend rarely sees more than 4-5 concurrent anyway
- 8: still creates significant load on local OpenCode server
- Per-client limiting: unnecessary complexity since this is a local-first app (one user)

### 7. AbortController for unmount/session switch

**Choice**: Pass AbortController signal to the fetch call in `useAssistantTranslation`. Abort on component unmount (cleanup function) and on session switch (via a session-change listener that aborts all pending controllers).

**Why**: Prevents wasted work and connection holding when user navigates away. The backend request continues (no server-side abort), but the client stops waiting and frees the connection.

## Risks / Trade-offs

- **[Stagger increases time-to-all-translated]** → Acceptable: user reads top-to-bottom, and messages translate in order. Last message in a 20-message session starts translating after ~6s.
- **[Hash collision in cache key]** → Negligible: composite key makes collision require matching session+message+part+settings+length+hash simultaneously.
- **[Backend queue starvation under sustained load]** → Mitigated: client stagger prevents sustained bursts; 120s polling timeout provides upper bound on queue wait.
- **[Abort doesn't cancel server-side work]** → Acceptable: the temporary OpenCode session still completes and gets deleted. We just stop waiting for it. Server-side abort would require OpenCode API changes (out of scope).
- **[LRU eviction drops translations user might scroll back to]** → Acceptable: 200 entries covers ~100 messages (2 parts avg). Evicted translations re-fetch on next view. This is a cache, not persistent storage.
