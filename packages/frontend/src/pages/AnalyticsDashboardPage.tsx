import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  BarChart3, Users, Calendar, DollarSign, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, subDays } from 'date-fns';
import {
  PageLoader, Card, CardBody, Button,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

interface ChartDataPoint {
  name: string;
  value?: number;
  appointments?: number;
  revenue?: number;
  count?: number;
}

interface DoctorPerf {
  name: string;
  count: number;
  revenue: number;
}

interface AnalyticsData {
  appointmentTrend: ChartDataPoint[];
  revenueTrend: ChartDataPoint[];
  patientDemographics: ChartDataPoint[];
  appointmentTypes: ChartDataPoint[];
  monthlyRevenue: ChartDataPoint[];
  doctorPerformance: DoctorPerf[];
  totals: {
    patients: number;
    appointments: number;
    revenue: number;
  };
}

interface RawAppointment {
  date?: string;
  appointment_date?: string;
  appointmentDate?: string;
  type?: string;
  doctor_name?: string;
  doctor?: string;
  doctorName?: string;
  status?: string;
}

interface RawInvoice {
  created_at?: string;
  createdAt?: string;
  issued_at?: string;
  issuedAt?: string;
  total_amount?: number;
  total?: number;
  status?: string;
  doctor_name?: string;
  doctor?: string;
}

interface RawPatient {
  gender?: string;
}

export default function AnalyticsDashboardPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AnalyticsData>({
    appointmentTrend: [],
    revenueTrend: [],
    patientDemographics: [],
    appointmentTypes: [],
    monthlyRevenue: [],
    doctorPerformance: [],
    totals: { patients: 0, appointments: 0, revenue: 0 },
  });

  const fetchAnalytics = useCallback(async () => {
    try {
      const [apptsRes, billingRes, patientsRes] = await Promise.allSettled([
        api.get('/appointments', { params: { limit: 100 } }),
        api.get('/invoices', { params: { limit: 100 } }),
        api.get('/patients', { params: { limit: 100 } }),
      ]);

      const appts: RawAppointment[] = apptsRes.status === 'fulfilled'
        ? (apptsRes.value.data?.data?.rows ?? apptsRes.value.data?.data ?? []) as RawAppointment[]
        : [];
      const invoices: RawInvoice[] = billingRes.status === 'fulfilled'
        ? (billingRes.value.data?.data?.rows ?? billingRes.value.data?.data ?? []) as RawInvoice[]
        : [];
      const patients: RawPatient[] = patientsRes.status === 'fulfilled'
        ? (patientsRes.value.data?.data?.rows ?? patientsRes.value.data?.data ?? []) as RawPatient[]
        : [];

      // Appointment trend (last 7 days)
      const appointmentTrend: ChartDataPoint[] = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), 6 - i);
        const dayStr = format(d, 'yyyy-MM-dd');
        const dayLabel = format(d, 'EEE');
        const count = appts.filter((a) => (a.appointmentDate ?? a.appointment_date ?? a.date)?.startsWith(dayStr)).length;
        return { name: dayLabel, appointments: count };
      });

      // Revenue trend (last 7 days)
      const revenueTrend: ChartDataPoint[] = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), 6 - i);
        const dayStr = format(d, 'yyyy-MM-dd');
        const dayLabel = format(d, 'EEE');
        const rev = invoices
          .filter((inv) => (inv.issuedAt ?? inv.createdAt ?? inv.created_at)?.startsWith(dayStr) && inv.status === 'paid')
          .reduce((sum, inv) => sum + (inv.total_amount ?? inv.total ?? 0), 0);
        return { name: dayLabel, revenue: rev };
      });

      // Patient demographics
      const genderMap: Record<string, number> = {};
      patients.forEach((p) => {
        const g = p.gender || t('analytics.unknown');
        genderMap[g] = (genderMap[g] || 0) + 1;
      });
      const patientDemographics: ChartDataPoint[] = Object.entries(genderMap).map(([name, value]) => ({ name, value }));

      // Appointment types
      const typeMap: Record<string, number> = {};
      appts.forEach((a) => {
        const tp = a.type || t('analytics.unknown');
        typeMap[tp] = (typeMap[tp] || 0) + 1;
      });
      const appointmentTypes: ChartDataPoint[] = Object.entries(typeMap)
        .map(([name, value]) => ({ name, value }))
        .slice(0, 6);

      // Doctor performance
      const docMap: Record<string, DoctorPerf> = {};
      appts.forEach((a) => {
        const doc = a.doctorName ?? a.doctor_name ?? a.doctor ?? t('analytics.unknown');
        if (!docMap[doc]) docMap[doc] = { name: doc, count: 0, revenue: 0 };
        docMap[doc].count++;
      });
      invoices.forEach((inv) => {
        const doc = inv.doctor_name ?? inv.doctor ?? t('analytics.unknown');
        if (!docMap[doc]) docMap[doc] = { name: doc, count: 0, revenue: 0 };
        if (inv.status === 'paid') docMap[doc].revenue += inv.total_amount ?? inv.total ?? 0;
      });
      const doctorPerformance: DoctorPerf[] = Object.values(docMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Monthly revenue (last 6 months)
      const monthlyRevenue: ChartDataPoint[] = Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        const mStart = format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
        const mEnd = format(new Date(d.getFullYear(), d.getMonth() + 1, 0), 'yyyy-MM-dd');
        const rev = invoices
          .filter((inv) => {
            const d2 = inv.issuedAt ?? inv.createdAt ?? inv.created_at;
            return d2 && d2 >= mStart && d2 <= mEnd && inv.status === 'paid';
          })
          .reduce((sum, inv) => sum + (inv.total_amount ?? inv.total ?? 0), 0);
        return { name: format(d, 'MMM'), revenue: rev };
      });

      // Totals
      const totalRevenue = invoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum, inv) => sum + (inv.total_amount ?? inv.total ?? 0), 0);

      setData({
        appointmentTrend,
        revenueTrend,
        patientDemographics,
        appointmentTypes,
        monthlyRevenue,
        doctorPerformance,
        totals: {
          patients: patients.length,
          appointments: appts.length,
          revenue: totalRevenue,
        },
      });
    } catch {
      toast.error(t('analytics.loadError'));
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await fetchAnalytics();
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [fetchAnalytics]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  }, [fetchAnalytics]);

  const formatCurrency = useClinicMoney();

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('analytics.title')}</h1>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? t('analytics.refreshing') : t('analytics.refresh')}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardBody className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-100 rounded-lg"><Users className="w-4 h-4 text-blue-600" /></div>
            <p className="text-xs text-gray-500">{t('analytics.totalPatients')}</p>
          </div>
          <p className="text-lg font-bold text-gray-900">{data.totals.patients.toLocaleString()}</p>
        </CardBody></Card>
        <Card><CardBody className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-green-100 rounded-lg"><Calendar className="w-4 h-4 text-green-600" /></div>
            <p className="text-xs text-gray-500">{t('analytics.totalAppointments')}</p>
          </div>
          <p className="text-lg font-bold text-gray-900">{data.totals.appointments.toLocaleString()}</p>
        </CardBody></Card>
        <Card><CardBody className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-yellow-100 rounded-lg"><DollarSign className="w-4 h-4 text-yellow-600" /></div>
            <p className="text-xs text-gray-500">{t('analytics.totalRevenue')}</p>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(data.totals.revenue)}</p>
        </CardBody></Card>
        <Card><CardBody className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-100 rounded-lg"><BarChart3 className="w-4 h-4 text-purple-600" /></div>
            <p className="text-xs text-gray-500">{t('analytics.doctorPerformance')}</p>
          </div>
          <p className="text-lg font-bold text-gray-900">{data.doctorPerformance.length}</p>
        </CardBody></Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card><CardBody className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">{t('analytics.appointmentTrend')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data.appointmentTrend}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="appointments" stroke="#3B82F6" fill="url(#grad1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardBody></Card>

        <Card><CardBody className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">{t('analytics.revenueTrend')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody></Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card><CardBody className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">{t('analytics.patientDemographics')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data.patientDemographics} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {data.patientDemographics.map((_, i) => <Cell key={`demo-${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardBody></Card>

        <Card><CardBody className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">{t('analytics.appointmentTypes')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={data.appointmentTypes} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label>
                {data.appointmentTypes.map((_, i) => <Cell key={`type-${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardBody></Card>

        <Card><CardBody className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4">{t('analytics.monthlyRevenue')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody></Card>
      </div>

      {/* Doctor Performance */}
      <Card><CardBody className="p-4">
        <h3 className="font-semibold text-gray-900 mb-4">{t('analytics.doctorPerformance')}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.doctorPerformance} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" name={t('analytics.appointments')} fill="#3B82F6" radius={[0, 4, 4, 0]} />
            <Bar dataKey="revenue" name={t('analytics.revenue')} fill="#10B981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardBody></Card>
    </div>
  );
}
