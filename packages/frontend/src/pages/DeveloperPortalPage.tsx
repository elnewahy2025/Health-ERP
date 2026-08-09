import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Key, Code, Webhook, Shield, Copy, Plus, Trash2,
} from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, Table,
  PageLoader, Modal,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { sanitizeString, escapeHtml } from '../lib/sanitize';

/* ── Types ─────────────────────────────────────────────────────────── */

type DevTab = 'keys' | 'docs' | 'webhooks' | 'rate-limits';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string;
  allowedIps: string[];
  rateLimit: { requests: number; period: string };
  expiresAt: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface WebhookConfig {
  id: string;
  url: string;
  events: string;
  isActive: boolean;
  createdAt: string;
}

interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  category: string;
}

interface RateLimitTier {
  tier: string;
  requests: string;
  burst: string;
  description: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const API_ENDPOINTS: ApiEndpoint[] = [
  { method: 'GET', path: '/api/v1/patients', description: 'List all patients', category: 'Patients' },
  { method: 'POST', path: '/api/v1/patients', description: 'Create a patient', category: 'Patients' },
  { method: 'GET', path: '/api/v1/patients/:id', description: 'Get patient by ID', category: 'Patients' },
  { method: 'PUT', path: '/api/v1/patients/:id', description: 'Update patient', category: 'Patients' },
  { method: 'GET', path: '/api/v1/appointments', description: 'List appointments', category: 'Appointments' },
  { method: 'POST', path: '/api/v1/appointments', description: 'Book appointment', category: 'Appointments' },
  { method: 'GET', path: '/api/v1/invoices', description: 'List invoices', category: 'Billing' },
  { method: 'POST', path: '/api/v1/invoices', description: 'Create invoice', category: 'Billing' },
  { method: 'GET', path: '/api/v1/lab/orders', description: 'List lab orders', category: 'Laboratory' },
  { method: 'POST', path: '/api/v1/lab/orders', description: 'Create lab order', category: 'Laboratory' },
  { method: 'GET', path: '/api/v1/pharmacy/prescriptions', description: 'List prescriptions', category: 'Pharmacy' },
  { method: 'GET', path: '/api/v1/insurance-claims', description: 'List insurance claims', category: 'Insurance' },
  { method: 'POST', path: '/api/v1/insurance-claims', description: 'Submit claim', category: 'Insurance' },
  { method: 'GET', path: '/api/v1/reports', description: 'List report definitions', category: 'Reports' },
  { method: 'GET', path: '/api/v1/health', description: 'Health check', category: 'System' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-yellow-100 text-yellow-700',
  DELETE: 'bg-red-100 text-red-700',
  PATCH: 'bg-purple-100 text-purple-700',
};

const RATE_LIMITS: RateLimitTier[] = [
  { tier: 'Free', requests: '100', burst: '10/min', description: 'For testing and evaluation' },
  { tier: 'Basic', requests: '1,000', burst: '50/min', description: 'Small clinics and practices' },
  { tier: 'Pro', requests: '10,000', burst: '200/min', description: 'Growing healthcare organizations' },
  { tier: 'Enterprise', requests: '100,000', burst: '1,000/min', description: 'Large hospital networks' },
];

/* ── Component ─────────────────────────────────────────────────────── */

export default function DeveloperPortalPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DevTab>('keys');
  const [loading, setLoading] = useState(true);

  /* ── API Keys ── */
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState('read');
  const [createLoading, setCreateLoading] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);

