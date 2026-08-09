import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Zap, Plus, Play, Activity, Trash2, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

type AutomationTab = 'rules' | 'logs';

interface AutomationRule {
  id: string;
  name: string;
  slug: string;
  category: string;
  triggerType: string;
  triggerEvent: string | null;
  triggerConfig: Record<string, unknown>;
  conditions: unknown[];
  description: string | null;
  isActive: boolean;
  priority: number;
  maxExecutions: number;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  triggerType: string;
  referenceType: string | null;
  referenceId: string | null;
  status: string;
  inputData: unknown;
  outputData: unknown;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TriggerEvent {
  id: string;
  label: string;
  category: string;
}

const CATEGORY_OPTIONS = [
  { value: 'general', labelKey: 'automation.general' },
  { value: 'clinical', labelKey: 'automation.clinical' },
  { value: 'billing', labelKey: 'automation.billing' },
  { value: 'operations', labelKey: 'automation.operations' },
];

const TRIGGER_TYPE_OPTIONS = [
  { value: 'manual', labelKey: 'automation.manual' },
  { value: 'event', labelKey: 'automation.eventDriven' },
  { value: 'schedule', labelKey: 'automation.scheduled' },
];

export default function AutomationPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AutomationTab>('rules');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [triggerRule, setTriggerRule] = useState<AutomationRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<AutomationRule | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [triggerEvents, setTriggerEvents] = useState<TriggerEvent[]>([]);

  const loadRules = useCallback(async () => {
    try {
      const r = await api.get('/automation/rules');
      setRules((r.data?.data ?? []) as AutomationRule[]);
    } catch {
      toast.error(t('automation.loadError'));
    }
  }, [t]);

  const loadLogs = useCallback(async () => {
    try {
      const r = await api.get('/automation/logs');
      const data = r.data?.data;
      setLogs((data?.logs ?? []) as ExecutionLog[]);
    } catch {
      toast.error(t('automation.loadError'));
    }
  }, [t]);

