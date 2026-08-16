import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { billingApi } from '../lib/api';
import type { Invoice, InvoiceItem, InvoiceStatus, PaymentMethod } from '@healthcare/shared/types';
import { Modal, Input, Select, PatientSearchField, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, Trash2, DollarSign, FileText, TrendingUp, AlertTriangle, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { sanitizeNumber } from '../lib/sanitize';
import toast from 'react-hot-toast';

interface InvoiceItemForm {
  description: string;
  code: string;
  quantity: number;
  unitPrice: number;
  type: InvoiceItem['type'];
}

interface InvoiceForm {
  patientId: string;
  items: InvoiceItemForm[];
  discount: number;
  tax: number;
  dueDate: string;
  notes: string;
}

interface FormErrors {
  patientId?: string;
  items?: string;
  dueDate?: string;
}

interface RevenueSummary {
  total_revenue: number;
  total_collected: number;
  total_pending: number;
  invoice_count: number;
  paid_count: number;
  pending_count: number;
  overdue_count: number;
  period: { start: string; end: string };
}

interface PaymentForm {
  method: PaymentMethod;
  notes: string;
}

const ITEM_TYPES: { value: InvoiceItem['type']; labelKey: string }[] = [
  { value: 'consultation', labelKey: 'billing.typeConsultation' },
  { value: 'procedure', labelKey: 'billing.typeProcedure' },
  { value: 'medication', labelKey: 'billing.typeMedication' },
  { value: 'laboratory', labelKey: 'billing.typeLaboratory' },
  { value: 'radiology', labelKey: 'billing.typeRadiology' },
  { value: 'supply', labelKey: 'billing.typeSupply' },
  { value: 'other', labelKey: 'billing.typeOther' },
];

const PAYMENT_METHODS: { value: PaymentMethod; labelKey: string }[] = [
  { value: 'cash', labelKey: 'billing.cash' },
  { value: 'card', labelKey: 'billing.card' },
  { value: 'bank_transfer', labelKey: 'billing.bankTransfer' },
  { value: 'online', labelKey: 'billing.online' },
  { value: 'insurance', labelKey: 'billing.insurance' },
  { value: 'wallet', labelKey: 'billing.wallet' },
];

function getStatusFilterOptions(t: (key: string) => string) {
  return [
    { value: '', label: t('common.all') },
    { value: 'draft', label: t('billing.statusDraft') },
    { value: 'pending', label: t('billing.statusPending') },
    { value: 'partial', label: t('billing.statusPartial') },
    { value: 'paid', label: t('billing.statusPaid') },
    { value: 'overdue', label: t('billing.statusOverdue') },
    { value: 'cancelled', label: t('billing.statusCancelled') },
  ];
}

const INITIAL_FORM: InvoiceForm = {
  patientId: '',
  items: [{ description: '', code: '', quantity: 1, unitPrice: 0, type: 'consultation' }],
  discount: 0,
  tax: 0,
  dueDate: '',
  notes: '',
};

const INITIAL_PAYMENT: PaymentForm = {
  method: 'cash',
  notes: '',
};

function createEmptyItem(): InvoiceItemForm {
  return { description: '', code: '', quantity: 1, unitPrice: 0, type: 'consultation' };
}

function calcItemTotal(item: InvoiceItemForm): number {
  return item.quantity * item.unitPrice;
}

function calcInvoiceTotal(items: InvoiceItemForm[], discount: number, tax: number): number {
  const subtotal = items.reduce((sum, item) => sum + calcItemTotal(item), 0);
  return subtotal - discount + tax;
}

function validateForm(form: InvoiceForm, t: (key: string) => string): FormErrors {
  const errors: FormErrors = {};

  if (!form.patientId) {
    errors.patientId = t('billing.selectPatientError');
  }

  const hasEmptyItem = form.items.some(
    (item) => !item.description.trim() || item.quantity <= 0 || item.unitPrice <= 0,
  );
  if (hasEmptyItem) {
    errors.items = t('billing.itemsRequired');
  }

  if (!form.dueDate) {
    errors.dueDate = t('billing.dueDateRequired');
  }

  return errors;
}

function formatEgp(amount: number): string {
  return `${Number(amount).toLocaleString('en-EG')} EGP`;
}

function getStatusVariant(status: InvoiceStatus): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  const map: Record<InvoiceStatus, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
    paid: 'success',
    pending: 'warning',
    partial: 'info',
    overdue: 'danger',
    draft: 'gray',
    cancelled: 'gray',
    refunded: 'warning',
  };
  return map[status] || 'gray';
}

