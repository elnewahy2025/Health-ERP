import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  FileText, Download, Calendar, BarChart3, Clock,
} from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, Table,
  PageLoader, EmptyState, Modal,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { escapeHtml } from '../lib/sanitize';

/* ── Types ─────────────────────────────────────────────────────────── */

type ReportTab = 'builder' | 'scheduled' | 'history';

interface ReportDefinition {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  exportFormats: string[];
  isScheduled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ReportSchedule {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  format: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

interface ReportExecution {
  id: string;
  reportId: string;
  status: string;
  format: string;
  error: string | null;
  rowCount: number;
  trigger: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'excel', label: 'Excel' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'advRep.daily' },
  { value: 'weekly', label: 'advRep.weekly' },
  { value: 'monthly', label: 'advRep.monthly' },
  { value: 'quarterly', label: 'advRep.quarterly' },
] as const;

const DAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
    completed: 'success',
    pending: 'warning',
    failed: 'danger',
    running: 'info',
    active: 'success',
    paused: 'danger',
  };
  return map[status] ?? 'gray';
}

function buildCronExpression(frequency: string, day: string, time: string): string {
  const [hours, minutes] = time.split(':');
  switch (frequency) {
    case 'daily': return `${minutes} ${hours} * * *`;
    case 'weekly': {
      const dayMap: Record<string, string> = {
        monday: '1', tuesday: '2', wednesday: '3', thursday: '4',
        friday: '5', saturday: '6', sunday: '0',
      };
      return `${minutes} ${hours} * * ${dayMap[day] ?? '1'}`;
    }
    case 'monthly': return `${minutes} ${hours} 1 * *`;
    case 'quarterly': return `${minutes} ${hours} 1 1,4,7,10 *`;
    default: return `${minutes} ${hours} * * 1`;
  }
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function AdvancedReportingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ReportTab>('builder');
  const [loading, setLoading] = useState(true);

  /* ── Report data ── */
  const [reportDefinitions, setReportDefinitions] = useState<ReportDefinition[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState('pdf');
  const [generating, setGenerating] = useState(false);

  /* ── Scheduled reports ── */
  const [schedules] = useState<ReportSchedule[]>([]);

  /* ── Execution history ── */
  const [executions, setExecutions] = useState<ReportExecution[]>([]);

  /* ── Schedule modal ── */
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    frequency: 'weekly',
    day: 'monday',
    time: '09:00',
    email: '',
    format: 'pdf',
  });

  /* ── Data fetching ── */

  const fetchReportDefinitions = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/reports');
      setReportDefinitions((data.data ?? []) as ReportDefinition[]);
    } catch {
      toast.error(t('advRep.loadFailed'));
    }
  }, [t]);



  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      setLoading(true);
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      setDateTo(today.toISOString().split('T')[0]);
      setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
      await fetchReportDefinitions();
      if (!cancelled) setLoading(false);
    };

    void init();
    return () => { cancelled = true; };
  }, [fetchReportDefinitions]);

  /* ── Load executions when report is selected ── */

  useEffect(() => {
    if (!selectedReportId || tab !== 'history') return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const { data } = await api.get(`/reports/${selectedReportId}/executions`);
        if (!cancelled) setExecutions((data.data ?? []) as ReportExecution[]);
      } catch { /* non-critical */ }
    };
    void load();
    return () => { cancelled = true; };
  }, [selectedReportId, tab]);

  /* ── Actions ── */

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!selectedReportId) {
      toast.error(t('advRep.selectReport'));
      return;
    }
    setGenerating(true);
    try {
      await api.post(`/reports/${selectedReportId}/execute`, { format });
      toast.success(t('advRep.reportGenerated'));
      if (tab === 'history') {
        try {
          const { data } = await api.get(`/reports/${selectedReportId}/executions`);
          setExecutions((data.data ?? []) as ReportExecution[]);
        } catch { /* non-critical */ }
      }
    } catch {
      toast.error(t('advRep.reportGenerateFailed'));
    } finally {
      setGenerating(false);
    }
  }, [selectedReportId, format, t, tab]);

  const handleSchedule = useCallback(async (): Promise<void> => {
    if (!selectedReportId) return;
    const cron = buildCronExpression(scheduleForm.frequency, scheduleForm.day, scheduleForm.time);
    try {
      await api.post(`/reports/${selectedReportId}/schedules`, {
        cron,
        recipients: scheduleForm.email
          ? scheduleForm.email.split(',').map((e) => e.trim()).filter(Boolean)
          : [],
        format: scheduleForm.format,
      });
      toast.success(t('advRep.scheduleSuccess'));
      setShowSchedule(false);
    } catch {
      toast.error(t('advRep.reportGenerateFailed'));
    }
  }, [selectedReportId, scheduleForm, t]);

  /* ── Derived data ── */

  /* ── Table columns ── */

  const scheduleColumns: Column<ReportSchedule>[] = [
    {
      key: 'reportId',
      header: t('advRep.report'),
      render: (item) => {
        const report = reportDefinitions.find((r) => r.id === item.reportId);
        return <span className="font-medium">{escapeHtml(report?.name ?? item.reportId)}</span>;
      },
    },
    {
      key: 'cron',
      header: t('advRep.frequency'),
      render: (item) => <Badge variant="info">{escapeHtml(item.cron)}</Badge>,
    },
    {
      key: 'recipients',
      header: t('advRep.email'),
      render: (item) => <span>{escapeHtml(item.recipients?.join(', ') || '-')}</span>,
    },
    {
      key: 'isActive',
      header: t('advRep.status'),
      render: (item) => (
        <Badge variant={item.isActive ? 'success' : 'danger'}>
          {item.isActive ? t('advRep.active') : t('advRep.paused')}
        </Badge>
      ),
    },
  ];

  const executionColumns: Column<ReportExecution>[] = [
    {
      key: 'createdAt',
      header: t('advRep.generated'),
      render: (item) => <span>{formatDateTime(item.createdAt) || '-'}</span>,
    },
    {
      key: 'format',
      header: t('advRep.formatCol'),
      render: (item) => <Badge>{escapeHtml(item.format?.toUpperCase() ?? '-')}</Badge>,
    },
    {
      key: 'status',
      header: t('advRep.status'),
      render: (item) => (
        <Badge variant={getStatusVariant(item.status)}>{item.status}</Badge>
      ),
    },
    {
      key: 'rowCount',
      header: 'Rows',
      render: (item) => <span>{item.rowCount ?? 0}</span>,
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: ReportTab; icon: React.ReactNode; label: string }> = [
    { key: 'builder', icon: <BarChart3 className="w-4 h-4" />, label: t('advRep.builderTab') },
    { key: 'scheduled', icon: <Clock className="w-4 h-4" />, label: t('advRep.scheduledTab') },
    { key: 'history', icon: <Calendar className="w-4 h-4" />, label: t('advRep.historyTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary-600" />
          {t('advRep.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t('advRep.subtitle')}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
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
          {/* ── REPORT BUILDER ── */}
          {tab === 'builder' && (
            <Card>
              <CardBody className="p-6">
                {reportDefinitions.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="w-8 h-8 text-gray-400" />}
                    title={t('advRep.noReports')}
                    message={t('advRep.loadFailed')}
                  />
                ) : (
                  <div className="space-y-6">
                    {/* Report Type Selection */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3">{t('advRep.reportTypes')}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {reportDefinitions.map((report) => (
                          <button
                            key={report.id}
                            onClick={() => setSelectedReportId(report.id)}
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              selectedReportId === report.id
                                ? 'border-primary-600 bg-primary-50 shadow-md'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5 text-primary-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">
                                  {escapeHtml(report.name)}
                                </p>
                                {report.description && (
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {escapeHtml(report.description)}
                                  </p>
                                )}
                                <div className="flex gap-1 mt-2">
                                  {report.exportFormats?.map((f) => (
                                    <Badge key={f} variant="gray">{f.toUpperCase()}</Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Date Range & Generate */}
                    {selectedReportId && (
                      <div className="border-t border-gray-200 pt-4">
                        <div className="flex flex-wrap items-end gap-4">
                          <Input
                            label={t('advRep.dateFrom')}
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                          />
                          <Input
                            label={t('advRep.dateTo')}
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                          />
                          <Select
                            label={t('advRep.format')}
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                            options={EXPORT_FORMATS}
                          />
                          <Button
                            onClick={() => void handleGenerate()}
                            loading={generating}
                            disabled={generating}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            {t('advRep.generate')}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setShowSchedule(true)}
                          >
                            <Clock className="w-4 h-4 mr-1" />
                            {t('advRep.schedule')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ── SCHEDULED REPORTS ── */}
          {tab === 'scheduled' && (
            <Card>
              <CardBody className="p-0">
                <Table<ReportSchedule>
                  columns={scheduleColumns}
                  data={schedules}
                  loading={false}
                  emptyMessage={t('advRep.noScheduled')}
                />
              </CardBody>
            </Card>
          )}

          {/* ── EXECUTION HISTORY ── */}
          {tab === 'history' && (
            <div className="space-y-4">
              <Select
                label={t('advRep.selectReport')}
                value={selectedReportId}
                onChange={(e) => setSelectedReportId(e.target.value)}
                options={[
                  { value: '', label: t('advRep.chooseReport') },
                  ...reportDefinitions.map((r) => ({ value: r.id, label: r.name })),
                ]}
              />
              <Card>
                <CardBody className="p-0">
                  <Table<ReportExecution>
                    columns={executionColumns}
                    data={executions}
                    loading={false}
                    emptyMessage={t('advRep.noHistory')}
                  />
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── Schedule Modal ── */}
      <Modal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        title={t('advRep.scheduleReport')}
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowSchedule(false)}>
              {t('advRep.cancel')}
            </Button>
            <Button onClick={() => void handleSchedule()}>
              {t('advRep.scheduleNow')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('advRep.frequencyLabel')}
              value={scheduleForm.frequency}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, frequency: e.target.value }))}
              options={FREQUENCY_OPTIONS.map((opt) => ({
                value: opt.value,
                label: t(opt.label),
              }))}
            />
            <Select
              label={t('advRep.dayLabel')}
              value={scheduleForm.day}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, day: e.target.value }))}
              options={DAY_OPTIONS}
            />
            <Input
              label={t('advRep.timeLabel')}
              type="time"
              value={scheduleForm.time}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, time: e.target.value }))}
            />
            <Select
              label={t('advRep.formatCol')}
              value={scheduleForm.format}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, format: e.target.value }))}
              options={EXPORT_FORMATS}
            />
          </div>
          <Input
            label={t('advRep.emailRecipients')}
            value={scheduleForm.email}
            onChange={(e) => setScheduleForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder={t('advRep.emailPlaceholder')}
          />
        </div>
      </Modal>
    </div>
  );
}
