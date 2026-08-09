import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Monitor, Smartphone, Globe, Clock, LogOut, AlertTriangle } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

interface Session {
  id: string;
  device: string;
  ipAddress: string;
  userAgent: string;
  location: string | null;
  isActive?: boolean;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface SecurityInfo {
  activeSessions: number;
  lastLogin: string | null;
  lastIp: string | null;
  lastDevice: string | null;
}

export default function SessionsPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [securityInfo, setSecurityInfo] = useState<SecurityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [sR, secR] = await Promise.allSettled([
          api.get('/sessions'),
          api.get('/sessions/security-info'),
        ]);
        if (cancelled) return;
        if (sR.status === 'fulfilled') setSessions((sR.value.data?.data ?? []) as Session[]);
        if (secR.status === 'fulfilled') setSecurityInfo(secR.value.data?.data as SecurityInfo | null);
      } catch {
        if (!cancelled) toast.error(t('sessions.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const handleTerminate = useCallback(async (sessionId: string) => {
    setTerminatingId(sessionId);
    try {
      await api.post(`/sessions/${sessionId}/logout`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toast.success(t('sessions.terminateSuccess'));
      const secR = await api.get('/sessions/security-info');
      setSecurityInfo(secR.data?.data as SecurityInfo | null);
    } catch {
      toast.error(t('sessions.terminateError'));
    } finally {
      setTerminatingId(null);
    }
  }, [t]);

  const handleLogoutOthers = useCallback(async () => {
    setLoggingOutOthers(true);
    try {
      await api.post('/sessions/logout-others');
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast.success(t('sessions.logoutOthersSuccess'));
      const secR = await api.get('/sessions/security-info');
      setSecurityInfo(secR.data?.data as SecurityInfo | null);
    } catch {
      toast.error(t('sessions.logoutOthersError'));
    } finally {
      setLoggingOutOthers(false);
    }
  }, [t]);

  const formatDate = useCallback((dateStr: string) => {
    if (!dateStr) return t('sessions.na');
    return formatDateTime(dateStr);
  }, [t]);

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('sessions.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('sessions.sessionCount', { count: sessions.length })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">{t('sessions.activeSessions')}</p>
            <p className="text-2xl font-bold">{securityInfo?.activeSessions ?? 0}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">{t('sessions.lastLogin')}</p>
            <p className="text-sm font-medium">{formatDate(securityInfo?.lastLogin ?? '')}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">{t('sessions.lastIp')}</p>
            <p className="text-sm font-mono">{sanitizeString(securityInfo?.lastIp ?? t('sessions.na'))}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">{t('sessions.device')}</p>
            <p className="text-sm font-medium capitalize">{sanitizeString(securityInfo?.lastDevice ?? t('sessions.na'))}</p>
          </CardBody>
        </Card>
      </div>

      {sessions.length > 1 && (
        <Card className="mb-4 bg-yellow-50 border-yellow-200">
          <CardBody className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                {t('sessions.otherSessions', { count: sessions.length - 1 })}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogoutOthers} loading={loggingOutOthers}>
              <LogOut className="w-3 h-3" /> {t('sessions.logoutOthers')}
            </Button>
          </CardBody>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <EmptyState title={t('sessions.noSessions')} />
        ) : (
          sessions.map((s) => (
            <Card key={s.id}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      {s.device === 'mobile' ? (
                        <Smartphone className="w-5 h-5 text-gray-500" />
                      ) : (
                        <Monitor className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">
                          {sanitizeString(s.device || t('sessions.unknownDevice'))}
                        </span>
                        {s.isCurrent && <Badge variant="success">{t('sessions.current')}</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <Globe className="w-3 h-3 inline mr-1" />
                        {sanitizeString(s.ipAddress)} · {sanitizeString(s.userAgent?.substring(0, 60) ?? '')}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span><Clock className="w-3 h-3 inline mr-1" />{t('sessions.activeLabel')}: {formatDate(s.lastActivityAt)}</span>
                        <span>{t('sessions.createdLabel')}: {formatDate(s.createdAt)}</span>
                        <span>{t('sessions.expiresLabel')}: {formatDate(s.expiresAt)}</span>
                      </div>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTerminate(s.id)}
                      loading={terminatingId === s.id}
                    >
                      <LogOut className="w-3 h-3" /> {t('sessions.terminate')}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
