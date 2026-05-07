import React from 'react';
import type { Part } from '@opencode-ai/sdk/v2';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import type { StreamPhase } from '../types';
import type { ContentChangeReason } from '@/hooks/useChatAutoFollow';
import { useStreamingTextThrottle } from '../../hooks/useStreamingTextThrottle';
import { resolveAssistantDisplayText, shouldRenderAssistantText } from './assistantTextVisibility';
import { streamPerfCount, streamPerfObserve } from '@/stores/utils/streamDebug';
import { Button } from '@/components/ui/button';
import type { ChatTranslationSettings, DesktopSettings } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';
import { extractTextContent } from '../partUtils';
import { shouldCommitTranslationState } from './assistantTranslationState';

type PartWithText = Part & { text?: string; content?: string; value?: string; time?: { start?: number; end?: number } };

type TranslationState = {
    status: 'idle' | 'loading' | 'success' | 'error';
    translatedText?: string;
    error?: string;
    showOriginal: boolean;
    key?: string;
};

const translationCache = new Map<string, TranslationState>();
const settingsKey = (settings: ChatTranslationSettings) => [
    settings.targetLanguage,
    settings.customTargetLanguage,
    settings.providerID,
    settings.modelID,
    settings.systemPrompt,
].map((value) => value ?? '').join('\u001f');

const textCacheKey = (text: string): string => `${text.length}:${text}`;

const isTranslationConfigured = (settings?: ChatTranslationSettings) => {
    if (!settings?.enabled) return false;
    const language = settings.targetLanguage === 'custom' ? settings.customTargetLanguage : settings.targetLanguage;
    return Boolean(language?.trim() && settings.providerID?.trim() && settings.modelID?.trim());
};

const useChatTranslationSettings = () => {
    const [settings, setSettings] = React.useState<ChatTranslationSettings | undefined>();

    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const response = await fetch('/api/config/settings', { headers: { Accept: 'application/json' } });
            if (!response.ok) return;
            const payload = await response.json().catch(() => null) as DesktopSettings | null;
            if (!cancelled) setSettings(payload?.chatTranslation);
        };
        void load();
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<DesktopSettings>).detail;
            setSettings(detail.chatTranslation);
        };
        window.addEventListener('openchamber:settings-synced', handler);
        return () => {
            cancelled = true;
            window.removeEventListener('openchamber:settings-synced', handler);
        };
    }, []);

    return settings;
};

const useAssistantTranslation = ({ sessionId, messageId, partId, text, isFinalized, isStreaming }: { sessionId?: string; messageId: string; partId: string; text: string; isFinalized: boolean; isStreaming: boolean }) => {
    const settings = useChatTranslationSettings();
    const configured = isTranslationConfigured(settings);
    const cacheKey = configured ? `${sessionId ?? ''}:${messageId}:${partId}:${settingsKey(settings!)}:${textCacheKey(text)}` : undefined;
    const latestCacheKeyRef = React.useRef(cacheKey);
    const [state, setState] = React.useState<TranslationState>(() => cacheKey ? translationCache.get(cacheKey) ?? { status: 'idle', showOriginal: false, key: cacheKey } : { status: 'idle', showOriginal: false });

    React.useEffect(() => {
        latestCacheKeyRef.current = cacheKey;
    }, [cacheKey]);

    const request = React.useCallback(async () => {
        if (!configured || !cacheKey || !text.trim() || isStreaming || !isFinalized) return;
        const loadingState: TranslationState = { status: 'loading', showOriginal: state.showOriginal, key: cacheKey };
        translationCache.set(cacheKey, loadingState);
        setState(loadingState);
        try {
            const response = await fetch('/api/chat/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ sessionId, messageId, partId, text }),
            });
            const payload = await response.json().catch(() => null) as { translatedText?: string; error?: string } | null;
            if (!response.ok || !payload?.translatedText) throw new Error(payload?.error || 'Translation failed');
            const successState: TranslationState = { status: 'success', translatedText: payload.translatedText, showOriginal: false, key: cacheKey };
            translationCache.set(cacheKey, successState);
            if (shouldCommitTranslationState(latestCacheKeyRef.current, cacheKey)) setState(successState);
        } catch (error) {
            const errorState: TranslationState = { status: 'error', error: error instanceof Error ? error.message : 'Translation failed', showOriginal: true, key: cacheKey };
            translationCache.set(cacheKey, errorState);
            if (shouldCommitTranslationState(latestCacheKeyRef.current, cacheKey)) setState(errorState);
        }
    }, [cacheKey, configured, isFinalized, isStreaming, messageId, partId, sessionId, state.showOriginal, text]);

    React.useEffect(() => {
        if (!cacheKey) {
            setState({ status: 'idle', showOriginal: false });
            return;
        }
        const cached = translationCache.get(cacheKey);
        if (cached) {
            setState(cached);
            return;
        }
        setState({ status: 'idle', showOriginal: false, key: cacheKey });
        void request();
    }, [cacheKey, request]);

    const toggleOriginal = React.useCallback(() => setState((current) => {
        const next = { ...current, showOriginal: !current.showOriginal };
        if (cacheKey) translationCache.set(cacheKey, next);
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
