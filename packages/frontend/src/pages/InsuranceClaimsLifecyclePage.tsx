import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ShieldCheck, FileText, Activity, CheckCircle, XCircle, Clock,
  AlertCircle, Plus,
} from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, Table,
  PageLoader, EmptyState, Modal,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

/* ── Types ─────────────────────────────────────────────────────────── */

type ClaimsTab = 'claims' | 'new-claim' | 'tracking' | 'analytics';
type ClaimStatus = 'draft' | 'submitted' | 'pending_review' | 'approved' | 'partially_approved' | 'denied' | 'appealed' | 'paid';

interface InsuranceCompany {
  id: string;
  name: string;
  code: string;
  contractType: string;
  discountRate: number;
}

interface InsuranceClaim {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  patientName: string | null;
  patientMrn: string | null;
  companyName: string | null;
  invoiceNumber: string | null;
  claimedAmount: number;
  approvedAmount: number;
  paidAmount: number;
  submissionDate: string | null;
  responseDate: string | null;
  denialReason: string | null;
  notes: string | null;
  createdAt: string;
}

interface SummaryData {
  total: number;
  total_claimed: number;
  total_approved: number;
  total_paid: number;
  draft: number;
  submitted: number;
  approved: number;
  denied: number;
  paid: number;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
  paid: 'success',
  approved: 'success',
  partially_approved: 'warning',
  submitted: 'info',
  pending_review: 'warning',
  draft: 'gray',
  denied: 'danger',
  appealed: 'warning',
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  draft: FileText,
  submitted: Clock,
  pending_review: AlertCircle,
  approved: CheckCircle,
  partially_approved: Activity,
  denied: XCircle,
  appealed: AlertCircle,
  paid: CheckCircle,
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  return STATUS_VARIANTS[status] ?? 'gray';
}

