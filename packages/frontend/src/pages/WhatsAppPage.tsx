import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MessageCircle, Send, BarChart3, Plus } from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Modal, Badge, Table,
  PageLoader, EmptyState,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { isValidEgyptianPhone } from '../lib/validators';
import { formatDateTime } from '../lib/format';

/* ── Types ─────────────────────────────────────────────────────────── */

type WhatsAppTab = 'messages' | 'send' | 'templates' | 'stats';

interface WhatsAppMessage {
  id: string;
  to_number: string;
  message: string;
  template_name: string;
  message_type: string;
  status: string;
  direction: string;
  created_at: string;
}

interface WhatsAppStats {
  total: number;
  today: number;
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ message_type: string; count: number }>;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  body_text: string;
  language: string;
  status: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
  received: 'warning',
};

/* ── Component ─────────────────────────────────────────────────────── */

export default function WhatsAppPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WhatsAppTab>('messages');
  const [loading, setLoading] = useState(true);

  /* ── Messages ── */
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);

  /* ── Stats ── */
  const [stats, setStats] = useState<WhatsAppStats | null>(null);

  /* ── Templates ── */
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  /* ── Send form ── */
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({
    to: '',
    message: '',
    templateName: '',
    templateParams: '',
    messageType: 'text',
  });
  const [sendLoading, setSendLoading] = useState(false);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});

  /* ── Data fetching ── */

  const fetchMessages = useCallback(async (): Promise<void> => {
    try {
      const params: Record<string, string | number> = { page: String(page), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/whatsapp/messages', { params });
      setMessages((data.data ?? []) as WhatsAppMessage[]);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch {
      toast.error(t('whatsapp.loadFailed'));
    }
  }, [page, statusFilter, t]);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/whatsapp/stats');
      setStats((data.data ?? null) as WhatsAppStats | null);
    } catch { /* non-critical */ }
  }, []);

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/whatsapp/templates');
      setTemplates((data.data ?? []) as WhatsAppTemplate[]);
    } catch { /* non-critical */ }
  }, []);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchMessages(), fetchStats(), fetchTemplates()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchMessages, fetchStats, fetchTemplates]);

  /* ── Tab data loading ── */

  useEffect(() => {
    let cancelled = false;
    const loadTab = async (): Promise<void> => {
      if (tab === 'messages') {
        try {
          const params: Record<string, string | number> = { page: String(page), limit: '20' };
          if (statusFilter) params.status = statusFilter;
          const { data } = await api.get('/whatsapp/messages', { params });
          if (!cancelled) {
            setMessages((data.data ?? []) as WhatsAppMessage[]);
            setTotalPages(data.pagination?.totalPages ?? 1);
          }
        } catch { if (!cancelled) toast.error(t('whatsapp.loadFailed')); }
      }
      if (tab === 'stats') {
        try {
          const { data } = await api.get('/whatsapp/stats');
          if (!cancelled) setStats((data.data ?? null) as WhatsAppStats | null);
        } catch { /* non-critical */ }
      }
      if (tab === 'templates') {
        try {
          const { data } = await api.get('/whatsapp/templates');
          if (!cancelled) setTemplates((data.data ?? []) as WhatsAppTemplate[]);
        } catch { /* non-critical */ }
      }
    };
    void loadTab();
    return () => { cancelled = true; };
  }, [tab, page, statusFilter, t]);

  /* ── Send message ── */

  const handleSend = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!sendForm.to.trim()) errors.to = t('common.required');
    else if (!isValidEgyptianPhone(sendForm.to)) errors.to = 'Invalid phone number';
    if (sendForm.messageType === 'text' && !sendForm.message.trim()) errors.message = t('common.required');
    if (sendForm.messageType === 'template' && !sendForm.templateName.trim()) errors.templateName = t('common.required');
    setSendErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSendLoading(true);
    try {
      const payload: Record<string, unknown> = {
        to: sendForm.to.trim(),
        messageType: sendForm.messageType,
      };
      if (sendForm.messageType === 'template') {
        payload.templateName = sendForm.templateName.trim();
        payload.templateParams = ['en', ...sendForm.templateParams.split(',').map((s) => s.trim()).filter(Boolean)];
      } else {
        payload.message = sanitizeString(sendForm.message);
      }
      await api.post('/whatsapp/send', payload);
      toast.success(t('whatsapp.messageSent'));
      setShowSendModal(false);
      setSendForm({ to: '', message: '', templateName: '', templateParams: '', messageType: 'text' });
      void fetchMessages();
    } catch {
      toast.error(t('whatsapp.messageFailed'));
    } finally {
      setSendLoading(false);
    }
  }, [sendForm, t, fetchMessages]);

  /* ── Table columns ── */

  const messageColumns: Column<WhatsAppMessage>[] = [
    {
      key: 'to_number',
      header: t('whatsapp.toLabel'),
      render: (item) => <span className="font-mono text-sm">{escapeHtml(item.to_number)}</span>,
    },
    {
      key: 'message_type',
      header: t('whatsapp.type'),
      render: (item) => <Badge>{item.message_type}</Badge>,
    },
    {
      key: 'message',
      header: t('whatsapp.message'),
      render: (item) => (
        <span className="truncate max-w-[200px] block text-sm text-gray-600">
          {escapeHtml(item.message || item.template_name || '-')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('whatsapp.status'),
      render: (item) => (
        <Badge variant={STATUS_VARIANTS[item.status] ?? 'gray'}>{item.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('whatsapp.date'),
      render: (item) => <span className="text-sm">{formatDateTime(item.created_at) || '-'}</span>,
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: WhatsAppTab; icon: React.ReactNode; label: string }> = [
    { key: 'messages', icon: <MessageCircle className="w-4 h-4" />, label: t('whatsapp.messagesTab') },
    { key: 'send', icon: <Send className="w-4 h-4" />, label: t('whatsapp.sendTab') },
    { key: 'templates', icon: <Plus className="w-4 h-4" />, label: t('whatsapp.templatesTab') },
    { key: 'stats', icon: <BarChart3 className="w-4 h-4" />, label: t('whatsapp.statsTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('whatsapp.title')}</h1>
            <p className="text-sm text-gray-500">{t('whatsapp.subtitle')}</p>
          </div>
        </div>
        <Button onClick={() => setShowSendModal(true)}>
          <Send className="w-4 h-4 mr-1" />
          {t('whatsapp.newMessage')}
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
          {/* ── MESSAGES TAB ── */}
          {tab === 'messages' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Select
                  label={t('whatsapp.status')}
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  options={[
                    { value: '', label: t('whatsapp.filterAll') },
                    { value: 'sent', label: t('whatsapp.filterSent') },
                    { value: 'delivered', label: t('whatsapp.filterDelivered') },
                    { value: 'read', label: t('whatsapp.filterRead') },
                    { value: 'failed', label: t('whatsapp.filterFailed') },
                  ]}
                />
              </div>
              <Card>
                <CardBody className="p-0">
                  <Table<WhatsAppMessage>
                    columns={messageColumns}
                    data={messages}
                    loading={false}
                    emptyMessage={t('whatsapp.noMessages')}
                    onRowClick={(item) => setSelectedMessage(item)}
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
                    {t('whatsapp.prev')}
                  </Button>
                  <span className="text-sm text-gray-500">
                    {t('whatsapp.pageOf', { current: String(page), total: String(totalPages) } as Record<string, unknown>)}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    {t('whatsapp.next')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── SEND TAB ── */}
          {tab === 'send' && (
            <Card>
              <CardBody className="p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{t('whatsapp.sendMessage')}</h3>
                <div className="space-y-4 max-w-lg">
                  <Input
                    label={t('whatsapp.to')}
                    placeholder={t('whatsapp.toPlaceholder')}
                    value={sendForm.to}
                    onChange={(e) => setSendForm((p) => ({ ...p, to: e.target.value }))}
                    error={sendErrors.to}
                  />
                  <Select
                    label={t('whatsapp.messageType')}
                    value={sendForm.messageType}
                    onChange={(e) => setSendForm((p) => ({ ...p, messageType: e.target.value }))}
                    options={[
                      { value: 'text', label: t('whatsapp.textMessage') },
                      { value: 'template', label: t('whatsapp.templateMessage') },
                    ]}
                  />
                  {sendForm.messageType === 'text' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {t('whatsapp.message')}
                      </label>
                      <textarea
                        className="w-full rounded-lg border border-gray-300 p-3 h-32 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                        placeholder={t('whatsapp.messagePlaceholder')}
                        value={sendForm.message}
                        onChange={(e) => setSendForm((p) => ({ ...p, message: e.target.value }))}
                      />
                      {sendErrors.message && <p className="text-xs text-red-600 mt-1">{sendErrors.message}</p>}
                    </div>
                  ) : (
                    <>
                      <Input
                        label={t('whatsapp.templateName')}
                        placeholder={t('whatsapp.templateNamePlaceholder')}
                        value={sendForm.templateName}
                        onChange={(e) => setSendForm((p) => ({ ...p, templateName: e.target.value }))}
                        error={sendErrors.templateName}
                      />
                      <Input
                        label={t('whatsapp.templateParams')}
                        placeholder={t('whatsapp.templateParamsPlaceholder')}
                        value={sendForm.templateParams}
                        onChange={(e) => setSendForm((p) => ({ ...p, templateParams: e.target.value }))}
                      />
                    </>
                  )}
                  <Button onClick={() => void handleSend()} disabled={sendLoading}>
                    <Send className="w-4 h-4 mr-1" />
                    {sendLoading ? t('whatsapp.sending') : t('whatsapp.sendMessage')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* ── TEMPLATES TAB ── */}
          {tab === 'templates' && (
            <Card>
              <CardBody className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">{t('whatsapp.templatesTab')}</h3>
                {templates.length === 0 ? (
                  <EmptyState
                    icon={<MessageCircle className="w-8 h-8 text-gray-400" />}
                    title={t('whatsapp.noTemplates')}
                    message={t('whatsapp.createTemplates')}
                  />
                ) : (
                  <div className="space-y-3">
                    {templates.map((tmpl) => (
                      <div key={tmpl.id} className="p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{escapeHtml(tmpl.name)}</p>
                            <p className="text-sm text-gray-500">{escapeHtml(tmpl.body_text)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge>{tmpl.category}</Badge>
                            <Badge>{tmpl.language}</Badge>
                            <Badge variant={tmpl.status === 'approved' ? 'success' : 'warning'}>
                              {tmpl.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* ── STATS TAB ── */}
          {tab === 'stats' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardBody className="p-5 text-center">
                  <p className="text-3xl font-bold text-gray-900">{stats?.total ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Total Messages</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="p-5 text-center">
                  <p className="text-3xl font-bold text-green-600">{stats?.today ?? 0}</p>
                  <p className="text-sm text-gray-500 mt-1">Today</p>
                </CardBody>
              </Card>
              {stats?.byStatus?.map((s) => (
                <Card key={s.status}>
                  <CardBody className="p-5 text-center">
                    <Badge variant={STATUS_VARIANTS[s.status] ?? 'gray'}>{s.status}</Badge>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{s.count}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Send Modal ── */}
      <Modal
        open={showSendModal}
        onClose={() => setShowSendModal(false)}
        title={t('whatsapp.sendMessage')}
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowSendModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSend()} loading={sendLoading} disabled={sendLoading}>
              {t('whatsapp.sendMessage')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('whatsapp.to')}
            placeholder={t('whatsapp.toPlaceholder')}
            value={sendForm.to}
            onChange={(e) => setSendForm((p) => ({ ...p, to: e.target.value }))}
            error={sendErrors.to}
          />
          <Select
            label={t('whatsapp.messageType')}
            value={sendForm.messageType}
            onChange={(e) => setSendForm((p) => ({ ...p, messageType: e.target.value }))}
            options={[
              { value: 'text', label: t('whatsapp.textMessage') },
              { value: 'template', label: t('whatsapp.templateMessage') },
            ]}
          />
          {sendForm.messageType === 'text' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('whatsapp.message')}
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 p-3 h-32 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                placeholder={t('whatsapp.messagePlaceholder')}
                value={sendForm.message}
                onChange={(e) => setSendForm((p) => ({ ...p, message: e.target.value }))}
              />
              {sendErrors.message && <p className="text-xs text-red-600 mt-1">{sendErrors.message}</p>}
            </div>
          ) : (
            <>
              <Input
                label={t('whatsapp.templateName')}
                placeholder={t('whatsapp.templateNamePlaceholder')}
                value={sendForm.templateName}
                onChange={(e) => setSendForm((p) => ({ ...p, templateName: e.target.value }))}
                error={sendErrors.templateName}
              />
              <Input
                label={t('whatsapp.templateParams')}
                placeholder={t('whatsapp.templateParamsPlaceholder')}
                value={sendForm.templateParams}
                onChange={(e) => setSendForm((p) => ({ ...p, templateParams: e.target.value }))}
              />
            </>
          )}
        </div>
      </Modal>

      {/* ── Message Detail Modal ── */}
      <Modal
        open={!!selectedMessage}
        onClose={() => setSelectedMessage(null)}
        title={t('whatsapp.messageDetails')}
      >
        {selectedMessage && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('whatsapp.direction')}</span>
              <span>{escapeHtml(selectedMessage.direction)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('whatsapp.toLabel')}</span>
              <span className="font-mono">{escapeHtml(selectedMessage.to_number)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('whatsapp.type')}</span>
              <Badge>{selectedMessage.message_type}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('whatsapp.status')}</span>
              <Badge variant={STATUS_VARIANTS[selectedMessage.status] ?? 'gray'}>
                {selectedMessage.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('whatsapp.date')}</span>
              <span>{escapeHtml(new Date(selectedMessage.created_at).toLocaleString())}</span>
            </div>
            {selectedMessage.message && (
              <div>
                <p className="text-gray-500 mb-1">{t('whatsapp.message')}</p>
                <p className="bg-gray-50 p-3 rounded-lg">{escapeHtml(selectedMessage.message)}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
