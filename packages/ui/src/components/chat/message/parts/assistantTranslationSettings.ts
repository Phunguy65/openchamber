import type { ChatTranslationSettings } from '@/lib/desktop';

export const isTranslationConfigured = (settings?: ChatTranslationSettings) => {
    if (!settings?.enabled) return false;
    const language = settings.targetLanguage === 'custom' ? settings.customTargetLanguage : settings.targetLanguage;
    return Boolean(language?.trim() && settings.providerID?.trim() && settings.modelID?.trim());
};

export const isAutoTranslationEffectivelyEnabled = (settings?: ChatTranslationSettings) => {
    return settings?.enabled === true && (settings.autoTranslate ?? true);
};
