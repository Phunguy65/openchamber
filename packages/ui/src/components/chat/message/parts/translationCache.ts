export type TranslationState = {
    status: 'idle' | 'loading' | 'success' | 'error';
    translatedText?: string;
    error?: string;
    showOriginal: boolean;
    key?: string;
};

const MAX_ENTRIES = 200;
const MAX_BYTES = 10 * 1024 * 1024;

const cache = new Map<string, TranslationState>();
const entryBytes = new Map<string, number>();
const inflight = new Map<string, Promise<string>>();
let totalBytes = 0;

const approxStringBytes = (value: string | undefined): number => (value?.length ?? 0) * 2;

export const approxBytes = (state: TranslationState): number => {
    return approxStringBytes(state.translatedText) + approxStringBytes(state.error);
};

export const fnv1a32 = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createTranslationCacheKey = ({
    sessionId,
    messageId,
    partId,
    settingsKey,
    text,
}: {
    sessionId?: string;
    messageId: string;
    partId: string;
    settingsKey: string;
    text: string;
}): string => `${sessionId ?? ''}:${messageId}:${partId}:${settingsKey}:${text.length}:${fnv1a32(text)}`;

const setEntryBytes = (key: string, bytes: number) => {
    const previousBytes = entryBytes.get(key) ?? 0;
    totalBytes -= previousBytes;
    entryBytes.set(key, bytes);
    totalBytes += bytes;
};

export const evict = () => {
    let skippedLoadingEntries = 0;
    while (cache.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
        const oldestKey = cache.keys().next().value as string | undefined;
        if (!oldestKey) return;

        const oldestState = cache.get(oldestKey);
        if (oldestState?.status === 'loading') {
            cache.delete(oldestKey);
            cache.set(oldestKey, oldestState);
            skippedLoadingEntries += 1;
            if (skippedLoadingEntries >= cache.size) return;
            continue;
        }

        const bytes = entryBytes.get(oldestKey) ?? 0;
        cache.delete(oldestKey);
        entryBytes.delete(oldestKey);
        totalBytes -= bytes;
        skippedLoadingEntries = 0;
    }
};

export const set = (key: string, state: TranslationState): TranslationState => {
    cache.delete(key);
    cache.set(key, state);
    setEntryBytes(key, approxBytes(state));
    evict();
    return state;
};

export const get = (key: string): TranslationState | undefined => {
    const state = cache.get(key);
    if (!state) return undefined;
    cache.delete(key);
    cache.set(key, state);
    return state;
};

export const has = (key: string): boolean => cache.has(key);

export const getOrCreate = (key: string, create: () => TranslationState): TranslationState => {
    const current = get(key);
    if (current) return current;
    return set(key, create());
};

export const clear = () => {
    cache.clear();
    entryBytes.clear();
    inflight.clear();
    totalBytes = 0;
};

export const getInflight = (key: string): Promise<string> | undefined => inflight.get(key);

export const setInflight = (key: string, promise: Promise<string>): Promise<string> => {
    inflight.set(key, promise);
    const clearCurrent = () => {
        if (inflight.get(key) === promise) inflight.delete(key);
    };
    promise.then(clearCurrent, clearCurrent);
    return promise;
};

export const clearInflight = (key: string) => {
    inflight.delete(key);
};

export const getApproxBytesTotal = (): number => totalBytes;
export const getEntryCount = (): number => cache.size;
