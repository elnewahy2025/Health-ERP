import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  reportsApi,
  type ReportDefinition,
  type ReportSchedule,
  type ReportExecution,
} from '../lib/api';
import { escapeHtml, sanitizeString } from '../lib/sanitize';
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
import { confirmDialog } from '../components/ui';
import {
  FileSpreadsheet,
  Plus,
  Clock,
  Play,
  Download,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabType = 'reports' | 'schedules' | 'executions';

const CATEGORY_OPTIONS = [
  { value: 'clinical', label: 'Clinical' },
  { value: 'financial', label: 'Financial' },
  { value: 'operational', label: 'Operational' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'executive', label: 'Executive' },
  { value: 'custom', label: 'Custom' },
];

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'excel', label: 'Excel' },
];

export default function ReportsPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('reports');
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [executions, setExecutions] = useState<ReportExecution[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    name: '',
    description: '',
    category: 'clinical',
    exportFormats: 'csv,pdf',
  });
  const [scheduleForm, setScheduleForm] = useState({
    cron: '0 8 * * 1',
    recipients: '',
    format: 'pdf',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await reportsApi.list();
        if (!cancelled) setReports(data);
      } catch {
        if (!cancelled) setError(t('reports.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const loadSchedules = async (reportId: string) => {
    try {
      const data = await reportsApi.listSchedules(reportId);
      setSchedules(data);
    } catch {
      setSchedules([]);
    }
  };

  const loadExecutions = async (reportId: string) => {
    try {
      const data = await reportsApi.listExecutions(reportId);
      setExecutions(data);
    } catch {
      setExecutions([]);
    }
  };

  const validateReportForm = (): boolean => {
    const errors: Record<string, string> = {};
    const name = sanitizeString(reportForm.name);
    if (!name) {
      errors.name = t('common.required');
    } else if (name.length > 200) {
      errors.name = t('common.maxLength', { max: 200 });
    }
    const formats = reportForm.exportFormats
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const validFormats = ['csv', 'pdf', 'excel'];
    const invalid = formats.filter((f) => !validFormats.includes(f));
    if (invalid.length > 0) {
      errors.exportFormats = t('reports.invalidFormats');
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateScheduleForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!scheduleForm.cron.trim()) {
      errors.cron = t('common.required');
    }
    if (scheduleForm.recipients) {
      const emails = scheduleForm.recipients.split(',').map((e) => e.trim());
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalid = emails.filter((e) => !emailRegex.test(e));
      if (invalid.length > 0) {
        errors.recipients = t('reports.invalidEmails');
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateReport = async () => {
    if (!validateReportForm()) return;
    setSubmitting(true);
    try {
      const formats = reportForm.exportFormats
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      await reportsApi.create({
        name: sanitizeString(reportForm.name),
        description: reportForm.description || undefined,
        category: reportForm.category,
        exportFormats: formats,
      });
      toast.success(t('common.created'));
      setShowReportModal(false);
      setReportForm({ name: '', description: '', category: 'clinical', exportFormats: 'csv,pdf' });
      setFormErrors({});
      const updated = await reportsApi.list();
      setReports(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    const confirmed = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete'), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
    if (!confirmed) return;
    try {
      await reportsApi.delete(id);
      toast.success(t('common.deleted'));
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedReport?.id === id) {
        setSelectedReport(null);
        setSchedules([]);
        setExecutions([]);
      }
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleExecuteReport = async (reportId: string) => {
    try {
      await reportsApi.execute(reportId, { format: 'csv' });
      toast.success(t('reports.run') + ' ✓');
      void loadExecutions(reportId);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleCreateSchedule = async () => {
    if (!selectedReport) return;
    if (!validateScheduleForm()) return;
    setSubmitting(true);
    try {
      const recipients = scheduleForm.recipients
        ? scheduleForm.recipients.split(',').map((e) => e.trim())
        : [];
      await reportsApi.createSchedule(selectedReport.id, {
        cron: scheduleForm.cron,
        recipients,
        format: scheduleForm.format,
      });
      toast.success(t('common.created'));
      setShowScheduleModal(false);
      setScheduleForm({ cron: '0 8 * * 1', recipients: '', format: 'pdf' });
      setFormErrors({});
      await loadSchedules(selectedReport.id);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReport = async (report: ReportDefinition) => {
    setSelectedReport(report);
    await Promise.all([
      loadSchedules(report.id),
      loadExecutions(report.id),
    ]);
  };

  const filteredReports = reports.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('reports.reportCount', { count: reports.length })}
          </p>
        </div>
        {tab === 'reports' && (
          <Button onClick={() => { setShowReportModal(true); setFormErrors({}); }}>
            <Plus className="w-4 h-4 mr-1" /> {t('reports.newReport')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'reports' ? 'primary' : 'secondary'}
          onClick={() => setTab('reports')}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span className="ml-1">{t('reports.reports')} ({reports.length})</span>
        </Button>
        <Button
          variant={tab === 'schedules' ? 'primary' : 'secondary'}
          onClick={() => setTab('schedules')}
        >
          <Clock className="w-4 h-4" />
          <span className="ml-1">{t('reports.schedules')} ({schedules.length})</span>
        </Button>
        <Button
          variant={tab === 'executions' ? 'primary' : 'secondary'}
          onClick={() => setTab('executions')}
        >
          <Play className="w-4 h-4" />
          <span className="ml-1">{t('reports.executions')} ({executions.length})</span>
        </Button>
      </div>

      {/* Search */}
      {tab === 'reports' && (
        <div className="mb-4 max-w-md">
          <Input
            placeholder={t('reports.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.name')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.category')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.columns')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.formats')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.scheduled')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<FileSpreadsheet className="w-12 h-12 text-gray-300" />}
                      title={t('reports.noReports')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                filteredReports.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">{escapeHtml(r.name)}</td>
                    <td className="p-3"><Badge>{escapeHtml(r.category)}</Badge></td>
                    <td className="p-3 text-sm">{r.columns?.length ?? 0}</td>
                    <td className="p-3 text-sm text-gray-500">
                      {(r.exportFormats ?? []).join(', ')}
                    </td>
                    <td className="p-3">
                      <Badge variant={r.isScheduled ? 'success' : 'gray'}>
                        {r.isScheduled ? t('reports.active') : t('reports.paused')}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleViewReport(r)}
                        >
                          {t('reports.view')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleExecuteReport(r.id)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                        <button
                          onClick={() => void handleDeleteReport(r.id)}
                          className="text-red-400 hover:text-red-600 text-xs px-2"
                          aria-label="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedules Tab */}
      {tab === 'schedules' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.name')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.cron')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.formats')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.recipients')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.nextRun')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<Clock className="w-12 h-12 text-gray-300" />}
                      title={t('reports.noSchedules')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                schedules.map((s) => (
                  <tr key={s.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">
                      {selectedReport ? escapeHtml(selectedReport.name) : '-'}
                    </td>
                    <td className="p-3 text-sm font-mono text-gray-500">{escapeHtml(s.cron)}</td>
                    <td className="p-3"><Badge>{escapeHtml(s.format)}</Badge></td>
                    <td className="p-3 text-sm text-gray-500">
                      {(s.recipients ?? []).join(', ') || '-'}
                    </td>
                    <td className="p-3">
                      <Badge variant={s.isActive ? 'success' : 'gray'}>
                        {s.isActive ? t('reports.active') : t('reports.paused')}
                      </Badge>
                    </td>
                    <td className="p-3 text-sm text-gray-500">
                      {s.nextRunAt ?? '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Executions Tab */}
      {tab === 'executions' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.name')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.formats')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.rowCount')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.trigger')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('reports.started')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {executions.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<Play className="w-12 h-12 text-gray-300" />}
                      title={t('reports.noExecutions')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                executions.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium">
                      {selectedReport ? escapeHtml(selectedReport.name) : '-'}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          e.status === 'completed'
                            ? 'success'
                            : e.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {escapeHtml(e.status)}
                      </Badge>
                    </td>
                    <td className="p-3"><Badge>{escapeHtml(e.format)}</Badge></td>
                    <td className="p-3 text-sm">{e.rowCount.toLocaleString()}</td>
                    <td className="p-3"><Badge>{escapeHtml(e.trigger)}</Badge></td>
                    <td className="p-3 text-sm text-gray-500">
                      {formatDateTime(e.startedAt) || '-'}
                    </td>
                    <td className="p-3">
                      {e.status === 'completed' ? (
                        <Button variant="ghost" size="sm">
                          <Download className="w-3 h-3" />
                        </Button>
                      ) : (
                        '-'
                      )}
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
        title={selectedReport?.name ?? ''}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            {selectedReport && (
              <Button
                onClick={() => void handleExecuteReport(selectedReport.id)}
              >
                <Play className="w-3 h-3 mr-1" /> {t('reports.runNow')}
              </Button>
            )}
          </div>
        }
      >
        {selectedReport && (
          <div className="space-y-3 text-sm">
            <p>
              <strong>{t('reports.category')}:</strong>{' '}
              {escapeHtml(selectedReport.category)}
            </p>
            <p>
              <strong>{t('reports.description')}:</strong>{' '}
              {selectedReport.description
                ? escapeHtml(selectedReport.description)
                : '-'}
            </p>
            <p>
              <strong>{t('reports.columns')}:</strong>{' '}
              {(selectedReport.columns ?? [])
                .map((c) => c.header)
                .join(', ') || t('reports.noneConfigured')}
            </p>
            <p>
              <strong>{t('reports.formats')}:</strong>{' '}
              {(selectedReport.exportFormats ?? []).join(', ')}
            </p>
            {Boolean((selectedReport.queryConfig as Record<string, unknown>)?.table) && (
              <p>
                <strong>{t('reports.table')}:</strong>{' '}
                {escapeHtml(String((selectedReport.queryConfig as Record<string, unknown>).table))}
              </p>
            )}

            {schedules.length > 0 && (
              <div className="mt-4">
                <p className="font-medium mb-2">{t('reports.schedulesList')}</p>
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs mb-1"
                  >
                    <span>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {escapeHtml(s.cron)} · {escapeHtml(s.format)}
                    </span>
                    <Badge variant={s.isActive ? 'success' : 'gray'}>
                      {s.isActive ? t('reports.active') : t('reports.paused')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Report Modal */}
      <Modal
        open={showReportModal}
        onClose={() => { setShowReportModal(false); setFormErrors({}); }}
        title={t('reports.newReport')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowReportModal(false); setFormErrors({}); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateReport} loading={submitting}>
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('reports.name')}
            required
            value={reportForm.name}
            onChange={(e) =>
              setReportForm((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
          />
          <Input
            label={t('reports.description')}
            value={reportForm.description}
            onChange={(e) =>
              setReportForm((prev) => ({ ...prev, description: e.target.value }))
            }
          />
          <Select
            label={t('reports.category')}
            value={reportForm.category}
            onChange={(e) =>
              setReportForm((prev) => ({ ...prev, category: e.target.value }))
            }
            options={CATEGORY_OPTIONS}
          />
          <Input
            label={t('reports.formats')}
            value={reportForm.exportFormats}
            onChange={(e) =>
              setReportForm((prev) => ({ ...prev, exportFormats: e.target.value }))
            }
            helpText={t('reports.formatHelp')}
            error={formErrors.exportFormats}
          />
        </div>
      </Modal>

      {/* Create Schedule Modal */}
      <Modal
        open={showScheduleModal}
        onClose={() => { setShowScheduleModal(false); setFormErrors({}); }}
        title={t('reports.schedules')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowScheduleModal(false); setFormErrors({}); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateSchedule} loading={submitting}>
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('reports.cron')}
            required
            value={scheduleForm.cron}
            onChange={(e) =>
              setScheduleForm((prev) => ({ ...prev, cron: e.target.value }))
            }
            error={formErrors.cron}
            placeholder="0 8 * * 1"
          />
          <Input
            label={t('reports.recipients')}
            value={scheduleForm.recipients}
            onChange={(e) =>
              setScheduleForm((prev) => ({ ...prev, recipients: e.target.value }))
            }
            placeholder="email1@example.com, email2@example.com"
            error={formErrors.recipients}
          />
          <Select
            label={t('reports.formats')}
            value={scheduleForm.format}
            onChange={(e) =>
              setScheduleForm((prev) => ({ ...prev, format: e.target.value }))
            }
            options={FORMAT_OPTIONS}
          />
        </div>
      </Modal>
    </div>
  );
}
