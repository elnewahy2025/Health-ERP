import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  MessageSquare, Send, Plus, CheckCheck, ArrowLeft, Search,
} from 'lucide-react';
import {
  Button, Input, Modal, Badge, PageLoader, EmptyState,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { Can } from '../components/auth/Authorization';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Conversation {
  id: string;
  title: string;
  patient_id: string;
  appointment_id: string;
  is_active: boolean;
  unread_count: number;
  last_message: string;
  last_message_at: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: string;
  message_type: string;
  content: string;
  created_at: string;
  is_edited: boolean;
  is_deleted: boolean;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function ChatPage() {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  /* ── Conversations ── */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  /* ── Messages ── */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  /* ── New conversation modal ── */
  const [showNewConv, setShowNewConv] = useState(false);
  const [convForm, setConvForm] = useState({ title: '', role: 'staff' });
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantResults, setParticipantResults] = useState<Array<{ id: string; name: string; email?: string; employeeType?: string }>>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<Array<{ id: string; name: string }>>([]);
  const [participantSearching, setParticipantSearching] = useState(false);
  const [convFormErrors, setConvFormErrors] = useState<Record<string, string>>({});

  /* ── Derived ── */

  const filteredConversations = conversations.filter((c) =>
    !searchTerm || c.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeConversation = conversations.find((c) => c.id === activeConv) ?? null;

  /* ── Data fetching ── */

  const fetchConversations = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/chat/conversations', { params: { page: '1', limit: '50' } });
      setConversations((data.data ?? []) as Conversation[]);
    } catch {
      toast.error(t('chat.loadFailed'));
    }
  }, [t]);

  const fetchUnread = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/chat/unread');
      setUnreadCount((data.data?.unreadCount ?? 0) as number);
    } catch { /* non-critical */ }
  }, []);



  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchConversations(), fetchUnread()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchConversations, fetchUnread]);

  /* ── Load messages when conversation changes ── */

  useEffect(() => {
    if (!activeConv) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      setMessagesLoading(true);
      try {
        const { data } = await api.get(`/chat/conversations/${activeConv}/messages`);
        if (!cancelled) setMessages((data.data ?? []) as ChatMessage[]);
        await api.post(`/chat/conversations/${activeConv}/read`);
        if (!cancelled) {
          try {
            const { data: unreadData } = await api.get('/chat/unread');
            if (!cancelled) setUnreadCount((unreadData.data?.unreadCount ?? 0) as number);
          } catch { /* non-critical */ }
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeConv]);

  /* ── Poll for unread count ── */

  useEffect(() => {
    const interval = setInterval(() => void fetchUnread(), 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  /* ── Scroll to bottom ── */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Send message ── */

  const handleSend = useCallback(async (): Promise<void> => {
    if (!newMessage.trim() || !activeConv) return;
    setSending(true);
    try {
      const { data } = await api.post(`/chat/conversations/${activeConv}/messages`, {
        content: sanitizeString(newMessage.trim()),
        messageType: 'text',
      });
      setMessages((prev) => [...prev, (data.data ?? null) as ChatMessage]);
      setNewMessage('');
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv
            ? { ...c, last_message: newMessage.trim(), last_message_at: new Date().toISOString() }
            : c
        )
      );
    } catch {
      toast.error(t('chat.messageFailed'));
    } finally {
      setSending(false);
    }
  }, [newMessage, activeConv, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  /* ── Participant search ── */

  const handleParticipantSearch = useCallback(async (value: string): Promise<void> => {
    setParticipantSearch(value);
    const q = value.trim();
    if (!q) {
      setParticipantResults([]);
      return;
    }
    setParticipantSearching(true);
    try {
      const { data } = await api.get('/chat/participants', { params: { search: q, limit: 20 } });
      const users = ((data.data?.users ?? []) as Array<{ id: string; name: string; email?: string; employeeType?: string }>)
        .filter((u) => !selectedParticipants.some((sp) => sp.id === u.id));
      setParticipantResults(users);
    } catch { /* non-critical */ } finally {
      setParticipantSearching(false);
    }
  }, [selectedParticipants]);

  const addParticipant = useCallback((p: { id: string; name: string }) => {
    setSelectedParticipants((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setParticipantResults((prev) => prev.filter((x) => x.id !== p.id));
    setParticipantSearch('');
  }, []);

  const removeParticipant = useCallback((id: string) => {
    setSelectedParticipants((prev) => prev.filter((x) => x.id !== id));
  }, []);

  /* ── Create conversation ── */

  const handleCreateConv = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!convForm.title.trim()) errors.title = t('common.required');
    if (selectedParticipants.length === 0) errors.participantIds = t('common.required');
    setConvFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const participantIds = selectedParticipants.map((p) => p.id);
      await api.post('/chat/conversations', {
        title: sanitizeString(convForm.title),
        participantIds,
        participantRoles: participantIds.map(() => convForm.role),
      });
      toast.success(t('chat.convCreated'));
      setShowNewConv(false);
      setConvForm({ title: '', role: 'staff' });
      setSelectedParticipants([]);
      setParticipantSearch('');
      setParticipantResults([]);
      void fetchConversations();
    } catch {
      toast.error(t('chat.convCreateFailed'));
    }
  }, [convForm, selectedParticipants, t, fetchConversations]);

  /* ── Select conversation ── */

  const handleSelectConv = useCallback((convId: string): void => {
    setActiveConv(convId);
    setMobileShowChat(true);
  }, []);

  /* ── Render ── */

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <MessageSquare className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('chat.title')}</h1>
            <p className="text-sm text-gray-500">{t('chat.subtitle')}</p>
          </div>
        </div>
        <Can permission="chat.create">
          <Button onClick={() => setShowNewConv(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t('chat.newConversation')}
          </Button>
        </Can>
      </div>

      {/* Chat Layout */}
      <div className="flex h-[600px] border border-gray-200 rounded-xl overflow-hidden bg-white">
        {/* Conversations Sidebar */}
        <div className={`w-full sm:w-80 border-r border-gray-200 flex flex-col ${mobileShowChat && activeConv ? 'hidden sm:flex' : 'flex'}`}>
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('chat.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                {t('chat.noConversations')}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                  className={`w-full p-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    activeConv === conv.id ? 'bg-primary-50 border-l-2 border-l-primary-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{escapeHtml(conv.title || 'Untitled')}</p>
                    {conv.unread_count > 0 && (
                      <Badge variant="danger">{conv.unread_count}</Badge>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-xs text-gray-500 truncate mt-1">{escapeHtml(conv.last_message)}</p>
                  )}
                </button>
              ))
            )}
          </div>
          {unreadCount > 0 && (
            <div className="p-3 border-t border-gray-200 text-center">
              <span className="text-sm text-gray-500">{unreadCount} unread</span>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${!mobileShowChat || !activeConv ? 'hidden sm:flex' : 'flex'}`}>
          {activeConv ? (
            <>
              {/* Chat Header */}
              <div className="p-3 border-b border-gray-200 flex items-center gap-2">
                <button
                  className="sm:hidden p-1 rounded hover:bg-gray-100"
                  onClick={() => setMobileShowChat(false)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                  <p className="font-medium text-sm">{escapeHtml(activeConversation?.title ?? '')}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50/50">
                {messagesLoading ? (
                  <PageLoader message={t('common.loading')} />
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <p>{t('chat.noMessages')}</p>
                  </div>
                ) : (
                  messages.filter((m) => !m.is_deleted).map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_role === 'system' ? 'justify-center' : 'justify-start'}`}
                    >
                      {msg.sender_role === 'system' ? (
                        <div className="bg-gray-200 text-gray-500 text-xs px-3 py-1 rounded-full">
                          {escapeHtml(msg.content)}
                        </div>
                      ) : (
                        <div className={`max-w-[75%] ${
                          msg.message_type === 'text'
                            ? 'bg-blue-500 text-white rounded-2xl rounded-tl-sm px-4 py-2.5'
                            : ''
                        }`}>
                          {msg.message_type === 'text' ? (
                            <div>
                              <p className="text-sm whitespace-pre-wrap">{escapeHtml(msg.content)}</p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <span className="text-[10px] opacity-70">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <CheckCheck className="w-3 h-3 opacity-70" />
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-700">
                              <p className="italic">[{msg.message_type}] {escapeHtml(msg.content)}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <textarea
                      className="w-full rounded-xl border border-gray-300 p-3 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] max-h-32 text-sm"
                      placeholder={t('chat.typeMessage')}
                      rows={1}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                  <Can permission="chat.create">
                    <Button
                      onClick={() => void handleSend()}
                      disabled={sending || !newMessage.trim()}
                      size="lg"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </Can>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t('chat.pressEnter')}</p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<MessageSquare className="w-8 h-8 text-gray-400" />}
                title={t('chat.selectConversation')}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── New Conversation Modal ── */}
      <Modal
        open={showNewConv}
        onClose={() => setShowNewConv(false)}
        title={t('chat.newConvTitle')}
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowNewConv(false)}>
              {t('common.cancel')}
            </Button>
            <Can permission="chat.create">
              <Button onClick={() => void handleCreateConv()}>
                {t('chat.createConv')}
              </Button>
            </Can>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('chat.convTitle')}
            placeholder={t('chat.convTitlePlaceholder')}
            value={convForm.title}
            onChange={(e) => setConvForm((p) => ({ ...p, title: e.target.value }))}
            error={convFormErrors.title}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('chat.participantIds')}
            </label>
            <div className="relative">
              <Input
                placeholder={t('chat.participantIdsPlaceholder')}
                value={participantSearch}
                onChange={(e) => void handleParticipantSearch(e.target.value)}
                error={convFormErrors.participantIds}
              />
              {participantSearch.trim() && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {participantSearching ? (
                    <p className="p-3 text-sm text-gray-500">{t('common.loading')}</p>
                  ) : participantResults.length === 0 ? (
                    <p className="p-3 text-sm text-gray-400">{t('chat.noResults')}</p>
                  ) : (
                    participantResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2"
                        onClick={() => addParticipant({ id: u.id, name: u.name })}
                      >
                        <span className="text-sm font-medium truncate">{escapeHtml(u.name)}</span>
                        <span className="text-xs text-gray-400 capitalize truncate">
                          {escapeHtml(u.employeeType || 'staff')}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedParticipants.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedParticipants.map((sp) => (
                  <span key={sp.id} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-full px-2.5 py-1">
                    {escapeHtml(sp.name)}
                    <button type="button" onClick={() => removeParticipant(sp.id)} className="hover:text-red-500" aria-label={t('common.remove')}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('chat.participantRole')}
            </label>
            <select
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              value={convForm.role}
              onChange={(e) => setConvForm((p) => ({ ...p, role: e.target.value }))}
            >
              <option value="doctor">{t('chat.doctor')}</option>
              <option value="patient">{t('chat.patient')}</option>
              <option value="staff">{t('chat.staff')}</option>
              <option value="admin">{t('chat.admin')}</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
