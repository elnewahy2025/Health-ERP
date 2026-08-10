import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Stethoscope, Loader2, UserPlus, LogIn, LogOut, CalendarCheck, FileText,
  Receipt, MessageSquare, Phone, Smartphone, CheckCircle2,
} from 'lucide-react';
import { portalApi } from '../lib/api';

const COUNTRY_CODES = [
  { code: '+966', label: 'Saudi Arabia (+966)' },
  { code: '+20', label: 'Egypt (+20)' },
  { code: '+971', label: 'United Arab Emirates (+971)' },
  { code: '+974', label: 'Qatar (+974)' },
  { code: '+968', label: 'Oman (+968)' },
  { code: '+973', label: 'Bahrain (+973)' },
  { code: '+965', label: 'Kuwait (+965)' },
  { code: '+962', label: 'Jordan (+962)' },
  { code: '+961', label: 'Lebanon (+961)' },
  { code: '+970', label: 'Palestine (+970)' },
  { code: '+90', label: 'Turkey (+90)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+1', label: 'USA / Canada (+1)' },
  { code: '+49', label: 'Germany (+49)' },
  { code: '+33', label: 'France (+33)' },
];

type AuthMode = 'signin' | 'request' | 'otp';
type DashTab = 'dashboard' | 'appointments' | 'records' | 'bills' | 'messages';

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  medicalRecordNumber: string;
}

