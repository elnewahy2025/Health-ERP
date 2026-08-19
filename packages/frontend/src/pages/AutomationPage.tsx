import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, CheckCircle2, ChevronDown, ChevronRight, Clock3, Play, Plus, Trash2, X,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { useAuth } from '../stores/authStore';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

type AutomationTab = 'rules' | 'logs';

type ActionConfig = Record<string, unknown>;

interface AutomationAction {
  id: string;
  stepOrder: number;
  actionType: string;
  actionName: string | null;
  actionConfig: ActionConfig | string;
  conditionOverride: unknown;
  isActive: boolean;
}

interface AutomationRule {
  id: string;
  name: string;
  slug: string;
  category: string;
  triggerType: string;
  triggerEvent: string | null;
  triggerConfig: ActionConfig | string;
  conditions: unknown[] | string;
  description: string | null;
  isActive: boolean;
  priority: number;
  maxExecutions: number;
  cooldownMinutes: number;
  lastTriggeredAt: string | null;
  nextRunAt: string | null;
  lastScheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  actions?: AutomationAction[];
}

interface ActionDefinition {
  id: string;
  label: string;
  category: string;
  fields: string[];
  retryable: boolean;
  maxAttempts: number;
}

interface ExecutionStep {
  id: string;
  stepOrder: number;
  actionType: string;
  actionName: string | null;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  outputData: unknown;
  errorCode: string | null;
  errorMessage: string | null;
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
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  idempotencyKey: string | null;
  steps: ExecutionStep[];
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

function objectValue(value: unknown): ActionConfig {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as ActionConfig;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ActionConfig : {};
    } catch { return {}; }
  }
  return {};
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (status === 'completed') return 'success';
  if (status === 'completed_with_errors' || status === 'retry_wait' || status === 'running') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'queued') return 'info';
  return 'gray';
}

