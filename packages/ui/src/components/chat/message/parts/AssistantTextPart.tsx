import React from 'react';
import type { Part } from '@opencode-ai/sdk/v2';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import type { StreamPhase } from '../types';
import type { ContentChangeReason } from '@/hooks/useChatAutoFollow';
import { useStreamingTextThrottle } from '../../hooks/useStreamingTextThrottle';
import { resolveAssistantDisplayText, shouldRenderAssistantText } from './assistantTextVisibility';
import { streamPerfCount, streamPerfObserve } from '@/stores/utils/streamDebug';
import { Button } from '@/components/ui/button';
import type { ChatTranslationSettings } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';
import { extractTextContent } from '../partUtils';
import { shouldCommitTranslationState } from './assistantTranslationState';
import { CHAT_TRANSLATION_MANUAL_REQUEST_EVENT, type ManualTranslationRequestDetail } from './assistantTranslationEvents';
import { isAutoTranslationEffectivelyEnabled, isTranslationConfigured } from './assistantTranslationSettings';
import { cancelSession, scheduleTranslation } from './translationQueue';
import { clearInflight, createTranslationCacheKey, get, getInflight, set, setInflight, type TranslationState } from './translationCache';
import { useChatTranslationSettingsShared } from './translationSettingsProvider';
import { abortSessionTranslations, registerAbortController } from './assistantTranslationAbort';

type PartWithText = Part & { text?: string; content?: string; value?: string; time?: { start?: number; end?: number } };

const settingsKey = (settings: ChatTranslationSettings) => [
    settings.targetLanguage,
    settings.customTargetLanguage,
    settings.providerID,
    settings.modelID,
    settings.systemPrompt,
    settings.autoTranslate === false ? 'manual' : 'auto',
].map((value) => value ?? '').join('\u001f');

const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

const useAssistantTranslation = ({ sessionId, messageId, partId, text, isFinalized, isStreaming }: { sessionId?: string; messageId: string; partId: string; text: string; isFinalized: boolean; isStreaming: boolean }) => {
    const settings = useChatTranslationSettingsShared();
    const configured = isTranslationConfigured(settings);
    const autoTranslate = isAutoTranslationEffectivelyEnabled(settings);
    const cacheKey = configured ? createTranslationCacheKey({ sessionId, messageId, partId, settingsKey: settingsKey(settings!), text }) : undefined;
    const latestCacheKeyRef = React.useRef(cacheKey);
    const abortControllerRef = React.useRef<AbortController | null>(null);
    const sessionIdRef = React.useRef(sessionId);
    const [state, setState] = React.useState<TranslationState>(() => cacheKey ? get(cacheKey) ?? { status: 'idle', showOriginal: false, key: cacheKey } : { status: 'idle', showOriginal: false });

    React.useEffect(() => {
        latestCacheKeyRef.current = cacheKey;
    }, [cacheKey]);

    const request = React.useCallback(async () => {
        if (!configured || !cacheKey || !text.trim() || isStreaming || !isFinalized) return;
        const loadingState: TranslationState = { status: 'loading', showOriginal: state.showOriginal, key: cacheKey };
        set(cacheKey, loadingState);
        setState(loadingState);
        const existingRequest = getInflight(cacheKey);
        try {
            const translationPromise = existingRequest ?? (() => {
                const controller = new AbortController();
                abortControllerRef.current?.abort();
                abortControllerRef.current = controller;
                const unregister = registerAbortController(sessionId, controller);
                const promise = fetch('/api/chat/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ sessionId, messageId, partId, text }),
                    signal: controller.signal,
                })
                    .then(async (response) => {
                        const payload = await response.json().catch(() => null) as { translatedText?: string; error?: string } | null;
                        if (!response.ok || !payload?.translatedText) throw new Error(payload?.error || 'Translation failed');
                        return payload.translatedText;
                    })
                    .finally(() => {
                        unregister();
                        if (abortControllerRef.current === controller) abortControllerRef.current = null;
                    });
                return setInflight(cacheKey, promise);
            })();
            const translatedText = await translationPromise;
            const successState: TranslationState = { status: 'success', translatedText, showOriginal: false, key: cacheKey };
            set(cacheKey, successState);
            if (shouldCommitTranslationState(latestCacheKeyRef.current, cacheKey)) setState(successState);
        } catch (error) {
            if (isAbortError(error)) {
                clearInflight(cacheKey);
                return;
            }
            const errorState: TranslationState = { status: 'error', error: error instanceof Error ? error.message : 'Translation failed', showOriginal: true, key: cacheKey };
            set(cacheKey, errorState);
            if (shouldCommitTranslationState(latestCacheKeyRef.current, cacheKey)) setState(errorState);
        }
    }, [cacheKey, configured, isFinalized, isStreaming, messageId, partId, sessionId, state.showOriginal, text]);

    React.useEffect(() => {
        if (!cacheKey) {
            setState({ status: 'idle', showOriginal: false });
            return;
        }
        const cached = get(cacheKey);
        if (cached) {
            setState(cached);
            return;
        }
        setState({ status: 'idle', showOriginal: false, key: cacheKey });
        if (autoTranslate) {
            const cancel = scheduleTranslation(sessionId ?? '', cacheKey, request);
            return cancel;
        }
    }, [autoTranslate, cacheKey, request, sessionId]);

    React.useEffect(() => {
        if (sessionIdRef.current === sessionId) return;
        const previousSessionId = sessionIdRef.current;
        sessionIdRef.current = sessionId;
        cancelSession(previousSessionId ?? '');
        abortSessionTranslations(previousSessionId);
    }, [sessionId]);

    React.useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
        };
    }, []);

    React.useEffect(() => {
        if (!configured || autoTranslate) return;
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<ManualTranslationRequestDetail>).detail;
            if (detail?.messageId === messageId) {
                void request();
            }
        };
        window.addEventListener(CHAT_TRANSLATION_MANUAL_REQUEST_EVENT, handler);
        return () => window.removeEventListener(CHAT_TRANSLATION_MANUAL_REQUEST_EVENT, handler);
    }, [autoTranslate, configured, messageId, request]);

    const toggleOriginal = React.useCallback(() => setState((current) => {
        const next = { ...current, showOriginal: !current.showOriginal };
        if (cacheKey) set(cacheKey, next);
        return next;
    }), [cacheKey]);

    return { state, request, toggleOriginal, enabled: configured };
};

