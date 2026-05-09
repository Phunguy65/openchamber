import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { updateDesktopSettings } from '@/lib/persistence';
import type { ChatTranslationSettings, DesktopSettings } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';

const LANGUAGE_OPTIONS: Array<{ value: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0] }> = [
  { value: 'Vietnamese', labelKey: 'settings.chat.translation.language.vietnamese' },
  { value: 'English', labelKey: 'settings.chat.translation.language.english' },
  { value: 'Spanish', labelKey: 'settings.chat.translation.language.spanish' },
  { value: 'French', labelKey: 'settings.chat.translation.language.french' },
  { value: 'German', labelKey: 'settings.chat.translation.language.german' },
  { value: 'Japanese', labelKey: 'settings.chat.translation.language.japanese' },
  { value: 'Korean', labelKey: 'settings.chat.translation.language.korean' },
  { value: 'custom', labelKey: 'settings.chat.translation.language.custom' },
];

const EMPTY_TRANSLATION: ChatTranslationSettings = { enabled: false, autoTranslate: false };

const DEFAULT_CHAT_TRANSLATION_PROMPT = `You are a technical translation engine. Translate only natural-language prose to the requested target language.
Preserve markdown structure exactly, including headings, lists, tables, blockquotes, links, and emphasis.
Do not translate or modify fenced code blocks, inline code, commands, URLs, file paths, environment variables, package names, class names, function names, identifiers, logs, diffs, or terminal output.
Return only the translated markdown with no explanations, prefaces, or suffixes.`;

type TranslationModel = {
  id: string;
  owned_by?: string;
};

