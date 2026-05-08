import React from 'react';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
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

export const ChatTranslationSettingsSection: React.FC = () => {
  const { t } = useI18n();
  const [settings, setSettings] = React.useState<ChatTranslationSettings>(EMPTY_TRANSLATION);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
  const missingModel = settings.enabled && (!settings.providerID || !settings.modelID);
  const enabledStatus = autoTranslateEnabled
    ? t('settings.chat.translation.status.enabledAuto')
    : t('settings.chat.translation.status.enabledManual');

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

      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.model.label')}</span>
        <ModelSelector providerId={settings.providerID ?? ''} modelId={settings.modelID ?? ''} onChange={(providerID, modelID) => persist({ providerID, modelID })} placeholder={t('settings.chat.translation.model.placeholder')} />
      </label>

      <label className="space-y-2 block">
        <span className="text-sm font-medium text-[var(--surface-foreground)]">{t('settings.chat.translation.systemPrompt.label')}</span>
        <Textarea value={settings.systemPrompt ?? ''} onChange={(event) => persist({ systemPrompt: event.target.value })} placeholder={t('settings.chat.translation.systemPrompt.placeholder')} aria-label={t('settings.chat.translation.systemPrompt.aria')} />
      </label>

      <div className="text-xs text-[var(--surface-muted-foreground)]" role="status">
        {isLoading ? t('settings.chat.translation.status.loading') : error ?? (settings.enabled ? (missingLanguage || missingModel ? t('settings.chat.translation.status.missingConfiguration') : enabledStatus) : t('settings.chat.translation.status.disabled'))}
      </div>
    </section>
  );
};
