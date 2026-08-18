import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, appointmentsApi } from '../lib/api';
import { Spinner } from '../components/ui';
import { Can } from '../components/auth/Authorization';
import {
  CalendarCheck, Receipt, Users, DollarSign,
  Stethoscope, TrendingUp, ArrowUp,
  Clock, CheckCircle, XCircle, UserCheck,
} from 'lucide-react';

interface DashboardStats {
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingBills: number;
  revenueToday: number;
  activeDoctors: number;
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0, totalAppointments: 0, todayAppointments: 0,
    pendingBills: 0, revenueToday: 0, activeDoctors: 0,
  });
  interface TodayData { counts: { scheduled: number; checkedIn: number; completed: number; inProgress: number; cancelled: number; noShow: number; }; appointments: TodayAppointment[]; }
interface TodayAppointment { id: string; patientName: string; doctorName: string; startTime: string; endTime: string; status: string; }
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dashboardApi.stats(),
      appointmentsApi.today().catch(() => null),
    ]).then(([stats, today]) => {
      if (stats) setStats(stats);
      if (today) setTodayData(today);
    }).finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: t('dashboard.todayAppointments'), value: stats.todayAppointments, icon: CalendarCheck, color: 'bg-blue-500', change: '+12%' },
    { label: t('dashboard.totalPatients'), value: stats.totalPatients, icon: Users, color: 'bg-green-500', change: '+5%' },
    { label: t('dashboard.pendingBills'), value: stats.pendingBills, icon: Receipt, color: 'bg-yellow-500', change: '-3%' },
    { label: t('dashboard.revenueToday'), value: `${(stats.revenueToday || 0).toLocaleString()} EGP`, icon: DollarSign, color: 'bg-purple-500', change: '+8%' },
    { label: t('dashboard.activeDoctors'), value: stats.activeDoctors, icon: Stethoscope, color: 'bg-teal-500', change: '0%' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="text-muted-txt mt-1">
            {new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Can permission="analytics_dashboard.view">
          <button className="btn-primary" onClick={() => navigate("/analytics-dashboard")}>
            <TrendingUp className="w-4 h-4" />
            View Reports
          </button>
        </Can>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
        {statCards.map((card, idx) => (
          <div key={idx} className="stat-card">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs text-[var(--success)] font-medium flex items-center gap-1">
                <ArrowUp className="w-3 h-3" />
                {card.change}
              </span>
            </div>
            <p className="stat-label mt-3">{card.label}</p>
            <p className="stat-value">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Today's Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary-600" />
              {t('appointment.today')}
            </h2>
          </div>
          <div className="card-body">
            {todayData && todayData.counts ? (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-[var(--surface-secondary)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{todayData.counts.scheduled}</p>
                  <p className="text-xs text-[var(--text-muted)]">Scheduled</p>
                </div>
                <div className="text-center p-3 bg-[var(--info-soft)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--info)]">{todayData.counts.checkedIn}</p>
                  <p className="text-xs text-[var(--info)]">Checked In</p>
                </div>
                <div className="text-center p-3 bg-[var(--success-soft)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--success)]">{todayData.counts.completed}</p>
                  <p className="text-xs text-[var(--success)]">Completed</p>
                </div>
                <div className="text-center p-3 bg-[var(--warning-soft)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--warning)]">{todayData.counts.inProgress}</p>
                  <p className="text-xs text-[var(--warning)]">In Progress</p>
                </div>
                <div className="text-center p-3 bg-[var(--error-soft)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--error)]">{todayData.counts.cancelled}</p>
                  <p className="text-xs text-[var(--error)]">Cancelled</p>
                </div>
                <div className="text-center p-3 bg-[var(--surface-secondary)] rounded-lg">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{todayData.counts.noShow || 0}</p>
                  <p className="text-xs text-[var(--text-muted)]">No Show</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-txt text-sm">{t('common.noData')}</p>
            )}

            {todayData?.appointments && todayData.appointments.length > 0 && (
              <div className="space-y-3 mt-4">
                {todayData.appointments.slice(0, 5).map((apt: TodayAppointment) => (
                  <div key={apt.id} className="flex items-center gap-3 p-3 bg-[var(--surface-secondary)] rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${
                      apt.status === 'completed' ? 'bg-green-500' :
                      apt.status === 'checked_in' ? 'bg-blue-500' :
                      apt.status === 'cancelled' ? 'bg-red-500' : 'bg-yellow-500'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{apt.patientName}</p>
                      <p className="text-xs text-[var(--text-muted)]">{apt.startTime} - {apt.endTime}</p>
                    </div>
                    <span className={`badge ${
                      apt.status === 'completed' ? 'badge-success' :
                      apt.status === 'checked_in' ? 'badge-info' :
                      apt.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                    }`}>{apt.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions & Activity */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('dashboard.recentActivity')}</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {[
                { icon: UserCheck, iconClass: 'bg-[var(--success-soft)] text-[var(--success)]', text: 'New patient registered', sub: 'Ahmed Mohamed', time: '2m ago' },
                { icon: Clock, iconClass: 'bg-[var(--info-soft)] text-[var(--info)]', text: 'Appointment checked in', sub: 'Fatma Hassan - Check-up', time: '15m ago' },
                { icon: CheckCircle, iconClass: 'bg-[var(--info-soft)] text-[var(--info)]', text: 'Invoice paid', sub: 'INV-001 - 1,250 EGP', time: '1h ago' },
                { icon: XCircle, iconClass: 'bg-[var(--error-soft)] text-[var(--error)]', text: 'Appointment cancelled', sub: 'Omar Ali - Follow-up', time: '2h ago' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-[var(--surface-secondary)] rounded-lg">
                  <item.icon className={`w-8 h-8 ${item.iconClass} p-1.5 rounded-lg`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{item.text}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{item.sub}</p>
                  </div>
                  <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
