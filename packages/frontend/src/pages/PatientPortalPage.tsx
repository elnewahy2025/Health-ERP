import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  UserRound, CalendarCheck, FileText, MessageSquare, Smartphone,
} from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDate, formatDateTime } from '../lib/format';

type PortalTab = 'dashboard' | 'appointments' | 'bills' | 'messages';
type LoginStep = 'phone' | 'otp';

interface DashboardData {
  patient: { id: string; firstName: string; lastName: string; medicalRecordNumber: string } | null;
  upcomingAppointments: Appointment[];
  recentRecords: { id: string; diagnosis: string; createdAt: string }[];
  pendingBills: Bill[];
  unreadMessages: number;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  type: string;
  status: string;
  reason: string;
}

interface Bill {
  id: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  dueAmount: number;
  status: string;
  dueDate: string;
}

interface PortalMessage {
  id: string;
  subject: string;
  body: string;
  direction: 'inbound' | 'outbound';
  isRead: boolean;
  createdAt: string;
}

const PHONE_REGEX = /^\+?[0-9]{10,15}$/;

export default function PatientPortalPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PortalTab>('dashboard');
  const [phone, setPhone] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [step, setStep] = useState<LoginStep>('phone');
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [portalAccessToken, setPortalAccessToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateLoginForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!tenantSlug || tenantSlug.trim().length < 1) {
      newErrors.tenantSlug = t('portal.invalidOrg');
    }
    if (!PHONE_REGEX.test(phone.replace(/\s/g, ''))) {
      newErrors.phone = t('portal.invalidPhone');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [tenantSlug, phone, t]);

  const validateOtpForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!otp || !/^\d{6}$/.test(otp)) {
      newErrors.otp = t('portal.invalidOtp');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [otp, t]);

  const doLogin = useCallback(async () => {
    if (!validateLoginForm()) return;
    setLoading(true);
    try {
      const r = await api.post('/portal/login', {
        phone: sanitizeString(phone),
        tenantSlug: sanitizeString(tenantSlug),
      });
      setSessionToken(String(r.data?.data?.token ?? ''));
      setStep('otp');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || t('portal.loginFailed'));
    } finally {
      setLoading(false);
    }
  }, [phone, tenantSlug, validateLoginForm, t]);

  const loadDashboardData = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride || portalAccessToken;
    if (!token) return;
    setLoggedIn(true);
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [dashR, apptR, billsR, msgsR] = await Promise.allSettled([
        api.get('/portal/dashboard', { headers }),
        api.get('/portal/appointments', { headers }),
        api.get('/portal/bills', { headers }),
        api.get('/portal/messages', { headers }),
      ]);

      if (dashR.status === 'fulfilled') {
        const d = dashR.value.data?.data as DashboardData | undefined;
        if (d) setDashboard(d);
      }
      if (apptR.status === 'fulfilled') {
        setAppointments((apptR.value.data?.data ?? []) as Appointment[]);
      }
      if (billsR.status === 'fulfilled') {
        setBills((billsR.value.data?.data ?? []) as Bill[]);
      }
      if (msgsR.status === 'fulfilled') {
        setMessages((msgsR.value.data?.data ?? []) as PortalMessage[]);
      }
      setTab('dashboard');
    } catch {
      setLoggedIn(false);
      setPortalAccessToken(null);
      toast.error(t('portal.sessionExpired'));
    } finally {
      setLoading(false);
    }
  }, [t]);


  const doVerify = useCallback(async () => {
    if (!validateOtpForm()) return;
    setLoading(true);
    try {
      const r = await api.post('/portal/verify', { token: sessionToken, otp });
      const accessToken = String(r.data?.data?.accessToken ?? '');
      setPortalAccessToken(accessToken);
      setLoggedIn(true);
      setStep('phone');
      await loadDashboardData(accessToken);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || t('portal.verifyFailed'));
    } finally {
      setLoading(false);
    }
  }, [sessionToken, otp, validateOtpForm, loadDashboardData, t]);


  const handleLogout = useCallback(() => {
    setPortalAccessToken(null);
    setLoggedIn(false);
    setTab('dashboard');
    setDashboard(null);
    setAppointments([]);
    setBills([]);
    setMessages([]);
  }, []);

  useEffect(() => {
    const token = portalAccessToken;
    if (!token) return;
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [dashR, apptR, billsR, msgsR] = await Promise.allSettled([
          api.get('/portal/dashboard', { headers }),
          api.get('/portal/appointments', { headers }),
          api.get('/portal/bills', { headers }),
          api.get('/portal/messages', { headers }),
        ]);
        if (cancelled) return;
        if (dashR.status === 'fulfilled') {
          const d = dashR.value.data?.data as DashboardData | undefined;
          if (d) setDashboard(d);
        }
        if (apptR.status === 'fulfilled') {
          setAppointments((apptR.value.data?.data ?? []) as Appointment[]);
        }
        if (billsR.status === 'fulfilled') {
          setBills((billsR.value.data?.data ?? []) as Bill[]);
        }
        if (msgsR.status === 'fulfilled') {
          setMessages((msgsR.value.data?.data ?? []) as PortalMessage[]);
        }
        setTab('dashboard');
      } catch {
        setLoggedIn(false);
        setPortalAccessToken(null);
        toast.error(t('portal.sessionExpired'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => { cancelled = true; };
  }, [t]);

  if (!loggedIn) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardBody>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <UserRound className="w-8 h-8 text-primary-600" />
              </div>
              <h1 className="text-xl font-bold">{t('portal.title')}</h1>
              <p className="text-sm text-gray-500">{t('portal.subtitle')}</p>
            </div>

            {step === 'phone' && (
              <div className="space-y-4">
                <Input
                  label={t('portal.orgCode')}
                  placeholder={t('portal.orgCodePlaceholder')}
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  error={errors.tenantSlug}
                />
                <Input
                  label={t('portal.phone')}
                  placeholder={t('portal.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  error={errors.phone}
                />
                <Button className="w-full" onClick={doLogin} loading={loading}>
                  <Smartphone className="w-4 h-4" /> {t('portal.sendOtp')}
                </Button>
              </div>
            )}

            {step === 'otp' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">{t('portal.enterOtp')}</p>
                <Input
                  placeholder={t('portal.otpPlaceholder')}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  error={errors.otp}
                  className="text-center text-2xl tracking-widest"
                />
                <Button className="w-full" onClick={doVerify} loading={loading}>
                  {t('portal.verifyLogin')}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  if (loading && !dashboard) return <PageLoader message={t('common.loading')} />;

  const tabs: { key: PortalTab; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: t('portal.dashboard'), icon: <CalendarCheck className="w-4 h-4" /> },
    { key: 'appointments', label: t('portal.appointments'), icon: <CalendarCheck className="w-4 h-4" /> },
    { key: 'bills', label: t('portal.bills'), icon: <FileText className="w-4 h-4" /> },
    { key: 'messages', label: t('portal.messages'), icon: <MessageSquare className="w-4 h-4" /> },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('portal.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('portal.welcome')}, {dashboard?.patient?.firstName ?? ''}
          </p>
        </div>
        <Button variant="ghost" onClick={handleLogout}>
          {t('portal.logout')}
        </Button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === tb.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && dashboard && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('portal.upcoming')}</p>
                <p className="text-2xl font-bold">{dashboard.upcomingAppointments.length}</p>
                <p className="text-xs text-gray-400">{t('portal.appointments')}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('portal.pendingBills')}</p>
                <p className="text-2xl font-bold">{dashboard.pendingBills.length}</p>
                <p className="text-xs text-gray-400">{t('portal.billsTab')}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('portal.unreadMessages')}</p>
                <p className="text-2xl font-bold">{dashboard.unreadMessages}</p>
                <p className="text-xs text-gray-400">{t('portal.messagesTab')}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">{t('portal.recentRecords')}</p>
                <p className="text-2xl font-bold">{dashboard.recentRecords.length}</p>
                <p className="text-xs text-gray-400">{t('portal.dashboard')}</p>
              </CardBody>
            </Card>
          </div>

          {dashboard.upcomingAppointments.length > 0 && (
            <Card className="mb-4">
              <CardBody>
                <h3 className="font-semibold mb-3">{t('portal.upcomingAppointments')}</h3>
                {dashboard.upcomingAppointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{a.date} at {a.time}</p>
                      <p className="text-xs text-gray-500">{a.type} · {a.status}</p>
                    </div>
                    <Badge variant={a.status === 'confirmed' ? 'success' : 'warning'}>{a.status}</Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {dashboard.pendingBills.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="font-semibold mb-3">{t('portal.pendingBillsList')}</h3>
                {dashboard.pendingBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="font-medium">{b.invoiceNumber}</p>
                      <p className="text-xs text-gray-500">{t('portal.due')}: {formatDate(b.dueDate)}</p>
                    </div>
                    <p className="font-bold text-red-600">{Number(b.dueAmount).toFixed(2)} EGP</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === 'appointments' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('common.time')}</th>
                <th>{t('common.type')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title={t('portal.noAppointments')} />
                  </td>
                </tr>
              ) : (
                appointments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td>{sanitizeString(a.date)}</td>
                    <td>{sanitizeString(a.time)}</td>
                    <td><Badge>{sanitizeString(a.type)}</Badge></td>
                    <td>
                      <Badge variant={a.status === 'confirmed' ? 'success' : a.status === 'cancelled' ? 'danger' : 'warning'}>
                        {sanitizeString(a.status)}
                      </Badge>
                    </td>
                    <td className="text-xs">{sanitizeString(a.reason || '-')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'bills' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('billing.invoice')}</th>
                <th>{t('common.total')}</th>
                <th>{t('common.paid')}</th>
                <th>{t('common.due')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.dueDate')}</th>
              </tr>
            </thead>
            <tbody>
              {bills.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title={t('portal.noBills')} />
                  </td>
                </tr>
              ) : (
                bills.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="font-mono text-xs">{sanitizeString(b.invoiceNumber)}</td>
                    <td>{Number(b.total).toFixed(2)} EGP</td>
                    <td>{Number(b.paid).toFixed(2)}</td>
                    <td className="font-medium text-red-600">{Number(b.dueAmount).toFixed(2)}</td>
                    <td>
                      <Badge variant={b.status === 'paid' ? 'success' : b.status === 'pending' ? 'warning' : 'danger'}>
                        {sanitizeString(b.status)}
                      </Badge>
                    </td>
                    <td className="text-xs">{sanitizeString(b.dueDate || '-')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'messages' && (
        <div>
          {messages.length === 0 ? (
            <EmptyState title={t('portal.noMessages')} />
          ) : (
            messages.map((m) => (
              <Card key={m.id} className="mb-3">
                <CardBody>
                  <div className="flex items-start justify-between mb-1">
                    <h4 className={`font-medium text-sm ${!m.isRead && m.direction === 'outbound' ? 'text-primary-600' : ''}`}>
                      {sanitizeString(m.subject)}
                    </h4>
                    <div className="flex gap-2 items-center">
                      {!m.isRead && m.direction === 'outbound' && <Badge variant="warning">{t('portal.new')}</Badge>}
                      <Badge variant={m.direction === 'inbound' ? 'info' : 'gray'}>
                        {m.direction === 'inbound' ? t('portal.you') : t('portal.staff')}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{sanitizeString(m.body)}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(m.createdAt)}</p>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
