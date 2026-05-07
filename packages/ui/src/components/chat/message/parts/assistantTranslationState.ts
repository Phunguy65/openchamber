export const shouldCommitTranslationState = (currentCacheKey: string | undefined, requestCacheKey: string): boolean => {
    return currentCacheKey === requestCacheKey;
};
