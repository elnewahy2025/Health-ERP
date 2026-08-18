import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Receipt, Plus, Wallet } from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, Table,
  PageLoader,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

/* ── Types ─────────────────────────────────────────────────────────── */

type ExpenseTab = 'list' | 'add' | 'stats';

interface Expense {
  id: string;
  title: string;
  amount: number;
  category_name: string;
  category_code: string;
  expense_date: string;
  status: string;
  payment_method: string;
  vendor_name: string;
  expense_number: string;
  description: string;
  created_at: string;
}

interface ExpenseStats {
  totalExpenses: number;
  pendingCount: number;
  byCategory: Array<{ total: number }>;
  byMonth: Array<{ month: string; total: number }>;
}

interface Category {
  id: string;
  name: string;
  code: string;
  type: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
  paid: 'success',
  approved: 'info',
  pending: 'warning',
  rejected: 'danger',
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'expense.cash' },
  { value: 'bank', label: 'expense.bankTransfer' },
  { value: 'credit', label: 'expense.creditCard' },
] as const;

/* ── Component ─────────────────────────────────────────────────────── */

export default function ExpenseTrackingPage() {
  const { t } = useTranslation();
  const formatMoney = useClinicMoney();
  const [tab, setTab] = useState<ExpenseTab>('list');
  const [loading, setLoading] = useState(true);

  /* ── Data ── */
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<ExpenseStats | null>(null);

  /* ── Pagination ── */
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  /* ── Filters ── */
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  /* ── Form ── */
  const [form, setForm] = useState({
    title: '', amount: '', categoryId: '', expenseDate: '',
    description: '', paymentMethod: 'cash', vendorName: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /* ── Data fetching ── */

  const fetchExpenses = useCallback(async (): Promise<void> => {
    try {
      const params: Record<string, string | number> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (catFilter) params.categoryId = catFilter;
      const { data } = await api.get('/expenses', { params });
      setExpenses((data.data ?? []) as Expense[]);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch {
      toast.error(t('expense.loadFailed'));
    }
  }, [page, statusFilter, catFilter, t]);

  const fetchCategories = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/expense-categories');
      setCategories((data.data ?? []) as Category[]);
    } catch { /* non-critical */ }
  }, []);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/expenses/stats');
      setStats((data.data ?? null) as ExpenseStats | null);
    } catch { /* non-critical */ }
  }, []);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchExpenses(), fetchCategories(), fetchStats()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchExpenses, fetchCategories, fetchStats]);

  /* ── Tab data loading ── */

  useEffect(() => {
    if (tab !== 'stats') return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const { data } = await api.get('/expenses/stats');
        if (!cancelled) setStats((data.data ?? null) as ExpenseStats | null);
      } catch { /* non-critical */ }
    };
    void load();
    return () => { cancelled = true; };
  }, [tab]);

  /* ── Submit handler ── */

  const handleSubmit = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!form.title.trim()) errors.title = t('common.required');
    if (!form.amount || Number(form.amount) <= 0) errors.amount = t('common.required');
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await api.post('/expenses', {
        title: sanitizeString(form.title),
        amount: Number(form.amount),
        categoryId: form.categoryId || null,
        expenseDate: form.expenseDate || undefined,
        description: sanitizeString(form.description) || undefined,
        paymentMethod: form.paymentMethod,
        vendorName: sanitizeString(form.vendorName) || undefined,
      });
      toast.success(t('expense.expenseRecorded'));
      setForm({ title: '', amount: '', categoryId: '', expenseDate: '', description: '', paymentMethod: 'cash', vendorName: '' });
      setTab('list');
      void fetchExpenses();
    } catch {
      toast.error(t('expense.recordFailed'));
    } finally {
      setSaving(false);
    }
  }, [form, t, fetchExpenses]);

  /* ── Table columns ── */

  const expenseColumns: Column<Expense>[] = [
    {
      key: 'expense_number',
      header: '#',
      render: (item) => <span className="text-xs text-gray-400">{escapeHtml(item.expense_number)}</span>,
    },
    {
      key: 'title',
      header: t('expense.titleField'),
      render: (item) => <span className="font-medium">{escapeHtml(item.title)}</span>,
    },
    {
      key: 'category_name',
      header: t('expense.category'),
      render: (item) => <span>{escapeHtml(item.category_name || '-')}</span>,
    },
    {
      key: 'amount',
      header: t('expense.amount'),
      render: (item) => <span className="font-semibold">{formatMoney(item.amount)}</span>,
    },
    {
      key: 'expense_date',
      header: t('expense.date'),
      render: (item) => <span className="text-sm text-gray-500">{escapeHtml(item.expense_date)}</span>,
    },
    {
      key: 'status',
      header: t('expense.listTab'),
      render: (item) => (
        <Badge variant={STATUS_VARIANTS[item.status] ?? 'gray'}>{t(`expense.${item.status}`) || item.status}</Badge>
      ),
    },
    {
      key: 'vendor_name',
      header: t('expense.vendorName'),
      render: (item) => <span className="text-sm text-gray-500">{escapeHtml(item.vendor_name || '-')}</span>,
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: ExpenseTab; icon: React.ReactNode; label: string }> = [
    { key: 'list', icon: <Receipt className="w-4 h-4" />, label: t('expense.listTab') },
    { key: 'add', icon: <Plus className="w-4 h-4" />, label: t('expense.addTab') },
    { key: 'stats', icon: <Wallet className="w-4 h-4" />, label: t('expense.statsTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Wallet className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('expense.title')}</h1>
            <p className="text-sm text-gray-500">{t('expense.subtitle')}</p>
          </div>
        </div>
        <Button onClick={() => setTab('add')}>
          <Plus className="w-4 h-4 mr-1" />
          {t('expense.newExpense')}
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tabItem.key
                ? 'bg-orange-600 text-white shadow-sm'
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
          {/* ── EXPENSES LIST ── */}
          {tab === 'list' && (
            <div className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <Select
                  label={t('expense.listTab')}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  options={[
                    { value: '', label: t('expense.allStatuses') },
                    { value: 'pending', label: t('expense.pending') },
                    { value: 'approved', label: t('expense.approved') },
                    { value: 'paid', label: t('expense.paid') },
                  ]}
                />
                <Select
                  label={t('expense.category')}
                  value={catFilter}
                  onChange={(e) => { setCatFilter(e.target.value); setPage(1); }}
                  options={[
                    { value: '', label: t('expense.allCategories') },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
              </div>
              <Card>
                <CardBody className="p-0">
                  <Table<Expense>
                    columns={expenseColumns}
                    data={expenses}
                    loading={false}
                    emptyMessage={t('expense.noExpenses')}
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
                    {t('expense.prev')}
                  </Button>
                  <span className="text-sm text-gray-500">
                    {t('expense.pageOf', { current: String(page), total: String(totalPages) } as Record<string, unknown>)}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    {t('expense.next')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── ADD EXPENSE ── */}
          {tab === 'add' && (
            <Card>
              <CardBody className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{t('expense.recordExpense')}</h3>
                <div className="space-y-4 max-w-lg">
                  <Input
                    label={t('expense.titleField')}
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    error={formErrors.title}
                  />
                  <Input
                    label={t('expense.amount')}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    error={formErrors.amount}
                  />
                  <Select
                    label={t('expense.category')}
                    value={form.categoryId}
                    onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
                    options={[
                      { value: '', label: t('expense.selectCategory') },
                      ...categories.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                  <Input
                    label={t('expense.date')}
                    type="date"
                    value={form.expenseDate}
                    onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))}
                  />
                  <Input
                    label={t('expense.vendorName')}
                    value={form.vendorName}
                    onChange={(e) => setForm((p) => ({ ...p, vendorName: e.target.value }))}
                  />
                  <Select
                    label={t('expense.paymentMethod')}
                    value={form.paymentMethod}
                    onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                    options={PAYMENT_METHODS.map((opt) => ({ value: opt.value, label: t(opt.label) }))}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('expense.description')}
                    </label>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg p-3 h-24 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder={t('expense.descriptionPlaceholder')}
                    />
                  </div>
                  <Button onClick={() => void handleSubmit()} disabled={saving}>
                    <Plus className="w-4 h-4 mr-1" />
                    {saving ? t('expense.recording') : t('expense.recordExpense')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ── STATS TAB ── */}
          {tab === 'stats' && stats && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardBody className="p-5 text-center">
                    <p className="text-sm text-gray-500">{t('expense.totalExpenses')}</p>
                    <p className="text-3xl font-bold text-orange-600">
                      {formatMoney(stats.totalExpenses)}
                    </p>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody className="p-5 text-center">
                    <p className="text-sm text-gray-500">{t('expense.pendingCount')}</p>
                    <p className="text-3xl font-bold text-yellow-600">{stats.pendingCount}</p>
                  </CardBody>
                </Card>
                <Card>
                  <CardBody className="p-5 text-center">
                    <p className="text-sm text-gray-500">{t('expense.categoriesCount')}</p>
                    <p className="text-3xl font-bold text-blue-600">{stats.byCategory?.length || 0}</p>
                  </CardBody>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
