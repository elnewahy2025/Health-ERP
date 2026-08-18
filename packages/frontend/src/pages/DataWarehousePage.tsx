import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Calendar, DollarSign, Users, RefreshCw,
} from 'lucide-react';
import {
  PageLoader, Card, CardBody, Button, Badge,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

type DwTab = 'overview' | 'appointments' | 'revenue' | 'patients';

interface AppointmentTotals {
  total: number;
  completed: number;
  cancelled: number;
}

interface DailyAppointment {
  date: string;
  total_appointments: number;
  completed_appointments: number;
  cancelled_appointments: number;
  no_show_appointments: number;
}

interface AppointmentStats {
  daily: DailyAppointment[];
  totals: AppointmentTotals;
}

interface RevenueTotals {
  total: number;
  collected: number;
  pending: number;
}

interface DailyRevenue {
  date: string;
  total_revenue: number;
  collected_revenue: number;
  pending_revenue: number;
  invoice_count: number;
  paid_invoice_count: number;
}

interface RevenueStats {
  daily: DailyRevenue[];
  totals: RevenueTotals;
}

interface PatientTotals {
  new: number;
  active: number;
}

interface DailyPatient {
  date: string;
  new_patients: number;
  total_active_patients: number;
  gender_distribution: Record<string, number>;
}

interface PatientStats {
  daily: DailyPatient[];
  totals: PatientTotals;
}

const PERIOD_OPTIONS = [
  { value: 7, label: '7 Days' },
  { value: 30, label: '30 Days' },
  { value: 90, label: '90 Days' },
];

export default function DataWarehousePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DwTab>('overview');
  const [apptStats, setApptStats] = useState<AppointmentStats | null>(null);
  const [revStats, setRevStats] = useState<RevenueStats | null>(null);
  const [patStats, setPatStats] = useState<PatientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(30);

  const loadStats = useCallback(async (period: number) => {
    try {
      const [apptR, revR, patR] = await Promise.allSettled([
        api.get('/dw/appointments', { params: { days: period } }),
        api.get('/dw/revenue', { params: { days: period } }),
        api.get('/dw/patients', { params: { days: period } }),
      ]);
      if (apptR.status === 'fulfilled') setApptStats(apptR.value.data?.data as AppointmentStats | null);
      if (revR.status === 'fulfilled') setRevStats(revR.value.data?.data as RevenueStats | null);
      if (patR.status === 'fulfilled') setPatStats(patR.value.data?.data as PatientStats | null);
    } catch {
      toast.error(t('dw.loadError'));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [apptR, revR, patR] = await Promise.allSettled([
          api.get('/dw/appointments', { params: { days } }),
          api.get('/dw/revenue', { params: { days } }),
          api.get('/dw/patients', { params: { days } }),
        ]);
        if (cancelled) return;
        if (apptR.status === 'fulfilled') setApptStats(apptR.value.data?.data as AppointmentStats | null);
        if (revR.status === 'fulfilled') setRevStats(revR.value.data?.data as RevenueStats | null);
        if (patR.status === 'fulfilled') setPatStats(patR.value.data?.data as PatientStats | null);
      } catch {
        if (!cancelled) toast.error(t('dw.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [days, t]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.post('/dw/refresh');
      toast.success(t('dw.refreshSuccess'));
      await loadStats(days);
    } catch {
      toast.error(t('dw.refreshError'));
    } finally {
      setRefreshing(false);
    }
  }, [days, loadStats, t]);

  const formatCurrency = useClinicMoney();

  if (loading) return <PageLoader message={t('common.loading')} />;

  const tabs: { key: DwTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: t('dw.overview'), icon: <Calendar className="w-4 h-4" /> },
    { key: 'appointments', label: t('dw.appointments'), icon: <Calendar className="w-4 h-4" /> },
    { key: 'revenue', label: t('dw.revenue'), icon: <DollarSign className="w-4 h-4" /> },
    { key: 'patients', label: t('dw.patients'), icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dw.title')}</h1>
          <p className="text-gray-500 mt-1">{t('dw.subtitle')}</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? t('dw.refreshing') : t('dw.refreshNow')}
        </Button>
      </div>

      <div className="flex gap-2 mb-6">
        {PERIOD_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={days === opt.value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setDays(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 mb-6">
        {tabs.map((tb) => (
          <Button key={tb.key} variant={tab === tb.key ? 'primary' : 'secondary'} onClick={() => setTab(tb.key)}>
            {tb.icon} {tb.label}
          </Button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">{t('dw.appointments')}</h3>
              <Calendar className="w-5 h-5 text-primary-500" />
            </div>
            <p className="text-3xl font-bold">{apptStats?.totals?.total ?? 0}</p>
            <div className="flex gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Badge variant="success">{apptStats?.totals?.completed ?? 0}</Badge> {t('dw.completed')}</span>
              <span className="flex items-center gap-1"><Badge variant="danger">{apptStats?.totals?.cancelled ?? 0}</Badge> {t('dw.cancelled')}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">{t('dw.revenue')}</h3>
              <DollarSign className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold">{formatCurrency(revStats?.totals?.total ?? 0)}</p>
            <div className="flex gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Badge variant="success">{formatCurrency(revStats?.totals?.collected ?? 0)}</Badge> {t('dw.collected')}</span>
              <span className="flex items-center gap-1"><Badge variant="warning">{formatCurrency(revStats?.totals?.pending ?? 0)}</Badge> {t('dw.pending')}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500">{t('dw.patients')}</h3>
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-3xl font-bold">{patStats?.totals?.active ?? 0}</p>
            <div className="flex gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Badge variant="info">{patStats?.totals?.new ?? 0}</Badge> {t('dw.newPatients')}</span>
              <span className="flex items-center gap-1"><Badge variant="gray">{t('dw.active')}</Badge></span>
            </div>
          </CardBody>
        </Card>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardBody>
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> {t('dw.appointments')}</h3>
              {apptStats?.daily?.length ? (
                <div className="space-y-2">
                  {apptStats.daily.slice(-7).map((d) => (
                    <div key={d.date} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{d.date}</span>
                      <div className="flex gap-3">
                        <span className="text-green-600">{d.completed_appointments} {t('dw.completed')}</span>
                        <span className="text-red-600">{d.cancelled_appointments} {t('dw.cancelled')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-8 text-center">{t('dw.noDataYet')}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h3 className="font-semibold mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4" /> {t('dw.dailyRevenue')}</h3>
              {revStats?.daily?.length ? (
                <div className="space-y-2">
                  {revStats.daily.slice(-7).map((d) => (
                    <div key={d.date} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{d.date}</span>
                      <div className="flex gap-3">
                        <span className="text-green-600">{formatCurrency(d.collected_revenue)}</span>
                        <span className="text-yellow-600">{formatCurrency(d.pending_revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-8 text-center">{t('dw.noDataYet')}</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'appointments' && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-4">{t('dw.dailyAppointments')}</h3>
            {apptStats?.daily?.length ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>{t('dw.total')}</th>
                      <th>{t('dw.completed')}</th>
                      <th>{t('dw.cancelled')}</th>
                      <th>{t('dw.noShow')}</th>
                      <th>{t('dw.completionRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apptStats.daily.map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50">
                        <td>{d.date}</td>
                        <td className="font-medium">{d.total_appointments}</td>
                        <td><Badge variant="success">{d.completed_appointments}</Badge></td>
                        <td><Badge variant="danger">{d.cancelled_appointments}</Badge></td>
                        <td><Badge variant="warning">{d.no_show_appointments ?? 0}</Badge></td>
                        <td>{d.total_appointments > 0 ? Math.round(d.completed_appointments / d.total_appointments * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-sm py-8 text-center">{t('dw.noDataYet')}</p>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'revenue' && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-4">{t('dw.dailyRevenueStats')}</h3>
            {revStats?.daily?.length ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>{t('dw.totalRevenue')}</th>
                      <th>{t('dw.collected')}</th>
                      <th>{t('dw.pending')}</th>
                      <th>{t('dw.invoices')}</th>
                      <th>{t('dw.paid')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revStats.daily.map((d) => (
                      <tr key={d.date} className="hover:bg-gray-50">
                        <td>{d.date}</td>
                        <td className="font-medium">{formatCurrency(d.total_revenue)}</td>
                        <td className="text-green-600">{formatCurrency(d.collected_revenue)}</td>
                        <td className="text-yellow-600">{formatCurrency(d.pending_revenue ?? 0)}</td>
                        <td>{d.invoice_count ?? 0}</td>
                        <td>{d.paid_invoice_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-sm py-8 text-center">{t('dw.noDataYet')}</p>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'patients' && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-4">{t('dw.dailyPatients')}</h3>
            {patStats?.daily?.length ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>{t('dw.newPatients')}</th>
                      <th>{t('dw.active')}</th>
                      <th>{t('dw.genderDistribution')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patStats.daily.map((d) => {
                      const genderInfo = d.gender_distribution
                        ? Object.entries(d.gender_distribution).map(([k, v]) => `${k}: ${v}`).join(', ')
                        : '-';
                      return (
                        <tr key={d.date} className="hover:bg-gray-50">
                          <td>{d.date}</td>
                          <td><Badge variant="info">{d.new_patients}</Badge></td>
                          <td className="font-medium">{d.total_active_patients}</td>
                          <td className="text-xs text-gray-500">{genderInfo}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-sm py-8 text-center">{t('dw.noDataYet')}</p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