const AssistantTextTranslationContent: React.FC<{
    part: Part;
    sessionId?: string;
    messageId: string;
    displayTextContent: string;
    isFinalized: boolean;
    isStreaming: boolean;
    chatRenderMode: 'sorted' | 'live';
}> = ({ part, sessionId, messageId, displayTextContent, isFinalized, isStreaming, chatRenderMode }) => {
    const { t } = useI18n();
    const translation = useAssistantTranslation({
        sessionId,
        messageId,
        partId: part.id ?? 'text',
        text: displayTextContent,
        isFinalized,
        isStreaming,
    });

    const translatedText = translation.state.status === 'success' && translation.state.translatedText ? translation.state.translatedText : null;
    const renderedContent = translatedText && !translation.state.showOriginal ? translatedText : displayTextContent;

    return (
        <>
            <MarkdownRenderer
                content={renderedContent}
                part={part}
                messageId={messageId}
                isAnimated={false}
                isStreaming={isStreaming}
                disableStreamAnimation={chatRenderMode === 'sorted'}
                variant="assistant"
                enableFileReferences={isFinalized}
            />
            {translation.enabled && (translation.state.status === 'loading' || translation.state.status === 'error' || translatedText) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--surface-muted-foreground)]">
                    {translation.state.status === 'loading' && <span>{t('settings.chat.translation.inline.loading')}</span>}
                    {translation.state.status === 'error' && <span className="text-[var(--status-error)]">{translation.state.error || t('settings.chat.translation.inline.error')}</span>}
                    {translatedText && (
                        <Button type="button" variant="outline" size="xs" onClick={translation.toggleOriginal}>
                            {translation.state.showOriginal ? t('settings.chat.translation.inline.showTranslated') : t('settings.chat.translation.inline.showOriginal')}
                        </Button>
                    )}
                    {translation.state.status === 'error' && (
                        <Button type="button" variant="outline" size="xs" onClick={translation.request}>
                            {t('settings.chat.translation.inline.retry')}
                        </Button>
                    )}
                </div>
            )}
        </>
    );
};

interface AssistantTextPartProps {
    part: Part;
    sessionId?: string;
    messageId: string;
    streamPhase: StreamPhase;
    chatRenderMode?: 'sorted' | 'live';
    onContentChange?: (reason?: ContentChangeReason, messageId?: string) => void;
}

const AssistantTextPart: React.FC<AssistantTextPartProps> = ({
    part,
    sessionId,
    messageId,
    streamPhase,
    chatRenderMode = 'live',
}) => {
    // Use part directly from props — parent provides the latest version from the store.
    // No store subscription here to avoid re-render cascade from unrelated delta events.
    const partWithText = part as PartWithText;
    const textContent = extractTextContent(part);
    const isStreamingPhase = streamPhase === 'streaming';
    const isCooldownPhase = streamPhase === 'cooldown';
    const isStreaming = chatRenderMode === 'live' && (isStreamingPhase || isCooldownPhase);

    streamPerfCount('ui.assistant_text_part.render');
    if (isStreaming) {
        streamPerfCount('ui.assistant_text_part.render.streaming');
    }

    const throttledTextContent = useStreamingTextThrottle({
        text: textContent,
        isStreaming,
        identityKey: `${messageId}:${part.id ?? 'text'}`,
    });

    const displayTextContent = resolveAssistantDisplayText({
        textContent,
        throttledTextContent,
        isStreaming,
    });

    streamPerfObserve('ui.assistant_text_part.display_len', displayTextContent.length);
    const time = partWithText.time;
    const isFinalized = Boolean(time && typeof time.end !== 'undefined');

    const isRenderableTextPart = part.type === 'text' || part.type === 'reasoning';
    if (!isRenderableTextPart) {
        return null;
    }

    if (!shouldRenderAssistantText({
        displayTextContent,
        isFinalized,
    })) {
        return null;
    }

    return (
        <div
            className={`group/assistant-text relative break-words ${chatRenderMode === 'live' ? 'my-1' : ''}`}
            key={part.id || `${messageId}-text`}
        >
            {part.type === 'text' ? (
                <AssistantTextTranslationContent
                    part={part}
                    sessionId={sessionId}
                    messageId={messageId}
                    displayTextContent={displayTextContent}
                    isFinalized={isFinalized}
                    isStreaming={isStreaming}
                    chatRenderMode={chatRenderMode}
                />
            ) : (
                <MarkdownRenderer
                    content={displayTextContent}
                    part={part}
                    messageId={messageId}
                    isAnimated={false}
                    isStreaming={isStreaming}
                    disableStreamAnimation={chatRenderMode === 'sorted'}
                    variant="reasoning"
                    enableFileReferences={isFinalized}
                />
            )}
        </div>
    );
};

export default React.memo(AssistantTextPart);