  const loadTriggerEvents = useCallback(async () => {
    try {
      const r = await api.get('/automation/trigger-events');
      setTriggerEvents((r.data?.data ?? []) as TriggerEvent[]);
    } catch {
      // optional — non-critical
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [rulesR, logsR] = await Promise.allSettled([
          api.get('/automation/rules'),
          api.get('/automation/logs'),
        ]);
        if (cancelled) return;
        if (rulesR.status === 'fulfilled') setRules((rulesR.value.data?.data ?? []) as AutomationRule[]);
        if (logsR.status === 'fulfilled') {
          const data = logsR.value.data?.data;
          setLogs((data?.logs ?? []) as ExecutionLog[]);
        }
      } catch {
        if (!cancelled) toast.error(t('automation.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (search && !r.name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory && r.category !== filterCategory) return false;
      return true;
    });
  }, [rules, search, filterCategory]);

  const categories = useMemo(() => {
    const cats = rules.map((r) => r.category);
    return [...new Set(cats)].filter(Boolean);
  }, [rules]);

  const handleTrigger = useCallback(async () => {
    if (!triggerRule) return;
    setTriggering(true);
    try {
      await api.post(`/automation/rules/${triggerRule.id}/trigger`, {});
      toast.success(t('automation.ruleTriggered'));
      setShowTriggerModal(false);
      setTriggerRule(null);
      await loadLogs();
    } catch {
      toast.error(t('automation.ruleTriggerError'));
    } finally {
      setTriggering(false);
    }
  }, [triggerRule, t, loadLogs]);

  const handleDelete = useCallback(async () => {
    if (!deleteRule) return;
    setDeleting(true);
    try {
      await api.delete(`/automation/rules/${deleteRule.id}`);
      setRules((prev) => prev.filter((r) => r.id !== deleteRule.id));
      toast.success(t('automation.ruleDeleted'));
      setShowDeleteModal(false);
      setDeleteRule(null);
    } catch {
      toast.error(t('automation.ruleDeleteError'));
    } finally {
      setDeleting(false);
    }
  }, [deleteRule, t]);

  const openTrigger = useCallback((rule: AutomationRule) => {
    setTriggerRule(rule);
    setShowTriggerModal(true);
  }, []);

  const openDelete = useCallback((rule: AutomationRule) => {
    setDeleteRule(rule);
    setShowDeleteModal(true);
  }, []);

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('automation.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('automation.ruleCount', { count: rules.length })} · {t('automation.executionCount', { count: logs.length })}
          </p>
        </div>
        <Button onClick={() => { setShowNewModal(true); void loadTriggerEvents(); }}>
          <Plus className="w-4 h-4" /> {t('automation.newRule')}
        </Button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <Button variant={tab === 'rules' ? 'primary' : 'secondary'} onClick={() => setTab('rules')}>
          <Zap className="w-4 h-4" /> {t('automation.rules')} ({rules.length})
        </Button>
        <Button variant={tab === 'logs' ? 'primary' : 'secondary'} onClick={() => setTab('logs')}>
          <Activity className="w-4 h-4" /> {t('automation.logs')} ({logs.length})
        </Button>
      </div>

      {tab === 'rules' && (
        <>
          <Card className="mb-6">
            <CardBody>
              <div className="flex gap-4 flex-wrap">
                <Input
                  placeholder={t('automation.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-md"
                />
                <select
                  className="input max-w-[200px]"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="">{t('automation.allCategories')}</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
            </CardBody>
          </Card>

          <div className="space-y-3">
            {filteredRules.length === 0 ? (
              <EmptyState title={t('automation.noRules')} />
            ) : (
              filteredRules.map((rule) => (
                <Card key={rule.id}>
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                          aria-label={expandedRule === rule.id ? 'Collapse' : 'Expand'}
                        >
                          {expandedRule === rule.id
                            ? <ChevronDown className="w-4 h-4 text-gray-400" />
                            : <ChevronRight className="w-4 h-4 text-gray-400" />}
                        </button>
                        <Zap className={`w-5 h-5 ${rule.isActive ? 'text-primary-600' : 'text-gray-300'}`} />
                        <div>
                          <span className="font-medium">{sanitizeString(rule.name)}</span>
                          <div className="flex gap-2 mt-1">
                            <Badge>{sanitizeString(rule.category)}</Badge>
                            <Badge variant={rule.triggerType === 'event' ? 'info' : rule.triggerType === 'schedule' ? 'warning' : 'gray'}>
                              {sanitizeString(rule.triggerType)}
                            </Badge>
                            <Badge variant={rule.isActive ? 'success' : 'gray'}>
                              {rule.isActive ? t('automation.active') : t('automation.inactive')}
                            </Badge>
                            {rule.triggerEvent && <Badge variant="info">{sanitizeString(rule.triggerEvent)}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openTrigger(rule)}>
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDelete(rule)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {expandedRule === rule.id && (
                      <div className="mt-4 pt-4 border-t text-sm space-y-2">
                        {rule.description && <p className="text-gray-600">{sanitizeString(rule.description)}</p>}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div><span className="text-gray-500">{t('automation.priority')}:</span> <span className="font-medium">{rule.priority}</span></div>
                          <div><span className="text-gray-500">{t('automation.trigger')}:</span> <span className="font-medium">{sanitizeString(rule.triggerType)}</span></div>
                          <div>
                            <span className="text-gray-500">{t('automation.lastTriggered')}:</span>{' '}
                            <span className="font-medium">{rule.lastTriggeredAt ? formatDateTime(rule.lastTriggeredAt) : t('automation.never')}</span>
                          </div>
                          <div><span className="text-gray-500">{t('automation.cooldown')}:</span> <span className="font-medium">{rule.cooldownMinutes} min</span></div>
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {tab === 'logs' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('automation.rule')}</th>
                <th>{t('automation.trigger')}</th>
                <th>{t('automation.status')}</th>
                <th>{t('automation.error')}</th>
                <th>{t('automation.duration')}</th>
                <th>{t('automation.timestamp')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title={t('automation.noLogs')} />
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="font-medium text-sm">{sanitizeString(log.ruleName)}</td>
                    <td><Badge>{sanitizeString(log.triggerType)}</Badge></td>
                    <td>
                      <Badge variant={log.status === 'completed' ? 'success' : log.status === 'completed_with_errors' ? 'warning' : 'danger'}>
                        {sanitizeString(log.status)}
                      </Badge>
                    </td>
                    <td className="text-xs max-w-xs truncate">
                      {log.errorMessage ? sanitizeString(log.errorMessage) : '-'}
                    </td>
                    <td className="text-xs">{log.durationMs ?? '-'}{log.durationMs ? 'ms' : ''}</td>
                    <td className="text-xs">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title={t('automation.newRule')} size="lg">
        <NewRuleForm
          triggerEvents={triggerEvents}
          onDone={() => { setShowNewModal(false); void loadRules(); }}
        />
      </Modal>

      <Modal open={showTriggerModal} onClose={() => { setShowTriggerModal(false); setTriggerRule(null); }} title={`${t('automation.trigger')}: ${triggerRule?.name ?? ''}`} size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('automation.triggerDescription')}</p>
          <Button className="w-full" onClick={handleTrigger} loading={triggering}>
            <Play className="w-4 h-4" /> {t('automation.triggerNow')}
          </Button>
        </div>
      </Modal>

      <Modal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteRule(null); }} title={t('automation.confirmDeleteTitle')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">{t('automation.confirmDeleteMessage')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setShowDeleteModal(false); setDeleteRule(null); }}>
              {t('automation.cancel')}
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>
              {t('automation.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NewRuleForm({
  triggerEvents,
  onDone,
}: {
  triggerEvents: TriggerEvent[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [triggerType, setTriggerType] = useState('manual');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setNameError(t('automation.ruleName') + ' is required');
      return;
    }
    setNameError('');
    setSaving(true);
    try {
      await api.post('/automation/rules', {
        name: sanitizeString(name),
        category,
        triggerType,
        triggerEvent: triggerEvent || undefined,
        description: description ? sanitizeString(description) : undefined,
      });
      toast.success(t('automation.ruleCreated'));
      onDone();
    } catch {
      toast.error(t('automation.ruleCreateError'));
    } finally {
      setSaving(false);
    }
  }, [name, category, triggerType, triggerEvent, description, t, onDone]);

  return (
    <div className="space-y-4">
      <Input
        label={t('automation.ruleName')}
        placeholder={t('automation.ruleNamePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('automation.category')}</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('automation.triggerType')}</label>
          <select className="input" value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
            {TRIGGER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </div>
      </div>
      {triggerType === 'event' && triggerEvents.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">{t('automation.triggerEvent')}</label>
          <select className="input" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
            <option value="">{t('automation.selectEvent')}</option>
            {triggerEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>{sanitizeString(ev.label)}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">{t('automation.description')}</label>
        <textarea
          className="input min-h-[80px]"
          placeholder={t('automation.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <Button className="w-full" onClick={handleSubmit} loading={saving} disabled={saving}>
        <Plus className="w-4 h-4" /> {saving ? t('automation.creating') : t('automation.createRule')}
      </Button>
    </div>
  );
}
