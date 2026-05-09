# Tasks

## 1. Frontend Translation Cache LRU

- [x] 1.1 Create `packages/ui/src/components/chat/message/parts/translationCache.ts` with LRU Map implementation (dual constraint: 200 entries, 10MB byte budget), using Map insertion order for LRU tracking
- [x] 1.2 Implement FNV-1a 32-bit hash function in the same module for cache key generation
- [x] 1.3 Export `getOrCreate`, `set`, `get`, `has`, `evict`, `clear`, `approxBytes` functions matching the TranslationState type
- [x] 1.4 Add unit tests for LRU eviction (entry limit, byte limit, LRU ordering, skip-loading-entries behavior) ← (verify: eviction respects both constraints, loading entries preserved, LRU order correct)

## 2. Frontend In-Flight Deduplication

- [x] 2.1 Add in-flight promise Map to `translationCache.ts` — keyed by cache key, stores pending fetch promises
- [x] 2.2 Export `getInflight`, `setInflight`, `clearInflight` functions
- [x] 2.3 Add unit tests for in-flight dedup (concurrent callers share promise, cleared on completion) ← (verify: same key returns same promise, different keys are independent, cleanup on resolve/reject)

## 3. Frontend Staggered Auto-Translate Queue

- [x] 3.1 Create `packages/ui/src/components/chat/message/parts/translationQueue.ts` with stagger scheduling logic (300ms incremental delay, session-scoped)
- [x] 3.2 Export `scheduleTranslation(sessionId, cacheKey, requestFn)` that returns a cancel function
- [x] 3.3 Export `cancelSession(sessionId)` that clears all pending timers for a session
- [x] 3.4 Add unit tests for stagger timing and session cancellation ← (verify: delays are incremental, cancel clears all timers, manual requests bypass queue)

## 4. Frontend Centralized Translation Settings

- [x] 4.1 Create `packages/ui/src/components/chat/message/parts/translationSettingsProvider.ts` — singleton that fetches once, caches, and subscribes to `openchamber:settings-synced`
- [x] 4.2 Export `useChatTranslationSettingsShared()` hook that subscribes to the singleton
- [x] 4.3 Replace `useChatTranslationSettings` in `AssistantTextPart.tsx` with the shared hook
- [x] 4.4 Replace `useChatTranslationSettingsSnapshot` in `MessageBody.tsx` with the shared hook ← (verify: only one settings fetch on mount of many components, event updates propagate to all)

## 5. Frontend AbortController Integration

- [x] 5.1 In `useAssistantTranslation` hook, create AbortController and pass signal to the fetch call
- [x] 5.2 Abort on component unmount (useEffect cleanup)
- [x] 5.3 Abort all controllers for a session when session switches (listen to session change, call `cancelSession` from queue module)
- [x] 5.4 Ensure aborted requests do not write to cache (check AbortError before setState/cache.set) ← (verify: unmount aborts fetch, session switch aborts all, no cache pollution from aborted requests)

## 6. Frontend Integration — Wire Everything Together

- [x] 6.1 Refactor `useAssistantTranslation` in `AssistantTextPart.tsx` to use new cache module (get/set via translationCache instead of raw Map)
- [x] 6.2 Integrate in-flight dedup into the request flow (check inflight before fetching)
- [x] 6.3 Integrate stagger queue for auto-translate path (schedule via translationQueue instead of immediate request)
- [x] 6.4 Keep manual translation path (event listener) as immediate (bypass stagger)
- [x] 6.5 Remove the old module-level `translationCache` Map and `textCacheKey` function ← (verify: all translation flows work — auto-translate, manual translate, retry, toggle original, settings change invalidation)

## 7. Backend Concurrency Semaphore

- [x] 7.1 Add a simple counting semaphore utility at the top of `packages/web/server/lib/chat-translation/routes.js` (acquire/release pattern, max 4, FIFO queue)
- [x] 7.2 Wrap `translateWithOpenCode` call in the route handler with semaphore acquire/release
- [x] 7.3 Add unit tests for semaphore behavior (concurrent limit respected, FIFO ordering, release on error) ← (verify: max 4 concurrent, queued requests proceed in order, errors release slot)

## 8. Backend Minor Fixes

- [x] 8.1 Replace `.catch(() => {})` on `deleteTemporarySession` with `.catch((err) => console.warn('[ChatTranslation] Session cleanup failed:', err?.message))`
- [x] 8.2 Add `express.json({ limit: '200kb' })` middleware specifically for the `/api/chat/translate` route (before the handler)
- [x] 8.3 Add test for 413 rejection when body exceeds 200KB ← (verify: deletion failures logged, oversized body rejected with 413, existing tests still pass)

## 9. Validation

- [x] 9.1 Run `bun run type-check` — zero errors
- [x] 9.2 Run `bun run lint` — zero errors
- [x] 9.3 Run existing translation tests: `bun test packages/web/server/lib/chat-translation/` — all pass
- [x] 9.4 Run existing UI tests: `bun test packages/ui/src/components/chat/message/parts/__tests__/` — all pass ← (verify: baseline green, no regressions)
