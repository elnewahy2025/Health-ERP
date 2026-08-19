import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { billingApi, paymentApi, egyptPaymentApi } from '../lib/api';
import type { Invoice, InvoiceItem, InvoiceStatus, PaymentMethod } from '@healthcare/shared/types';
import type { ProviderPaymentTransaction } from '../lib/api/billing';
import type { ManualInstapayReconciliation } from '../lib/api/payment';
import { Modal, Input, Select, PatientSearchField, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, Trash2, DollarSign, FileText, TrendingUp, AlertTriangle, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { sanitizeNumber } from '../lib/sanitize';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';
import { formatClinicMoney, useClinicConfiguration } from '../stores/clinicConfigurationStore';
import { getProviderErrorInfo } from '../lib/provider-errors';

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
  const { identity } = useClinicConfiguration();
  const formatMoney = (amount: number | string | null | undefined) => formatClinicMoney(
    amount,
    identity?.currency,
    identity?.locale,
  );

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
  const [providerAction, setProviderAction] = useState<'stripe' | 'fawry' | 'instapay' | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [fawryPhone, setFawryPhone] = useState('');
  const [fawryEmail, setFawryEmail] = useState('');
  const [providerPayments, setProviderPayments] = useState<ProviderPaymentTransaction[]>([]);
  const [providerPaymentsLoading, setProviderPaymentsLoading] = useState(false);
  const [manualReconciliations, setManualReconciliations] = useState<ManualInstapayReconciliation[]>([]);
  const [manualReconciliationsLoading, setManualReconciliationsLoading] = useState(false);
  const [manualDecisionAction, setManualDecisionAction] = useState<'reconcile' | 'reject' | null>(null);
  const [manualExternalReference, setManualExternalReference] = useState('');
  const [manualReceivedAmount, setManualReceivedAmount] = useState(0);
  const [manualTransferDate, setManualTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualDecisionNotes, setManualDecisionNotes] = useState('');

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

  const handleStripePayment = async () => {
    if (!selectedInvoice) return;
    setProviderAction('stripe');
    setProviderNotice(null);
    try {
      const result = await paymentApi.createStripeSession(selectedInvoice.id, selectedInvoice.due, identity?.currency);
      if (!result?.redirectUrl) {
        const message = t('billing.providerPaymentFailed');
        setProviderNotice(message);
        toast.error(message);
        return;
      }
      window.location.assign(result.redirectUrl);
    } catch (error: unknown) {
      const providerError = getProviderErrorInfo(error);
      const message = providerError?.kind === 'not_ready' || providerError?.kind === 'disabled'
        ? t('billing.providerSetupRequired')
        : providerError?.kind === 'unsupported_operation'
          ? t('billing.providerUnsupported')
          : t('billing.providerPaymentFailed');
      setProviderNotice(message);
      toast.error(message);
    } finally {
      setProviderAction(null);
    }
  };

  const handleFawryPayment = async () => {
    if (!selectedInvoice) return;
    if (!selectedInvoice.patientName?.trim() || !fawryPhone.trim() || !fawryEmail.trim()) {
      const message = t('billing.fawryContactRequired');
      setProviderNotice(message);
      toast.error(message);
      return;
    }
    setProviderAction('fawry');
    setProviderNotice(null);
    try {
      const result = await egyptPaymentApi.fawry(
        selectedInvoice.id,
        selectedInvoice.due,
        fawryPhone.trim(),
        selectedInvoice.patientName.trim(),
        fawryEmail.trim() || undefined,
      );
      if (result?.referenceNumber) {
        const message = t('billing.fawryPaymentInitiated', { reference: result.referenceNumber });
        setProviderNotice(message);
        toast.success(message);
        void refreshProviderPayments(selectedInvoice.id);
      } else {
        const message = t('billing.providerPaymentFailed');
        setProviderNotice(message);
        toast.error(message);
      }
    } catch (error: unknown) {
      const providerError = getProviderErrorInfo(error);
      const message = providerError?.kind === 'not_ready' || providerError?.kind === 'disabled'
        ? t('billing.providerSetupRequired')
        : providerError?.kind === 'unsupported_operation'
          ? t('billing.providerUnsupported')
          : t('billing.providerPaymentFailed');
      setProviderNotice(message);
      toast.error(message);
    } finally {
      setProviderAction(null);
    }
  };

  const refreshProviderPayments = async (invoiceId: string) => {
    setProviderPaymentsLoading(true);
    try {
      setProviderPayments(await billingApi.providerPayments(invoiceId));
    } catch {
      setProviderPayments([]);
    } finally {
      setProviderPaymentsLoading(false);
    }
  };

  const refreshManualReconciliations = async (invoiceId: string) => {
    setManualReconciliationsLoading(true);
    try {
      setManualReconciliations(await egyptPaymentApi.instapayHistory(invoiceId));
    } catch {
      setManualReconciliations([]);
    } finally {
      setManualReconciliationsLoading(false);
    }
  };

  const handleManualInstapayRequest = async () => {
    if (!selectedInvoice) return;
    setProviderAction('instapay');
    setProviderNotice(null);
    try {
      const result = await egyptPaymentApi.instapay(selectedInvoice.id, selectedInvoice.due);
      const message = t('billing.instapayManualCreated', { reference: result.localReference });
      setProviderNotice(message);
      toast.success(message);
      await refreshManualReconciliations(selectedInvoice.id);
    } catch (error: unknown) {
      const providerError = getProviderErrorInfo(error);
      const message = providerError?.kind === 'disabled' || providerError?.kind === 'not_ready'
        ? t('billing.instapayManualSetupRequired')
        : t('billing.instapayManualFailed');
      setProviderNotice(message);
      toast.error(message);
    } finally {
      setProviderAction(null);
    }
  };

  const handleManualReconcile = async (reconciliation: ManualInstapayReconciliation) => {
    if (!selectedInvoice) return;
    if (!manualExternalReference.trim() || !manualDecisionNotes.trim() || manualReceivedAmount <= 0) {
      const message = t('billing.instapayManualVerificationRequired');
      setProviderNotice(message);
      toast.error(message);
      return;
    }
    setManualDecisionAction('reconcile');
    try {
      await egyptPaymentApi.reconcileInstapay(reconciliation.id, {
        externalReference: manualExternalReference.trim(),
        receivedAmount: manualReceivedAmount,
        transferDate: manualTransferDate,
        decisionNotes: manualDecisionNotes.trim(),
      });
      const updatedInvoice = await billingApi.get(selectedInvoice.id);
      setInvoices((current) => current.map((invoice) => invoice.id === updatedInvoice.id ? updatedInvoice : invoice));
      await refreshManualReconciliations(selectedInvoice.id);
      setProviderNotice(t('billing.instapayManualReconciled'));
      setManualExternalReference('');
      setManualDecisionNotes('');
      toast.success(t('billing.instapayManualReconciled'));
    } catch {
      setProviderNotice(t('billing.instapayManualFailed'));
      toast.error(t('billing.instapayManualFailed'));
    } finally {
      setManualDecisionAction(null);
    }
  };

  const handleManualReject = async (reconciliation: ManualInstapayReconciliation) => {
    if (!selectedInvoice) return;
    if (!manualDecisionNotes.trim()) {
      const message = t('billing.instapayManualRejectionRequired');
      setProviderNotice(message);
      toast.error(message);
      return;
    }
    setManualDecisionAction('reject');
    try {
      await egyptPaymentApi.rejectInstapay(reconciliation.id, manualDecisionNotes.trim());
      await refreshManualReconciliations(selectedInvoice.id);
      setManualDecisionNotes('');
      setProviderNotice(t('billing.instapayManualRejected'));
      toast.success(t('billing.instapayManualRejected'));
    } catch {
      setProviderNotice(t('billing.instapayManualFailed'));
      toast.error(t('billing.instapayManualFailed'));
    } finally {
      setManualDecisionAction(null);
    }
  };

  const openPayModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm(INITIAL_PAYMENT);
    setProviderNotice(null);
    setFawryPhone(invoice.patientPhone || '');
    setFawryEmail(invoice.patientEmail || '');
    setProviderPayments([]);
    setManualReconciliations([]);
    setManualExternalReference('');
    setManualReceivedAmount(invoice.due);
    setManualTransferDate(new Date().toISOString().slice(0, 10));
    setManualDecisionNotes('');
    setShowPayModal(true);
    void refreshProviderPayments(invoice.id);
    void refreshManualReconciliations(invoice.id);
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
    setProviderAction(null);
    setManualDecisionAction(null);
    setProviderNotice(null);
    setFawryPhone('');
    setFawryEmail('');
    setProviderPayments([]);
    setProviderPaymentsLoading(false);
    setManualReconciliations([]);
    setManualReconciliationsLoading(false);
    setManualExternalReference('');
    setManualReceivedAmount(0);
    setManualTransferDate(new Date().toISOString().slice(0, 10));
    setManualDecisionNotes('');
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
        <Can permission="billing.create">
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowNewModal(true)}
          >
            {t('billing.new')}
          </Button>
        </Can>
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
                <p className="text-lg font-bold text-[var(--text-primary)]">{formatMoney(revenue.total_revenue)}</p>
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
                <p className="text-lg font-bold text-[var(--success)]">{formatMoney(revenue.total_collected)}</p>
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
                <p className="text-lg font-bold text-[var(--warning)]">{formatMoney(revenue.total_pending)}</p>
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
            <Can permission="billing.create">
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewModal(true)}>
                {t('billing.new')}
              </Button>
            </Can>
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
                      {formatMoney(invoice.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--success)]">
                      {formatMoney(invoice.paid)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--error)] font-medium">
                      {formatMoney(invoice.due)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusVariant(invoice.status)}>
                        {getStatusLabel(invoice.status, t)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Can permission="billing.approve">
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
                      </Can>
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
            <Can permission="billing.create">
              <Button loading={saving} onClick={() => {
                const form = document.getElementById('invoice-form') as HTMLFormElement;
                if (form) form.requestSubmit();
              }}>
                {t('common.create')}
              </Button>
            </Can>
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
                    {formatMoney(calcItemTotal(item))}
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
            {t('billing.totalAmount', { amount: formatMoney(calcInvoiceTotal(newInvoice.items, newInvoice.discount, newInvoice.tax)) })}
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
            <Can permission="billing.approve">
              <Button loading={saving} onClick={handleRecordPayment}>
                {t('billing.pay')} {selectedInvoice ? formatMoney(selectedInvoice.due) : ''}
              </Button>
            </Can>
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
                {t('billing.amountDue')}: {formatMoney(selectedInvoice.due)}
              </p>
            </div>

            {providerNotice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
                {providerNotice}
              </div>
            )}

            <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
              <div>
                <p className="font-medium text-[var(--text-primary)]">{t('billing.externalPayment')}</p>
                <p className="text-xs text-muted-txt">{t('billing.externalPaymentDescription')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Can permission="billing.create">
                  <Button variant="secondary" loading={providerAction === 'stripe'} disabled={providerAction !== null} onClick={() => void handleStripePayment()}>
                    {t('billing.payWithStripe')}
                  </Button>
                  <Button variant="secondary" loading={providerAction === 'fawry'} disabled={providerAction !== null} onClick={() => void handleFawryPayment()}>
                    {t('billing.payWithFawry')}
                  </Button>
                </Can>
              </div>
              <Input
                label={t('billing.fawryPhone')}
                value={fawryPhone}
                onChange={(e) => setFawryPhone(e.target.value)}
                placeholder={t('billing.fawryPhonePlaceholder')}
              />
              <Input
                label={t('billing.fawryEmailRequired')}
                value={fawryEmail}
                onChange={(e) => setFawryEmail(e.target.value)}
                placeholder={t('billing.fawryEmailPlaceholder')}
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
              <div>
                <p className="font-medium text-amber-900">{t('billing.instapayManualTitle')}</p>
                <p className="text-xs text-amber-800">{t('billing.instapayManualDescription')}</p>
              </div>
              <Can permission="billing.create">
                <Button variant="secondary" loading={providerAction === 'instapay'} disabled={providerAction !== null} onClick={() => void handleManualInstapayRequest()}>
                  {t('billing.instapayManualCreate')}
                </Button>
              </Can>
              {manualReconciliationsLoading ? (
                <p className="text-xs text-amber-800">{t('common.loading')}</p>
              ) : manualReconciliations.length === 0 ? (
                <p className="text-xs text-amber-800">{t('billing.instapayManualNoRequests')}</p>
              ) : (
                manualReconciliations.map((reconciliation) => {
                  const statusLabel = reconciliation.status === 'awaiting_transfer'
                    ? t('billing.instapayManualAwaiting')
                    : reconciliation.status === 'reconciled'
                      ? t('billing.instapayManualReconciledStatus')
                      : t('billing.instapayManualRejectedStatus');
                  return (
                    <div key={reconciliation.id} className="rounded-lg border border-amber-200 bg-white p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-[var(--text-primary)]">{reconciliation.localReference}</span>
                        <Badge variant={reconciliation.status === 'reconciled' ? 'success' : reconciliation.status === 'rejected' ? 'danger' : 'warning'}>{statusLabel}</Badge>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{t('billing.instapayManualDestination', { wallet: reconciliation.walletIdentifier, account: reconciliation.accountName, currency: reconciliation.currency })}</p>
                      <p className="whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{reconciliation.instructions}</p>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{t('billing.instapayManualAmount', { amount: formatMoney(reconciliation.requestedAmount) })}</p>
                      {reconciliation.externalReference && <p className="text-xs text-[var(--text-secondary)]">{t('billing.instapayManualExternalReference', { reference: reconciliation.externalReference })}</p>}
                      {reconciliation.status === 'awaiting_transfer' && (
                        <Can permission="billing.verify">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-amber-100 pt-3">
                            <Input label={t('billing.instapayManualExternalReferenceLabel')} value={manualExternalReference} onChange={(event) => setManualExternalReference(event.target.value)} />
                            <Input type="number" step="0.01" label={t('billing.instapayManualReceivedAmount')} value={manualReceivedAmount} min="0" onChange={(event) => setManualReceivedAmount(sanitizeNumber(event.target.value))} />
                            <Input type="date" label={t('billing.instapayManualTransferDate')} value={manualTransferDate} onChange={(event) => setManualTransferDate(event.target.value)} />
                            <Input label={t('billing.instapayManualDecisionNotes')} value={manualDecisionNotes} onChange={(event) => setManualDecisionNotes(event.target.value)} />
                            <div className="flex flex-wrap gap-2 sm:col-span-2">
                              <Button size="sm" loading={manualDecisionAction === 'reconcile'} disabled={manualDecisionAction !== null} onClick={() => void handleManualReconcile(reconciliation)}>{t('billing.instapayManualReconcile')}</Button>
                              <Button size="sm" variant="secondary" loading={manualDecisionAction === 'reject'} disabled={manualDecisionAction !== null} onClick={() => void handleManualReject(reconciliation)}>{t('billing.instapayManualReject')}</Button>
                            </div>
                          </div>
                        </Can>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
              <p className="font-medium text-[var(--text-primary)]">{t('billing.providerPaymentHistory')}</p>
              {providerPaymentsLoading ? (
                <p className="text-xs text-muted-txt">{t('common.loading')}</p>
              ) : providerPayments.length === 0 ? (
                <p className="text-xs text-muted-txt">{t('billing.noProviderPayments')}</p>
              ) : (
                providerPayments.map((payment) => {
                  const statusVariant = payment.status === 'completed'
                    ? 'success'
                    : payment.status === 'failed'
                      ? 'danger'
                      : payment.status === 'pending'
                        ? 'warning'
                        : 'gray';
                  const statusLabel = payment.status === 'completed'
                    ? t('billing.providerStatusCompleted')
                    : payment.status === 'failed'
                      ? t('billing.providerStatusFailed')
                      : payment.status === 'pending'
                        ? t('billing.providerStatusPending')
                        : payment.status;
                  return (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-[var(--text-primary)]">
                        {payment.providerKey.toUpperCase()} · {payment.reference || '—'}
                      </span>
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                  );
                })
              )}
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
