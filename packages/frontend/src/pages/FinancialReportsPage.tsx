import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  financialApi,
  type RevenueSummary,
  type AgingBucket,
  type TopPatient,
  type PlReport,
} from '../lib/api';
import { PageLoader } from '../components/ui';
import { formatClinicMoney, useClinicConfiguration } from '../stores/clinicConfigurationStore';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Wallet,
  AlertTriangle,
  ArrowUp,
} from 'lucide-react';

type PeriodKey = 'week' | 'month' | 'quarter' | 'year';
type TabType = 'overview' | 'pl';

const PERIOD_OPTIONS: { value: PeriodKey; labelKey: string }[] = [
  { value: 'week', labelKey: 'finRep.thisWeek' },
  { value: 'month', labelKey: 'finRep.thisMonth' },
  { value: 'quarter', labelKey: 'finRep.thisQuarter' },
  { value: 'year', labelKey: 'finRep.thisYear' },
];

export default function FinancialReportsPage() {
  const { t } = useTranslation();
  const { identity } = useClinicConfiguration();
  const formatMoney = (amount: number | string | null | undefined) => formatClinicMoney(
    amount,
    identity?.currency,
    identity?.locale,
  );

  const [tab, setTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [agingData] = useState<AgingBucket[]>([]);
  const [topPatientsData] = useState<TopPatient[]>([]);
  const [plReport, setPlReport] = useState<PlReport | null>(null);

  const getDateRange = (p: PeriodKey) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (p) {
      case 'week': {
        const d = new Date(now.getTime() - 7 * 86400000);
        return { from: d.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      }
      case 'month':
        return { from: new Date(y, m, 1).toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      case 'quarter': {
        const sq = Math.floor(m / 3) * 3;
        return { from: new Date(y, sq, 1).toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      }
      case 'year':
        return { from: new Date(y, 0, 1).toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
      default:
        return { from: new Date(y, m, 1).toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      const dr = getDateRange(period);
      try {
        const [revRes, plRes] = await Promise.allSettled([
          financialApi.revenue({ period }),
          financialApi.plReport(dr),
        ]);
        if (cancelled) return;
        if (revRes.status === 'fulfilled') setRevenue(revRes.value);
        if (plRes.status === 'fulfilled') setPlReport(plRes.value);
        if (revRes.status === 'rejected' && plRes.status === 'rejected') {
          setError(t('finRep.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(t('finRep.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [period, t]);

  const calcRate = (): string => {
    if (!revenue?.totalRevenue || !revenue?.totalCollected) return '0';
    return ((Number(revenue.totalCollected) / Number(revenue.totalRevenue)) * 100).toFixed(1);
  };

  if (loading) return <PageLoader message={t('common.loading')} />;

  if (error) {
    return (
      <div className="p-6 text-center py-12">
        <AlertTriangle className="mx-auto w-12 h-12 text-red-400" />
        <p className="mt-4 text-gray-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6" /> {t('finRep.title')}
        </h1>
        <select
          className="border rounded-lg p-2 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-2 rounded-t-lg font-medium text-sm ${
            tab === 'overview' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('finRep.overview')}
        </button>
        <button
          onClick={() => setTab('pl')}
          className={`px-4 py-2 rounded-t-lg font-medium text-sm ${
            tab === 'pl' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t('finRep.plStatement')}
        </button>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('finRep.totalRevenue')}</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatMoney(revenue?.totalRevenue ?? 0)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('finRep.collected')}</p>
                  <p className="text-xl font-bold text-blue-600">
                    {formatMoney(revenue?.totalCollected ?? 0)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <ArrowUp className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('finRep.outstanding')}</p>
                  <p className="text-xl font-bold text-yellow-600">
                    {formatMoney(revenue?.totalOutstanding ?? 0)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('finRep.collectionRate')}</p>
                  <p className="text-xl font-bold text-purple-600">{calcRate()}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Revenue by Category */}
          {(revenue?.revenueByCategory ?? []).length > 0 && (
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                {t('finRep.revenue')} {t('finRep.byCategory')}
              </h3>
              <div className="space-y-2">
                {revenue!.revenueByCategory.map((cat) => (
                  <div key={cat.category} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span className="text-sm font-medium">{cat.category}</span>
                    <span className="text-sm font-semibold">{formatMoney(cat.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aging */}
          {agingData.length > 0 && (
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                {t('finRep.agingBuckets')}
              </h3>
              <div className="space-y-2">
                {agingData.map((bucket) => (
                  <div key={bucket.range} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                    <span className="font-medium">{bucket.range}</span>
                    <div className="flex gap-4">
                      <span className="text-gray-500">{bucket.count} {t('finRep.count').toLowerCase()}</span>
                      <span className="font-semibold">{formatMoney(bucket.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Patients */}
          {topPatientsData.length > 0 && (
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                {t('finRep.topPatients')}
              </h3>
              <div className="space-y-2">
                {topPatientsData.map((p, idx) => (
                  <div key={p.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-400 w-6 text-center">{idx + 1}</span>
                      <span className="font-medium">{p.name}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>{p.invoiceCount} {t('finRep.invoiceCount').toLowerCase()}</span>
                      <span className="font-semibold text-green-600">{formatMoney(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* P&L Statement Tab */}
      {tab === 'pl' && plReport && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            {t('finRep.period')}: {plReport.period.from} — {plReport.period.to}
          </p>

          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-semibold text-lg text-green-700 mb-3 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> {t('finRep.revenue')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="font-medium">{t('finRep.totalRevenueInv')}</span>
                <span className="font-bold text-green-700">{formatMoney(plReport.revenue.total)}</span>
              </div>
              <div className="flex justify-between items-center p-2">
                <span className="text-sm text-gray-600 ml-4">{t('finRep.collected')}</span>
                <span className="font-medium">{formatMoney(plReport.revenue.collected)}</span>
              </div>
              <div className="flex justify-between items-center p-2">
                <span className="text-sm text-gray-600 ml-4">{t('finRep.outstanding')}</span>
                <span className="font-medium text-yellow-600">{formatMoney(plReport.revenue.outstanding)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <h3 className="font-semibold text-lg text-orange-700 mb-3 flex items-center gap-2">
              <Wallet className="w-5 h-5" /> {t('finRep.expenses')}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <span className="font-medium">{t('finRep.totalExpenses')}</span>
                <span className="font-bold text-orange-700">{formatMoney(plReport.expenses.total)}</span>
              </div>
              {plReport.expenses.byCategory?.map((cat) => (
                <div key={cat.category} className="flex justify-between items-center p-2">
                  <span className="text-sm text-gray-600 ml-4">{cat.category}</span>
                  <span className="font-medium">{formatMoney(cat.total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
            <div className="space-y-3">
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                <span className="text-lg font-bold">{t('finRep.grossProfit')}</span>
                <span className={`text-lg font-bold ${plReport.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatMoney(plReport.grossProfit)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3">
                <span className="font-medium text-gray-700">{t('finRep.profitMargin')}</span>
                <span className={`font-bold ${plReport.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {plReport.profitMargin.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {(plReport.revenueByMonth ?? []).length > 0 && (
            <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
              <h3 className="font-semibold mb-3">{t('finRep.monthlyTrend')}</h3>
              <div className="space-y-2">
                {plReport.revenueByMonth.map((m) => {
                  const expMonth = plReport.expenseByMonth?.find((e) => e.month === m.month);
                  const rev = Number(m.revenue || 0);
                  const exp = Number(expMonth?.total || 0);
                  const profit = rev - exp;
                  return (
                    <div key={m.month} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm font-medium w-20">{m.month}</span>
                      <div className="flex-1 flex gap-4 text-xs">
                        <span className="text-green-600">Rev: {formatMoney(rev)}</span>
                        <span className="text-orange-600">Exp: {formatMoney(exp)}</span>
                      </div>
                      <span className={`text-sm font-semibold w-28 text-right ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {profit >= 0 ? '+' : ''}{formatMoney(profit)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
