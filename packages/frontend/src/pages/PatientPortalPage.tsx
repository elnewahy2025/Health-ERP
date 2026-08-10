import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  UserRound, MessageSquare, RefreshCw, Check, X, Copy, ExternalLink, Send,
} from 'lucide-react';
import { PageLoader, EmptyState, Card, CardBody, Button, Badge, Input } from '../components/ui';
import { staffPortalApi } from '../lib/api';

interface Enrollment {
  id: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  phone: string;
  nationalId: string;
  dateOfBirth: string;
  gender: string;
  email: string | null;
  status: string;
  patientId: string | null;
  createdAt: string;
}

interface OtpQueueItem {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  otp: string | null;
  waMeLink: string | null;
  status: string;
  requestedAt: string;
  expiresAt: string;
}

type Tab = 'requests' | 'otpQueue';

const statusColor: Record<string, 'success' | 'warning' | 'danger' | 'gray'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  sent: 'success',
};

function copyText(text: string, fallback: () => void) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(fallback).catch(() => fallback());
  } else {
    fallback();
  }
}

export default function PatientPortalPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('requests');
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [queue, setQueue] = useState<OtpQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');

  const loadEnrollments = useCallback(async () => {
    try {
      const rows = await staffPortalApi.enrollments(statusFilter === 'all' ? undefined : statusFilter);
      setEnrollments(rows || []);
    } catch {
      toast.error(t('portalAccess.loadFailed'));
    }
  }, [statusFilter, t]);

  const loadQueue = useCallback(async () => {
    try {
      const rows = await staffPortalApi.otpQueue();
      setQueue(rows || []);
    } catch {
      // keep last known queue on transient failures
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadEnrollments(), loadQueue()]);
    setLoading(false);
  }, [loadEnrollments, loadQueue]);

  useEffect(() => {
    refreshAll();
    const interval = window.setInterval(() => {
      loadEnrollments();
      loadQueue();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [refreshAll, loadEnrollments, loadQueue]);

  const handleApprove = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setConfirmId(null);
    setBusyId(id);
    try {
      await staffPortalApi.approve(id);
      toast.success(t('portalAccess.approved'));
      await refreshAll();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('portalAccess.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    setConfirmId(null);
    setBusyId(id);
    try {
      await staffPortalApi.reject(id);
      toast.success(t('portalAccess.rejected'));
      await refreshAll();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('portalAccess.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkSent = async (id: string) => {
    setBusyId(id);
    try {
      await staffPortalApi.markSent(id);
      toast.success(t('portalAccess.markedSent'));
      await refreshAll();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('portalAccess.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode; badge: number }> = [
    { key: 'requests', label: t('portalAccess.requests'), icon: <UserRound className="w-4 h-4" />, badge: enrollments.filter((e) => e.status === 'pending').length },
    { key: 'otpQueue', label: t('portalAccess.otpQueue'), icon: <MessageSquare className="w-4 h-4" />, badge: queue.length },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('portalAccess.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('portalAccess.subtitle')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={refreshAll}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('portalAccess.refresh')}
        </Button>
      </div>

      <div className="flex gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg ${
              tab === tb.key ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {tb.icon}
            {tb.label}
            {tb.badge > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${tab === tb.key ? 'bg-white/20' : 'bg-primary-100 text-primary-700'}`}>
                {tb.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : tab === 'requests' ? (
        <Card>
          <CardBody className="p-0">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
              {['pending', 'approved', 'rejected', 'all'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs rounded-full ${
                    statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t(`portalAccess.filter.${s}`)}
                </button>
              ))}
            </div>
            {enrollments.length === 0 ? (
              <EmptyState title={t('portalAccess.emptyRequests')} icon={<UserRound className="w-8 h-8" />} />
            ) : (
              <div className="divide-y divide-gray-100">
                {enrollments.map((e) => (
                  <div key={e.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{e.firstName} {e.lastName}</span>
                        <Badge variant={statusColor[e.status] || 'gray'}>{e.status}</Badge>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {e.countryCode} {e.phone} · {e.nationalId} · {e.dateOfBirth}
                        {e.email ? ` · ${e.email}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {e.patientId ? `Patient: ${e.patientId}` : t('portalAccess.unlinked')} · {t('common.date')}: {String(e.createdAt).slice(0, 10)}
                      </div>
                    </div>
                    {e.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant={confirmId === e.id ? 'danger' : 'secondary'}
                          disabled={busyId === e.id}
                          onClick={() => handleReject(e.id)}
                        >
                          <X className="w-4 h-4" /> {confirmId === e.id ? t('portalAccess.confirm') : t('portalAccess.reject')}
                        </Button>
                        <Button size="sm" disabled={busyId === e.id} onClick={() => handleApprove(e.id)}>
                          <Check className="w-4 h-4" /> {confirmId === e.id ? t('portalAccess.confirm') : t('portalAccess.approve')}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="p-4 border-b border-gray-100">
              <p className="text-sm text-gray-500">{t('portalAccess.otpQueueHint')}</p>
            </div>
            {queue.length === 0 ? (
              <EmptyState title={t('portalAccess.emptyQueue')} icon={<MessageSquare className="w-8 h-8" />} />
            ) : (
              <div className="divide-y divide-gray-100">
                {queue.map((q) => (
                  <div key={q.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{q.firstName} {q.lastName}</span>
                        <Badge variant={statusColor[q.status] || 'gray'}>{q.status}</Badge>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">{q.phone}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {t('portalAccess.expiresIn')}: {q.expiresAt ? new Date(q.expiresAt).toLocaleTimeString() : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-mono tracking-[0.3em] text-gray-900">{q.otp || '······'}</span>
                        <button
                          title={t('portalAccess.copyOtp')}
                          onClick={() => copyText(q.otp || '', () => toast.success(t('portalAccess.copied')))}
                          className="p-2 text-gray-400 hover:text-gray-700"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {q.waMeLink && (
                        <a href={q.waMeLink} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                          <ExternalLink className="w-4 h-4" /> {t('portalAccess.sendWhatsApp')}
                        </a>
                      )}
                      {q.status !== 'sent' && (
                        <Button size="sm" disabled={busyId === q.id} onClick={() => handleMarkSent(q.id)}>
                          <Send className="w-4 h-4" /> {t('portalAccess.markSent')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
