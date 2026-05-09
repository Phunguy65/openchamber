const abortControllersBySession = new Map<string, Set<AbortController>>();

export const translationAbortSessionKey = (sessionId: string | undefined) => sessionId ?? '';

export const registerAbortController = (sessionId: string | undefined, controller: AbortController) => {
    const key = translationAbortSessionKey(sessionId);
    const controllers = abortControllersBySession.get(key) ?? new Set<AbortController>();
    controllers.add(controller);
    abortControllersBySession.set(key, controllers);

    return () => {
        controllers.delete(controller);
        if (controllers.size === 0) abortControllersBySession.delete(key);
    };
};

export const abortSessionTranslations = (sessionId: string | undefined) => {
    const key = translationAbortSessionKey(sessionId);
    const controllers = abortControllersBySession.get(key);
    if (!controllers) return;
    for (const controller of controllers) controller.abort();
    abortControllersBySession.delete(key);
};

export const clearTranslationAbortControllers = () => {
    abortControllersBySession.clear();
};
