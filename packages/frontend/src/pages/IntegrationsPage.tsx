import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  integrationsApi,
  type IntegrationConnection,
  type IntegrationWebhook,
  type IntegrationCatalogItem,
  type WebhookLog,
} from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import {
  Input,
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import {
  Puzzle,
  Link2,
  Webhook,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';

type TabType = 'connections' | 'webhooks' | 'catalog';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'gray'> = {
  connected: 'success',
  active: 'success',
  delivered: 'success',
  disconnected: 'gray',
  disabled: 'gray',
  error: 'danger',
  failed: 'danger',
  pending: 'warning',
  paused: 'warning',
};

export default function IntegrationsPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('connections');
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [webhooks, setWebhooks] = useState<IntegrationWebhook[]>([]);
  const [catalog, setCatalog] = useState<IntegrationCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Webhook logs
  const [selectedWebhook, setSelectedWebhook] = useState<IntegrationWebhook | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [connRes, whRes, catRes] = await Promise.allSettled([
          integrationsApi.listConnections(),
          integrationsApi.listWebhooks(),
          integrationsApi.listCatalog(),
        ]);
        if (cancelled) return;
        if (connRes.status === 'fulfilled') setConnections(connRes.value);
        if (whRes.status === 'fulfilled') setWebhooks(whRes.value);
        if (catRes.status === 'fulfilled') setCatalog(catRes.value);
        if (connRes.status === 'rejected' && whRes.status === 'rejected') {
          setError(t('intg.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('intg.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [t]);

  const loadWebhookLogs = async (webhookId: string) => {
    try {
      const data = await integrationsApi.listWebhookLogs(webhookId);
      setWebhookLogs(data);
    } catch {
      setWebhookLogs([]);
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      await integrationsApi.testConnection(id);
      toast.success(t('intg.connected'));
      const updated = await integrationsApi.listConnections();
      setConnections(updated);
    } catch {
      toast.error(t('intg.error'));
    }
  };

  const filteredConnections = connections.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.provider.toLowerCase().includes(search.toLowerCase())
  );

  const filteredWebhooks = webhooks.filter(
    (w) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <PageLoader message={t('common.loading')} />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<AlertTriangle className="w-12 h-12 text-red-400" />}
          title={t('common.error')}
          message={error}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Puzzle className="w-6 h-6" /> {t('intg.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('intg.connectionCount', { count: connections.length })} ·{' '}
            {t('intg.webhookCount', { count: webhooks.length })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={tab === 'connections' ? 'primary' : 'secondary'}
          onClick={() => setTab('connections')}
        >
          <Link2 className="w-4 h-4" />
          <span className="ml-1">{t('intg.connections')} ({connections.length})</span>
        </Button>
        <Button
          variant={tab === 'webhooks' ? 'primary' : 'secondary'}
          onClick={() => setTab('webhooks')}
        >
          <Webhook className="w-4 h-4" />
          <span className="ml-1">{t('intg.webhooks')} ({webhooks.length})</span>
        </Button>
        <Button
          variant={tab === 'catalog' ? 'primary' : 'secondary'}
          onClick={() => setTab('catalog')}
        >
          <Puzzle className="w-4 h-4" />
          <span className="ml-1">{t('intg.catalog')} ({catalog.length})</span>
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4 max-w-md">
        <Input
          placeholder={t('intg.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Connections Tab */}
      {tab === 'connections' && (
        <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.name')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.provider')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.category')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.lastSync')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredConnections.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Link2 className="w-12 h-12 text-gray-300" />}
                      title={t('intg.noConnections')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                filteredConnections.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(c.name)}</td>
                    <td className="p-3 text-sm">{escapeHtml(c.provider)}</td>
                    <td className="p-3"><Badge>{escapeHtml(c.category)}</Badge></td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                        {escapeHtml(c.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {formatDateTime(c.lastSyncAt) || 'Never'}
                    </td>
                    <td className="p-3">
                      <Can permission="integrations.manage">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleTestConnection(c.id)}
                        >
                          {t('intg.test')}
                        </Button>
                      </Can>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Webhooks Tab */}
      {tab === 'webhooks' && (
        <div>
          <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800 mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.name')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.url')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.events')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.status')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.lastTrigger')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredWebhooks.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<Webhook className="w-12 h-12 text-gray-300" />}
                        title={t('intg.noWebhooks')}
                        message={t('common.noData')}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredWebhooks.map((w) => (
                    <tr key={w.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-3 text-sm font-medium">{escapeHtml(w.name)}</td>
                      <td className="p-3 text-xs max-w-xs truncate text-gray-500">
                        {escapeHtml(w.url)}
                      </td>
                      <td className="p-3 text-xs">{(w.events ?? []).join(', ')}</td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[w.status] ?? 'gray'}>
                          {escapeHtml(w.status)}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {formatDateTime(w.lastTriggeredAt) || '-'}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedWebhook(w);
                            void loadWebhookLogs(w.id);
                          }}
                        >
                          {t('intg.logs')}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Webhook Logs */}
          {selectedWebhook && (
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">
                  {t('intg.logs')}: {escapeHtml(selectedWebhook.name)}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedWebhook(null); setWebhookLogs([]); }}
                >
                  {t('common.close')}
                </Button>
              </div>
              <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.events')}</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.status')}</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.response')}</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">{t('intg.attempt')}</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.error')}</th>
                      <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState
                            icon={<Webhook className="w-12 h-12 text-gray-300" />}
                            title={t('intg.noLogs')}
                            message={t('common.noData')}
                          />
                        </td>
                      </tr>
                    ) : (
                      webhookLogs.map((l) => (
                        <tr key={l.id} className="border-b last:border-b-0 hover:bg-gray-50">
                          <td className="p-3"><Badge>{escapeHtml(l.event)}</Badge></td>
                          <td className="p-3">
                            <Badge variant={STATUS_VARIANT[l.status] ?? 'gray'}>
                              {escapeHtml(l.status)}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm">{l.responseStatus ?? '-'}</td>
                          <td className="p-3 text-sm">{l.attempt}</td>
                          <td className="p-3 text-xs text-red-600 max-w-xs truncate">
                            {l.error ? escapeHtml(l.error) : '-'}
                          </td>
                          <td className="p-3 text-xs text-gray-500">
                            {formatDateTime(l.createdAt) || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalog.length === 0 ? (
            <EmptyState
              icon={<Puzzle className="w-12 h-12 text-gray-300" />}
              title={t('intg.noCatalog')}
              message={t('common.noData')}
            />
          ) : (
            catalog.map((c) => (
              <div key={c.id} className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">{escapeHtml(c.name)}</h3>
                  <Badge>{escapeHtml(c.category)}</Badge>
                </div>
                <p className="text-xs text-gray-500 mb-2">{escapeHtml(c.provider)}</p>
                <p className="text-sm text-gray-600">
                  {c.description ? escapeHtml(c.description) : t('intg.noDescription')}
                </p>
                {(c.availableActions ?? []).length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {c.availableActions.map((a) => (
                      <Badge key={a} variant="gray">{escapeHtml(a)}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
