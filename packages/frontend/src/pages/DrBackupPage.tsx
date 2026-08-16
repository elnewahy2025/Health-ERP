import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  drApi,
  type BackupConfig,
  type BackupExecution,
  type DrConfig,
} from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import {
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import {
  HardDrive,
  RefreshCw,
  Shield,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabType = 'backups' | 'configs' | 'dr';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'gray'> = {
  completed: 'success',
  healthy: 'success',
  active: 'success',
  enabled: 'success',
  running: 'warning',
  pending: 'warning',
  failed: 'danger',
  error: 'danger',
  disabled: 'gray',
  inactive: 'gray',
};

export default function DrBackupPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('backups');
  const [backups, setBackups] = useState<BackupExecution[]>([]);
  const [configs, setConfigs] = useState<BackupConfig[]>([]);
  const [drConfig, setDrConfig] = useState<DrConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningBackup, setRunningBackup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [backupsRes, configsRes, drRes] = await Promise.allSettled([
          drApi.listBackups(),
          drApi.listConfigs(),
          drApi.getDrConfig(),
        ]);
        if (cancelled) return;
        if (backupsRes.status === 'fulfilled') setBackups(backupsRes.value);
        if (configsRes.status === 'fulfilled') setConfigs(configsRes.value);
        if (drRes.status === 'fulfilled') setDrConfig(drRes.value);
        if (backupsRes.status === 'rejected' && configsRes.status === 'rejected') {
          setError(t('dr.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('dr.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [t]);

  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      await drApi.runBackup({ type: 'full' });
      toast.success(t('dr.backupStarted'));
      const updated = await drApi.listBackups();
      setBackups(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setRunningBackup(false);
    }
  };

  const handleRunDrTest = async () => {
    try {
      await drApi.runDrTest();
      toast.success(t('dr.drTestComplete'));
      const updated = await drApi.getDrConfig();
      setDrConfig(updated);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const formatSize = (bytes: number | null): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardDrive className="w-6 h-6" /> {t('dr.title')}
        </h1>
        <Button onClick={handleRunBackup} loading={runningBackup}>
          <RefreshCw className="w-4 h-4 mr-1" /> {t('dr.runBackup')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'backups' ? 'primary' : 'secondary'}
          onClick={() => setTab('backups')}
        >
          <HardDrive className="w-4 h-4" />
          <span className="ml-1">{t('dr.backups')} ({backups.length})</span>
        </Button>
        <Button
          variant={tab === 'configs' ? 'primary' : 'secondary'}
          onClick={() => setTab('configs')}
        >
          <Activity className="w-4 h-4" />
          <span className="ml-1">{t('dr.configs')} ({configs.length})</span>
        </Button>
        <Button
          variant={tab === 'dr' ? 'primary' : 'secondary'}
          onClick={() => setTab('dr')}
        >
          <Shield className="w-4 h-4" /> {t('dr.drConfig')}
        </Button>
      </div>

      {/* Backups Tab */}
      {tab === 'backups' && (
        <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.configName')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.type')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.size')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.checksum')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.trigger')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('dr.started')}</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<HardDrive className="w-12 h-12 text-gray-300" />}
                      title={t('dr.noBackups')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">
                      {b.configName ? escapeHtml(b.configName) : t('dr.manual')}
                    </td>
                    <td className="p-3"><Badge>{escapeHtml(b.type)}</Badge></td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[b.status] ?? 'gray'}>
                        {escapeHtml(b.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">{formatSize(b.sizeBytes)}</td>
                    <td className="p-3 font-mono text-xs">
                      {b.checksum ? escapeHtml(b.checksum.slice(0, 16)) : '-'}
                    </td>
                    <td className="p-3"><Badge>{escapeHtml(b.trigger)}</Badge></td>
                    <td className="p-3 text-xs">
                      {formatDateTime(b.startedAt) || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Configs Tab */}
      {tab === 'configs' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {configs.length === 0 ? (
              <EmptyState
                icon={<Activity className="w-12 h-12 text-gray-300" />}
                title={t('dr.noConfigs')}
                message={t('common.noData')}
              />
            ) : (
              configs.map((c) => (
                <div key={c.id} className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{escapeHtml(c.name)}</h3>
                    <Badge>{escapeHtml(c.type)}</Badge>
                  </div>
                  <div className="space-y-1 text-xs text-gray-500">
                    <p>
                      {t('dr.schedule')}: <code className="font-mono">{escapeHtml(c.schedule)}</code>
                    </p>
                    <p>
                      {t('dr.retention')}: {c.retentionDays} {t('dr.days')} ·{' '}
                      {t('dr.location')}: {escapeHtml(c.storageLocation)}
                    </p>
                    <p>
                      {t('dr.lastBackup')}: {formatDateTime(c.lastBackupAt) || t('dr.never')} ·{' '}
                      <Badge variant={c.isActive ? 'success' : 'gray'}>
                        {c.isActive ? t('dr.active') : t('dr.inactive')}
                      </Badge>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* DR Config Tab */}
      {tab === 'dr' && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <p className="text-sm text-gray-500">{t('dr.status')}</p>
              <p className="text-xl font-bold">
                <Badge variant={drConfig?.status === 'healthy' ? 'success' : 'danger'}>
                  {drConfig?.status ? escapeHtml(drConfig.status) : t('dr.notConfigured')}
                </Badge>
              </p>
            </div>
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <p className="text-sm text-gray-500">{t('dr.rpo')}</p>
              <p className="text-xl font-bold">{drConfig?.rpoMinutes ?? 60} min</p>
              <p className="text-xs text-gray-400">{t('dr.rpoDesc')}</p>
            </div>
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <p className="text-sm text-gray-500">{t('dr.rto')}</p>
              <p className="text-xl font-bold">{drConfig?.rtoMinutes ?? 120} min</p>
              <p className="text-xs text-gray-400">{t('dr.rtoDesc')}</p>
            </div>
          </div>

          {/* DR Configuration Details */}
          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800 mb-4">
            <h3 className="font-semibold mb-3">{t('dr.drConfiguration')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">{t('dr.failover')}</p>
                <p className="font-medium capitalize">
                  {drConfig?.failoverStrategy ? escapeHtml(drConfig.failoverStrategy) : t('dr.manual')}
                </p>
              </div>
              <div>
                <p className="text-gray-500">{t('dr.replicationRegion')}</p>
                <p className="font-medium">
                  {drConfig?.replicationRegion ? escapeHtml(drConfig.replicationRegion) : 'auto'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">{t('dr.crossRegion')}</p>
                <p className="font-medium">
                  {drConfig?.crossRegionReplication ? t('dr.enabled') : t('dr.disabled')}
                </p>
              </div>
              <div>
                <p className="text-gray-500">{t('dr.secondaryRegion')}</p>
                <p className="font-medium">
                  {drConfig?.secondaryRegion ? escapeHtml(drConfig.secondaryRegion) : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">{t('dr.lastDrTest')}</p>
                <p className="font-medium">
                  {formatDateTime(drConfig?.lastDrTestAt) || t('dr.never')}
                </p>
              </div>
            </div>
          </div>

          <Button onClick={handleRunDrTest}>
            <Shield className="w-4 h-4 mr-1" /> {t('dr.runDrTest')}
          </Button>
        </div>
      )}
    </div>
  );
}
