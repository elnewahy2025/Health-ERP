import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Server, Bell, Database, Activity,
  CheckCircle, RefreshCw,
} from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

type MonitorTab = 'health' | 'alerts' | 'storage' | 'audit';

interface HealthData {
  status: string;
  uptime: string;
  database: { status: string; latency: string };
  redis: { status: string };
  memory: { heapUsed: string; heapTotal: string; rss: string };
  platform: { node: string; arch: string; platform: string; cpus: number };
  timestamp: string;
}

interface SystemAlert {
  id: string;
  severity: string;
  source: string;
  message: string;
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string;
}

interface StorageStat {
  table: string;
  recordCount: number;
}

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  userId: string;
  ip: string;
  timestamp: string;
}

export default function SystemMonitorPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MonitorTab>('health');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [storage, setStorage] = useState<StorageStat[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditFilter, setAuditFilter] = useState('');
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [healthR, alertsR, storageR, auditR] = await Promise.allSettled([
        api.get('/system/health'),
        api.get('/system/alerts', { params: { acknowledged: 'false' } }),
        api.get('/system/storage'),
        api.get('/system/audit-log'),
      ]);
      if (healthR.status === 'fulfilled') setHealth(healthR.value.data?.data as HealthData | null);
      if (alertsR.status === 'fulfilled') setAlerts((alertsR.value.data?.data ?? []) as SystemAlert[]);
      if (storageR.status === 'fulfilled') setStorage((storageR.value.data?.data ?? []) as StorageStat[]);
      if (auditR.status === 'fulfilled') setAuditLog((auditR.value.data?.data ?? []) as AuditEntry[]);
    } catch {
      toast.error(t('monitor.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        const [healthR, alertsR, storageR, auditR] = await Promise.allSettled([
          api.get('/system/health'),
          api.get('/system/alerts', { params: { acknowledged: 'false' } }),
          api.get('/system/storage'),
          api.get('/system/audit-log'),
        ]);
        if (cancelled) return;
        if (healthR.status === 'fulfilled') setHealth(healthR.value.data?.data as HealthData | null);
        if (alertsR.status === 'fulfilled') setAlerts((alertsR.value.data?.data ?? []) as SystemAlert[]);
        if (storageR.status === 'fulfilled') setStorage((storageR.value.data?.data ?? []) as StorageStat[]);
        if (auditR.status === 'fulfilled') setAuditLog((auditR.value.data?.data ?? []) as AuditEntry[]);
      } catch {
        if (!cancelled) toast.error(t('monitor.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadData();
    return () => { cancelled = true; };
  }, [t]);

  const handleAcknowledge = useCallback(async (alertId: string) => {
    setAcknowledgingId(alertId);
    try {
      await api.put(`/system/alerts/${alertId}/acknowledge`);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast.success(t('monitor.acknowledgeSuccess'));
    } catch {
      toast.error(t('monitor.acknowledgeError'));
    } finally {
      setAcknowledgingId(null);
    }
  }, [t]);

  const filteredAudit = auditFilter
    ? auditLog.filter(
        (l) =>
          l.action?.toLowerCase().includes(auditFilter.toLowerCase()) ||
          l.entity?.toLowerCase().includes(auditFilter.toLowerCase())
      )
    : auditLog;

  const formatTimestamp = useCallback((ts: string) => {
    if (!ts) return '';
    return formatDateTime(ts);
  }, []);

  if (loading) return <PageLoader message={t('common.loading')} />;

  const tabs: { key: MonitorTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'health', label: t('monitor.health'), icon: <Server className="w-4 h-4" /> },
    { key: 'alerts', label: t('monitor.alerts'), icon: <Bell className="w-4 h-4" />, count: alerts.length },
    { key: 'storage', label: t('monitor.storage'), icon: <Database className="w-4 h-4" /> },
    { key: 'audit', label: t('monitor.auditLog'), icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('monitor.title')}</h1></div>
        <Button onClick={load}><RefreshCw className="w-4 h-4" /> {t('monitor.refresh')}</Button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((tb) => (
          <Button
            key={tb.key}
            variant={tab === tb.key ? 'primary' : 'secondary'}
            onClick={() => setTab(tb.key)}
          >
            {tb.icon} {tb.label}{tb.count !== undefined ? ` (${tb.count})` : ''}
          </Button>
        ))}
      </div>

      {tab === 'health' && health && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-4 h-4 rounded-full ${health.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xl font-bold capitalize">
              {health.status === 'healthy' ? t('monitor.healthy') : health.status === 'degraded' ? t('monitor.degraded') : t('monitor.unhealthy')}
            </span>
            <span className="text-sm text-gray-500">{t('monitor.uptime')}: {sanitizeString(health.uptime)}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-2">
                  <Database className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{t('monitor.database')}</span>
                </div>
                <Badge variant={health.database?.status === 'healthy' ? 'success' : 'danger'}>
                  {health.database?.status}
                </Badge>
                <p className="text-xs text-gray-500 mt-1">{t('monitor.latency')}: {sanitizeString(health.database?.latency)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{t('monitor.redis')}</span>
                </div>
                <Badge variant={health.redis?.status === 'connected' ? 'success' : 'danger'}>
                  {health.redis?.status === 'connected' ? t('monitor.connected') : t('monitor.disconnected')}
                </Badge>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-2">
                  <Server className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{t('monitor.memory')}</span>
                </div>
                <p className="text-xl font-bold">{sanitizeString(health.memory?.heapUsed)}</p>
                <p className="text-xs text-gray-500">RSS: {sanitizeString(health.memory?.rss)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="flex items-center gap-2 mb-2">
                  <Server className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">{t('monitor.platform')}</span>
                </div>
                <p className="text-sm">Node {sanitizeString(health.platform?.node)}</p>
                <p className="text-xs text-gray-500">{health.platform?.cpus} {t('monitor.cpus')} · {sanitizeString(health.platform?.arch)}</p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardBody>
              <h3 className="font-semibold mb-3">{t('monitor.environment')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-500">{t('monitor.nodejs')}</p><p className="font-medium">{sanitizeString(health.platform?.node)}</p></div>
                <div><p className="text-gray-500">{t('monitor.platform')}</p><p className="font-medium">{sanitizeString(health.platform?.platform)}</p></div>
                <div><p className="text-gray-500">{t('monitor.architecture')}</p><p className="font-medium">{sanitizeString(health.platform?.arch)}</p></div>
                <div><p className="text-gray-500">{t('monitor.cpus')}</p><p className="font-medium">{health.platform?.cpus}</p></div>
                <div><p className="text-gray-500">{t('monitor.heapTotal')}</p><p className="font-medium">{sanitizeString(health.memory?.heapTotal)}</p></div>
                <div><p className="text-gray-500">{t('monitor.heapUsed')}</p><p className="font-medium">{sanitizeString(health.memory?.heapUsed)}</p></div>
                <div><p className="text-gray-500">{t('monitor.rss')}</p><p className="font-medium">{sanitizeString(health.memory?.rss)}</p></div>
                <div><p className="text-gray-500">{t('monitor.uptime')}</p><p className="font-medium">{sanitizeString(health.uptime)}</p></div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'alerts' && (
        <div>
          {alerts.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-gray-500">{t('monitor.noAlerts')}</p>
              </CardBody>
            </Card>
          ) : (
            alerts.map((a) => (
              <Card
                key={a.id}
                className={`mb-3 border-l-4 ${
                  a.severity === 'critical' ? 'border-l-red-500' :
                  a.severity === 'warning' ? 'border-l-yellow-500' : 'border-l-blue-500'
                }`}
              >
                <CardBody>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={
                          a.severity === 'critical' ? 'danger' :
                          a.severity === 'warning' ? 'warning' : 'info'
                        }>
                          {a.severity === 'critical' ? t('monitor.critical') :
                           a.severity === 'warning' ? t('monitor.warning') : t('monitor.info')}
                        </Badge>
                        <span className="font-medium">{sanitizeString(a.source)}</span>
                      </div>
                      <p className="text-sm">{sanitizeString(a.message)}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatTimestamp(a.createdAt)}</p>
                    </div>
                    {!a.isAcknowledged && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAcknowledge(a.id)}
                        loading={acknowledgingId === a.id}
                      >
                        {t('monitor.acknowledge')}
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'storage' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {storage.length === 0 ? (
            <EmptyState title={t('monitor.noStorage')} />
          ) : (
            storage.map((s) => (
              <Card key={s.table}>
                <CardBody>
                  <p className="text-sm text-gray-500 capitalize">{sanitizeString(s.table.replace(/_/g, ' '))}</p>
                  <p className="text-xl font-bold">{s.recordCount?.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{t('monitor.records')}</p>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div>
          <Card className="mb-4">
            <CardBody>
              <Input
                placeholder={t('monitor.filterPlaceholder')}
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                className="max-w-md"
              />
            </CardBody>
          </Card>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('monitor.action')}</th>
                  <th>{t('monitor.entity')}</th>
                  <th>{t('monitor.entityId')}</th>
                  <th>{t('monitor.user')}</th>
                  <th>{t('monitor.ip')}</th>
                  <th>{t('monitor.timestamp')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState title={t('monitor.noAudit')} />
                    </td>
                  </tr>
                ) : (
                  filteredAudit.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td><Badge>{sanitizeString(l.action)}</Badge></td>
                      <td className="text-xs">{sanitizeString(l.entity)}</td>
                      <td className="font-mono text-xs">{sanitizeString(l.entityId?.slice(0, 12) ?? '')}</td>
                      <td className="text-xs">{sanitizeString(l.userId?.slice(0, 8) ?? '')}</td>
                      <td className="text-xs">{sanitizeString(l.ip ?? '')}</td>
                      <td className="text-xs">{formatTimestamp(l.timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
