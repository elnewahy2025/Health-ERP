import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  claimsApi,
  type InsuranceClaimListItem,
  type InsuranceClaimsSummary,
} from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import {
  Modal,
  Select,
  Button,
  Badge,
  EmptyState,
  PageLoader,
} from '../components/ui';
import {
  ShieldCheck,
  Send,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'paid', label: 'Paid' },
];

const STATUS_CHANGE_OPTIONS = [
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'paid', label: 'Paid' },
];

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'gray'> = {
  draft: 'gray',
  submitted: 'info',
  acknowledged: 'info',
  in_review: 'warning',
  approved: 'success',
  denied: 'danger',
  paid: 'success',
};

export default function InsuranceClaimsPage() {
  const { t } = useTranslation();

  const [claims, setClaims] = useState<InsuranceClaimListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [summary, setSummary] = useState<InsuranceClaimsSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state for status change
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<InsuranceClaimListItem | null>(null);
  const [newStatus, setNewStatus] = useState('acknowledged');
  const [statusFormErrors, setStatusFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [claimsRes, summaryRes] = await Promise.allSettled([
          claimsApi.list({ page, limit: 15, status: statusFilter || undefined }),
          claimsApi.summary(),
        ]);
        if (cancelled) return;
        if (claimsRes.status === 'fulfilled') {
          setClaims(claimsRes.value.data);
          setPagination(claimsRes.value.pagination);
        } else {
          setError(t('insClaims.loadFailed'));
        }
        if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      } catch {
        if (!cancelled) setError(t('insClaims.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [page, statusFilter, t]);

  const handleSubmit = async (id: string) => {
    try {
      await claimsApi.submit(id);
      toast.success(t('insClaims.submittedSuccess'));
      const [claimsRes, summaryRes] = await Promise.allSettled([
        claimsApi.list({ page, limit: 15, status: statusFilter || undefined }),
        claimsApi.summary(),
      ]);
      if (claimsRes.status === 'fulfilled') {
        setClaims(claimsRes.value.data);
        setPagination(claimsRes.value.pagination);
      }
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
    } catch {
      toast.error(t('insClaims.submitFailed'));
    }
  };

  const handleOpenStatusModal = (claim: InsuranceClaimListItem) => {
    setSelectedClaim(claim);
    setNewStatus('acknowledged');
    setStatusFormErrors({});
    setShowStatusModal(true);
  };

  const handleStatusChange = async () => {
    if (!selectedClaim) return;
    if (!newStatus) {
      setStatusFormErrors({ status: t('common.required') });
      return;
    }
    setSubmitting(true);
    try {
      await claimsApi.updateStatus(selectedClaim.id, {
        status: newStatus as 'acknowledged' | 'in_review' | 'approved' | 'denied' | 'paid',
      });
      toast.success(t('insClaims.statusUpdated'));
      setShowStatusModal(false);
      setSelectedClaim(null);
      const [claimsRes, summaryRes] = await Promise.allSettled([
        claimsApi.list({ page, limit: 15, status: statusFilter || undefined }),
        claimsApi.summary(),
      ]);
      if (claimsRes.status === 'fulfilled') {
        setClaims(claimsRes.value.data);
        setPagination(claimsRes.value.pagination);
      }
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
    } catch {
      toast.error(t('insClaims.statusFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && claims.length === 0) {
    return <PageLoader message={t('common.loading')} />;
  }

  if (error && claims.length === 0) {
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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" /> {t('insClaims.title')}
        </h1>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-lg border p-3 text-center">
            <p className="text-lg font-bold">{summary.total}</p>
            <p className="text-xs text-gray-500">{t('insClaims.total')}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-yellow-600">{summary.draft}</p>
            <p className="text-xs text-gray-500">{t('insClaims.draft')}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-blue-600">{summary.submitted}</p>
            <p className="text-xs text-gray-500">{t('insClaims.submitted')}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-green-600">{summary.approved}</p>
            <p className="text-xs text-gray-500">{t('insClaims.approved')}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 text-center">
            <p className="text-lg font-bold text-red-600">{summary.denied}</p>
            <p className="text-xs text-gray-500">{t('insClaims.denied')}</p>
          </div>
          <div className="bg-white rounded-lg border p-3 col-span-2 sm:col-span-3 lg:col-span-5">
            <p className="text-sm">
              {t('insClaims.claimed')}: <strong>{Number(summary.totalClaimed).toLocaleString()} EGP</strong>
              {' | '}
              {t('insClaims.approved')}: <strong>{Number(summary.totalApproved).toLocaleString()} EGP</strong>
              {' | '}
              {t('insClaims.totalPaid')}: <strong className="text-green-600">{Number(summary.totalPaid).toLocaleString()} EGP</strong>
            </p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="mb-4 max-w-xs">
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          options={STATUS_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(`insClaims.${opt.value || 'allStatus'}`, opt.label),
          }))}
        />
      </div>

      {/* Claims Table */}
      <div className="bg-white rounded-lg border overflow-hidden dark:bg-gray-900 dark:border-gray-800">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.claimNumber')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.patient')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.company')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.invoice')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.claimedAmount')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.approvedAmount')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.status')}</th>
              <th className="text-left p-3 text-sm font-medium text-gray-600">{t('insClaims.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon={<ShieldCheck className="w-12 h-12 text-gray-300" />}
                    title={t('insClaims.noClaims')}
                    message={t('common.noData')}
                  />
                </td>
              </tr>
            ) : (
              claims.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs font-medium">{escapeHtml(c.claimNumber)}</td>
                  <td className="p-3 text-sm">
                    {c.patientName ? escapeHtml(c.patientName) : '-'}
                    {c.patientMrn && (
                      <br />
                    )}
                    {c.patientMrn && (
                      <span className="text-xs text-gray-400">{escapeHtml(c.patientMrn)}</span>
                    )}
                  </td>
                  <td className="p-3 text-sm">{c.companyName ? escapeHtml(c.companyName) : '-'}</td>
                  <td className="p-3 font-mono text-xs">{c.invoiceNumber ? escapeHtml(c.invoiceNumber) : '-'}</td>
                  <td className="p-3 font-semibold">{Number(c.claimedAmount).toLocaleString()} EGP</td>
                  <td className="p-3">{Number(c.approvedAmount).toLocaleString()} EGP</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>
                      {escapeHtml(c.status)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {c.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleSubmit(c.id)}
                        >
                          <Send className="w-3 h-3 mr-1" /> {t('insClaims.submit')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenStatusModal(c)}
                      >
                        <AlertCircle className="w-3 h-3 mr-1" /> {t('insClaims.changeStatus')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page === pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      <Modal
        open={showStatusModal}
        onClose={() => { setShowStatusModal(false); setSelectedClaim(null); }}
        title={`${t('insClaims.changeStatus')} — ${selectedClaim?.claimNumber ?? ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => { setShowStatusModal(false); setSelectedClaim(null); }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleStatusChange} loading={submitting}>
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label={t('insClaims.status')}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            options={STATUS_CHANGE_OPTIONS}
            error={statusFormErrors.status}
          />
        </div>
      </Modal>
    </div>
  );
}