  /* ── Webhooks ── */
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ url: '', events: '', secret: '' });
  const [webhookLoading, setWebhookLoading] = useState(false);

  /* ── Docs ── */
  const [searchEndpoint, setSearchEndpoint] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  /* ── Derived ── */

  const categories = [...new Set(API_ENDPOINTS.map((e) => e.category))];

  const filteredEndpoints = API_ENDPOINTS.filter((ep) => {
    const matchesSearch = !searchEndpoint ||
      ep.path.toLowerCase().includes(searchEndpoint.toLowerCase()) ||
      ep.description.toLowerCase().includes(searchEndpoint.toLowerCase());
    const matchesCategory = !categoryFilter || ep.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  /* ── Data fetching ── */

  const fetchKeys = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/api-keys');
      setApiKeys((data.data ?? []) as ApiKey[]);
    } catch {
      toast.error(t('devPortal.loadKeysFailed'));
    }
  }, [t]);

  const fetchWebhooks = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/integrations/webhooks');
      setWebhooks((data.data ?? []) as WebhookConfig[]);
    } catch {
      toast.error(t('devPortal.loadWebhooksFailed'));
    }
  }, [t]);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchKeys(), fetchWebhooks()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchKeys, fetchWebhooks]);

  /* ── API Key actions ── */

  const handleCreateKey = useCallback(async (): Promise<void> => {
    if (!newKeyName.trim()) {
      toast.error(t('devPortal.keyName') + ' is required');
      return;
    }
    setCreateLoading(true);
    try {
      const { data } = await api.post('/api-keys', {
        name: sanitizeString(newKeyName),
        permissions: newKeyPermissions,
      });
      const newKey = (data.data ?? null) as ApiKey | null;
      if (newKey) setApiKeys((prev) => [newKey, ...prev]);
      toast.success(t('devPortal.keyCreated'));
      setShowNewKey(false);
      setNewKeyName('');
    } catch {
      toast.error(t('devPortal.keyCreateFailed'));
    } finally {
      setCreateLoading(false);
    }
  }, [newKeyName, newKeyPermissions, t]);

  const handleRevokeKey = useCallback(async (): Promise<void> => {
    if (!showRevokeConfirm) return;
    try {
      await api.delete(`/api-keys/${showRevokeConfirm}`);
      setApiKeys((prev) => prev.filter((k) => k.id !== showRevokeConfirm));
      toast.success(t('devPortal.keyRevoked'));
    } catch {
      toast.error(t('devPortal.keyRevokeFailed'));
    } finally {
      setShowRevokeConfirm(null);
    }
  }, [showRevokeConfirm, t]);

  const toggleReveal = useCallback((id: string): void => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const copyToClipboard = useCallback((text: string): void => {
    void navigator.clipboard.writeText(text);
    toast.success(t('devPortal.copied'));
  }, [t]);

  /* ── Webhook actions ── */

  const handleCreateWebhook = useCallback(async (): Promise<void> => {
    if (!webhookForm.url.trim()) {
      toast.error(t('devPortal.webhookUrl') + ' is required');
      return;
    }
    setWebhookLoading(true);
    try {
      const { data } = await api.post('/integrations/webhooks', {
        url: sanitizeString(webhookForm.url),
        events: webhookForm.events.split(',').map((e) => e.trim()).filter(Boolean),
        secret: webhookForm.secret || undefined,
      });
      const newWh = (data.data ?? null) as WebhookConfig | null;
      if (newWh) setWebhooks((prev) => [newWh, ...prev]);
      toast.success(t('devPortal.webhookAdded'));
      setShowNewWebhook(false);
      setWebhookForm({ url: '', events: '', secret: '' });
    } catch {
      toast.error(t('devPortal.webhookAddFailed'));
    } finally {
      setWebhookLoading(false);
    }
  }, [webhookForm, t]);

  /* ── Table columns ── */

  const keyColumns: Column<ApiKey>[] = [
    {
      key: 'name',
      header: t('devPortal.keyName'),
      render: (item) => (
        <div>
          <p className="font-medium">{escapeHtml(item.name)}</p>
          <p className="text-xs text-gray-500 font-mono">{escapeHtml(item.keyPrefix)}...</p>
        </div>
      ),
    },
    {
      key: 'permissions',
      header: t('devPortal.permissions'),
      render: (item) => (
        <Badge variant={item.permissions === 'admin' ? 'danger' : item.permissions === 'read_write' ? 'warning' : 'info'}>
          {item.permissions}
        </Badge>
      ),
    },
    {
      key: 'lastUsedAt',
      header: t('devPortal.lastUsed'),
      render: (item) => <span>{formatDateTime(item.lastUsedAt) || '-'}</span>,
    },
    {
      key: 'isActive',
      header: t('devPortal.status'),
      render: (item) => (
        <Badge variant={item.isActive ? 'success' : 'danger'}>
          {item.isActive ? t('devPortal.active') : t('devPortal.inactive')}
        </Badge>
      ),
    },
    {
      key: 'id',
      header: t('devPortal.actions'),
      render: (item) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => toggleReveal(item.id)}>
            {revealedKeys.has(item.id) ? t('devPortal.hide') : t('devPortal.reveal')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(item.keyPrefix)}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowRevokeConfirm(item.id)}>
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const webhookColumns: Column<WebhookConfig>[] = [
    {
      key: 'url',
      header: t('devPortal.webhookUrl'),
      render: (item) => <span className="font-mono text-sm">{escapeHtml(item.url)}</span>,
    },
    {
      key: 'events',
      header: t('devPortal.webhookEvents'),
      render: (item) => <span className="text-sm text-gray-500">{escapeHtml(item.events)}</span>,
    },
    {
      key: 'isActive',
      header: t('devPortal.status'),
      render: (item) => (
        <Badge variant={item.isActive ? 'success' : 'danger'}>
          {item.isActive ? t('devPortal.webhookActive') : t('devPortal.webhookInactive')}
        </Badge>
      ),
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: DevTab; icon: React.ReactNode; label: string }> = [
    { key: 'keys', icon: <Key className="w-4 h-4" />, label: t('devPortal.keysTab') },
    { key: 'docs', icon: <Code className="w-4 h-4" />, label: t('devPortal.docsTab') },
    { key: 'webhooks', icon: <Webhook className="w-4 h-4" />, label: t('devPortal.webhooksTab') },
    { key: 'rate-limits', icon: <Shield className="w-4 h-4" />, label: t('devPortal.rateLimitsTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Code className="w-6 h-6 text-primary-600" />
          {t('devPortal.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t('devPortal.subtitle')}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tabItem.key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tabItem.icon}
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader message={t('common.loading')} />
      ) : (
        <>
          {/* ── API KEYS ── */}
          {tab === 'keys' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowNewKey(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t('devPortal.createNewKey')}
                </Button>
              </div>
              <Card>
                <CardBody className="p-0">
                  <Table<ApiKey>
                    columns={keyColumns}
                    data={apiKeys}
                    loading={false}
                    emptyMessage={t('devPortal.noKeys')}
                  />
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── API DOCS ── */}
          {tab === 'docs' && (
            <Card>
              <CardBody className="p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('devPortal.apiEndpoints')}</h3>
                <div className="flex flex-wrap gap-3 mb-4">
                  <Input
                    placeholder={t('devPortal.searchEndpoints')}
                    value={searchEndpoint}
                    onChange={(e) => setSearchEndpoint(e.target.value)}
                  />
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    options={[
                      { value: '', label: t('devPortal.allCategories') },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  {filteredEndpoints.map((ep, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${METHOD_COLORS[ep.method] ?? ''}`}>
                        {ep.method}
                      </span>
                      <code className="text-sm font-mono flex-1">{ep.path}</code>
                      <span className="text-sm text-gray-500 hidden sm:block">{ep.description}</span>
                      <Badge>{ep.category}</Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">{t('devPortal.quickStart')}</h4>
                  <pre className="text-xs bg-gray-800 text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  https://api.visionhealthcare.com/api/v1/patients`}
                  </pre>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ── WEBHOOKS ── */}
          {tab === 'webhooks' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowNewWebhook(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t('devPortal.addWebhook')}
                </Button>
              </div>
              <Card>
                <CardBody className="p-0">
                  <Table<WebhookConfig>
                    columns={webhookColumns}
                    data={webhooks}
                    loading={false}
                    emptyMessage={t('devPortal.noWebhooks')}
                  />
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── RATE LIMITS ── */}
          {tab === 'rate-limits' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {RATE_LIMITS.map((rl) => (
                <Card key={rl.tier}>
                  <CardBody className="p-5 text-center">
                    <h3 className="font-bold text-lg text-gray-900 mb-2">{rl.tier}</h3>
                    <p className="text-2xl font-bold text-primary-600 mb-1">{rl.requests}</p>
                    <p className="text-sm text-gray-500">{t('devPortal.burst')}: {rl.burst}</p>
                    <p className="text-xs text-gray-400 mt-3">{rl.description}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Create Key Modal ── */}
      <Modal
        open={showNewKey}
        onClose={() => setShowNewKey(false)}
        title={t('devPortal.createNewKey')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowNewKey(false)}>
              {t('devPortal.cancel')}
            </Button>
            <Button onClick={() => void handleCreateKey()} loading={createLoading} disabled={createLoading}>
              {t('devPortal.createKey')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('devPortal.keyName')}
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={t('devPortal.keyNamePlaceholder')}
          />
          <Select
            label={t('devPortal.scopes')}
            value={newKeyPermissions}
            onChange={(e) => setNewKeyPermissions(e.target.value)}
            options={[
              { value: 'read', label: t('devPortal.readOnly') },
              { value: 'read_write', label: t('devPortal.readWrite') },
              { value: 'admin', label: t('devPortal.admin') },
            ]}
          />
        </div>
      </Modal>

      {/* ── Revoke Confirmation Modal ── */}
      <Modal
        open={!!showRevokeConfirm}
        onClose={() => setShowRevokeConfirm(null)}
        title={t('devPortal.revokeConfirm')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowRevokeConfirm(null)}>
              {t('devPortal.cancel')}
            </Button>
            <Button variant="danger" onClick={() => void handleRevokeKey()}>
              {t('devPortal.revoke')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">{t('devPortal.revokeConfirm')}</p>
      </Modal>

      {/* ── Add Webhook Modal ── */}
      <Modal
        open={showNewWebhook}
        onClose={() => setShowNewWebhook(false)}
        title={t('devPortal.addWebhook')}
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowNewWebhook(false)}>
              {t('devPortal.cancel')}
            </Button>
            <Button onClick={() => void handleCreateWebhook()} loading={webhookLoading} disabled={webhookLoading}>
              {t('devPortal.addWebhook')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('devPortal.webhookUrl')}
            value={webhookForm.url}
            onChange={(e) => setWebhookForm((prev) => ({ ...prev, url: e.target.value }))}
            placeholder={t('devPortal.webhookUrlPlaceholder')}
          />
          <Input
            label={t('devPortal.webhookEvents')}
            value={webhookForm.events}
            onChange={(e) => setWebhookForm((prev) => ({ ...prev, events: e.target.value }))}
            placeholder={t('devPortal.webhookEventsPlaceholder')}
          />
          <Input
            label={t('devPortal.webhookSecret')}
            value={webhookForm.secret}
            onChange={(e) => setWebhookForm((prev) => ({ ...prev, secret: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