export const ChatTranslationSettingsSection: React.FC = () => {
  const { t } = useI18n();
  const [settings, setSettings] = React.useState<ChatTranslationSettings>(EMPTY_TRANSLATION);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [models, setModels] = React.useState<TranslationModel[]>([]);
  const [modelsLoading, setModelsLoading] = React.useState(false);
  const [modelsError, setModelsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/config/settings', { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.statusText);
        return response.json() as Promise<DesktopSettings>;
      })
      .then((payload) => {
        if (!cancelled) setSettings(payload.chatTranslation ?? EMPTY_TRANSLATION);
      })
      .catch(() => {
        if (!cancelled) setError(t('settings.chat.translation.status.loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const persist = (changes: ChatTranslationSettings) => {
    const next = { ...settings, ...changes };
    setSettings(next);
    setError(null);
    void updateDesktopSettings({ chatTranslation: next }).catch(() => setError(t('settings.chat.translation.status.saveError')));
  };

  const targetLanguage = settings.targetLanguage || 'Vietnamese';
  const autoTranslateEnabled = settings.enabled === true && (settings.autoTranslate ?? true);
  const missingLanguage = settings.enabled && targetLanguage === 'custom' && !settings.customTargetLanguage?.trim();
  const hasDirectCredentials = Boolean(settings.apiKey?.trim() && settings.baseURL?.trim());
  const missingModel = settings.enabled && (!settings.modelID || (!settings.providerID && !hasDirectCredentials));
  const canFetchModels = hasDirectCredentials && !modelsLoading;
  const enabledStatus = autoTranslateEnabled
    ? t('settings.chat.translation.status.enabledAuto')
    : t('settings.chat.translation.status.enabledManual');

  const fetchModels = async () => {
    if (!settings.apiKey?.trim() || !settings.baseURL?.trim()) {
      setModelsError(t('settings.chat.translation.models.missingCredentials'));
      return;
    }

    setModelsLoading(true);
    setModelsError(null);
    try {
      const response = await fetch('/api/chat/translation/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ apiKey: settings.apiKey, baseURL: settings.baseURL }),
      });
      const payload = await response.json().catch(() => null) as { models?: TranslationModel[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || response.statusText);
      }
      setModels(Array.isArray(payload?.models) ? payload.models.filter((model) => typeof model.id === 'string' && model.id.length > 0) : []);
    } catch (fetchError) {
      const message = fetchError instanceof Error && fetchError.message ? fetchError.message : t('settings.chat.translation.models.fetchError');
      setModelsError(message);
    } finally {
      setModelsLoading(false);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="chat-translation-title">
      <div>
        <div className="flex items-center gap-2">
          <h3 id="chat-translation-title" className="text-base font-semibold text-[var(--surface-foreground)]">{t('settings.chat.translation.title')}</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 rounded px-1 pb-px typography-micro leading-none text-[var(--status-warning)] bg-[var(--status-warning)]/10">
                {t('settings.view.badge.beta')}
              </span>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>{t('settings.chat.translation.beta.tooltip')}</TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-1 text-sm text-[var(--surface-muted-foreground)]">{t('settings.chat.translation.description')}</p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3">
        <span>
          <span className="block text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.enable.label')}</span>
          <span className="block text-xs text-[var(--surface-muted-foreground)]">{t('settings.chat.translation.enable.description')}</span>
        </span>
        <Switch
          checked={settings.enabled === true}
          onCheckedChange={(enabled) => persist(enabled ? { enabled, autoTranslate: settings.autoTranslate ?? false } : { enabled })}
          aria-label={t('settings.chat.translation.enable.aria')}
        />
      </label>

      <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3">
        <span>
          <span className="block text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.auto.label')}</span>
          <span className="block text-xs text-[var(--surface-muted-foreground)]">{t('settings.chat.translation.auto.description')}</span>
        </span>
        <Switch
          checked={autoTranslateEnabled}
          onCheckedChange={(autoTranslate) => persist({ autoTranslate })}
          disabled={!settings.enabled}
          aria-label={t('settings.chat.translation.auto.aria')}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.apiKey.label')}</span>
          <Input type="password" value={settings.apiKey ?? ''} onChange={(event) => persist({ apiKey: event.target.value || undefined })} placeholder={t('settings.chat.translation.apiKey.placeholder')} aria-label={t('settings.chat.translation.apiKey.aria')} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.baseURL.label')}</span>
          <Input value={settings.baseURL ?? ''} onChange={(event) => persist({ baseURL: event.target.value || undefined })} placeholder={t('settings.chat.translation.baseURL.placeholder')} aria-label={t('settings.chat.translation.baseURL.aria')} />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.targetLanguage.label')}</span>
          <Select value={targetLanguage} onValueChange={(targetLanguage) => persist({ targetLanguage })}>
            <SelectTrigger aria-label={t('settings.chat.translation.targetLanguage.aria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.customLanguage.label')}</span>
          <Input value={settings.customTargetLanguage ?? ''} onChange={(event) => persist({ customTargetLanguage: event.target.value })} disabled={targetLanguage !== 'custom'} aria-label={t('settings.chat.translation.customLanguage.aria')} />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className="flex-1 space-y-2">
            <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.model.label')}</span>
            <Input value={settings.modelID ?? ''} onChange={(event) => persist({ modelID: event.target.value })} placeholder={t('settings.chat.translation.model.placeholder')} aria-label={t('settings.chat.translation.model.manualAria')} />
          </label>
          <Button type="button" variant="outline" size="sm" disabled={!canFetchModels} onClick={() => void fetchModels()} aria-label={t('settings.chat.translation.models.fetchAria')} className="mt-7">
            {modelsLoading ? t('settings.chat.translation.models.fetching') : t('settings.chat.translation.models.fetch')}
          </Button>
        </div>
        {models.length > 0 ? (
          <Select value={settings.modelID ?? ''} onValueChange={(modelID) => persist({ modelID })}>
            <SelectTrigger aria-label={t('settings.chat.translation.models.selectAria')}>
              <SelectValue placeholder={t('settings.chat.translation.models.selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => <SelectItem key={model.id} value={model.id}>{model.id}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
        {modelsError ? <p className="text-xs text-[var(--status-error)]">{modelsError}</p> : null}
      </div>

      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.systemPrompt.label')}</span>
        <Textarea value={settings.systemPrompt || DEFAULT_CHAT_TRANSLATION_PROMPT} onChange={(event) => persist({ systemPrompt: event.target.value })} placeholder={t('settings.chat.translation.systemPrompt.placeholder')} aria-label={t('settings.chat.translation.systemPrompt.aria')} />
      </label>

      <div className="text-xs text-[var(--surface-muted-foreground)]" role="status">
        {isLoading ? t('settings.chat.translation.status.loading') : error ?? (settings.enabled ? (missingLanguage || missingModel ? t('settings.chat.translation.status.missingConfiguration') : enabledStatus) : t('settings.chat.translation.status.disabled'))}
      </div>
    </section>
  );
};