export default function PublicPortalPage() {
  const { t } = useTranslation();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [token, setToken] = useState('');
  const [portalToken, setPortalToken] = useState<string | null>(() => sessionStorage.getItem('portal_token'));
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Sign-in fields
  const [orgCode, setOrgCode] = useState('');
  const [countryCode, setCountryCode] = useState('+966');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Request-access fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('male');
  const [email, setEmail] = useState('');

  // Dashboard
  const [dashTab, setDashTab] = useState<DashTab>('dashboard');
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [appointments, setAppointments] = useState<Array<Record<string, unknown>>>([]);
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [bills, setBills] = useState<Array<Record<string, unknown>>>([]);
  const [messages, setMessages] = useState<Array<Record<string, unknown>>>([]);

  const loadDashboard = useCallback(async (tokenValue: string) => {
    setLoading(true);
    try {
      const [dash, appts, recs, bils, msgs] = await Promise.all([
        portalApi.dashboard(tokenValue),
        portalApi.appointments(tokenValue),
        portalApi.records(tokenValue),
        portalApi.bills(tokenValue),
        portalApi.messages(tokenValue),
      ]);
      setPatient(dash.patient);
      setAppointments(appts || []);
      setRecords(recs || []);
      setBills(bils || []);
      setMessages(msgs || []);
    } catch {
      toast.error(t('portal.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (portalToken) {
      loadDashboard(portalToken);
    }
  }, [portalToken, loadDashboard]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgCode || !phone) { toast.error(t('portal.fillPhone')); return; }
    if (!/^\d{6,15}$/.test(phone.replace(/\D/g, ''))) { toast.error(t('portal.invalidPhone')); return; }
    setLoading(true);
    try {
      const data = await portalApi.requestOtp({ tenantSlug: orgCode.trim(), countryCode, phone: phone.trim() });
      setToken(data.token);
      setMode('otp');
      toast.success(t('portal.otpRequested'));
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('portal.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) { toast.error(t('portal.otpSixDigits')); return; }
    setLoading(true);
    try {
      const data = await portalApi.verify({ token, otp: otp.trim() });
      sessionStorage.setItem('portal_token', data.accessToken);
      setPortalToken(data.accessToken);
      toast.success(t('portal.welcome'));
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('portal.invalidOtp'));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgCode || !firstName || !lastName || !phone || !nationalId || !dob) {
      toast.error(t('portal.fillAll'));
      return;
    }
    if (!/^\d{14}$/.test(nationalId.trim())) { toast.error(t('portal.nationalIdHint')); return; }
    if (!/^\d{6,15}$/.test(phone.replace(/\D/g, ''))) { toast.error(t('portal.invalidPhone')); return; }
    if (!dob || new Date(dob) > new Date()) { toast.error(t('portal.invalidDob')); return; }
    setLoading(true);
    try {
      await portalApi.requestAccess({
        tenantSlug: orgCode.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        countryCode,
        phone: phone.trim(),
        nationalId: nationalId.trim(),
        dateOfBirth: dob,
        gender,
        email: email.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || t('portal.requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (portalToken) portalApi.logout(portalToken).catch(() => {});
    sessionStorage.removeItem('portal_token');
    setPortalToken(null);
    setPatient(null);
    setAppointments([]);
    setBills([]);
    setMessages([]);
    setMode('signin');
    setOtp('');
    setToken('');
  };

  if (portalToken) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Stethoscope className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">{t('portal.title')}</span>
            </div>
            {patient && (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{patient.firstName} {patient.lastName}</span>
                  <span className="text-gray-400 ml-2">MRN {patient.medicalRecordNumber}</span>
                </div>
                <button onClick={handleLogout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                  <LogOut className="w-4 h-4" /> {t('portal.logout')}
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-5 overflow-x-auto">
            {([
              ['dashboard', 'portal.dashboard', CalendarCheck],
              ['appointments', 'portal.appointments', CalendarCheck],
              ['records', 'portal.records', FileText],
              ['bills', 'portal.bills', Receipt],
              ['messages', 'portal.messages', MessageSquare],
            ] as Array<[DashTab, string, typeof CalendarCheck]>).map(([key, labelKey, Icon]) => (
              <button
                key={key}
                onClick={() => setDashTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg whitespace-nowrap ${
                  dashTab === key ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" /> {t(labelKey)}
              </button>
            ))}
          </div>

          {loading && <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-600" /></div>}
          {!loading && dashTab === 'dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card p-5">
                <h3 className="font-semibold text-gray-800 mb-2">{t('portal.upcoming')} {t('portal.appointments')}</h3>
                {appointments.filter((a) => ['scheduled', 'confirmed'].includes(String(a.status))).slice(0, 5).map((a) => (
                  <div key={String(a.id)} className="text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <div className="text-gray-800">{String(a.date)} · {String(a.time || '')}</div>
                    <div className="text-gray-400 capitalize">{String(a.type || a.status)}</div>
                  </div>
                ))}
                {appointments.length === 0 && <p className="text-sm text-gray-400">{t('portal.noAppointments')}</p>}
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-gray-800 mb-2">{t('portal.recentRecords')}</h3>
                {records.slice(0, 5).map((r) => (
                  <div key={String(r.id)} className="text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <div className="text-gray-800 line-clamp-2">{String(r.diagnosis || r.symptoms || '—')}</div>
                    <div className="text-gray-400">{String(r.encounterDate || r.createdAt || '')}</div>
                  </div>
                ))}
                {records.length === 0 && <p className="text-sm text-gray-400">{t('portal.noRecords')}</p>}
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-gray-800 mb-2">{t('portal.pendingBills')}</h3>
                {bills.filter((b) => ['pending', 'partial'].includes(String(b.status))).slice(0, 5).map((b) => (
                  <div key={String(b.id)} className="text-sm py-1.5 border-b border-gray-100 last:border-0 flex justify-between">
                    <span className="text-gray-800">{String(b.invoiceNumber)}</span>
                    <span className="font-medium">{Number(b.dueAmount).toFixed(2)}</span>
                  </div>
                ))}
                {bills.length === 0 && <p className="text-sm text-gray-400">{t('portal.noBills')}</p>}
              </div>
            </div>
          )}
          {!loading && dashTab === 'appointments' && (
            <div className="card divide-y divide-gray-100">
              {appointments.map((a) => (
                <div key={String(a.id)} className="p-4 flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-800">{String(a.date)} {a.time ? `· ${String(a.time)}` : ''}</div>
                    <div className="text-sm text-gray-500 capitalize">{String(a.type || '')} · {String(a.status || '')}</div>
                    {a.reason ? <div className="text-sm text-gray-500 mt-1">{String(a.reason)}</div> : null}
                  </div>
                </div>
              ))}
              {appointments.length === 0 && <div className="p-6 text-center text-gray-400">{t('portal.noAppointments')}</div>}
            </div>
          )}
          {!loading && dashTab === 'records' && (
            <div className="card divide-y divide-gray-100">
              {records.map((r) => (
                <div key={String(r.id)} className="p-4">
                  <div className="font-medium text-gray-800">{String(r.diagnosis || t('portal.record'))}</div>
                  <div className="text-sm text-gray-500 mt-1">{String(r.symptoms || '')}</div>
                  {r.treatment ? <div className="text-sm text-gray-600 mt-2">Plan: {String(r.treatment)}</div> : null}
                  <div className="text-xs text-gray-400 mt-2">{String(r.encounterDate || r.createdAt || '')}</div>
                </div>
              ))}
              {records.length === 0 && <div className="p-6 text-center text-gray-400">{t('portal.noRecords')}</div>}
            </div>
          )}
          {!loading && dashTab === 'bills' && (
            <div className="card divide-y divide-gray-100">
              {bills.map((b) => (
                <div key={String(b.id)} className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium text-gray-800">{String(b.invoiceNumber)}</div>
                    <div className="text-sm text-gray-500 capitalize">{String(b.status)} · {String(b.dueDate || '')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{Number(b.total).toFixed(2)}</div>
                    {Number(b.dueAmount) > 0 && <div className="text-xs text-red-500">due {Number(b.dueAmount).toFixed(2)}</div>}
                  </div>
                </div>
              ))}
              {bills.length === 0 && <div className="p-6 text-center text-gray-400">{t('portal.noBills')}</div>}
            </div>
          )}
          {!loading && dashTab === 'messages' && (
            <div className="card divide-y divide-gray-100">
              {messages.map((m) => (
                <div key={String(m.id)} className="p-4">
                  <div className="flex justify-between">
                    <div className="font-medium text-gray-800">{String(m.subject || '')}</div>
                    <div className="text-xs text-gray-400">{String(m.createdAt || '')}</div>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{String(m.body || '')}</div>
                </div>
              ))}
              {messages.length === 0 && <div className="p-6 text-center text-gray-400">{t('portal.noMessages')}</div>}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('portal.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('portal.subtitle')}</p>
        </div>

        {submitted && mode === 'request' ? (
          <div className="card p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-gray-900">{t('portal.requestSubmitted')}</h2>
            <p className="text-sm text-gray-500 mt-2">{t('portal.requestSubmittedHint')}</p>
            <button
              onClick={() => { setSubmitted(false); setMode('signin'); }}
              className="btn-secondary w-full mt-5"
            >
              {t('portal.backToSignIn')}
            </button>
          </div>
        ) : mode === 'otp' ? (
          <form onSubmit={handleVerify} className="card p-6">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-5 h-5 text-primary-600" />
              <h2 className="font-semibold text-gray-900">{t('portal.enterOtp')}</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">{t('portal.otpWhatsAppHint')}</p>
            <label className="label">{t('portal.otpCode')}</label>
            <input
              className="input text-center text-2xl tracking-[0.5em] font-mono"
              maxLength={6}
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="••••••"
              autoFocus
            />
            <button type="submit" disabled={loading} className="btn-primary w-full mt-4">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t('portal.verifyLogin')}
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setOtp(''); setToken(''); }}
              className="text-sm text-gray-400 hover:text-gray-600 mt-3 w-full text-center"
            >
              {t('portal.backToSignIn')}
            </button>
          </form>
        ) : (
          <div className="card p-6">
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button
                onClick={() => setMode('signin')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg ${
                  mode === 'signin' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <LogIn className="w-4 h-4" /> {t('portal.tabSignIn')}
              </button>
              <button
                onClick={() => setMode('request')}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg ${
                  mode === 'request' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <UserPlus className="w-4 h-4" /> {t('portal.tabRequestAccess')}
              </button>
            </div>

            {mode === 'request' && (
              <div className="mb-4 p-3 bg-blue-50 text-blue-700 text-xs rounded-lg">
                {t('portal.requestHint')}
              </div>
            )}

            <form onSubmit={mode === 'request' ? handleRequestAccess : handleRequestOtp} className="space-y-3">
              <div>
                <label className="label">{t('portal.orgCode')}</label>
                <input className="input" value={orgCode} onChange={(e) => setOrgCode(e.target.value)} placeholder={t('portal.orgCodePlaceholder')} />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">{t('portal.countryCode')}</label>
                  <select className="input" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                    {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t('portal.countryCodeHint')}</p>
                </div>
                <div>
                  <label className="label">{t('portal.phone')}</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      className="input pl-9"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="5xxxxxxxx"
                      inputMode="numeric"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{t('portal.phoneHint')}</p>
                </div>
              </div>

              {mode === 'request' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">{t('portal.firstName')}</label>
                      <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">{t('portal.lastName')}</label>
                      <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="label">{t('portal.nationalId')}</label>
                    <input
                      className="input"
                      value={nationalId}
                      onChange={(e) => setNationalId(e.target.value.replace(/\D/g, '').slice(0, 14))}
                      maxLength={14}
                      inputMode="numeric"
                      placeholder="14 digits"
                    />
                    <p className="text-xs text-gray-400 mt-1">{t('portal.nationalIdHint')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">{t('portal.dateOfBirth')}</label>
                      <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().split('T')[0]} />
                    </div>
                    <div>
                      <label className="label">{t('portal.gender')}</label>
                      <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
                        <option value="male">{t('portal.male')}</option>
                        <option value="female">{t('portal.female')}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">{t('portal.emailOptional')}</label>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                </>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'request' ? t('portal.submitRequest') : t('portal.sendOtp')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
