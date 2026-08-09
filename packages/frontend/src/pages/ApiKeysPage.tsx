import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Activity, Copy } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string;
  rateLimit: { requests: number; period: string };
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface ApiKeyLog {
  id: string;
  method: string;
  endpoint: string;
  responseStatus: number;
  ip: string;
  createdAt: string;
}

interface GeneratedKey {
  id: string;
  apiKey: string;
  keyPrefix: string;
}

export default function ApiKeysPage() {
  const { t } = useTranslation();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [nameError, setNameError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [logs, setLogs] = useState<ApiKeyLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const r = await api.get('/api-keys');
      setKeys((r.data?.data ?? []) as ApiKey[]);
    } catch {
      toast.error(t('apiKeys.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.get('/api-keys');
        if (!cancelled) setKeys((r.data?.data ?? []) as ApiKey[]);
      } catch {
        if (!cancelled) toast.error(t('apiKeys.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const loadLogs = useCallback(async (keyId: string) => {
    setLogsLoading(true);
    try {
      const r = await api.get(`/api-keys/${keyId}/logs`);
      setLogs((r.data?.data ?? []) as ApiKeyLog[]);
    } catch {
      toast.error(t('apiKeys.logsError'));
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [t]);

  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) {
      setNameError(t('apiKeys.invalidName'));
      return;
    }
    setGenerating(true);
    setNameError('');
    try {
      const r = await api.post('/api-keys', { name: sanitizeString(newKeyName) });
      setGeneratedKey(r.data?.data as GeneratedKey);
      await loadKeys();
      toast.success(t('apiKeys.createSuccess'));
    } catch {
      toast.error(t('apiKeys.createError'));
    } finally {
      setGenerating(false);
    }
  }, [newKeyName, loadKeys, t]);

  const copyToClipboard = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowNew(false);
    setGeneratedKey(null);
    setNewKeyName('');
    setNameError('');
  }, []);

  const viewLogs = useCallback((key: ApiKey) => {
    setSelectedKey(key);
    void loadLogs(key.id);
  }, [loadLogs]);

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('apiKeys.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('apiKeys.activeKeys', { count: keys.length })}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> {t('apiKeys.newKey')}
        </Button>
      </div>

      <div className="table-container mb-6">
        <table>
          <thead>
            <tr>
              <th>{t('apiKeys.name')}</th>
              <th>{t('apiKeys.keyPrefix')}</th>
              <th>{t('apiKeys.permissions')}</th>
              <th>{t('apiKeys.rateLimit')}</th>
              <th>{t('apiKeys.status')}</th>
              <th>{t('apiKeys.lastUsed')}</th>
              <th>{t('apiKeys.expires')}</th>
              <th>{t('apiKeys.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState title={t('apiKeys.noKeys')} />
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} className="hover:bg-gray-50">
                  <td className="font-medium">{sanitizeString(k.name)}</td>
                  <td className="font-mono text-xs">{sanitizeString(k.keyPrefix)}...</td>
                  <td><Badge>{sanitizeString(k.permissions)}</Badge></td>
                  <td className="text-xs">{k.rateLimit?.requests ?? 1000}/{k.rateLimit?.period ?? '1h'}</td>
                  <td>
                    <Badge variant={k.isActive ? 'success' : 'gray'}>
                      {k.isActive ? t('apiKeys.active') : t('apiKeys.inactive')}
                    </Badge>
                  </td>
                  <td className="text-xs">{formatDateTime(k.lastUsedAt) || t('apiKeys.never')}</td>
                  <td className="text-xs">{formatDateTime(k.expiresAt) || t('apiKeys.never')}</td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => viewLogs(k)}>
                      <Activity className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedKey && (
        <Card className="mb-6">
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t('apiKeys.usageLogs')}: {sanitizeString(selectedKey.name)}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedKey(null)}>
                {t('apiKeys.close')}
              </Button>
            </div>
            {logsLoading ? (
              <PageLoader message={t('common.loading')} />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>{t('common.type')}</th>
                      <th>{t('common.endpoint', 'Endpoint')}</th>
                      <th>{t('common.status')}</th>
                      <th>IP</th>
                      <th>{t('common.time')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <EmptyState title={t('apiKeys.noLogs')} />
                        </td>
                      </tr>
                    ) : (
                      logs.map((l) => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td><Badge>{sanitizeString(l.method)}</Badge></td>
                          <td className="text-xs max-w-md truncate">{sanitizeString(l.endpoint)}</td>
                          <td>
                            <Badge variant={l.responseStatus < 400 ? 'success' : 'danger'}>
                              {l.responseStatus}
                            </Badge>
                          </td>
                          <td className="text-xs">{sanitizeString(l.ip)}</td>
                          <td className="text-xs">{sanitizeString(l.createdAt?.split('T')[1]?.slice(0, 8) ?? '')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Modal open={showNew} onClose={handleCloseModal} title={t('apiKeys.createTitle')} size="md">
        {!generatedKey ? (
          <div className="space-y-4">
            <Input
              placeholder={t('apiKeys.keyName')}
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              error={nameError}
            />
            <Button className="w-full" onClick={handleCreate} loading={generating}>
              {t('apiKeys.generateKey')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 mb-2">{t('apiKeys.saveWarning')}</p>
              <div className="flex gap-2">
                <code className="flex-1 p-2 bg-white rounded border text-xs font-mono break-all">
                  {generatedKey.apiKey}
                </code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(generatedKey.apiKey)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={handleCloseModal}>
              {t('apiKeys.done')}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