function getStatusLabel(status: InvoiceStatus, t: (key: string) => string): string {
  const map: Record<InvoiceStatus, string> = {
    draft: t('billing.statusDraft'),
    pending: t('billing.statusPending'),
    partial: t('billing.statusPartial'),
    paid: t('billing.statusPaid'),
    cancelled: t('billing.statusCancelled'),
    refunded: t('billing.statusRefunded'),
    overdue: t('billing.statusOverdue'),
  };
  return map[status] || status;
}

function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-muted-txt" />;
  return direction === 'asc'
    ? <ChevronUp className="w-3 h-3 text-primary-600" />
    : <ChevronDown className="w-3 h-3 text-primary-600" />;
}

export default function BillingPage() {
  const { t } = useTranslation();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<'createdAt' | 'total' | 'due' | 'status'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);

  const [showNewModal, setShowNewModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);

  const [newInvoice, setNewInvoice] = useState<InvoiceForm>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(INITIAL_PAYMENT);





  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setRevenueLoading(true);
      try {
        const [invoiceData, revenueData] = await Promise.allSettled([
          billingApi.list({ page, limit: 10, status: statusFilter || undefined, sort: sortField, order: sortDirection }),
          billingApi.revenue(),
        ]);
        if (!cancelled) {
          if (invoiceData.status === 'fulfilled') {
            setInvoices(invoiceData.value.data);
            setPagination(invoiceData.value.pagination);
          } else {
            toast.error(t('billing.loadFailed'));
          }
          if (revenueData.status === 'fulfilled') {
            setRevenue(revenueData.value);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRevenueLoading(false);
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [page, statusFilter, sortField, sortDirection, t]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(newInvoice, t);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const items: InvoiceItem[] = newInvoice.items.map((item) => ({
        ...item,
        total: calcItemTotal(item),
      }));

      await billingApi.create({
        patientId: newInvoice.patientId,
        items,
        discount: newInvoice.discount,
        tax: newInvoice.tax,
        dueDate: newInvoice.dueDate,
        notes: newInvoice.notes || undefined,
      });
      toast.success(t('billing.createSuccess'));
      setShowNewModal(false);
      setNewInvoice(INITIAL_FORM);
      setFormErrors({});
      setPage(1);
    } catch {
      toast.error(t('billing.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;

    setSaving(true);
    try {
      await billingApi.pay(selectedInvoice.id, {
        amount: selectedInvoice.due,
        method: paymentForm.method,
        notes: paymentForm.notes || undefined,
      });
      toast.success(t('billing.paymentSuccess'));
      setShowPayModal(false);
      setSelectedInvoice(null);
      setPaymentForm(INITIAL_PAYMENT);
      setPage(1);
    } catch {
      toast.error(t('billing.paymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openPayModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm(INITIAL_PAYMENT);
    setShowPayModal(true);
  };

  const closeNewModal = () => {
    setShowNewModal(false);
    setNewInvoice(INITIAL_FORM);
    setFormErrors({});
  };

  const closePayModal = () => {
    setShowPayModal(false);
    setSelectedInvoice(null);
    setPaymentForm(INITIAL_PAYMENT);
  };

  const addItem = () => {
    setNewInvoice((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem()],
    }));
  };

  const removeItem = (index: number) => {
    setNewInvoice((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index: number, field: keyof InvoiceItemForm, value: string | number) => {
    setNewInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const newItemTypeOptions = ITEM_TYPES.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
  }));

  const paymentMethodOptions = PAYMENT_METHODS.map((m) => ({
    value: m.value,
    label: t(m.labelKey),
  }));

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const statusOptions = getStatusFilterOptions(t);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('billing.title')}</h1>
          <p className="text-muted-txt mt-1">{t('billing.invoiceCount', { count: pagination.total })}</p>
        </div>
        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowNewModal(true)}
        >
          {t('billing.new')}
        </Button>
      </div>

      {/* Revenue Summary Cards */}
      {!revenueLoading && revenue && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--info-soft)] flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-[var(--info)]" />
              </div>
              <div>
                <p className="text-xs text-muted-txt">{t('billing.totalRevenue')}</p>
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatEgp(revenue.total_revenue)}</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--success-soft)] flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-[var(--success)]" />
              </div>
              <div>
                <p className="text-xs text-muted-txt">{t('billing.collected')}</p>
                <p className="text-lg font-bold text-[var(--success)]">{formatEgp(revenue.total_collected)}</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--warning-soft)] flex items-center justify-center">
                <FileText className="w-5 h-5 text-[var(--warning)]" />
              </div>
              <div>
                <p className="text-xs text-muted-txt">{t('billing.outstanding')}</p>
                <p className="text-lg font-bold text-[var(--warning)]">{formatEgp(revenue.total_pending)}</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--error-soft)] flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
              </div>
              <div>
                <p className="text-xs text-muted-txt">{t('billing.overdueCount')}</p>
                <p className="text-lg font-bold text-[var(--error)]">{revenue.overdue_count}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          placeholder={t('common.filter')}
          className="w-48"
        />
      </div>

      {/* Invoice Table */}
      {loading ? (
        <PageLoader message={t('common.loading')} />
      ) : invoices.length === 0 ? (
        <EmptyState
          title={t('common.noData')}
          message={t('common.noData')}
          action={
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewModal(true)}>
              {t('billing.new')}
            </Button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-[var(--surface-hover)] select-none"
                    onClick={() => toggleSort('createdAt')}
                  >
                    <span className="flex items-center gap-1">
                      {t('billing.invoiceNumber')} <SortIndicator active={sortField === "createdAt"} direction={sortDirection} />
                    </span>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('billing.patient')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-[var(--surface-hover)] select-none"
                    onClick={() => toggleSort('total')}
                  >
                    <span className="flex items-center gap-1">
                      {t('billing.total')} <SortIndicator active={sortField === "total"} direction={sortDirection} />
                    </span>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('billing.paid')}
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-[var(--surface-hover)] select-none"
                    onClick={() => toggleSort('due')}
                  >
                    <span className="flex items-center gap-1">
                      {t('billing.due')} <SortIndicator active={sortField === "due"} direction={sortDirection} />
                    </span>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-[var(--surface-hover)] select-none"
                    onClick={() => toggleSort('status')}
                  >
                    <span className="flex items-center gap-1">
                      {t('common.status')} <SortIndicator active={sortField === "status"} direction={sortDirection} />
                    </span>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text-primary)]">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-txt">
                      {invoice.patientName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)] font-medium">
                      {formatEgp(invoice.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--success)]">
                      {formatEgp(invoice.paid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--error)] font-medium">
                      {formatEgp(invoice.due)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusVariant(invoice.status)}>
                        {getStatusLabel(invoice.status, t)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {invoice.due > 0 && invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<DollarSign className="w-3 h-3" />}
                          onClick={() => openPayModal(invoice)}
                        >
                          {t('billing.pay')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-line bg-[var(--surface-secondary)]">
              <p className="text-sm text-gray-500">
                {t('common.pageOf', { current: page, total: pagination.totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {t('common.start')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  {t('common.complete')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Invoice Modal */}
      <Modal
        open={showNewModal}
        onClose={closeNewModal}
        title={t('billing.newInvoice')}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={closeNewModal}>
              {t('common.cancel')}
            </Button>
            <Button loading={saving} onClick={() => {
              const form = document.getElementById('invoice-form') as HTMLFormElement 
              if (form) form.requestSubmit();
            }}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <form id="invoice-form" onSubmit={handleCreateInvoice} className="space-y-6">
          <PatientSearchField
            value={newInvoice.patientId}
            onChange={(patientId) => {
              setNewInvoice((prev) => ({ ...prev, patientId }));
              setFormErrors((prev) => ({ ...prev, patientId: undefined }));
            }}
            error={formErrors.patientId}
            required
          />

          {/* Invoice Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-secondary-txt">{t('billing.items')}</h3>
              <Button variant="ghost" size="sm" type="button" icon={<Plus className="w-3 h-3" />} onClick={addItem}>
                {t('billing.addItem')}
              </Button>
            </div>
            {formErrors.items && (
              <p className="text-xs text-red-600 mb-2">{formErrors.items}</p>
            )}
            <div className="space-y-3">
              {newInvoice.items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 p-3 bg-[var(--surface-secondary)] rounded-lg">
                  <div className="flex-1">
                    <Input
                      placeholder={t('billing.description')}
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      placeholder={t('billing.code')}
                      value={item.code}
                      onChange={(e) => updateItem(idx, 'code', e.target.value)}
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      placeholder={t('billing.quantity')}
                      value={item.quantity}
                      min="1"
                      onChange={(e) => updateItem(idx, 'quantity', sanitizeNumber(e.target.value))}
                      required
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('billing.unitPrice')}
                      value={item.unitPrice}
                      min="0"
                      onChange={(e) => updateItem(idx, 'unitPrice', sanitizeNumber(e.target.value))}
                      required
                    />
                  </div>
                  <div className="w-32">
                    <Select
                      options={newItemTypeOptions}
                      value={item.type}
                      onChange={(e) => updateItem(idx, 'type', e.target.value as InvoiceItem['type'])}
                    />
                  </div>
                  <div className="w-20 text-sm font-medium pt-2 text-right text-secondary-txt">
                    {formatEgp(calcItemTotal(item))}
                  </div>
                  {newInvoice.items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label={t('billing.removeItem')}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              type="number"
              step="0.01"
              label={t('billing.discount')}
              value={newInvoice.discount}
              min="0"
              onChange={(e) => setNewInvoice((prev) => ({ ...prev, discount: sanitizeNumber(e.target.value) }))}
            />
            <Input
              type="number"
              step="0.01"
              label={t('billing.tax')}
              value={newInvoice.tax}
              min="0"
              onChange={(e) => setNewInvoice((prev) => ({ ...prev, tax: sanitizeNumber(e.target.value) }))}
            />
            <Input
              type="date"
              label={t('billing.dueDate')}
              value={newInvoice.dueDate}
              onChange={(e) => {
                setNewInvoice((prev) => ({ ...prev, dueDate: e.target.value }));
                setFormErrors((prev) => ({ ...prev, dueDate: undefined }));
              }}
              error={formErrors.dueDate}
              required
            />
          </div>

          <div className="text-right text-lg font-bold text-[var(--text-primary)]">
            {t('billing.totalEgp', { amount: calcInvoiceTotal(newInvoice.items, newInvoice.discount, newInvoice.tax).toLocaleString('en-EG') })}
          </div>

          <Input
            label={t('billing.notes')}
            value={newInvoice.notes}
            onChange={(e) => setNewInvoice((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={showPayModal}
        onClose={closePayModal}
        title={t('billing.recordPayment')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closePayModal}>
              {t('common.cancel')}
            </Button>
            <Button loading={saving} onClick={handleRecordPayment}>
              {t('billing.pay')} {selectedInvoice ? formatEgp(selectedInvoice.due) : ''}
            </Button>
          </>
        }
      >
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="bg-[var(--surface-secondary)] rounded-lg p-4">
              <p className="text-sm text-muted-txt">
                {t('billing.invoiceNumber')}: {selectedInvoice.invoiceNumber}
              </p>
              <p className="text-sm text-muted-txt">
                {t('billing.patient')}: {selectedInvoice.patientName}
              </p>
              <p className="text-lg font-bold mt-2 text-[var(--text-primary)]">
                {t('billing.amountDue')}: {formatEgp(selectedInvoice.due)}
              </p>
            </div>

            <Select
              label={t('billing.paymentMethod')}
              options={paymentMethodOptions}
              value={paymentForm.method}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value as PaymentMethod }))}
            />

            <Input
              label={t('billing.notes')}
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
