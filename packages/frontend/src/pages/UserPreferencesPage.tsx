import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Sun, Moon, Bell, Keyboard, Save, Search , Monitor } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Select,
} from '../components/ui';
import { useTheme } from '../stores/themeStore';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';

type PrefsTab = 'appearance' | 'notifications' | 'shortcuts';

interface NotificationPref {
  id: string;
  channel: string;
  events: string[];
  isEnabled: boolean;
}

interface Shortcut {
  key: string;
  label: string;
  category: string;
}

const ITEMS_PER_PAGE_OPTIONS = [
  { value: '10', label: '10' },
  { value: '25', label: '25' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
];

export default function UserPreferencesPage() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<PrefsTab>('appearance');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPref[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [settingsR, notifR, shortcutsR] = await Promise.allSettled([
          api.get('/user/settings'),
          api.get('/user/notification-preferences'),
          api.get('/user/shortcuts'),
        ]);
        if (cancelled) return;
        if (settingsR.status === 'fulfilled') {
          const data = settingsR.value.data?.data as { itemsPerPage?: number } | undefined;
          if (data) setItemsPerPage(data.itemsPerPage ?? 25);
        }
        if (notifR.status === 'fulfilled') {
          setNotifPrefs((notifR.value.data?.data ?? []) as NotificationPref[]);
        }
        if (shortcutsR.status === 'fulfilled') {
          setShortcuts((shortcutsR.value.data?.data ?? []) as Shortcut[]);
        }
      } catch {
        if (!cancelled) toast.error(t('preferences.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      await api.put('/user/settings', {
        theme,
        itemsPerPage,
        quickSearchEnabled: true,
      });
      toast.success(t('preferences.saveSuccess'));
    } catch {
      toast.error(t('preferences.saveError'));
    } finally {
      setSaving(false);
    }
  }, [theme, itemsPerPage, t]);

  const toggleNotification = useCallback(async (channel: string, currentEnabled: boolean) => {
    try {
      await api.put(`/user/notification-preferences/${channel}`, { isEnabled: !currentEnabled });
      const r = await api.get('/user/notification-preferences');
      setNotifPrefs((r.data?.data ?? []) as NotificationPref[]);
      toast.success(t('preferences.notifUpdateSuccess'));
    } catch {
      toast.error(t('preferences.notifUpdateError'));
    }
  }, [t]);

  if (loading) return <PageLoader message={t('common.loading')} />;

  const categoryLabels: Record<string, string> = {
    navigation: t('preferences.navigation'),
    search: t('preferences.search'),
    actions: t('preferences.actions'),
    help: t('preferences.help'),
    appearance: t('preferences.appearanceCategory'),
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header">
        <div><h1 className="page-title">{t('preferences.title')}</h1></div>
        <Button onClick={saveSettings} loading={saving}>
          <Save className="w-4 h-4" /> {t('preferences.save')}
        </Button>
      </div>

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'appearance' ? 'primary' : 'secondary'} onClick={() => setTab('appearance')}>
          <Sun className="w-4 h-4" /> {t('preferences.appearance')}
        </Button>
        <Button variant={tab === 'notifications' ? 'primary' : 'secondary'} onClick={() => setTab('notifications')}>
          <Bell className="w-4 h-4" /> {t('preferences.notifications')}
        </Button>
        <Button variant={tab === 'shortcuts' ? 'primary' : 'secondary'} onClick={() => setTab('shortcuts')}>
          <Keyboard className="w-4 h-4" /> {t('preferences.shortcuts')}
        </Button>
      </div>

      {tab === 'appearance' && (
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold mb-6">{t('preferences.appearance')}</h2>

            <div className="mb-6">
              <p className="text-sm font-medium mb-3">{t('preferences.theme')}</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'light' as const, icon: Sun, label: t('preferences.light') },
                  { value: 'dark' as const, icon: Moon, label: t('preferences.dark') },
                  { value: 'system' as const, icon: Monitor, label: t('preferences.system') },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      theme === opt.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setTheme(opt.value)}
                  >
                    <opt.icon className={`w-6 h-6 mx-auto mb-2 ${theme === opt.value ? 'text-primary-600' : 'text-gray-400'}`} />
                    <p className={`text-sm font-medium ${theme === opt.value ? 'text-primary-700' : ''}`}>
                      {opt.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <Select
                label={t('preferences.itemsPerPage')}
                options={ITEMS_PER_PAGE_OPTIONS}
                value={String(itemsPerPage)}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">{t('preferences.quickSearch')}</p>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Search className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">{t('preferences.quickSearchHint')}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'notifications' && (
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold mb-4">{t('preferences.notificationPrefs')}</h2>
            {notifPrefs.length === 0 ? (
              <EmptyState title={t('preferences.noNotifPrefs')} />
            ) : (
              notifPrefs.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium capitalize">{sanitizeString(p.channel.replace(/_/g, ' '))}</p>
                    <p className="text-xs text-gray-500">{p.events.join(', ')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={p.isEnabled}
                      onChange={() => toggleNotification(p.channel, p.isEnabled)}
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
                  </label>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'shortcuts' && (
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold mb-4">{t('preferences.keyboardShortcuts')}</h2>
            {shortcuts.length === 0 ? (
              <EmptyState title={t('preferences.noShortcuts')} />
            ) : (
              <div className="space-y-3">
                {shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium text-sm">{sanitizeString(s.label)}</p>
                      <p className="text-xs text-gray-500 capitalize">{categoryLabels[s.category] ?? sanitizeString(s.category)}</p>
                    </div>
                    <kbd className="px-2 py-1 bg-gray-100 border rounded text-xs font-mono">{sanitizeString(s.key)}</kbd>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
