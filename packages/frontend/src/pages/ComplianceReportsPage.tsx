import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  complianceApi,
  type ComplianceReport,
  type HipaaSummary,
  type HipaaAuditLog,
  type RetentionPolicy,
  type Baa,
} from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import {
  Modal,
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import {
  ScrollText,
  Shield,
  FileText,
  UserCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react';


type TabType = 'reports' | 'hipaa' | 'retention' | 'baa';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'gray'> = {
  generated: 'success',
  executed: 'success',
  active: 'success',
  draft: 'warning',
  pending: 'warning',
  expired: 'danger',
  inactive: 'gray',
  archived: 'gray',
};

export default function ComplianceReportsPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('reports');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [hipaaSummary, setHipaaSummary] = useState<HipaaSummary | null>(null);
  const [hipaaLogs, setHipaaLogs] = useState<HipaaAuditLog[]>([]);
  const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
  const [baas, setBaas] = useState<Baa[]>([]);

  // Modal state for report detail
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [repRes, hipaaRes, logsRes, polRes, baaRes] =
          await Promise.allSettled([
            complianceApi.listReports(),
            complianceApi.hipaaSummary(),
            complianceApi.hipaaAudit(),
            complianceApi.listRetentionPolicies(),
            complianceApi.listBaas(),
          ]);
        if (cancelled) return;
        if (repRes.status === 'fulfilled') setReports(repRes.value);
        if (hipaaRes.status === 'fulfilled') setHipaaSummary(hipaaRes.value);
        if (logsRes.status === 'fulfilled') setHipaaLogs(logsRes.value);
        if (polRes.status === 'fulfilled') setPolicies(polRes.value);
        if (baaRes.status === 'fulfilled') setBaas(baaRes.value);
        if (repRes.status === 'rejected') {
          setError(t('compRep.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('compRep.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [t]);

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
            <ScrollText className="w-6 h-6" /> {t('compRep.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('compRep.reportCount', { count: reports.length })} ·{' '}
            {t('compRep.baaCount', { count: baas.length })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={tab === 'reports' ? 'primary' : 'secondary'}
          onClick={() => setTab('reports')}
        >
          <FileText className="w-4 h-4" />
          <span className="ml-1">{t('compRep.reports')} ({reports.length})</span>
        </Button>
        <Button
          variant={tab === 'hipaa' ? 'primary' : 'secondary'}
          onClick={() => setTab('hipaa')}
        >
          <Shield className="w-4 h-4" /> {t('compRep.hipaa')}
        </Button>
        <Button
          variant={tab === 'retention' ? 'primary' : 'secondary'}
          onClick={() => setTab('retention')}
        >
          <Clock className="w-4 h-4" />
          <span className="ml-1">{t('compRep.retention')} ({policies.length})</span>
        </Button>
        <Button
          variant={tab === 'baa' ? 'primary' : 'secondary'}
          onClick={() => setTab('baa')}
        >
          <UserCheck className="w-4 h-4" />
          <span className="ml-1">{t('compRep.baa')} ({baas.length})</span>
        </Button>
      </div>

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.title2')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.type')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.period')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.generated')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<FileText className="w-12 h-12 text-gray-300" />}
                      title={t('compRep.noReports')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(r.title)}</td>
                    <td className="p-3"><Badge>{escapeHtml(r.type)}</Badge></td>
                    <td className="p-3 text-xs">
                      {escapeHtml(r.periodStart)} → {escapeHtml(r.periodEnd)}
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>
                        {escapeHtml(r.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {formatDateTime(r.generatedAt) || '-'}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedReport(r)}
                      >
                        {t('common.view')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* HIPAA Audit Tab */}
      {tab === 'hipaa' && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">{t('compRep.events90d')}</p>
              <p className="text-2xl font-bold">{hipaaSummary?.totalEvents ?? 0}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">{t('compRep.uniqueUsers')}</p>
              <p className="text-2xl font-bold">{hipaaSummary?.uniqueUsers ?? 0}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">{t('compRep.topAction')}</p>
              <p className="text-lg font-bold">
                {hipaaSummary?.byAction?.[0]?.action ?? '-'}
              </p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <p className="text-sm text-gray-500">{t('compRep.topEntity')}</p>
              <p className="text-lg font-bold">
                {hipaaSummary?.byEntity?.[0]?.entity ?? '-'}
              </p>
            </div>
          </div>

          {/* Actions Breakdown */}
          <div className="bg-white rounded-lg border p-4 mb-4">
            <h3 className="font-semibold mb-2">{t('compRep.actionsBreakdown')}</h3>
            <div className="flex gap-2 flex-wrap">
              {(hipaaSummary?.byAction ?? []).length > 0 ? (
                hipaaSummary!.byAction.map((a) => (
                  <Badge key={a.action}>{escapeHtml(a.action)}: {a.count}</Badge>
                ))
              ) : (
                <p className="text-sm text-gray-500">{t('common.noData')}</p>
              )}
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.action')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.entity')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.entityId')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.user')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.ip')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.timestamp')}</th>
                </tr>
              </thead>
              <tbody>
                {hipaaLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<Shield className="w-12 h-12 text-gray-300" />}
                        title={t('compRep.noAuditLogs')}
                        message={t('common.noData')}
                      />
                    </td>
                  </tr>
                ) : (
                  hipaaLogs.slice(0, 50).map((l) => (
                    <tr key={l.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-3"><Badge>{escapeHtml(l.action)}</Badge></td>
                      <td className="p-3 text-xs">{escapeHtml(l.entity)}</td>
                      <td className="p-3 font-mono text-xs">
                        {l.entityId ? escapeHtml(l.entityId.slice(0, 8)) : '-'}
                      </td>
                      <td className="p-3 text-xs">
                        {l.userId ? escapeHtml(l.userId.slice(0, 8)) : '-'}
                      </td>
                      <td className="p-3 text-xs">{escapeHtml(l.ip || '-')}</td>
                      <td className="p-3 text-xs">
                        {formatDateTime(l.timestamp) || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Retention Tab */}
      {tab === 'retention' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.entity')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.retentionDays')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.action')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.lastCleanup')}</th>
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<Clock className="w-12 h-12 text-gray-300" />}
                      title={t('compRep.noRetention')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                policies.map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(p.entity)}</td>
                    <td className="p-3">
                      {p.retentionDays} {t('compRep.days')}
                    </td>
                    <td className="p-3"><Badge>{escapeHtml(p.action)}</Badge></td>
                    <td className="p-3">
                      <Badge variant={p.isActive ? 'success' : 'gray'}>
                        {p.isActive ? t('compRep.active') : t('compRep.inactive')}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {formatDateTime(p.lastCleanupAt) || t('compRep.never')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* BAA Tab */}
      {tab === 'baa' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.organization')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.contact')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.executed')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.expiry')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('compRep.status')}</th>
              </tr>
            </thead>
            <tbody>
              {baas.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<UserCheck className="w-12 h-12 text-gray-300" />}
                      title={t('compRep.noBaa')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                baas.map((b) => (
                  <tr key={b.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(b.organizationName)}</td>
                    <td className="p-3 text-xs">
                      {b.contactName ? escapeHtml(b.contactName) : '-'}
                      {b.contactEmail ? ` <${escapeHtml(b.contactEmail)}>` : ''}
                    </td>
                    <td className="p-3 text-xs">{b.executedDate ?? '-'}</td>
                    <td className="p-3 text-xs">{b.expiryDate ?? '-'}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[b.status] ?? 'gray'}>
                        {escapeHtml(b.status)}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Report Detail Modal */}
      <Modal
        open={!!selectedReport}
        onClose={() => setSelectedReport(null)}
        title={selectedReport?.title ?? ''}
        size="md"
      >
        {selectedReport && (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t('compRep.type')}:</strong>{' '}
              {escapeHtml(selectedReport.type)}
            </p>
            <p>
              <strong>{t('compRep.period')}:</strong>{' '}
              {escapeHtml(selectedReport.periodStart)} →{' '}
              {escapeHtml(selectedReport.periodEnd)}
            </p>
            <p>
              <strong>{t('compRep.status')}:</strong>{' '}
              <Badge variant={STATUS_VARIANT[selectedReport.status] ?? 'gray'}>
                {escapeHtml(selectedReport.status)}
              </Badge>
            </p>
            {selectedReport.findings && (
              <div>
                <strong>{t('compRep.findings')}:</strong>
                <p className="mt-1 p-2 bg-gray-50 rounded text-xs">
                  {escapeHtml(selectedReport.findings)}
                </p>
              </div>
            )}
            {selectedReport.recommendations && (
              <div>
                <strong>{t('compRep.recommendations')}:</strong>
                <p className="mt-1 p-2 bg-gray-50 rounded text-xs">
                  {escapeHtml(selectedReport.recommendations)}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
