import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Stethoscope, LayoutDashboard, Users, CalendarPlus, LifeBuoy, ArrowRight, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const { t, i18n } = useTranslation();
  const rtl = i18n.language === 'ar';
  const Arrow = rtl ? ArrowLeft : ArrowRight;

  const actions = [
    { to: '/', icon: LayoutDashboard, label: t('notFound.dashboard'), hint: t('notFound.dashboardHint') },
    { to: '/patients', icon: Users, label: t('notFound.patients'), hint: t('notFound.patientsHint') },
    { to: '/appointments', icon: CalendarPlus, label: t('notFound.appointments'), hint: t('notFound.appointmentsHint') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Stethoscope className="w-8 h-8 text-white" />
        </div>
        <span className="inline-block text-xs font-semibold tracking-wider text-primary-600 bg-primary-50 rounded-full px-3 py-1 mb-4">
          {t('notFound.badge')}
        </span>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('notFound.title')}</h1>
        <p className="text-gray-500 mb-8">{t('notFound.subtitle')}</p>

        <p className="text-sm font-semibold text-gray-700 mb-3">{t('notFound.guide')}</p>
        <div className="space-y-3 mb-8">
          {actions.map(({ to, icon: Icon, label, hint }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 p-4 text-left hover:border-primary-400 hover:shadow-sm transition"
            >
              <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{hint}</p>
              </div>
              <Arrow className="w-4 h-4 text-gray-400" />
            </Link>
          ))}
          <a
            href="mailto:support@visionhealthcare.com"
            className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 p-4 text-left hover:border-primary-400 hover:shadow-sm transition"
          >
            <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center shrink-0">
              <LifeBuoy className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{t('notFound.support')}</p>
              <p className="text-xs text-gray-500">{t('notFound.supportHint')}</p>
            </div>
            <Arrow className="w-4 h-4 text-gray-400" />
          </a>
        </div>

        <p className="text-xs text-gray-400">{t('notFound.tip')}</p>
      </div>
    </div>
  );
}