export default function AutomationPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState<AutomationTab>('rules');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [triggerRule, setTriggerRule] = useState<AutomationRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<AutomationRule | null>(null);
  const [actionRule, setActionRule] = useState<AutomationRule | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingActivation, setChangingActivation] = useState<string | null>(null);
  const [triggerEvents, setTriggerEvents] = useState<TriggerEvent[]>([]);
  const [actionDefinitions, setActionDefinitions] = useState<ActionDefinition[]>([]);
  const [ruleDetails, setRuleDetails] = useState<Record<string, AutomationRule>>({});

  const loadRules = useCallback(async () => {
    try {
      const response = await api.get('/automation/rules');
      setRules((response.data?.data ?? []) as AutomationRule[]);
    } catch {
      toast.error(t('automation.loadError'));
    }
  }, [t]);

  const loadLogs = useCallback(async () => {
    try {
      const response = await api.get('/automation/logs');
      const data = response.data?.data;
      setLogs((data?.logs ?? []) as ExecutionLog[]);
    } catch {
      toast.error(t('automation.loadError'));
    }
  }, [t]);

  const loadTriggerEvents = useCallback(async () => {
    try {
      const response = await api.get('/automation/trigger-events');
      setTriggerEvents((response.data?.data ?? []) as TriggerEvent[]);
    } catch {
      // Catalog loading is optional until the create form is opened.
    }
  }, []);

  const loadActionDefinitions = useCallback(async () => {
    try {
      const response = await api.get('/automation/action-types');
      setActionDefinitions((response.data?.data ?? []) as ActionDefinition[]);
    } catch {
      toast.error(t('automation.loadError'));
    }
  }, [t]);

  const loadRuleDetails = useCallback(async (ruleId: string) => {
    try {
      const response = await api.get(`/automation/rules/${ruleId}`);
      const detail = response.data?.data as AutomationRule;
      if (detail) setRuleDetails((previous) => ({ ...previous, [ruleId]: detail }));
    } catch {
      toast.error(t('automation.loadError'));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [rulesResponse, logsResponse] = await Promise.allSettled([
          api.get('/automation/rules'),
          api.get('/automation/logs'),
        ]);
        if (cancelled) return;
        if (rulesResponse.status === 'fulfilled') setRules((rulesResponse.value.data?.data ?? []) as AutomationRule[]);
        if (logsResponse.status === 'fulfilled') setLogs((logsResponse.value.data?.data?.logs ?? []) as ExecutionLog[]);
      } catch {
        if (!cancelled) toast.error(t('automation.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const filteredRules = useMemo(() => rules.filter((rule) => {
    if (search && !rule.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && rule.category !== filterCategory) return false;
    return true;
  }), [rules, search, filterCategory]);

  const categories = useMemo(() => [...new Set(rules.map((rule) => rule.category))].filter(Boolean), [rules]);

  const toggleRule = useCallback((rule: AutomationRule) => {
    const next = expandedRule === rule.id ? null : rule.id;
    setExpandedRule(next);
    if (next) void loadRuleDetails(rule.id);
  }, [expandedRule, loadRuleDetails]);

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
      setRules((previous) => previous.filter((rule) => rule.id !== deleteRule.id));
      toast.success(t('automation.ruleDeleted'));
      setShowDeleteModal(false);
      setDeleteRule(null);
    } catch {
      toast.error(t('automation.ruleDeleteError'));
    } finally {
      setDeleting(false);
    }
  }, [deleteRule, t]);

  const handleActivation = useCallback(async (rule: AutomationRule) => {
    setChangingActivation(rule.id);
    try {
      await api.put(`/automation/rules/${rule.id}`, { isActive: !rule.isActive });
      setRules((previous) => previous.map((item) => item.id === rule.id ? { ...item, isActive: !rule.isActive } : item));
      setRuleDetails((previous) => ({ ...previous, [rule.id]: { ...(previous[rule.id] || rule), isActive: !rule.isActive } }));
      toast.success(t(rule.isActive ? 'automation.ruleDeactivated' : 'automation.ruleActivated'));
    } catch {
      toast.error(t('automation.activationError'));
    } finally {
      setChangingActivation(null);
    }
  }, [t]);

  const handleDeleteAction = useCallback(async (ruleId: string, actionId: string) => {
    try {
      await api.delete(`/automation/rules/${ruleId}/actions/${actionId}`);
      await loadRuleDetails(ruleId);
      toast.success(t('automation.actionDeleted'));
    } catch {
      toast.error(t('automation.actionDeleteError'));
    }
  }, [loadRuleDetails, t]);

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
        {can('automation.create') && (
          <Button onClick={() => { setShowNewModal(true); void loadTriggerEvents(); }}>
            <Plus className="w-4 h-4" /> {t('automation.newRule')}
          </Button>
        )}
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
          <Card className="mb-6"><CardBody><div className="flex gap-4 flex-wrap">
            <Input placeholder={t('automation.searchPlaceholder')} value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-md" />
            <select className="input max-w-[200px]" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
              <option value="">{t('automation.allCategories')}</option>
              {categories.map((category) => <option key={category} value={category}>{category.charAt(0).toUpperCase() + category.slice(1)}</option>)}
            </select>
          </div></CardBody></Card>

          <div className="space-y-3">
            {filteredRules.length === 0 ? <EmptyState title={t('automation.noRules')} /> : filteredRules.map((rule) => {
              const detail = ruleDetails[rule.id];
              const actions = detail?.actions || rule.actions || [];
              return (
                <Card key={rule.id}><CardBody>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button onClick={() => toggleRule(rule)} className="p-1 hover:bg-gray-100 rounded" aria-label={expandedRule === rule.id ? 'Collapse' : 'Expand'}>
                        {expandedRule === rule.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </button>
                      <Zap className={`w-5 h-5 ${rule.isActive ? 'text-primary-600' : 'text-gray-300'}`} />
                      <div className="min-w-0">
                        <span className="font-medium">{sanitizeString(rule.name)}</span>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <Badge>{sanitizeString(rule.category)}</Badge>
                          <Badge variant={rule.triggerType === 'event' ? 'info' : rule.triggerType === 'schedule' ? 'warning' : 'gray'}>{sanitizeString(rule.triggerType)}</Badge>
                          <Badge variant={rule.isActive ? 'success' : 'gray'}>{rule.isActive ? t('automation.active') : t('automation.inactive')}</Badge>
                          {rule.triggerEvent && <Badge variant="info">{sanitizeString(rule.triggerEvent)}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {can('automation.manage') && rule.isActive && rule.triggerType === 'manual' && (
                        <Button variant="ghost" size="sm" onClick={() => { setTriggerRule(rule); setShowTriggerModal(true); }} title={t('automation.triggerNow')}><Play className="w-4 h-4" /></Button>
                      )}
                      {can('automation.edit') && (
                        <Button variant="ghost" size="sm" onClick={() => void handleActivation(rule)} loading={changingActivation === rule.id} title={rule.isActive ? t('automation.deactivate') : t('automation.activate')}>
                          {rule.isActive ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        </Button>
                      )}
                      {can('automation.delete') && <Button variant="ghost" size="sm" onClick={() => { setDeleteRule(rule); setShowDeleteModal(true); }}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                    </div>
                  </div>

                  {expandedRule === rule.id && (
                    <div className="mt-4 pt-4 border-t text-sm space-y-4">
                      {rule.description && <p className="text-gray-600">{sanitizeString(rule.description)}</p>}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div><span className="text-gray-500">{t('automation.priority')}:</span> <span className="font-medium">{rule.priority}</span></div>
                        <div><span className="text-gray-500">{t('automation.trigger')}:</span> <span className="font-medium">{sanitizeString(rule.triggerType)}</span></div>
                        <div><span className="text-gray-500">{t('automation.lastTriggered')}:</span> <span className="font-medium">{rule.lastTriggeredAt ? formatDateTime(rule.lastTriggeredAt) : t('automation.never')}</span></div>
                        <div><span className="text-gray-500">{t('automation.cooldown')}:</span> <span className="font-medium">{rule.cooldownMinutes} min</span></div>
                      </div>
                      {rule.triggerType === 'schedule' && (
                        <div className="rounded-md bg-gray-50 p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div><span className="text-gray-500">{t('automation.scheduleCron')}:</span> <span className="font-mono">{String(objectValue(rule.triggerConfig).cron || '')}</span></div>
                          <div><span className="text-gray-500">{t('automation.scheduleTimezone')}:</span> <span>{String(objectValue(rule.triggerConfig).timezone || 'UTC')}</span></div>
                          <div><span className="text-gray-500">{t('automation.nextRun')}:</span> <span>{rule.nextRunAt ? formatDateTime(rule.nextRunAt) : t('automation.never')}</span></div>
                        </div>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-2"><h3 className="font-medium">{t('automation.ruleActions')}</h3>{can('automation.edit') && <Button size="sm" variant="secondary" onClick={() => { setActionRule(rule); setShowActionModal(true); void loadActionDefinitions(); }}><Plus className="w-4 h-4" /> {t('automation.addAction')}</Button>}</div>
                        {actions.length === 0 ? <p className="text-amber-700 bg-amber-50 rounded p-3">{t('automation.noActions')}</p> : <div className="space-y-2">{actions.map((action) => {
                          const config = objectValue(action.actionConfig);
                          return <div key={action.id} className="flex items-center justify-between border rounded p-3">
                            <div><span className="font-medium">{sanitizeString(action.actionName || action.actionType)}</span><div className="text-xs text-gray-500 mt-1">{sanitizeString(action.actionType)} · {String(config.templateKey || '')} · {String(config.recipientPath || config.recipient || '')}</div></div>
                            {can('automation.edit') && <Button variant="ghost" size="sm" onClick={() => void handleDeleteAction(rule.id, action.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>}
                          </div>;
                        })}</div>}
                      </div>
                    </div>
                  )}
                </CardBody></Card>
              );
            })}
          </div>
        </>
      )}

      {tab === 'logs' && <ExecutionLogTable logs={logs} expandedLog={expandedLog} setExpandedLog={setExpandedLog} t={t} />}

      <Modal open={showNewModal} onClose={() => setShowNewModal(false)} title={t('automation.newRule')} size="lg">
        <NewRuleForm triggerEvents={triggerEvents} onDone={() => { setShowNewModal(false); void loadRules(); }} />
      </Modal>

      <Modal open={showActionModal} onClose={() => { setShowActionModal(false); setActionRule(null); }} title={t('automation.addAction')} size="lg">
        {actionRule && <ActionForm rule={actionRule} definitions={actionDefinitions} onDone={() => { setShowActionModal(false); void loadRuleDetails(actionRule.id); }} />}
      </Modal>

      <Modal open={showTriggerModal} onClose={() => { setShowTriggerModal(false); setTriggerRule(null); }} title={`${t('automation.trigger')}: ${triggerRule?.name ?? ''}`} size="md">
        <div className="space-y-4"><p className="text-sm text-gray-600">{t('automation.triggerDescription')}</p><Button className="w-full" onClick={handleTrigger} loading={triggering}><Play className="w-4 h-4" /> {t('automation.triggerNow')}</Button></div>
      </Modal>

      <Modal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteRule(null); }} title={t('automation.confirmDeleteTitle')} size="sm">
        <div className="space-y-4"><p className="text-sm text-gray-600">{t('automation.confirmDeleteMessage')}</p><div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => { setShowDeleteModal(false); setDeleteRule(null); }}>{t('automation.cancel')}</Button><Button variant="danger" className="flex-1" onClick={handleDelete} loading={deleting}>{t('automation.confirm')}</Button></div></div>
      </Modal>
    </div>
  );
}

function ExecutionLogTable({ logs, expandedLog, setExpandedLog, t }: { logs: ExecutionLog[]; expandedLog: string | null; setExpandedLog: (id: string | null) => void; t: (key: string, options?: Record<string, unknown>) => string }) {
  return <div className="table-container"><table><thead><tr><th>{t('automation.rule')}</th><th>{t('automation.trigger')}</th><th>{t('automation.status')}</th><th>{t('automation.attempt')}</th><th>{t('automation.steps')}</th><th>{t('automation.error')}</th><th>{t('automation.timestamp')}</th></tr></thead><tbody>
    {logs.length === 0 ? <tr><td colSpan={7}><EmptyState title={t('automation.noLogs')} /></td></tr> : logs.map((log) => <Fragment key={log.id}>
      <tr key={log.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
        <td className="font-medium text-sm">{sanitizeString(log.ruleName)}</td><td><Badge>{sanitizeString(log.triggerType)}</Badge></td><td><Badge variant={statusVariant(log.status)}>{sanitizeString(log.status)}</Badge></td>
        <td className="text-xs">{log.attemptCount}/{log.maxAttempts}</td><td className="text-xs">{log.steps?.length ?? 0}</td><td className="text-xs max-w-xs truncate">{log.errorMessage ? sanitizeString(log.errorMessage) : '-'}</td><td className="text-xs">{formatDateTime(log.createdAt)}</td>
      </tr>
      {expandedLog === log.id && <tr key={`${log.id}-details`}><td colSpan={7}><div className="p-3 bg-gray-50 space-y-3"><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"><div><span className="text-gray-500">{t('automation.duration')}:</span> {log.durationMs ?? '-'}ms</div><div><span className="text-gray-500">{t('automation.retryAt')}:</span> {log.nextAttemptAt ? formatDateTime(log.nextAttemptAt) : '-'}</div><div><span className="text-gray-500">{t('automation.reference')}:</span> {log.referenceId || '-'}</div><div><span className="text-gray-500">{t('automation.idempotencyKey')}:</span> <span className="font-mono break-all">{log.idempotencyKey || '-'}</span></div></div>{log.steps?.length ? <div className="space-y-2">{log.steps.map((step) => <div key={step.id} className="flex items-center justify-between border rounded bg-white p-2 text-xs"><div><span className="font-medium">{t('automation.step', { step: step.stepOrder + 1 })}</span> · {sanitizeString(step.actionName || step.actionType)}</div><div className="flex items-center gap-2"><Badge variant={statusVariant(step.status)}>{sanitizeString(step.status)}</Badge><span>{step.attemptCount}/{step.maxAttempts}</span>{step.errorMessage && <span className="text-red-600">{sanitizeString(step.errorMessage)}</span>}</div></div>)}</div> : <span className="text-gray-500">{t('automation.noSteps')}</span>}</div></td></tr>}
    </Fragment>)}</tbody></table></div>;
}

function NewRuleForm({ triggerEvents, onDone }: { triggerEvents: TriggerEvent[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [triggerType, setTriggerType] = useState('manual');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [description, setDescription] = useState('');
  const [cron, setCron] = useState('0 9 * * *');
  const [timezone, setTimezone] = useState('UTC');
  const [maxExecutions, setMaxExecutions] = useState('0');
  const [cooldownMinutes, setCooldownMinutes] = useState('0');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { setNameError(t('automation.ruleName') + ' is required'); return; }
    setNameError(''); setSaving(true);
    try {
      await api.post('/automation/rules', {
        name: sanitizeString(name), category, triggerType, triggerEvent: triggerType === 'event' ? triggerEvent || undefined : undefined,
        triggerConfig: triggerType === 'schedule' ? { cron: cron.trim(), timezone: timezone.trim() || 'UTC' } : {},
        description: description ? sanitizeString(description) : undefined,
        maxExecutions: Number(maxExecutions) || 0, cooldownMinutes: Number(cooldownMinutes) || 0, isActive: false,
      });
      toast.success(t('automation.ruleCreated')); onDone();
    } catch { toast.error(t('automation.ruleCreateError')); } finally { setSaving(false); }
  }, [name, category, triggerType, triggerEvent, description, cron, timezone, maxExecutions, cooldownMinutes, t, onDone]);

  return <div className="space-y-4">
    <Input label={t('automation.ruleName')} placeholder={t('automation.ruleNamePlaceholder')} value={name} onChange={(event) => setName(event.target.value)} error={nameError} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium mb-1">{t('automation.category')}</label><select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select></div><div><label className="block text-sm font-medium mb-1">{t('automation.triggerType')}</label><select className="input" value={triggerType} onChange={(event) => setTriggerType(event.target.value)}>{TRIGGER_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select></div></div>
    {triggerType === 'event' && <div><label className="block text-sm font-medium mb-1">{t('automation.triggerEvent')}</label><select className="input" value={triggerEvent} onChange={(event) => setTriggerEvent(event.target.value)}><option value="">{t('automation.selectEvent')}</option>{triggerEvents.map((event) => <option key={event.id} value={event.id}>{sanitizeString(event.label)}</option>)}</select></div>}
    {triggerType === 'schedule' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label={t('automation.scheduleCron')} value={cron} onChange={(event) => setCron(event.target.value)} /><Input label={t('automation.scheduleTimezone')} value={timezone} onChange={(event) => setTimezone(event.target.value)} /></div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input type="number" min="0" label={t('automation.maxExecutions', 'Max executions')} value={maxExecutions} onChange={(event) => setMaxExecutions(event.target.value)} /><Input type="number" min="0" label={t('automation.cooldown', 'Cooldown minutes')} value={cooldownMinutes} onChange={(event) => setCooldownMinutes(event.target.value)} /></div>
    <div><label className="block text-sm font-medium mb-1">{t('automation.description')}</label><textarea className="input min-h-[80px]" placeholder={t('automation.descriptionPlaceholder')} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">{t('automation.noActions')}</p>
    <Button className="w-full" onClick={handleSubmit} loading={saving} disabled={saving}><Plus className="w-4 h-4" /> {saving ? t('automation.creating') : t('automation.createRule')}</Button>
  </div>;
}

function ActionForm({ rule, definitions, onDone }: { rule: AutomationRule; definitions: ActionDefinition[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [actionType, setActionType] = useState(definitions[0]?.id || '');
  const [templateKey, setTemplateKey] = useState('invoice.paid');
  const [recipientPath, setRecipientPath] = useState('patient.email');
  const [recipient, setRecipient] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const definition = definitions[0];
    if (definition && !actionType) setActionType(definition.id);
  }, [definitions, actionType]);

  const submit = useCallback(async () => {
    if (!actionType || !templateKey.trim() || (!recipientPath.trim() && !recipient.trim())) { toast.error(t('automation.actionConfigRequired')); return; }
    setSaving(true);
    try {
      const config: ActionConfig = { templateKey: templateKey.trim(), ...(recipientPath.trim() ? { recipientPath: recipientPath.trim() } : { recipient: recipient.trim() }), ...(actionType === 'send_notification' ? { channel } : {}) };
      await api.post(`/automation/rules/${rule.id}/actions`, { actionType, actionName: templateKey.trim(), actionConfig: config, conditionOverride: [], isActive: true });
      toast.success(t('automation.actionAdded')); onDone();
    } catch { toast.error(t('automation.actionAddError')); } finally { setSaving(false); }
  }, [actionType, templateKey, recipientPath, recipient, channel, rule.id, t, onDone]);

  return <div className="space-y-4">
    <div><label className="block text-sm font-medium mb-1">{t('automation.actionType')}</label><select className="input" value={actionType} onChange={(event) => { setActionType(event.target.value); setChannel(event.target.value === 'send_sms' ? 'sms' : 'email'); }}>{definitions.map((definition) => <option key={definition.id} value={definition.id}>{sanitizeString(definition.label)}</option>)}</select></div>
    <Input label={t('automation.templateKey')} value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label={t('automation.recipientPath')} value={recipientPath} onChange={(event) => setRecipientPath(event.target.value)} /><Input label={t('automation.recipient')} value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={t('automation.recipientHint')} /></div>
    {actionType === 'send_notification' && <div><label className="block text-sm font-medium mb-1">{t('automation.channel')}</label><select className="input" value={channel} onChange={(event) => setChannel(event.target.value as 'email' | 'sms')}><option value="email">{t('automation.email')}</option><option value="sms">{t('automation.sms')}</option></select></div>}
    <p className="text-xs text-gray-500">{t('automation.recipientHint')}</p>
    <Button className="w-full" onClick={() => void submit()} loading={saving} disabled={saving}><Plus className="w-4 h-4" /> {t('automation.addAction')}</Button>
  </div>;
}
