const STAGGER_DELAY_MS = 300;

type ScheduledTranslation = {
    cacheKey: string;
    timer: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, ScheduledTranslation[]>();

const pruneSession = (sessionId: string, cacheKey: string) => {
    const items = sessions.get(sessionId);
    if (!items) return;
    const next = items.filter((item) => item.cacheKey !== cacheKey);
    if (next.length) {
        sessions.set(sessionId, next);
    } else {
        sessions.delete(sessionId);
    }
};

export const scheduleTranslation = (sessionId: string, cacheKey: string, requestFn: () => void | Promise<void>): (() => void) => {
    const items = sessions.get(sessionId) ?? [];
    const delay = items.length * STAGGER_DELAY_MS;
    let cancelled = false;
    const timer = setTimeout(() => {
        pruneSession(sessionId, cacheKey);
        if (!cancelled) void requestFn();
    }, delay);

    sessions.set(sessionId, [...items, { cacheKey, timer }]);

    return () => {
        cancelled = true;
        clearTimeout(timer);
        pruneSession(sessionId, cacheKey);
    };
};

export const cancelSession = (sessionId: string) => {
    const items = sessions.get(sessionId);
    if (!items) return;
    for (const item of items) clearTimeout(item.timer);
    sessions.delete(sessionId);
};

export const clearTranslationQueue = () => {
    for (const sessionId of sessions.keys()) cancelSession(sessionId);
};
