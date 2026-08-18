import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  TrendingUp,
  AlertTriangle,
  DollarSign,
  Users,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  Input,
  PageLoader,
  EmptyState,
  Badge,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

interface NoShowPrediction {
  appointmentId: string;
  patient: string;
  time: string;
  riskScore: number;
  riskLevel: string;
  factors: string[];
}

interface RevenueForecast {
  historical: Array<{ month: string; revenue: number; count: number }>;
  forecast: Array<{
    month: string;
    predicted: number;
    low: number;
    high: number;
    confidence: number;
  }>;
}

interface PatientRisk {
  type: string;
  score: number;
  level: string;
  factors: string[];
  recommendation: string;
}

type TabKey = 'overview' | 'no-show' | 'revenue' | 'patient-risk';

const riskBadgeVariant = (level: string): 'success' | 'warning' | 'danger' | 'info' | 'gray' => {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
    low: 'success',
    moderate: 'warning',
    high: 'danger',
    critical: 'danger',
  };
  return map[level] || 'gray';
};

export default function PredictiveAnalyticsPage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();

  const [tab, setTab] = useState<TabKey>('overview');
  const [noShows, setNoShows] = useState<NoShowPrediction[]>([]);
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  const [risks, setRisks] = useState<PatientRisk[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [patientId, setPatientId] = useState('');
  const [patientIdError, setPatientIdError] = useState('');
  const [months, setMonths] = useState(3);
  const abortRef = useRef<AbortController | null>(null);

  const fetchNoShows = useCallback(async (signal?: AbortSignal) => {
    const res = await api.post('/ai/predictions/no-show', { date }, { signal });
    setNoShows(res.data.data || []);
  }, [date]);

  const fetchForecast = useCallback(async (signal?: AbortSignal) => {
    const res = await api.get('/ai/predictions/revenue', { params: { months }, signal });
    setForecast(res.data.data);
  }, [months]);

  const fetchPatientRisk = useCallback(async (signal?: AbortSignal) => {
    const sanitized = sanitizeString(patientId.trim());
    if (!sanitized) {
      setPatientIdError(t('pred.enterPatientId'));
      return;
    }
    setPatientIdError('');
    const res = await api.get(`/ai/predictions/patient-risk/${sanitized}`, { signal });
    setRisks(res.data.data || []);
  }, [patientId, t]);

  const handleTabChange = useCallback((newTab: TabKey) => {
    setTab(newTab);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (newTab === 'no-show') {
      setLoading(true);
      fetchNoShows(controller.signal)
        .catch(() => toast.error(t('pred.failedLoadPredictions')))
        .finally(() => setLoading(false));
    } else if (newTab === 'revenue') {
      setLoading(true);
      fetchForecast(controller.signal)
        .catch(() => toast.error(t('pred.failedLoadForecast')))
        .finally(() => setLoading(false));
    }
  }, [fetchNoShows, fetchForecast, t]);

  const handleRefreshNoShows = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetchNoShows(controller.signal)
      .catch(() => toast.error(t('pred.failedLoadPredictions')))
      .finally(() => setLoading(false));
  }, [fetchNoShows, t]);

  const handleRefreshForecast = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetchForecast(controller.signal)
      .catch(() => toast.error(t('pred.failedLoadForecast')))
      .finally(() => setLoading(false));
  }, [fetchForecast, t]);

  const handlePatientRisk = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetchPatientRisk(controller.signal)
      .catch(() => toast.error(t('pred.failedLoadRisk')))
      .finally(() => setLoading(false));
  }, [fetchPatientRisk, t]);

  const tabLabels: Record<TabKey, string> = {
    overview: t('pred.overviewTab'),
    'no-show': t('pred.noShowTab'),
    revenue: t('pred.revenueTab'),
    'patient-risk': t('pred.patientRiskTab'),
  };

  const sortedNoShows = [...noShows].sort((a, b) => b.riskScore - a.riskScore);

  const riskCounts = {
    low: noShows.filter((p) => p.riskLevel === 'low').length,
    moderate: noShows.filter((p) => p.riskLevel === 'moderate').length,
    high: noShows.filter((p) => p.riskLevel === 'high').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <BarChart3 className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('pred.title')}</h1>
          <p className="text-sm text-gray-500">{t('pred.subtitle')}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        {(Object.keys(tabLabels) as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => handleTabChange(k)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              tab === k
                ? 'bg-purple-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tabLabels[k]}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleTabChange('no-show')}
            >
              <CardBody>
                <AlertTriangle className="w-8 h-8 text-yellow-500 mb-2" />
                <h3 className="font-semibold">{t('pred.noShowTitle')}</h3>
                <p className="text-sm text-gray-500">{t('pred.noShowDesc')}</p>
              </CardBody>
            </Card>
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleTabChange('revenue')}
            >
              <CardBody>
                <DollarSign className="w-8 h-8 text-green-500 mb-2" />
                <h3 className="font-semibold">{t('pred.revenueTitle')}</h3>
                <p className="text-sm text-gray-500">{t('pred.revenueDesc')}</p>
              </CardBody>
            </Card>
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setTab('patient-risk')}
            >
              <CardBody>
                <Users className="w-8 h-8 text-blue-500 mb-2" />
                <h3 className="font-semibold">{t('pred.riskAssessmentTitle')}</h3>
                <p className="text-sm text-gray-500">{t('pred.riskAssessmentDesc')}</p>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === 'no-show' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              label={t('pred.date')}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button
              onClick={handleRefreshNoShows}
              icon={<RefreshCw className="w-4 h-4" />}
              loading={loading}
            >
              {t('pred.overviewTab')}
            </Button>
          </div>
          {loading ? (
            <PageLoader message={t('pred.loadingPredictions')} />
          ) : sortedNoShows.length > 0 ? (
            <div className="space-y-4">
              <Card>
                <CardBody>
                  <h3 className="font-semibold mb-3">{t('pred.noShowRiskDistribution')}</h3>
                  <div className="space-y-2">
                    {sortedNoShows.map((p) => (
                      <div
                        key={p.appointmentId}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <span className="font-medium text-sm">{sanitizeString(p.patient)}</span>
                          <p className="text-xs text-gray-500">
                            {new Date(p.time).toLocaleTimeString()} — {p.factors.slice(0, 2).join(', ')}
                          </p>
                        </div>
                        <Badge variant={riskBadgeVariant(p.riskLevel)}>
                          {t(`pred.${p.riskLevel}`)} ({(p.riskScore * 100).toFixed(0)}%)
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
              <div className="grid grid-cols-3 gap-3">
                {(['low', 'moderate', 'high'] as const).map((level) => (
                  <Card key={level}>
                    <CardBody className="text-center">
                      <p className="text-2xl font-bold">{riskCounts[level]}</p>
                      <p className="text-sm text-gray-500">{t(`pred.${level}`)}</p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<AlertTriangle className="w-12 h-12" />}
              title={t('pred.noShowTitle')}
              message={t('pred.noShowDesc')}
            />
          )}
        </div>
      )}

      {tab === 'revenue' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              label={t('pred.forecastMonths')}
              type="number"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              min={1}
              max={24}
            />
            <Button
              onClick={handleRefreshForecast}
              icon={<RefreshCw className="w-4 h-4" />}
              loading={loading}
            >
              {t('pred.revenueTab')}
            </Button>
          </div>
          {loading ? (
            <PageLoader message={t('pred.loadingForecast')} />
          ) : forecast ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardBody>
                  <h3 className="font-semibold mb-3">{t('pred.historicalRevenue')}</h3>
                  <div className="space-y-2">
                    {forecast.historical.slice(0, 6).map((h) => (
                      <div
                        key={h.month}
                        className="flex justify-between items-center p-2 bg-gray-50 rounded"
                      >
                        <span className="text-sm font-medium">{h.month}</span>
                        <span className="text-sm font-semibold">
                          {formatMoney(h.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardBody>
                  <h3 className="font-semibold mb-3">{t('pred.forecastedRevenue')}</h3>
                  <div className="space-y-2">
                    {forecast.forecast.map((f) => (
                      <div key={f.month} className="p-2 bg-purple-50 rounded">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{f.month}</span>
                          <span className="text-sm font-semibold text-purple-700">
                            {formatMoney(f.predicted)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>
                            {t('pred.range')}: {formatMoney(f.low)} – {formatMoney(f.high)}
                          </span>
                          <span>
                            {t('pred.confidence')}: {f.confidence ? (f.confidence * 100).toFixed(0) : t('pred.na')}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="w-12 h-12" />}
              title={t('pred.revenueTitle')}
              message={t('pred.revenueDesc')}
            />
          )}
        </div>
      )}

      {tab === 'patient-risk' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label={t('pred.patientId')}
                placeholder={t('pred.patientIdPlaceholder')}
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                error={patientIdError}
              />
            </div>
            <Button
              onClick={handlePatientRisk}
              icon={<Users className="w-4 h-4" />}
              loading={loading}
            >
              {t('pred.assessRisk')}
            </Button>
          </div>
          {loading ? (
            <PageLoader message={t('pred.loadingRisk')} />
          ) : risks.length > 0 ? (
            <div className="space-y-3">
              {risks.map((r) => (
                <Card key={r.type}>
                  <CardBody>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold capitalize">
                        {r.type.replace(/_/g, ' ')}
                      </h3>
                      <Badge variant={riskBadgeVariant(r.level)}>
                        {t(`pred.${r.level}`)} ({(r.score * 100).toFixed(0)}%)
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>{t('pred.factors')}:</strong>{' '}
                      {r.factors?.join(', ') || t('pred.na')}
                    </div>
                    <div className="text-sm text-blue-700 bg-blue-50 p-2 rounded">
                      <strong>{t('pred.recommendation')}:</strong> {sanitizeString(r.recommendation)}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users className="w-12 h-12" />}
              title={t('pred.noRiskData')}
              message={t('pred.noRiskMessage')}
            />
          )}
        </div>
      )}
    </div>
  );
}
