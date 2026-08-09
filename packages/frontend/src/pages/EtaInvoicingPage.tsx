import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileText, Send, Eye, QrCode, AlertTriangle, XCircle } from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, Table, PageLoader,
  Modal,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { formatDate } from '../lib/format';

/* ── Types ─────────────────────────────────────────────────────────── */

interface EtaInvoice {
  id: string;
  eta_uuid: string;
  eta_invoice_number: string;
  invoice_id: string;
  document_type: string;
  status: string;
  qr_code_data: string;
  submitted_at: string;
  approved_at: string;
  created_at: string;
  error_message: string;
  rejection_reason: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
  approved: 'success',
  submitted: 'info',
  rejected: 'danger',
  draft: 'gray',
  cancelled: 'warning',
};

const DOC_TYPE_MAP: Record<string, string> = { I: 'eta.invoice', C: 'eta.creditNote', D: 'eta.debitNote' };

/* ── Component ─────────────────────────────────────────────────────── */

export default function EtaInvoicingPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);

  /* ── Data ── */
  const [invoices, setInvoices] = useState<EtaInvoice[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<EtaInvoice | null>(null);

  /* ── Generate form ── */
  const [invoiceIdInput, setInvoiceIdInput] = useState('');
  const [generating, setGenerating] = useState(false);

  /* ── Data fetching ── */

  const fetchInvoices = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/eta/invoices', { params });
      setInvoices((data.data ?? []) as EtaInvoice[]);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch {
      toast.error(t('eta.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, t]);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      await fetchInvoices();
      if (cancelled) setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [fetchInvoices]);

  /* ── Generate handler ── */

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!invoiceIdInput.trim()) {
      toast.error(t('eta.invoiceIdRequired'));
      return;
    }
    setGenerating(true);
    try {
      await api.post('/eta/invoices/generate', { invoiceId: invoiceIdInput.trim() });
      toast.success(t('eta.generated'));
      setInvoiceIdInput('');
      void fetchInvoices();
    } catch {
      toast.error(t('eta.generateFailed'));
    } finally {
      setGenerating(false);
    }
  }, [invoiceIdInput, t, fetchInvoices]);

  /* ── Submit handler ── */

  const handleSubmit = useCallback(async (id: string): Promise<void> => {
    try {
      await api.post(`/eta/invoices/${id}/submit`);
      toast.success(t('eta.submitSuccess'));
      void fetchInvoices();
    } catch {
      toast.error(t('eta.submitFailed'));
    }
  }, [t, fetchInvoices]);

  /* ── Table columns ── */

  const columns: Column<EtaInvoice>[] = [
    {
      key: 'eta_uuid',
      header: t('eta.etaUuid'),
      render: (item) => (
        <span className="text-xs font-mono">{escapeHtml(item.eta_uuid || '—')}</span>
      ),
    },
    {
      key: 'eta_invoice_number',
      header: t('eta.etaNumber'),
      render: (item) => <span>{escapeHtml(item.eta_invoice_number || '—')}</span>,
    },
    {
      key: 'document_type',
      header: t('eta.type'),
      render: (item) => (
        <span className="capitalize">{t(DOC_TYPE_MAP[item.document_type] ?? 'eta.invoice')}</span>
      ),
    },
    {
      key: 'status',
      header: t('eta.status'),
      render: (item) => (
        <Badge variant={STATUS_VARIANTS[item.status] ?? 'gray'}>
          {t(`eta.${item.status}`) || item.status}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('eta.created'),
      render: (item) => (
        <span className="text-sm text-gray-500">
          {formatDate(item.created_at)}
        </span>
      ),
    },
    {
      key: 'id',
      header: t('eta.actions'),
      render: (item) => (
        <div className="flex gap-2">
          <button
            onClick={() => setSelected(item)}
            className="p-1 rounded hover:bg-gray-100"
            aria-label={t('eta.details')}
          >
            <Eye className="w-4 h-4 text-gray-500" />
          </button>
          {item.status === 'draft' && (
            <button
              onClick={() => void handleSubmit(item.id)}
              className="p-1 rounded hover:bg-green-100"
              aria-label={t('eta.submit')}
            >
              <Send className="w-4 h-4 text-green-600" />
            </button>
          )}
        </div>
      ),
    },
  ];

  /* ── Stats ── */

  const stats = ['draft', 'submitted', 'approved', 'rejected', 'cancelled'].map((s) => ({
    label: s,
    count: invoices.filter((i) => i.status === s).length,
  }));

  /* ── Render ── */

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <FileText className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('eta.title')}</h1>
          <p className="text-sm text-gray-500">{t('eta.subtitle')}</p>
        </div>
      </div>

      {/* Generate Card */}
      <Card>
        <CardBody className="p-4">
          <h3 className="font-semibold text-gray-900 mb-3">{t('eta.generateInvoice')}</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label={t('eta.invoiceId')}
                placeholder={t('eta.invoiceIdPlaceholder')}
                value={invoiceIdInput}
                onChange={(e) => setInvoiceIdInput(e.target.value)}
              />
            </div>
            <Button
              onClick={() => void handleGenerate()}
              disabled={generating || !invoiceIdInput.trim()}
            >
              <QrCode className="w-4 h-4 mr-1" />
              {generating ? t('eta.generating') : t('eta.generate')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody className="p-4 text-center">
              <p className="text-xs text-gray-500 capitalize mb-1">{t(`eta.${s.label}`) || s.label}</p>
              <p className="text-2xl font-bold text-gray-900">{s.count}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <Select
        label={t('eta.status')}
        value={statusFilter}
        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        options={[
          { value: '', label: t('eta.allStatuses') },
          { value: 'draft', label: t('eta.draft') },
          { value: 'submitted', label: t('eta.submitted') },
          { value: 'approved', label: t('eta.approved') },
          { value: 'rejected', label: t('eta.rejected') },
        ]}
      />

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          <Table<EtaInvoice>
            columns={columns}
            data={invoices}
            loading={false}
            emptyMessage={t('eta.noInvoices')}
          />
        </CardBody>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            {t('eta.prev')}
          </Button>
          <span className="text-sm text-gray-500">
            {t('eta.pageOf', { current: String(page), total: String(totalPages) } as Record<string, unknown>)}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            {t('eta.next')}
          </Button>
        </div>
      )}

      {/* ── Detail Modal ── */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t('eta.details')}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-sm text-gray-500">{t('eta.etaUuid')}</p>
                <p className="font-mono text-sm">{escapeHtml(selected.eta_uuid || t('eta.notSubmitted'))}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('eta.etaNumber')}</p>
                <p className="font-medium">{escapeHtml(selected.eta_invoice_number || '—')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('eta.status')}</p>
                <Badge variant={STATUS_VARIANTS[selected.status] ?? 'gray'}>
                  {t(`eta.${selected.status}`) || selected.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">{t('eta.type')}</p>
                <p className="capitalize">{t(DOC_TYPE_MAP[selected.document_type] ?? 'eta.invoice')}</p>
              </div>
            </div>
            {selected.qr_code_data && (
              <div>
                <p className="text-sm text-gray-500 mb-2">{t('eta.qrCodeData')}</p>
                <div className="bg-gray-50 p-3 rounded-lg text-xs font-mono break-all">
                  {escapeHtml(selected.qr_code_data)}
                </div>
              </div>
            )}
            {selected.error_message && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <p className="text-sm text-red-700">{escapeHtml(selected.error_message)}</p>
              </div>
            )}
            {selected.rejection_reason && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
                <XCircle className="w-5 h-5 text-yellow-600 shrink-0" />
                <p className="text-sm text-yellow-700">{escapeHtml(selected.rejection_reason)}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
