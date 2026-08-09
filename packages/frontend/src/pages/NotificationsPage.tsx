import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/ui';
import { apiClient as api } from '../lib/api';
import { Bell, CheckCheck, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTime } from '../lib/format';

interface Notification {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  status: string;
  referenceType: string | null;
  referenceId: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showReadModal, setShowReadModal] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  useEffect(() => {
    api.get('/notifications').then(r => setNotifs(r.data.data)).catch(() => toast.error('Failed to load notifications')).finally(() => setLoading(false));
  }, []);

  const markRead = useCallback(async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionLoading(id);
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n));
      toast.success('Marked as read');
    } catch {
      toast.error('Failed to mark as read');
    } finally {
      setActionLoading(null);
    }
  }, []);

  const openNotif = useCallback((n: Notification) => {
    setSelectedNotif(n);
    setShowReadModal(true);
    if (n.status === 'pending') markRead(n.id);
  }, [markRead]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const unread = notifs.filter(n => n.status === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('notif.title')}</h1>
          <p className="text-gray-500 mt-1">{unread} {t('notif.unread')} {t('notif.of')} {notifs.length} {t('notif.total')}</p>
        </div>
        {unread > 0 && (
          <button onClick={async () => {
            try {
              await Promise.all(notifs.filter(n => n.status === 'pending').map(n => api.put(`/notifications/${n.id}/read`)));
              setNotifs(prev => prev.map(n => ({ ...n, status: 'read' })));
              toast.success('All marked as read');
            } catch { toast.error('Failed to mark all as read'); }
          }} className="btn-secondary btn-sm">
            <CheckCircle2 className="w-4 h-4" />{t('notif.markAllRead')}
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-body">
          {notifs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{t('notif.noNotifs')}</p>
          ) : (
            <div className="space-y-2">
              {notifs.map(n => (
                <div key={n.id} onClick={() => openNotif(n)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    n.status === 'pending' ? 'bg-blue-50 hover:bg-blue-100' : 'bg-gray-50 hover:bg-gray-100'
                  }`}>
                  <Bell className={`w-5 h-5 shrink-0 ${n.status === 'pending' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.status === 'pending' ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {n.subject || t('notif.notification')}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {n.channel} — {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                  {n.status === 'pending' && (
                    <button onClick={(e) => markRead(n.id, e)} disabled={actionLoading === n.id}
                      className="btn-ghost btn-sm text-blue-600 shrink-0">
                      {actionLoading === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                      {t('notif.markRead')}
                    </button>
                  )}
                  <span className={`badge shrink-0 ${n.status === 'pending' ? 'badge-warning' : 'badge-gray'}`}>{n.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showReadModal} onClose={() => setShowReadModal(false)} title={selectedNotif?.subject || t('notif.notification')} size="md"
        footer={<button onClick={() => setShowReadModal(false)} className="btn-secondary">{t('common.close')}</button>}>
        {selectedNotif && (
          <div className="space-y-4">
            <div className="flex gap-2 text-sm text-gray-500">
              <span className="badge-info">{selectedNotif.channel}</span>
              <span className={`badge ${selectedNotif.status === 'pending' ? 'badge-warning' : 'badge-success'}`}>{selectedNotif.status}</span>
            </div>
            {selectedNotif.body && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedNotif.body}</p>
            )}
            <p className="text-xs text-gray-400">
              {formatDateTime(selectedNotif.createdAt)}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
