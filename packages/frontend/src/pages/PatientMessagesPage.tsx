import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MessageSquare, Send, Phone } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

interface Conversation {
  patientId: string;
  patientName: string;
  patientPhone: string;
  lastMessageAt: string;
  totalMessages: number;
  unread: number;
}

interface Message {
  id: string;
  subject: string;
  body: string;
  direction: 'inbound' | 'outbound';
  senderName: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function PatientMessagesPage() {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const r = await api.get('/patient-messages/conversations/list');
      setConversations((r.data?.data ?? []) as Conversation[]);
    } catch {
      toast.error(t('messages.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMessages = useCallback(async (patientId: string) => {
    try {
      const r = await api.get(`/patient-messages/${patientId}`);
      setMessages((r.data?.data ?? []) as Message[]);
    } catch {
      toast.error(t('messages.loadError'));
      setMessages([]);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.get('/patient-messages/conversations/list');
        if (!cancelled) setConversations((r.data?.data ?? []) as Conversation[]);
      } catch {
        if (!cancelled) toast.error(t('messages.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const selectConversation = useCallback((conv: Conversation) => {
    setSelectedPatient(conv);
    void loadMessages(conv.patientId);
  }, [loadMessages]);

  const handleSend = useCallback(async () => {
    if (!selectedPatient || !newMessage.trim()) return;
    setSending(true);
    try {
      await api.post('/patient-messages/send', {
        patientId: selectedPatient.patientId,
        message: sanitizeString(newMessage),
      });
      setNewMessage('');
      await loadMessages(selectedPatient.patientId);
      await loadConversations();
      toast.success(t('messages.sendSuccess'));
    } catch {
      toast.error(t('messages.sendError'));
    } finally {
      setSending(false);
    }
  }, [selectedPatient, newMessage, loadMessages, loadConversations, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const formatTime = useCallback((dateStr: string) => {
    if (!dateStr) return '';
    return formatDateTime(dateStr);
  }, []);

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('messages.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('messages.conversationCount', { count: conversations.length })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardBody>
              <h3 className="font-semibold mb-3">{t('messages.conversations')}</h3>
              {conversations.length === 0 ? (
                <EmptyState title={t('messages.noConversations')} />
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.patientId}
                    className={`p-3 rounded-lg cursor-pointer mb-2 transition-all ${
                      selectedPatient?.patientId === c.patientId
                        ? 'bg-primary-50 ring-1 ring-primary-200'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => selectConversation(c)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') selectConversation(c); }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{sanitizeString(c.patientName)}</p>
                      {c.unread > 0 && <Badge variant="warning">{c.unread}</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">{sanitizeString(c.patientPhone)}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {c.totalMessages} {t('messages.messages')} · {t('messages.last')} {formatTime(c.lastMessageAt)}
                    </p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedPatient ? (
            <Card>
              <CardBody>
                <div className="flex items-center justify-between mb-4 pb-3 border-b">
                  <div>
                    <h3 className="font-semibold">{sanitizeString(selectedPatient.patientName)}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {sanitizeString(selectedPatient.patientPhone)}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                  {messages.length === 0 ? (
                    <EmptyState title={t('messages.noMessages')} />
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.direction === 'outbound' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-lg ${
                            m.direction === 'outbound'
                              ? 'bg-gray-100 rounded-tl-none'
                              : 'bg-primary-50 rounded-tr-none'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">
                              {m.direction === 'outbound'
                                ? (m.senderName ? sanitizeString(m.senderName) : t('messages.staff'))
                                : t('messages.patient')}
                            </span>
                            {!m.isRead && m.direction === 'outbound' && (
                              <Badge variant="warning">{t('messages.new')}</Badge>
                            )}
                          </div>
                          <p className="text-sm">{sanitizeString(m.body)}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatTime(m.createdAt)}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="flex gap-2 pt-3 border-t">
                  <div className="flex-1">
                    <Input
                      placeholder={t('messages.typePlaceholder')}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      error={!newMessage.trim() && sending ? t('messages.emptyMessage') : undefined}
                    />
                  </div>
                  <Button
                    onClick={handleSend}
                    loading={sending}
                    disabled={!newMessage.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="text-center py-16">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">{t('messages.selectConversation')}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
