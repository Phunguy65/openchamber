import React from 'react';
import type { ChatTranslationSettings, DesktopSettings } from '@/lib/desktop';

let settings: ChatTranslationSettings | undefined;
let settingsPromise: Promise<ChatTranslationSettings | undefined> | undefined;
let listening = false;
const subscribers = new Set<(value: ChatTranslationSettings | undefined) => void>();

const notify = () => {
    for (const subscriber of subscribers) subscriber(settings);
};

const ensureSettingsListener = () => {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('openchamber:settings-synced', (event: Event) => {
        const detail = (event as CustomEvent<DesktopSettings>).detail;
        settings = detail.chatTranslation;
        notify();
    });
};

const loadSettings = async () => {
    if (settingsPromise) return settingsPromise;
    settingsPromise = fetch('/api/config/settings', { headers: { Accept: 'application/json' } })
        .then(async (response) => {
            if (!response.ok) return settings;
            const payload = await response.json().catch(() => null) as DesktopSettings | null;
            settings = payload?.chatTranslation;
            notify();
            return settings;
        })
        .finally(() => {
            settingsPromise = undefined;
        });
    return settingsPromise;
};

export const useChatTranslationSettingsShared = () => {
    const [snapshot, setSnapshot] = React.useState<ChatTranslationSettings | undefined>(settings);

    React.useEffect(() => {
        ensureSettingsListener();
        subscribers.add(setSnapshot);
        if (settings !== undefined) {
            setSnapshot(settings);
        } else {
            void loadSettings();
        }
        return () => {
            subscribers.delete(setSnapshot);
        };
    }, []);

    return snapshot;
};
