import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Send, Mail, MessageSquare, Phone, BarChart3, History } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input, Select,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { getProviderErrorInfo } from '../lib/provider-errors';
import { formatDateTime } from '../lib/format';

type CommsTab = 'send' | 'history' | 'stats';

interface NotificationTemplate {
  id: string;
  code: string;
  key?: string;
  channel: string;
  locale: string;
  subject: string | null;
  body: string;
  is_active: boolean;
}

interface NotificationLog {
  id: string;
  channel: string;
  recipient: string;
  template_key: string;
  subject: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface PaginatedLogs {
  data: NotificationLog[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  total?: number;
}

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="w-3 h-3" />,
  sms: <MessageSquare className="w-3 h-3" />,
  whatsapp: <Phone className="w-3 h-3" />,
};

export default function CommunicationsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CommsTab>('send');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [templatesR, logsR] = await Promise.allSettled([
        api.get('/notification-templates'),
        api.get('/notification-logs', { params: { page: 1, limit: 20 } }),
      ]);
      if (templatesR.status === 'fulfilled') {
        setTemplates((templatesR.value.data?.data ?? []) as NotificationTemplate[]);
      }
      if (logsR.status === 'fulfilled') {
        const body = logsR.value.data as PaginatedLogs | undefined;
        if (body) {
          setLogs(body.data ?? []);
          setLogsTotal(body.pagination?.total ?? body.total ?? 0);
        }
      }
    } catch {
      toast.error(t('comms.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [templatesR, logsR] = await Promise.allSettled([
          api.get('/notification-templates'),
          api.get('/notification-logs', { params: { page: 1, limit: 20 } }),
        ]);
        if (cancelled) return;
        if (templatesR.status === 'fulfilled') {
          setTemplates((templatesR.value.data?.data ?? []) as NotificationTemplate[]);
        }
        if (logsR.status === 'fulfilled') {
          const body = logsR.value.data as PaginatedLogs | undefined;
          if (body) {
            setLogs(body.data ?? []);
            setLogsTotal(body.pagination?.total ?? body.total ?? 0);
          }
        }
      } catch {
        if (!cancelled) toast.error(t('comms.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const loadLogsPage = useCallback(async (page: number) => {
    try {
      const r = await api.get('/notification-logs', { params: { page, limit: 20 } });
      const body = r.data as PaginatedLogs | undefined;
      if (body) {
        setLogs(body.data ?? []);
        setLogsTotal(body.pagination?.total ?? body.total ?? 0);
        setLogsPage(page);
      }
    } catch {
      toast.error(t('comms.loadError'));
    }
  }, [t]);

  const validateRecipient = useCallback((value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    return emailRegex.test(value) || phoneRegex.test(value.replace(/\s/g, ''));
  }, []);

  const handleSendTest = useCallback(async () => {
    if (!selectedTemplateId || !recipient.trim()) {
      if (!recipient.trim()) setRecipientError(t('comms.recipientPlaceholder'));
      return;
    }
    if (!validateRecipient(recipient)) {
      setRecipientError(t('comms.recipientPlaceholder'));
      return;
    }
    setRecipientError('');
    setProviderNotice(null);
    setSending(true);
    setSentMessage('');
    try {
      const r = await api.post(`/notification-templates/${selectedTemplateId}/test`, {
        recipient: sanitizeString(recipient),
      });
      const result = r.data?.data as { sent?: boolean; message?: string } | undefined;
      const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
      if (result?.sent) {
        setSentMessage(t('comms.sent'));
        toast.success(t('comms.sendSuccess'));
      } else if (selectedTemplate?.channel === 'sms') {
        const message = t('comms.smsProviderSetupRequired');
        setProviderNotice(message);
        setSentMessage(t('comms.sendFailed'));
        toast.error(message);
      } else {
        setSentMessage(t('comms.sendFailed'));
        toast.error(t('comms.sendError'));
      }
      await loadData();
    } catch (error: unknown) {
      const providerError = getProviderErrorInfo(error);
      if (providerError?.kind === 'not_ready' || providerError?.kind === 'disabled' || providerError?.kind === 'unsupported_operation') {
        const message = t('comms.smsProviderSetupRequired');
        setProviderNotice(message);
        toast.error(message);
      } else {
        toast.error(t('comms.sendError'));
      }
      setSentMessage(t('comms.sendFailed'));
    } finally {
      setSending(false);
    }
  }, [selectedTemplateId, recipient, templates, validateRecipient, t, loadData]);

  const templateOptions = templates.map((tpl) => ({
    value: tpl.id,
    label: `${sanitizeString((tpl.code || tpl.key || '').replace(/_/g, ' '))} (${tpl.channel})`,
  }));

  if (loading) return <PageLoader message={t('common.loading')} />;

  const totalPages = Math.ceil(logsTotal / 20);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('comms.title')}</h1>
          <p className="text-gray-500 mt-1">{t('comms.totalMessages', { count: logsTotal })}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'send' ? 'primary' : 'secondary'} onClick={() => setTab('send')}>
          <Send className="w-4 h-4" /> {t('comms.templates')}
        </Button>
        <Button variant={tab === 'history' ? 'primary' : 'secondary'} onClick={() => setTab('history')}>
          <History className="w-4 h-4" /> {t('comms.history')} ({logsTotal})
        </Button>
        <Button variant={tab === 'stats' ? 'primary' : 'secondary'} onClick={() => setTab('stats')}>
          <BarChart3 className="w-4 h-4" /> {t('comms.stats')}
        </Button>
      </div>

      {tab === 'send' && (
        <div className="max-w-lg mx-auto">
          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold mb-4">{t('comms.sendCommunication')}</h2>
              {providerNotice && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
                  {providerNotice}
                </div>
              )}
              <div className="space-y-4">
                <Select
                  label={t('comms.template')}
                  options={templateOptions.length > 0 ? templateOptions : [{ value: '', label: t('comms.noTemplates') }]}
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  placeholder={t('comms.chooseTemplate')}
                />
                <Input
                  label={t('comms.recipient')}
                  placeholder={t('comms.recipientPlaceholder')}
                  value={recipient}
                  onChange={(e) => { setRecipient(e.target.value); setRecipientError(''); }}
                  error={recipientError}
                />
                {sentMessage ? (
                  <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{sentMessage}</div>
                ) : (
                  <Button
                    className="w-full"
                    onClick={handleSendTest}
                    loading={sending}
                    disabled={!selectedTemplateId || !recipient.trim()}
                  >
                    <Send className="w-4 h-4" /> {t('comms.testSend')}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('comms.subject')}</th>
                  <th>{t('comms.channel')}</th>
                  <th>{t('comms.recipientLabel')}</th>
                  <th>{t('comms.status')}</th>
                  <th>{t('comms.sentAt')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title={t('comms.noHistory')} />
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="font-medium text-sm max-w-xs truncate">
                        {sanitizeString(log.subject ?? log.template_key)}
                      </td>
                      <td>
                        <span className="flex items-center gap-1">
                          {channelIcons[log.channel] ?? null}
                          {sanitizeString(log.channel)}
                        </span>
                      </td>
                      <td className="text-xs">{sanitizeString(log.recipient)}</td>
                      <td>
                        <Badge variant={log.status === 'sent' ? 'success' : log.status === 'failed' ? 'danger' : 'warning'}>
                          {sanitizeString(log.status)}
                        </Badge>
                      </td>
                      <td className="text-xs">
                        {formatDateTime(log.sent_at || log.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadLogsPage(logsPage - 1)}
                disabled={logsPage <= 1}
              >
                {t('comms.prev')}
              </Button>
              <span className="text-sm text-gray-500">{t('comms.page', { page: logsPage })}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadLogsPage(logsPage + 1)}
                disabled={logsPage >= totalPages}
              >
                {t('comms.next')}
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('comms.totalCount')}</p>
                <p className="text-2xl font-bold">{logsTotal}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('comms.templates')}</p>
                <p className="text-2xl font-bold">{templates.length}</p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardBody>
              <h3 className="font-semibold mb-3">{t('comms.byChannel')}</h3>
              <div className="flex gap-3 flex-wrap">
                {['email', 'sms', 'whatsapp'].map((ch) => {
                  const count = logs.filter((l) => l.channel === ch).length;
                  return (
                    <div key={ch} className="flex items-center gap-2">
                      <Badge>{ch}</Badge>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardBody>
              <h3 className="font-semibold mb-3">{t('comms.byStatus')}</h3>
              <div className="flex gap-3 flex-wrap">
                {['sent', 'failed', 'pending'].map((st) => {
                  const count = logs.filter((l) => l.status === st).length;
                  return (
                    <div key={st} className="flex items-center gap-2">
                      <Badge variant={st === 'sent' ? 'success' : st === 'failed' ? 'danger' : 'warning'}>
                        {st}
                      </Badge>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
