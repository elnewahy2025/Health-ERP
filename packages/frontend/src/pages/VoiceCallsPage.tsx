import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  PhoneCall, Phone, Clock, BarChart3, Plus,
} from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Modal, Badge, Table,
  PageLoader,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { isValidEgyptianPhone } from '../lib/validators';
import { formatDateTime } from '../lib/format';
import { buildPhoneDeviceLink, confirmAndOpenDeviceLink } from '../lib/device-actions';

/* ── Types ─────────────────────────────────────────────────────────── */

type VoiceTab = 'calls' | 'make' | 'stats';

interface VoiceCall {
  id: string;
  from_number: string;
  to_number: string;
  call_type: string;
  status: string;
  duration_seconds: number;
  ringing_seconds: number;
  notes: string;
  created_at: string;
  completed_at: string;
  patient_id: string;
}

interface VoiceStats {
  total: number;
  today: number;
  totalMinutes: number;
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ call_type: string; count: number }>;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
  completed: 'success',
  answered: 'info',
  ringing: 'warning',
  initiated: 'gray',
  failed: 'danger',
  busy: 'warning',
  'no-answer': 'info',
};

/* ── Helpers ───────────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function VoiceCallsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<VoiceTab>('calls');
  const [loading, setLoading] = useState(true);

  /* ── Calls ── */
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCall, setSelectedCall] = useState<VoiceCall | null>(null);

  /* ── Stats ── */
  const [stats, setStats] = useState<VoiceStats | null>(null);

  /* ── Make call ── */
  const [callForm, setCallForm] = useState({ toNumber: '' });
  const [callErrors, setCallErrors] = useState<Record<string, string>>({});
  const [callLoading, setCallLoading] = useState(false);

  /* ── Data fetching ── */

  const fetchCalls = useCallback(async (): Promise<void> => {
    try {
      const params: Record<string, string | number> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/voice/calls', { params });
      setCalls((data.data ?? []) as VoiceCall[]);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch {
      toast.error(t('voice.loadFailed'));
    }
  }, [page, statusFilter, t]);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/voice/stats');
      setStats((data.data ?? null) as VoiceStats | null);
    } catch { /* non-critical */ }
  }, []);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchCalls(), fetchStats()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchCalls, fetchStats]);

  /* ── Tab data loading ── */

  useEffect(() => {
    if (tab !== 'calls' && tab !== 'stats') return;
    let cancelled = false;
    const loadTab = async (): Promise<void> => {
      if (tab === 'calls') {
        try {
          const params: Record<string, string | number> = { page: String(page), limit: '20' };
          if (statusFilter) params.status = statusFilter;
          const { data } = await api.get('/voice/calls', { params });
          if (!cancelled) {
            setCalls((data.data ?? []) as VoiceCall[]);
            setTotalPages(data.pagination?.totalPages ?? 1);
          }
        } catch { if (!cancelled) toast.error(t('voice.loadFailed')); }
      }
      if (tab === 'stats') {
        try {
          const { data } = await api.get('/voice/stats');
          if (!cancelled) setStats((data.data ?? null) as VoiceStats | null);
        } catch { /* non-critical */ }
      }
    };
    void loadTab();
    return () => { cancelled = true; };
  }, [tab, page, statusFilter, t]);

  /* ── Make call handler ── */

  const handleCall = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!callForm.toNumber.trim()) errors.toNumber = t('common.required');
    else if (!isValidEgyptianPhone(callForm.toNumber)) errors.toNumber = 'Invalid phone number';
    setCallErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCallLoading(true);
    try {
      const opened = confirmAndOpenDeviceLink(
        buildPhoneDeviceLink(callForm.toNumber.trim()),
        t('voice.confirmOpenApp'),
      );
      if (!opened) return;
      toast.success(t('voice.appOpened'));
      setCallForm({ toNumber: '' });
    } catch {
      toast.error(t('voice.callFailed'));
    } finally {
      setCallLoading(false);
    }
  }, [callForm, t]);

  /* ── Table columns ── */

  const callColumns: Column<VoiceCall>[] = [
    {
      key: 'from_number',
      header: t('voice.fromNumber'),
      render: (item) => <span className="font-mono text-sm">{escapeHtml(item.from_number)}</span>,
    },
    {
      key: 'to_number',
      header: t('voice.toNumberLabel'),
      render: (item) => <span className="font-mono text-sm">{escapeHtml(item.to_number)}</span>,
    },
    {
      key: 'call_type',
      header: t('voice.type'),
      render: (item) => <Badge>{item.call_type}</Badge>,
    },
    {
      key: 'duration_seconds',
      header: t('voice.duration'),
      render: (item) => (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-gray-400" />
          {formatDuration(item.duration_seconds)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('voice.status'),
      render: (item) => (
        <Badge variant={STATUS_VARIANTS[item.status] ?? 'gray'}>{item.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('voice.date'),
      render: (item) => <span className="text-sm">{formatDateTime(item.created_at) || '-'}</span>,
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: VoiceTab; icon: React.ReactNode; label: string }> = [
    { key: 'calls', icon: <PhoneCall className="w-4 h-4" />, label: t('voice.callsTab') },
    { key: 'make', icon: <Plus className="w-4 h-4" />, label: t('voice.makeTab') },
    { key: 'stats', icon: <BarChart3 className="w-4 h-4" />, label: t('voice.statsTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <PhoneCall className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('voice.title')}</h1>
            <p className="text-sm text-gray-500">{t('voice.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setTab('make')}>
            <Phone className="w-4 h-4 mr-1" />
            {t('voice.makeCall')}
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          {/* ── CALLS TAB ── */}
          {tab === 'calls' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Select
                  label={t('voice.status')}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  options={[
                    { value: '', label: t('voice.filterAll') },
                    { value: 'completed', label: t('voice.filterCompleted') },
                    { value: 'failed', label: t('voice.filterFailed') },
                    { value: 'ringing', label: t('voice.filterRinging') },
                  ]}
                />
              </div>
              <Card>
                <CardBody className="p-0">
                  <Table<VoiceCall>
                    columns={callColumns}
                    data={calls}
                    loading={false}
                    emptyMessage={t('voice.loadFailed')}
                    onRowClick={(item) => setSelectedCall(item)}
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
                    {t('voice.prev')}
                  </Button>
                  <span className="text-sm text-gray-500">
                    {t('voice.pageOf', { current: String(page), total: String(totalPages) } as Record<string, unknown>)}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    {t('voice.next')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── MAKE CALL TAB ── */}
          {tab === 'make' && (
            <Card>
              <CardBody className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{t('voice.makeCall')}</h3>
                <div className="space-y-4 max-w-lg">
                  <Input
                    label={t('voice.toNumber')}
                    placeholder={t('voice.toNumberPlaceholder')}
                    value={callForm.toNumber}
                    onChange={(e) => setCallForm((p) => ({ ...p, toNumber: e.target.value }))}
                    error={callErrors.toNumber}
                  />
                  <Button onClick={() => void handleCall()} disabled={callLoading}>
                    <Phone className="w-4 h-4 mr-1" />
                    {callLoading ? t('voice.calling') : t('voice.makeCall')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ── STATS TAB ── */}
          {tab === 'stats' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardBody className="p-5 text-center">
                  <p className="text-3xl font-bold text-gray-900">{stats?.total ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('voice.totalCalls')}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="p-5 text-center">
                  <p className="text-3xl font-bold text-green-600">{stats?.today ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('voice.callsToday')}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="p-5 text-center">
                  <p className="text-3xl font-bold text-blue-600">{stats?.totalMinutes ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">{t('voice.totalMinutes')}</p>
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── Call Detail Modal ── */}
      <Modal
        open={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        title={t('voice.callDetails')}
      >
        {selectedCall && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('voice.type')}</span>
              <span className="capitalize">{escapeHtml(selectedCall.call_type)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('voice.fromNumber')}</span>
              <span className="font-mono">{escapeHtml(selectedCall.from_number)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('voice.toNumberLabel')}</span>
              <span className="font-mono">{escapeHtml(selectedCall.to_number)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('voice.duration')}</span>
              <span>{formatDuration(selectedCall.duration_seconds)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('voice.status')}</span>
              <Badge variant={STATUS_VARIANTS[selectedCall.status] ?? 'gray'}>
                {selectedCall.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('voice.date')}</span>
              <span>{escapeHtml(new Date(selectedCall.created_at).toLocaleString())}</span>
            </div>
            {selectedCall.notes && (
              <div>
                <p className="text-gray-500 mb-1">{t('voice.notesLabel')}</p>
                <p className="bg-gray-50 p-3 rounded-lg">{escapeHtml(selectedCall.notes)}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
