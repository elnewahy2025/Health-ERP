import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  saasApi,
  type SubscriptionPlan,
  type TenantSubscription,
  type SaasInvoice,
  type SaasUsageData,
} from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { formatClinicMoney } from '../stores/clinicConfigurationStore';
import { formatDate, formatDateTime } from '../lib/format';
import {
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import {
  CreditCard,
  BarChart3,
  Clock,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

type TabType = 'subscription' | 'plans' | 'invoices' | 'usage';

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'gray'> = {
  active: 'success',
  paid: 'success',
  cancelled: 'danger',
  failed: 'danger',
  pending: 'warning',
  trial: 'warning',
  past_due: 'warning',
};

export default function SaasBillingPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('subscription');
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [invoices, setInvoices] = useState<SaasInvoice[]>([]);
  const [usage, setUsage] = useState<SaasUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [subRes, plansRes, invRes, usageRes] = await Promise.allSettled([
          saasApi.getSubscription(),
          saasApi.listPlans(),
          saasApi.listInvoices(),
          saasApi.getUsage(),
        ]);
        if (cancelled) return;
        if (subRes.status === 'fulfilled') setSubscription(subRes.value);
        if (plansRes.status === 'fulfilled') setPlans(plansRes.value);
        if (invRes.status === 'fulfilled') setInvoices(invRes.value);
        if (usageRes.status === 'fulfilled') setUsage(usageRes.value);
        if (plansRes.status === 'rejected') {
          setError(t('saas.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('saas.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [t]);

  const handleSubscribe = async (planId: string) => {
    setSubscribing(planId);
    try {
      await saasApi.createSubscription({ planId });
      toast.success(t('saas.subscribeSuccess'));
      const updated = await saasApi.getSubscription();
      setSubscription(updated);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSubscribing(null);
    }
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

  const yearlySaving = (plan: SubscriptionPlan): number => {
    if (!plan.priceYearly || !plan.priceMonthly) return 0;
    return Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="w-6 h-6" /> {t('saas.title')}
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={tab === 'subscription' ? 'primary' : 'secondary'}
          onClick={() => setTab('subscription')}
        >
          <CreditCard className="w-4 h-4" /> {t('saas.subscription')}
        </Button>
        <Button
          variant={tab === 'plans' ? 'primary' : 'secondary'}
          onClick={() => setTab('plans')}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="ml-1">{t('saas.plans')} ({plans.length})</span>
        </Button>
        <Button
          variant={tab === 'invoices' ? 'primary' : 'secondary'}
          onClick={() => setTab('invoices')}
        >
          <DollarSign className="w-4 h-4" />
          <span className="ml-1">{t('saas.invoices')} ({invoices.length})</span>
        </Button>
        <Button
          variant={tab === 'usage' ? 'primary' : 'secondary'}
          onClick={() => setTab('usage')}
        >
          <Clock className="w-4 h-4" /> {t('saas.usage')}
        </Button>
      </div>

      {/* Subscription Tab */}
      {tab === 'subscription' && (
        <div>
          {subscription ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <p className="text-sm text-gray-500">{t('saas.currentPlan')}</p>
                <p className="text-xl font-bold">{escapeHtml(subscription.planName)}</p>
                <Badge variant={STATUS_VARIANT[subscription.status] ?? 'gray'}>
                  {escapeHtml(subscription.status)}
                </Badge>
              </div>
              <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <p className="text-sm text-gray-500">{t('saas.amount')}</p>
                <p className="text-xl font-bold">
                  {formatClinicMoney(subscription.amount, subscription.currency, 'en')}
                </p>
                <p className="text-xs text-gray-400">
                  {escapeHtml(subscription.billingCycle)}
                </p>
              </div>
              <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                <p className="text-sm text-gray-500">{t('saas.period')}</p>
                <p className="text-sm font-medium">
                  {formatDate(subscription.currentPeriodStart)} →{' '}
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
                {subscription.trialEndsAt && (
                  <p className="text-xs text-orange-500">
                    {t('saas.trialUntil')} {formatDate(subscription.trialEndsAt)}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800 mb-6">
              <p className="text-gray-500">{t('saas.noSubscription')}</p>
            </div>
          )}

          {/* Plan Details */}
          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-semibold mb-3">{t('saas.planDetails')}</h3>
            {subscription ? (
              <div className="text-sm space-y-2">
                <p>
                  <strong>{t('saas.category')}:</strong>{' '}
                  {escapeHtml(subscription.planCategory)}
                </p>
                <p>
                  <strong>{t('saas.maxUsers')}:</strong> {subscription.maxUsers} ·{' '}
                  <strong>{t('saas.maxBranches')}:</strong> {subscription.maxBranches} ·{' '}
                  <strong>{t('saas.storage')}:</strong> {subscription.maxStorageGb}GB
                </p>
                <p>
                  <strong>{t('saas.features')}:</strong>{' '}
                  {(subscription.planFeatures ?? []).join(', ') || '-'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">{t('saas.selectPlan')}</p>
            )}
          </div>
        </div>
      )}

      {/* Plans Tab */}
      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="w-12 h-12 text-gray-300" />}
              title={t('saas.plans')}
              message={t('common.noData')}
            />
          ) : (
            plans.map((p) => (
              <div
                key={p.id}
                className={`bg-white rounded-lg border-2 p-4 ${
                  subscription?.planId === p.id
                    ? 'border-blue-500'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-lg">{escapeHtml(p.name)}</h3>
                  <Badge>{escapeHtml(p.category)}</Badge>
                </div>
                <p className="text-3xl font-bold mb-1">
                  {formatClinicMoney(p.priceMonthly, p.currency, 'en')}{' '}
                  <span className="text-sm font-normal text-gray-500">
                    {t('saas.monthly')}
                  </span>
                </p>
                {p.priceYearly > 0 && (
                  <p className="text-sm text-gray-500 mb-4">
                    {formatClinicMoney(p.priceYearly, p.currency, 'en')} {t('saas.yearly')} ({t('saas.save')}{' '}
                    {yearlySaving(p)}%)
                  </p>
                )}
                <div className="text-sm space-y-2 mb-4">
                  <p>
                    {p.maxUsers} {t('saas.users')} · {p.maxBranches} {t('saas.branches')} ·{' '}
                    {p.maxStorageGb}GB
                  </p>
                  <p className="font-medium">
                    {t('saas.modules')}: {(p.modules ?? []).join(', ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 mb-4">
                  {(p.features ?? []).map((f) => (
                    <Badge key={f} variant="gray">{escapeHtml(f)}</Badge>
                  ))}
                </div>
                {subscription?.planId !== p.id ? (
                  <Button
                    className="w-full"
                    onClick={() => void handleSubscribe(p.id)}
                    loading={subscribing === p.id}
                  >
                    {t('saas.subscribe')}
                  </Button>
                ) : (
                  <Button className="w-full" variant="secondary" disabled>
                    {t('saas.current')}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.invoiceNumber')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.periodRange')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.amount')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.tax')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.total')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.paid')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={<DollarSign className="w-12 h-12 text-gray-300" />}
                      title={t('saas.noInvoices')}
                      message={t('common.noData')}
                    />
                  </td>
                </tr>
              ) : (
                invoices.map((i) => (
                  <tr key={i.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs">{escapeHtml(i.invoiceNumber)}</td>
                    <td className="p-3 text-xs">
                      {escapeHtml(i.periodStart)} → {escapeHtml(i.periodEnd)}
                    </td>
                    <td className="p-3">{formatClinicMoney(i.amount, i.currency, 'en')}</td>
                    <td className="p-3">{formatClinicMoney(i.tax, i.currency, 'en')}</td>
                    <td className="p-3 font-medium">
                      {formatClinicMoney(i.total, i.currency, 'en')}
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[i.status] ?? 'gray'}>
                        {escapeHtml(i.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">
                      {formatDateTime(i.paidAt) || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Usage Tab */}
      {tab === 'usage' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">{t('saas.last30Days')}</p>
          {(usage?.totals ?? []).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {usage!.totals.map((item) => (
                <div key={item.metric} className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
                  <p className="text-sm text-gray-500 capitalize">
                    {escapeHtml(item.metric.replace(/_/g, ' '))}
                  </p>
                  <p className="text-2xl font-bold">{item.total.toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-6">
              <EmptyState
                icon={<Clock className="w-12 h-12 text-gray-300" />}
                title={t('saas.noUsage')}
                message={t('common.noData')}
              />
            </div>
          )}

          {(usage?.records ?? []).length > 0 && (
            <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.metric')}</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.quantity')}</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">{t('saas.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage!.records.slice(0, 20).map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-3">
                        <Badge>{escapeHtml(r.metric)}</Badge>
                      </td>
                      <td className="p-3 font-medium">{r.quantity.toLocaleString()}</td>
                      <td className="p-3 text-xs text-gray-500">
                        {escapeHtml(r.recordDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