function getStatusIcon(status: string): React.ComponentType<{ className?: string }> {
  return STATUS_ICONS[status] ?? Clock;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function InsuranceClaimsLifecyclePage() {
  const formatMoney = useClinicMoney();
  const { t } = useTranslation();
  const [tab, setTab] = useState<ClaimsTab>('claims');
  const [loading, setLoading] = useState(true);

  /* ── Claims data ── */
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [companies, setCompanies] = useState<InsuranceCompany[]>([]);

  /* ── Filters ── */
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [insurerFilter, setInsurerFilter] = useState('');

  /* ── Detail modal ── */
  const [showDetail, setShowDetail] = useState<InsuranceClaim | null>(null);

  /* ── New claim form ── */
  const [form, setForm] = useState({
    patientId: '',
    invoiceId: '',
    insuranceId: '',
    claimedAmount: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);

  /* ── Data fetching ── */

  const fetchClaims = useCallback(async (): Promise<void> => {
    try {
      const params: Record<string, string> = { limit: '200' };
      if (statusFilter) params.status = statusFilter;
      if (insurerFilter) params.insuranceId = insurerFilter;
      const { data } = await api.get('/insurance-claims', { params });
      const rows = (data.data?.rows ?? data.data ?? []) as InsuranceClaim[];
      setClaims(rows);
    } catch {
      toast.error(t('insClaims.loadFailed'));
    }
  }, [statusFilter, insurerFilter, t]);

  const fetchSummary = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/insurance-claims/summary');
      setSummary((data.data ?? null) as SummaryData | null);
    } catch {
      // Summary is optional, don't show error for non-critical data
    }
  }, []);

  const fetchCompanies = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/insurance-companies');
      setCompanies((data.data ?? []) as InsuranceCompany[]);
    } catch {
      toast.error(t('insClaims.loadCompaniesFailed'));
    }
  }, [t]);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchClaims(), fetchSummary(), fetchCompanies()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchClaims, fetchSummary, fetchCompanies]);

  /* ── Filtered claims (client-side search) ── */

  const filteredClaims = useMemo(() => {
    if (!search.trim()) return claims;
    const q = search.toLowerCase();
    return claims.filter(
      (c) =>
        c.claimNumber?.toLowerCase().includes(q) ||
        c.patientName?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q) ||
        c.invoiceNumber?.toLowerCase().includes(q)
    );
  }, [claims, search]);

  /* ── Actions ── */

  const handleBulkSubmit = useCallback(async (): Promise<void> => {
    const drafts = claims.filter((c) => c.status === 'draft');
    if (drafts.length === 0) {
      toast.error(t('insClaims.noDraftClaims'));
      return;
    }
    try {
      await Promise.allSettled(
        drafts.map((c) => api.post(`/insurance-claims/${c.id}/submit`))
      );
      toast.success(t('insClaims.bulkSubmitSuccess', { count: String(drafts.length) } as Record<string, unknown>));
      void fetchClaims();
    } catch {
      toast.error(t('insClaims.bulkSubmitFailed'));
    }
  }, [claims, t, fetchClaims]);

  const handleCreateClaim = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!form.patientId.trim()) errors.patientId = t('common.required');
    if (!form.invoiceId.trim()) errors.invoiceId = t('common.required');
    if (!form.insuranceId) errors.insuranceId = t('common.required');
    if (!form.claimedAmount || Number(form.claimedAmount) <= 0) errors.claimedAmount = t('common.required');
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitLoading(true);
    try {
      await api.post('/insurance-claims', {
        patientId: form.patientId.trim(),
        invoiceId: form.invoiceId.trim(),
        insuranceId: form.insuranceId,
        claimedAmount: Number(form.claimedAmount),
        notes: sanitizeString(form.notes) || undefined,
      });
      toast.success(t('insClaims.claimCreated'));
      setForm({ patientId: '', invoiceId: '', insuranceId: '', claimedAmount: '', notes: '' });
      setTab('claims');
      void fetchClaims();
    } catch {
      toast.error(t('insClaims.claimCreateFailed'));
    } finally {
      setSubmitLoading(false);
    }
  }, [form, t, fetchClaims]);

  /* ── Summary stats (from real data) ── */

  const stats = useMemo(() => {
    if (summary) {
      return {
        total: summary.total,
        pending: summary.submitted + summary.draft,
        approved: summary.approved,
        denied: summary.denied,
        paid: summary.paid,
        totalClaimed: summary.total_claimed,
      };
    }
    return {
      total: claims.length,
      pending: claims.filter((c) => ['submitted', 'pending_review'].includes(c.status)).length,
      approved: claims.filter((c) => ['approved', 'partially_approved'].includes(c.status)).length,
      denied: claims.filter((c) => c.status === 'denied').length,
      paid: claims.filter((c) => c.status === 'paid').length,
      totalClaimed: claims.filter((c) => c.status === 'paid').reduce((s, c) => s + c.paidAmount, 0),
    };
  }, [summary, claims]);

  /* ── Table columns ── */

  const claimColumns: Column<InsuranceClaim>[] = [
    {
      key: 'claimNumber',
      header: t('insClaims.claimNumber'),
      render: (item) => (
        <span className="font-medium text-primary-600">{escapeHtml(item.claimNumber)}</span>
      ),
    },
    {
      key: 'patientName',
      header: t('insClaims.patient'),
      render: (item) => <span>{escapeHtml(item.patientName ?? '-')}</span>,
    },
    {
      key: 'companyName',
      header: t('insClaims.insurer'),
      render: (item) => <span>{escapeHtml(item.companyName ?? '-')}</span>,
    },
    {
      key: 'claimedAmount',
      header: t('insClaims.claimedAmount'),
      render: (item) => <span>{formatMoney(item.claimedAmount)}</span>,
    },
    {
      key: 'approvedAmount',
      header: t('insClaims.approvedAmount'),
      render: (item) => <span>{item.approvedAmount != null ? formatMoney(item.approvedAmount) : '-'}</span>,
    },
    {
      key: 'status',
      header: t('insClaims.status'),
      render: (item) => (
        <Badge variant={getStatusVariant(item.status)}>
          {t(`insClaims.${item.status.replace(/ /g, '')}`) || item.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t('insClaims.date'),
      render: (item) => <span>{formatDateTime(item.createdAt) || '-'}</span>,
    },
    {
      key: 'id',
      header: t('insClaims.actions'),
      render: (item) => (
        <Button size="sm" variant="ghost" onClick={() => setShowDetail(item)}>
          {t('insClaims.view')}
        </Button>
      ),
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: ClaimsTab; icon: React.ReactNode; label: string }> = [
    { key: 'claims', icon: <ShieldCheck className="w-4 h-4" />, label: t('insClaims.claimsTab') },
    { key: 'new-claim', icon: <Plus className="w-4 h-4" />, label: t('insClaims.newClaimTab') },
    { key: 'tracking', icon: <Activity className="w-4 h-4" />, label: t('insClaims.trackingTab') },
    { key: 'analytics', icon: <FileText className="w-4 h-4" />, label: t('insClaims.analyticsTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary-600" />
            {t('insClaims.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('insClaims.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void handleBulkSubmit()}>
            {t('insClaims.bulkSubmit')}
          </Button>
          <Button onClick={() => setTab('new-claim')}>
            <Plus className="w-4 h-4 mr-1" />
            {t('insClaims.newClaim')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: t('insClaims.totalClaims'), value: stats.total, color: 'text-gray-900' },
          { label: t('insClaims.pendingClaims'), value: stats.pending, color: 'text-yellow-600' },
          { label: t('insClaims.approvedClaims'), value: stats.approved, color: 'text-green-600' },
          { label: t('insClaims.deniedClaims'), value: stats.denied, color: 'text-red-600' },
          { label: t('insClaims.paidClaims'), value: stats.paid, color: 'text-blue-600' },
          { label: t('insClaims.totalClaimed'), value: formatMoney(stats.totalClaimed), color: 'text-purple-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardBody className="p-4 text-center">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
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
          {/* ── CLAIMS LIST ── */}
          {tab === 'claims' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3">
                <Input
                  placeholder={t('insClaims.search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Select
                  label={t('insClaims.filterStatus')}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  options={[
                    { value: '', label: t('insClaims.filterStatus') },
                    { value: 'draft', label: t('insClaims.draft') },
                    { value: 'submitted', label: t('insClaims.submitted') },
                    { value: 'pending_review', label: t('insClaims.pendingReview') },
                    { value: 'approved', label: t('insClaims.approved') },
                    { value: 'denied', label: t('insClaims.denied') },
                    { value: 'paid', label: t('insClaims.paid') },
                  ]}
                />
                <Select
                  label={t('insClaims.filterInsurer')}
                  value={insurerFilter}
                  onChange={(e) => setInsurerFilter(e.target.value)}
                  options={[
                    { value: '', label: t('insClaims.filterInsurer') },
                    ...companies.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>

              <Card>
                <CardBody className="p-0">
                  <Table<InsuranceClaim>
                    columns={claimColumns}
                    data={filteredClaims}
                    loading={false}
                    emptyMessage={t('insClaims.noClaims')}
                    onRowClick={(item) => setShowDetail(item)}
                  />
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── NEW CLAIM FORM ── */}
          {tab === 'new-claim' && (
            <Card>
              <CardBody className="p-6">
                <h3 className="text-lg font-semibold mb-4">{t('insClaims.createClaim')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                  <Input
                    label={t('insClaims.patientId')}
                    value={form.patientId}
                    onChange={(e) => setForm((prev) => ({ ...prev, patientId: e.target.value }))}
                    error={formErrors.patientId}
                    required
                  />
                  <Input
                    label={t('insClaims.invoiceId')}
                    value={form.invoiceId}
                    onChange={(e) => setForm((prev) => ({ ...prev, invoiceId: e.target.value }))}
                    error={formErrors.invoiceId}
                    required
                  />
                  <Select
                    label={t('insClaims.insuranceCompany')}
                    value={form.insuranceId}
                    onChange={(e) => setForm((prev) => ({ ...prev, insuranceId: e.target.value }))}
                    options={[
                      { value: '', label: t('insClaims.selectCompany') },
                      ...companies.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    error={formErrors.insuranceId}
                  />
                  <Input
                    label={t('insClaims.claimedAmountLabel')}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.claimedAmount}
                    onChange={(e) => setForm((prev) => ({ ...prev, claimedAmount: e.target.value }))}
                    error={formErrors.claimedAmount}
                    required
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label={t('insClaims.notes')}
                      value={form.notes}
                      onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder={t('insClaims.notesPlaceholder')}
                    />
                  </div>
                </div>
                <div className="mt-6">
                  <Button
                    onClick={() => void handleCreateClaim()}
                    loading={submitLoading}
                    disabled={submitLoading}
                  >
                    {t('insClaims.submitClaim')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ── CLAIM TRACKING ── */}
          {tab === 'tracking' && (
            <Card>
              <CardBody className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">{t('insClaims.trackingTab')}</h3>
                {claims.length === 0 ? (
                  <EmptyState title={t('insClaims.noClaims')} />
                ) : (
                  <div className="space-y-4">
                    {claims.slice(0, 20).map((c) => {
                      const Icon = getStatusIcon(c.status);
                      return (
                        <div key={c.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            c.status === 'paid' ? 'bg-green-100' : c.status === 'denied' ? 'bg-red-100' : 'bg-blue-100'
                          }`}>
                            <Icon className={`w-5 h-5 ${
                              c.status === 'paid' ? 'text-green-600' : c.status === 'denied' ? 'text-red-600' : 'text-blue-600'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{escapeHtml(c.claimNumber)}</p>
                            <p className="text-xs text-gray-500">{escapeHtml(c.patientName ?? '-')} — {escapeHtml(c.companyName ?? '-')}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <Badge variant={getStatusVariant(c.status)}>
                              {t(`insClaims.${c.status.replace(/ /g, '')}`) || c.status}
                            </Badge>
                            <p className="text-xs text-gray-500 mt-1">{formatMoney(c.claimedAmount)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ── ANALYTICS ── */}
          {tab === 'analytics' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardBody className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('insClaims.claimsByInsurer')}</h3>
                  {claims.length === 0 ? (
                    <EmptyState title={t('insClaims.noData')} />
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(
                        claims.reduce<Record<string, number>>((acc, c) => {
                          const name = c.companyName ?? 'Unknown';
                          acc[name] = (acc[name] ?? 0) + 1;
                          return acc;
                        }, {})
                      )
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 8)
                        .map(([insurer, count]) => {
                          const maxCount = Math.max(
                            ...Object.values(
                              claims.reduce<Record<string, number>>((acc, c) => {
                                const name = c.companyName ?? 'Unknown';
                                acc[name] = (acc[name] ?? 0) + 1;
                                return acc;
                              }, {})
                            )
                          );
                          return (
                            <div key={insurer} className="flex items-center gap-3">
                              <span className="text-sm flex-1">{escapeHtml(insurer)}</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-primary-500 h-2 rounded-full"
                                  style={{ width: `${(count / Math.max(maxCount, 1)) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-8 text-right">{count}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardBody>
              </Card>
              <Card>
                <CardBody className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('insClaims.approvalRate')}</h3>
                  {claims.length === 0 ? (
                    <EmptyState title={t('insClaims.noData')} />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-5xl font-bold text-green-600">
                        {claims.filter((c) => c.status !== 'draft').length > 0
                          ? Math.round(
                              (stats.approved /
                                Math.max(claims.filter((c) => c.status !== 'draft').length, 1)) *
                                100
                            )
                          : 0}%
                      </p>
                      <p className="text-gray-500 mt-2">
                        {t('insClaims.approvedCount', {
                          count: String(stats.approved),
                          total: String(claims.filter((c) => c.status !== 'draft').length),
                        } as Record<string, unknown>)}
                      </p>
                      <div className="flex justify-center gap-4 mt-4">
                        <span className="text-sm text-green-600">▲ {stats.approved} {t('insClaims.approvedClaims')}</span>
                        <span className="text-sm text-red-600">▼ {stats.denied} {t('insClaims.deniedClaims')}</span>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── Detail Modal ── */}
      <Modal
        open={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={t('insClaims.claimDetails')}
        size="lg"
      >
        {showDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">{t('insClaims.patient')}</span>
                <p className="font-medium">{escapeHtml(showDetail.patientName ?? '-')}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.insurer')}</span>
                <p className="font-medium">{escapeHtml(showDetail.companyName ?? '-')}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.invoiceNumber')}</span>
                <p className="font-medium">{escapeHtml(showDetail.invoiceNumber ?? '-')}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.claimedAmount')}</span>
                <p className="font-medium">{formatMoney(showDetail.claimedAmount)}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.approvedAmount')}</span>
                <p className="font-medium">{showDetail.approvedAmount != null ? formatMoney(showDetail.approvedAmount) : '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.paidBy')}</span>
                <p className="font-medium">{showDetail.paidAmount != null ? formatMoney(showDetail.paidAmount) : '-'}</p>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.status')}</span>
                <Badge variant={getStatusVariant(showDetail.status)} className="mt-1">
                  {t(`insClaims.${showDetail.status.replace(/ /g, '')}`) || showDetail.status}
                </Badge>
              </div>
              <div>
                <span className="text-gray-500">{t('insClaims.date')}</span>
                <p className="font-medium">{formatDateTime(showDetail.createdAt) || '-'}</p>
              </div>
              {showDetail.denialReason && (
                <div className="col-span-2">
                  <span className="text-gray-500">{t('insClaims.diagnosis')}</span>
                  <p className="font-medium text-red-600">{escapeHtml(showDetail.denialReason)}</p>
                </div>
              )}
              {showDetail.notes && (
                <div className="col-span-2">
                  <span className="text-gray-500">{t('insClaims.notes')}</span>
                  <p className="font-medium">{escapeHtml(showDetail.notes)}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
