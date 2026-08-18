import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  biApi,
  type BiDashboard,
  type BiWidget,
  type BiKpiAppointments,
  type BiKpiRevenue,
  type BiKpiPatients,
  type BiKpiClinical,
} from '../lib/api';
import { escapeHtml, sanitizeString } from '../lib/sanitize';
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
import { useClinicMoney } from '../stores/clinicConfigurationStore';
import {
  BarChart3,
  Plus,
  LayoutDashboard,
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';

type TabType = 'dashboards' | 'kpi';

const CATEGORY_OPTIONS = [
  { value: 'executive', label: 'Executive' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'financial', label: 'Financial' },
  { value: 'operational', label: 'Operational' },
  { value: 'custom', label: 'Custom' },
];

const REFRESH_OPTIONS = [
  { value: '1m', label: '1 minute' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
];

export default function BiPage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();

  const [tab, setTab] = useState<TabType>('dashboards');
  const [dashboards, setDashboards] = useState<BiDashboard[]>([]);
  const [widgets, setWidgets] = useState<BiWidget[]>([]);
  const [selectedDashboard, setSelectedDashboard] = useState<BiDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // KPI data
  const [kpiAppointments, setKpiAppointments] = useState<BiKpiAppointments | null>(null);
  const [kpiRevenue, setKpiRevenue] = useState<BiKpiRevenue | null>(null);
  const [kpiPatients, setKpiPatients] = useState<BiKpiPatients | null>(null);
  const [kpiClinical, setKpiClinical] = useState<BiKpiClinical | null>(null);

  // Modal states
  const [showDashboardModal, setShowDashboardModal] = useState(false);
  const [showWidgetModal, setShowWidgetModal] = useState(false);
  const [dashboardForm, setDashboardForm] = useState({
    name: '',
    description: '',
    category: 'executive',
    refreshInterval: '5m',
  });
  const [widgetForm, setWidgetForm] = useState({
    title: '',
    widgetType: 'kpi',
    dataSource: 'appointments',
    width: 4,
    height: 2,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [dashRes, appointRes, revRes, patRes, clinRes] =
          await Promise.allSettled([
            biApi.listDashboards(),
            biApi.kpiAppointments(),
            biApi.kpiRevenue(),
            biApi.kpiPatients(),
            biApi.kpiClinical(),
          ]);
        if (cancelled) return;
        if (dashRes.status === 'fulfilled') setDashboards(dashRes.value);
        if (appointRes.status === 'fulfilled') setKpiAppointments(appointRes.value);
        if (revRes.status === 'fulfilled') setKpiRevenue(revRes.value);
        if (patRes.status === 'fulfilled') setKpiPatients(patRes.value);
        if (clinRes.status === 'fulfilled') setKpiClinical(clinRes.value);
        if (dashRes.status === 'rejected' && appointRes.status === 'rejected') {
          setError(t('bi.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('bi.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const loadWidgets = async (dashboardId: string) => {
    try {
      const data = await biApi.listWidgets(dashboardId);
      setWidgets(data);
    } catch {
      setWidgets([]);
    }
  };

  const validateDashboardForm = (): boolean => {
    const errors: Record<string, string> = {};
    const name = sanitizeString(dashboardForm.name);
    if (!name) {
      errors.name = t('common.required');
    } else if (name.length > 200) {
      errors.name = t('common.maxLength', { max: 200 });
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateWidgetForm = (): boolean => {
    const errors: Record<string, string> = {};
    const title = sanitizeString(widgetForm.title);
    if (!title) {
      errors.title = t('common.required');
    } else if (title.length > 200) {
      errors.title = t('common.maxLength', { max: 200 });
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateDashboard = async () => {
    if (!validateDashboardForm()) return;
    setSubmitting(true);
    try {
      await biApi.createDashboard({
        name: sanitizeString(dashboardForm.name),
        description: dashboardForm.description || undefined,
        category: dashboardForm.category,
        refreshInterval: dashboardForm.refreshInterval,
      });
      toast.success(t('common.created'));
      setShowDashboardModal(false);
      setDashboardForm({ name: '', description: '', category: 'executive', refreshInterval: '5m' });
      setFormErrors({});
      const updated = await biApi.listDashboards();
      setDashboards(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDashboard = async (id: string) => {
    const confirmed = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete'), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
    if (!confirmed) return;
    try {
      await biApi.deleteDashboard(id);
      toast.success(t('common.deleted'));
      setDashboards((prev) => prev.filter((d) => d.id !== id));
      if (selectedDashboard?.id === id) {
        setSelectedDashboard(null);
        setWidgets([]);
      }
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleCreateWidget = async () => {
    if (!selectedDashboard) return;
    if (!validateWidgetForm()) return;
    setSubmitting(true);
    try {
      await biApi.createWidget(selectedDashboard.id, {
        title: sanitizeString(widgetForm.title),
        widgetType: widgetForm.widgetType,
        dataSource: widgetForm.dataSource,
        width: widgetForm.width,
        height: widgetForm.height,
      });
      toast.success(t('common.created'));
      setShowWidgetModal(false);
      setWidgetForm({ title: '', widgetType: 'kpi', dataSource: 'appointments', width: 4, height: 2 });
      setFormErrors({});
      await loadWidgets(selectedDashboard.id);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWidget = async (id: string) => {
    const confirmed = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete'), confirmLabel: t('common.delete'), cancelLabel: t('common.cancel'), danger: true });
    if (!confirmed) return;
    try {
      await biApi.deleteWidget(id);
      toast.success(t('common.deleted'));
      setWidgets((prev) => prev.filter((w) => w.id !== id));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const filteredDashboards = dashboards.filter(
    (d) =>
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.category.toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-2xl font-bold">{t('bi.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {dashboards.length} {t('bi.dashboards').toLowerCase()}
          </p>
        </div>
        {tab === 'dashboards' && (
          <Can permission="bi.manage">
            <Button onClick={() => { setShowDashboardModal(true); setFormErrors({}); }}>
              <Plus className="w-4 h-4 mr-1" /> {t('bi.newDashboard')}
            </Button>
          </Can>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'dashboards' ? 'primary' : 'secondary'}
          onClick={() => setTab('dashboards')}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="ml-1">{t('bi.dashboards')} ({dashboards.length})</span>
        </Button>
        <Button
          variant={tab === 'kpi' ? 'primary' : 'secondary'}
          onClick={() => setTab('kpi')}
        >
          <TrendingUp className="w-4 h-4" />
          <span className="ml-1">{t('bi.kpis')}</span>
        </Button>
      </div>

      {/* Dashboards Tab */}
      {tab === 'dashboards' && (
        <>
          <div className="mb-4 max-w-md">
            <Input
              placeholder={t('bi.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredDashboards.length === 0 ? (
            <EmptyState
              icon={<LayoutDashboard className="w-12 h-12 text-gray-300" />}
              title={t('bi.noDashboards')}
              message={t('common.noData')}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {filteredDashboards.map((d) => (
                <div
                  key={d.id}
                  className={`bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800 cursor-pointer transition-all hover:shadow-md ${
                    selectedDashboard?.id === d.id ? 'ring-2 ring-primary-500' : ''
                  }`}
                  onClick={() => {
                    setSelectedDashboard(d);
                    void loadWidgets(d.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedDashboard(d);
                      void loadWidgets(d.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">{escapeHtml(d.name)}</h3>
                    <Badge>{escapeHtml(d.category)}</Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {d.description ? escapeHtml(d.description) : t('bi.noDescription')}
                  </p>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                    <span>
                      {t('bi.refresh')}: {escapeHtml(d.refreshInterval)}
                      {d.isDefault ? ` · ${t('bi.default')}` : ''}
                    </span>
                    <Can permission="bi.manage">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteDashboard(d.id);
                        }}
                        className="text-red-400 hover:text-red-600"
                        aria-label="Delete"
                      >
                        ×
                      </button>
                    </Can>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Dashboard Widgets */}
          {selectedDashboard && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {escapeHtml(selectedDashboard.name)} — {t('bi.widgets')} ({widgets.length})
                </h2>
                <Can permission="bi.manage">
                  <Button
                    size="sm"
                    onClick={() => { setShowWidgetModal(true); setFormErrors({}); }}
                  >
                    <Plus className="w-4 h-4 mr-1" /> {t('bi.widgets')}
                  </Button>
                </Can>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {widgets.map((w) => (
                  <div key={w.id} className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-sm">{escapeHtml(w.title)}</h4>
                      <div className="flex items-center gap-2">
                        <Badge>{escapeHtml(w.widgetType)}</Badge>
                        <Can permission="bi.manage">
                          <button
                            onClick={() => void handleDeleteWidget(w.id)}
                            className="text-red-400 hover:text-red-600 text-xs"
                            aria-label="Delete"
                          >
                            ×
                          </button>
                        </Can>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {t('bi.dataSource')}: {escapeHtml(w.dataSource)} · {w.width}×{w.height}
                    </p>
                  </div>
                ))}
                {widgets.length === 0 && (
                  <EmptyState
                    icon={<BarChart3 className="w-12 h-12 text-gray-300" />}
                    title={t('bi.noWidgets')}
                    message={t('common.noData')}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* KPI Tab */}
      {tab === 'kpi' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Appointments KPI */}
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('bi.appointments')}</p>
                  <p className="text-xl font-bold">
                    {kpiAppointments?.total ?? 0}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {kpiAppointments?.today ?? 0} {t('bi.today')}
              </p>
            </div>

            {/* Revenue KPI */}
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('bi.revenue')}</p>
                  <p className="text-xl font-bold">
                    {formatMoney(kpiRevenue?.total ?? 0)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {formatMoney(kpiRevenue?.recent ?? 0)} ({t('bi.last30Days')})
              </p>
            </div>

            {/* Patients KPI */}
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('bi.patients')}</p>
                  <p className="text-xl font-bold">
                    {(kpiPatients?.total ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {kpiPatients?.newThisMonth ?? 0} {t('bi.newThisMonth')}
              </p>
            </div>

            {/* Clinical KPI */}
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('bi.clinical')}</p>
                  <p className="text-xl font-bold">
                    {kpiClinical?.labOrders ?? 0}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {kpiClinical?.prescriptions ?? 0} {t('bi.prescriptions')} ·{' '}
                {kpiClinical?.radiologyOrders ?? 0} {t('bi.imaging')}
              </p>
            </div>
          </div>

          {/* Appointments by Status */}
          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-semibold mb-3">{t('bi.byStatus')}</h3>
            {(kpiAppointments?.byStatus ?? []).length > 0 ? (
              <div className="flex gap-4 flex-wrap">
                {kpiAppointments!.byStatus.map((s) => (
                  <div key={s.status} className="flex items-center gap-2">
                    <Badge>{escapeHtml(s.status)}</Badge>
                    <span className="font-medium">{s.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t('bi.noAppointmentData')}</p>
            )}
          </div>
        </div>
      )}

      {/* Create Dashboard Modal */}
      <Modal
        open={showDashboardModal}
        onClose={() => { setShowDashboardModal(false); setFormErrors({}); }}
        title={t('bi.newDashboard')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowDashboardModal(false); setFormErrors({}); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateDashboard} loading={submitting}>
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('bi.name')}
            required
            value={dashboardForm.name}
            onChange={(e) =>
              setDashboardForm((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
          />
          <Input
            label={t('bi.description')}
            value={dashboardForm.description}
            onChange={(e) =>
              setDashboardForm((prev) => ({ ...prev, description: e.target.value }))
            }
          />
          <Select
            label={t('bi.category')}
            value={dashboardForm.category}
            onChange={(e) =>
              setDashboardForm((prev) => ({ ...prev, category: e.target.value }))
            }
            options={CATEGORY_OPTIONS}
          />
          <Select
            label={t('bi.refreshInterval')}
            value={dashboardForm.refreshInterval}
            onChange={(e) =>
              setDashboardForm((prev) => ({
                ...prev,
                refreshInterval: e.target.value,
              }))
            }
            options={REFRESH_OPTIONS}
          />
        </div>
      </Modal>

      {/* Create Widget Modal */}
      <Modal
        open={showWidgetModal}
        onClose={() => { setShowWidgetModal(false); setFormErrors({}); }}
        title={t('bi.widgets')}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowWidgetModal(false); setFormErrors({}); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateWidget} loading={submitting}>
              {t('common.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('bi.name')}
            required
            value={widgetForm.title}
            onChange={(e) =>
              setWidgetForm((prev) => ({ ...prev, title: e.target.value }))
            }
            error={formErrors.title}
          />
          <Select
            label={t('bi.widgetType')}
            value={widgetForm.widgetType}
            onChange={(e) =>
              setWidgetForm((prev) => ({ ...prev, widgetType: e.target.value }))
            }
            options={[
              { value: 'kpi', label: 'KPI' },
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
              { value: 'gauge', label: 'Gauge' },
              { value: 'text', label: 'Text' },
            ]}
          />
          <Select
            label={t('bi.dataSource')}
            value={widgetForm.dataSource}
            onChange={(e) =>
              setWidgetForm((prev) => ({ ...prev, dataSource: e.target.value }))
            }
            options={[
              { value: 'appointments', label: t('bi.appointments') },
              { value: 'revenue', label: t('bi.revenue') },
              { value: 'patients', label: t('bi.patients') },
              { value: 'clinical', label: t('bi.clinical') },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('bi.width')}
              type="number"
              min={1}
              max={12}
              value={widgetForm.width}
              onChange={(e) =>
                setWidgetForm((prev) => ({
                  ...prev,
                  width: parseInt(e.target.value, 10) || 4,
                }))
              }
            />
            <Input
              label={t('bi.height')}
              type="number"
              min={1}
              max={12}
              value={widgetForm.height}
              onChange={(e) =>
                setWidgetForm((prev) => ({
                  ...prev,
                  height: parseInt(e.target.value, 10) || 2,
                }))
              }
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
