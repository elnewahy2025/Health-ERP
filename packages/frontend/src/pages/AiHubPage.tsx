import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  aiHubApi,
  type AiAssistant,
  type AiProvider,
  type AiModel,
  type AiRequest,
  type AiCostData,
} from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import {
  Modal,
  Input,
  Select,
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import {
  Bot,
  Plus,
  Cpu,
  DollarSign,
  Activity,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../stores/authStore';

type TabType = 'chat' | 'assistants' | 'providers' | 'requests' | 'costs';

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'billing', label: 'Billing' },
  { value: 'patient', label: 'Patient' },
];

export default function AiHubPage() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [tab, setTab] = useState<TabType>('assistants');
  const [assistants, setAssistants] = useState<AiAssistant[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [requests, setRequests] = useState<AiRequest[]>([]);
  const [costData, setCostData] = useState<AiCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal states
  const [showAssistantModal, setShowAssistantModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [assistantForm, setAssistantForm] = useState({
    name: '',
    slug: '',
    category: 'general',
    systemPrompt: '',
    modelId: '',
  });
  const [providerForm, setProviderForm] = useState({
    name: '',
    provider: '',
    apiEndpoint: '',
    apiKey: '',
  });
  const [chatAssistantId, setChatAssistantId] = useState('none');
  const [chatModelId, setChatModelId] = useState('none');
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatRequest, setChatRequest] = useState<AiRequest | null>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
          const [assistantRes, providerRes, modelRes, requestRes, costRes] =
            await Promise.allSettled([
              aiHubApi.listAssistants(),
              aiHubApi.listProviders(),
              aiHubApi.listModels(),
              aiHubApi.listRequests(),
              aiHubApi.getCosts(),
            ]);
        if (cancelled) return;
        if (assistantRes.status === 'fulfilled') setAssistants(assistantRes.value);
        if (providerRes.status === 'fulfilled') setProviders(providerRes.value);
        if (modelRes.status === 'fulfilled') setModels(modelRes.value);
        if (requestRes.status === 'fulfilled') setRequests(requestRes.value);
        if (costRes.status === 'fulfilled') setCostData(costRes.value);
        const allFailed =
          assistantRes.status === 'rejected' &&
          providerRes.status === 'rejected' &&
          modelRes.status === 'rejected';
        if (allFailed) {
          setError(t('aiHub.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('aiHub.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const validateAssistantForm = (): boolean => {
    const errors: Record<string, string> = {};
    const name = sanitizeString(assistantForm.name);
    if (!name) {
      errors.name = t('common.required');
    } else if (name.length > 200) {
      errors.name = t('common.maxLength', { max: 200 });
    }
    if (assistantForm.systemPrompt && assistantForm.systemPrompt.length > 10000) {
      errors.systemPrompt = t('common.maxLength', { max: 10000 });
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateProviderForm = (): boolean => {
    const errors: Record<string, string> = {};
    const name = sanitizeString(providerForm.name);
    const provider = sanitizeString(providerForm.provider);
    if (!name) {
      errors.name = t('common.required');
    }
    if (!provider) {
      errors.provider = t('common.required');
    }
    if (providerForm.apiEndpoint) {
      try {
        new URL(providerForm.apiEndpoint);
      } catch {
        errors.apiEndpoint = t('common.invalidUrl');
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateAssistant = async () => {
    if (!validateAssistantForm()) return;
    setSubmitting(true);
    try {
      await aiHubApi.createAssistant({
        name: sanitizeString(assistantForm.name),
        slug: assistantForm.slug
          ? sanitizeString(assistantForm.slug)
          : undefined,
        category: assistantForm.category,
        systemPrompt: assistantForm.systemPrompt || undefined,
        modelId: assistantForm.modelId || undefined,
      });
      toast.success(t('common.created'));
      setShowAssistantModal(false);
      setAssistantForm({
        name: '',
        slug: '',
        category: 'general',
        systemPrompt: '',
        modelId: '',
      });
      setFormErrors({});
      const updated = await aiHubApi.listAssistants();
      setAssistants(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProvider = async () => {
    if (!validateProviderForm()) return;
    setSubmitting(true);
    try {
      await aiHubApi.createProvider({
        name: sanitizeString(providerForm.name),
        provider: sanitizeString(providerForm.provider),
        apiEndpoint: providerForm.apiEndpoint || undefined,
        apiKey: providerForm.apiKey || undefined,
      });
      toast.success(t('common.created'));
      setShowProviderModal(false);
      setProviderForm({ name: '', provider: '', apiEndpoint: '', apiKey: '' });
      setFormErrors({});
      const updated = await aiHubApi.listProviders();
      setProviders(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChat = async () => {
    const prompt = chatPrompt.trim();
    if (!prompt) {
      setChatError(t('aiHub.chatPromptRequired'));
      return;
    }
    if (chatAssistantId === 'none' && chatModelId === 'none') {
      setChatError(t('aiHub.chatSelectionRequired'));
      return;
    }
    setChatSubmitting(true);
    setChatError(null);
    try {
      const result = await aiHubApi.chat({
        assistantId: chatAssistantId === 'none' ? undefined : chatAssistantId,
        modelId: chatModelId === 'none' ? undefined : chatModelId,
        prompt,
        source: 'ai_hub_chat',
        idempotencyKey: crypto.randomUUID(),
      });
      setChatResponse(result.response);
      setChatRequest(result);
      setRequests((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setChatPrompt('');
    } catch {
      setChatError(t('aiHub.chatUnavailable'));
    } finally {
      setChatSubmitting(false);
    }
  };

  const filteredAssistants = assistants.filter(
    (a) =>
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProviders = providers.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.provider.toLowerCase().includes(search.toLowerCase())
  );
  const chatAssistantOptions = [
    { value: 'none', label: t('aiHub.noAssistant') },
    ...assistants.filter((assistant) => assistant.isActive).map((assistant) => ({ value: assistant.id, label: assistant.name })),
  ];
  const chatModelOptions = [
    { value: 'none', label: t('aiHub.chooseModel') },
    ...models.filter((model) => model.isActive && ['chat', 'multimodal'].includes(model.capabilities)).map((model) => ({ value: model.id, label: model.displayName || model.modelName })),
  ];

  const tabs: { key: TabType; icon: React.ReactNode; label: string; count: number }[] = [
    ...(can('ai_hub.create') ? [{ key: 'chat' as const, icon: <MessageSquare className="w-4 h-4" />, label: t('aiHub.chat'), count: 0 }] : []),
    { key: 'assistants', icon: <Bot className="w-4 h-4" />, label: t('aiHub.assistants'), count: assistants.length },
    { key: 'providers', icon: <Cpu className="w-4 h-4" />, label: t('aiHub.providers'), count: providers.length },
    { key: 'requests', icon: <Activity className="w-4 h-4" />, label: t('aiHub.requests'), count: requests.length },
    { key: 'costs', icon: <DollarSign className="w-4 h-4" />, label: t('aiHub.costs'), count: 0 },
  ];

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t('aiHub.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('aiHub.assistantCount', { count: assistants.length })} ·{' '}
            {t('aiHub.providerCount', { count: providers.length })}
          </p>
        </div>
        {tab === 'assistants' && can('ai_hub.create') && (
          <Button onClick={() => { setShowAssistantModal(true); setFormErrors({}); }}>
            <Plus className="w-4 h-4 mr-1" /> {t('aiHub.newAssistant')}
          </Button>
        )}
        {tab === 'providers' && can('ai_hub.create') && (
          <Button onClick={() => { setShowProviderModal(true); setFormErrors({}); }}>
            <Plus className="w-4 h-4 mr-1" /> {t('aiHub.newProvider')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((item) => (
          <Button
            key={item.key}
            variant={tab === item.key ? 'primary' : 'secondary'}
            onClick={() => setTab(item.key)}
          >
            {item.icon}
            <span className="ml-1">{item.label}</span>
            {item.key !== 'costs' && (
              <span className="ml-1 text-xs opacity-70">({item.count})</span>
            )}
          </Button>
        ))}
      </div>

      {/* Search */}
      {tab !== 'costs' && tab !== 'chat' && (
        <div className="mb-4 max-w-md">
          <Input
            
            placeholder={
              tab === 'assistants'
                ? t('aiHub.searchPlaceholder')
                : t('common.search')
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Chat Tab */}
      {tab === 'chat' && (
        <div className="max-w-4xl space-y-4">
          <div className="bg-white rounded-lg border p-5 dark:bg-gray-900 dark:border-gray-800">
            <h2 className="text-lg font-semibold flex items-center gap-2"><MessageSquare className="w-5 h-5" /> {t('aiHub.chatTitle')}</h2>
            <p className="text-sm text-gray-500 mt-1">{t('aiHub.chatDescription')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              <Select
                label={t('aiHub.assistant')}
                value={chatAssistantId}
                onChange={(e) => {
                  const selected = e.target.value;
                  setChatAssistantId(selected);
                  const assistant = assistants.find((item) => item.id === selected);
                  if (assistant?.modelId) setChatModelId(assistant.modelId);
                }}
                options={chatAssistantOptions}
              />
              <Select
                label={t('aiHub.model')}
                value={chatModelId}
                onChange={(e) => setChatModelId(e.target.value)}
                options={chatModelOptions}
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('aiHub.prompt')}</label>
              <textarea
                className="w-full border rounded-lg p-3 text-sm min-h-[140px] dark:bg-gray-950 dark:border-gray-700"
                value={chatPrompt}
                onChange={(e) => { setChatPrompt(e.target.value); setChatError(null); }}
                maxLength={50000}
                placeholder={t('aiHub.promptPlaceholder')}
              />
            </div>
            <div className="flex items-center justify-between mt-4 gap-4">
              <p className="text-xs text-gray-500">{t('aiHub.configurationHint')}</p>
              <Button onClick={handleChat} loading={chatSubmitting}>{t('aiHub.sendPrompt')}</Button>
            </div>
            {chatError && <p className="text-sm text-red-600 mt-3">{chatError}</p>}
          </div>
          {chatResponse && (
            <div className="bg-white rounded-lg border p-5 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center justify-between gap-4 mb-3">
                <h3 className="font-semibold">{t('aiHub.response')}</h3>
                {chatRequest && <Badge variant="success">{chatRequest.modelId ? (models.find((model) => model.id === chatRequest.modelId)?.displayName || models.find((model) => model.id === chatRequest.modelId)?.modelName) : t('aiHub.completed')}</Badge>}
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6">{chatResponse}</div>
            </div>
          )}
        </div>
      )}

      {/* Assistants Tab */}
      {tab === 'assistants' && (
        <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.name')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.slug')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.category')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.model')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.isActive')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssistants.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Bot className="w-12 h-12 text-gray-300" />}
                      title={t('aiHub.noAssistants')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                filteredAssistants.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(a.name)}</td>
                    <td className="p-3 text-sm font-mono text-gray-500">{escapeHtml(a.slug)}</td>
                    <td className="p-3"><Badge>{a.category}</Badge></td>
                    <td className="p-3 text-sm text-gray-500">{a.modelName ?? '-'}</td>
                    <td className="p-3">
                      <Badge variant={a.isActive ? 'success' : 'gray'}>
                        {a.isActive ? t('aiHub.active') : t('aiHub.inactive')}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Providers Tab */}
      {tab === 'providers' && (
        <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.name')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.provider')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.endpoint')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.credentials')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.isActive')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProviders.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Cpu className="w-12 h-12 text-gray-300" />}
                      title={t('aiHub.noProviders')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                filteredProviders.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(p.name)}</td>
                    <td className="p-3"><Badge>{escapeHtml(p.provider)}</Badge></td>
                    <td className="p-3 text-sm text-gray-500 max-w-xs truncate">
                      {p.apiEndpoint ?? '-'}
                    </td>
                    <td className="p-3 text-sm">{p.apiKeyConfigured ? t('aiHub.configured') : t('aiHub.notConfigured')}</td>
                    <td className="p-3">
                      <Badge variant={p.isActive ? 'success' : 'gray'}>
                        {p.isActive ? t('aiHub.active') : t('aiHub.inactive')}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Requests Tab */}
      {tab === 'requests' && (
        <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.source')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.tokens')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.cost')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.latency')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.date')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Activity className="w-12 h-12 text-gray-300" />}
                      title={t('aiHub.noRequests')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3"><Badge>{escapeHtml(r.source || 'chat')}</Badge></td>
                    <td className="p-3 text-sm">{(r.promptTokens + r.completionTokens).toLocaleString()}</td>
                    <td className="p-3 text-sm">{Number(r.cost).toFixed(6)}</td>
                    <td className="p-3 text-sm">{r.latencyMs}ms</td>
                    <td className="p-3">
                      <Badge variant={r.status === 'completed' ? 'success' : 'danger'}>
                        {escapeHtml(r.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm text-gray-500">
                      {formatDateTime(r.createdAt) || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Costs Tab */}
      {tab === 'costs' && (
        <div>
          {costData?.summary ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <p className="text-sm text-gray-500">{t('aiHub.totalCost')}</p>
                <p className="text-2xl font-bold mt-1">
                  {Number(costData.summary.totalCost).toFixed(4)}
                </p>
              </div>
              <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <p className="text-sm text-gray-500">{t('aiHub.totalTokens')}</p>
                <p className="text-2xl font-bold mt-1">
                  {costData.summary.totalTokens.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <p className="text-sm text-gray-500">{t('aiHub.totalRequests')}</p>
                <p className="text-2xl font-bold mt-1">
                  {costData.summary.totalRequests.toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <EmptyState
                icon={<DollarSign className="w-12 h-12 text-gray-300" />}
                title={t('aiHub.noCostData')}
                message={t('common.noData')}
              />
            </div>
          )}

          <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.date')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.source')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.cost')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.totalRequests')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('aiHub.totalTokens')}</th>
                </tr>
              </thead>
              <tbody>
                {(costData?.daily ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={<DollarSign className="w-12 h-12 text-gray-300" />}
                        title={t('aiHub.noDailyCosts')}
                        message={t('common.noData')}
                      />
                    </td>
                  </tr>
                ) : (
                  costData!.daily.map((c, i) => (
                    <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-3 text-sm text-gray-500">{escapeHtml(c.date)}</td>
                      <td className="p-3"><Badge>{escapeHtml(c.source)}</Badge></td>
                      <td className="p-3 text-sm">{Number(c.totalCost).toFixed(4)}</td>
                      <td className="p-3 text-sm">{c.totalRequests.toLocaleString()}</td>
                      <td className="p-3 text-sm">{c.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Assistant Modal */}
      <Modal
        open={showAssistantModal}
        onClose={() => { setShowAssistantModal(false); setFormErrors({}); }}
        title={t('aiHub.newAssistant')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowAssistantModal(false); setFormErrors({}); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateAssistant} loading={submitting}>
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('aiHub.name')}
            required
            value={assistantForm.name}
            onChange={(e) =>
              setAssistantForm((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
          />
          <Input
            label={t('aiHub.slug')}
            value={assistantForm.slug}
            onChange={(e) =>
              setAssistantForm((prev) => ({ ...prev, slug: e.target.value }))
            }
            helpText={t('aiHub.slugHelp')}
          />
          <Select
            label={t('aiHub.category')}
            value={assistantForm.category}
            onChange={(e) =>
              setAssistantForm((prev) => ({ ...prev, category: e.target.value }))
            }
            options={CATEGORY_OPTIONS}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('aiHub.systemPrompt')}
            </label>
            <textarea
              className="w-full border rounded-lg p-2 text-sm min-h-[100px]"
              value={assistantForm.systemPrompt}
              onChange={(e) =>
                setAssistantForm((prev) => ({
                  ...prev,
                  systemPrompt: e.target.value,
                }))
              }
            />
            {formErrors.systemPrompt && (
              <p className="text-red-500 text-xs mt-1">{formErrors.systemPrompt}</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Create Provider Modal */}
      <Modal
        open={showProviderModal}
        onClose={() => { setShowProviderModal(false); setFormErrors({}); }}
        title={t('aiHub.newProvider')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowProviderModal(false); setFormErrors({}); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateProvider} loading={submitting}>
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('aiHub.name')}
            required
            value={providerForm.name}
            onChange={(e) =>
              setProviderForm((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
          />
          <Input
            label={t('aiHub.providerType')}
            required
            value={providerForm.provider}
            onChange={(e) =>
              setProviderForm((prev) => ({ ...prev, provider: e.target.value }))
            }
            error={formErrors.provider}
            placeholder={t('aiHub.providerTypePlaceholder')}
          />
          <Input
            label={t('aiHub.endpoint')}
            value={providerForm.apiEndpoint}
            onChange={(e) =>
              setProviderForm((prev) => ({
                ...prev,
                apiEndpoint: e.target.value,
              }))
            }
            error={formErrors.apiEndpoint}
            placeholder="https://provider.example/v1"
          />
          <Input
            label={t('aiHub.apiKey')}
            type="password"
            value={providerForm.apiKey}
            onChange={(e) =>
              setProviderForm((prev) => ({
                ...prev,
                apiKey: e.target.value,
              }))
            }
            helpText={t('aiHub.apiKeyHelp')}
          />
        </div>
      </Modal>
    </div>
  );
}
