export const CHAT_TRANSLATION_MANUAL_REQUEST_EVENT = 'openchamber:chat-translation-manual-request';

export type ManualTranslationRequestDetail = {
    messageId: string;
};

export const requestManualChatTranslation = (messageId: string) => {
    window.dispatchEvent(new CustomEvent<ManualTranslationRequestDetail>(CHAT_TRANSLATION_MANUAL_REQUEST_EVENT, {
        detail: { messageId },
    }));
};
