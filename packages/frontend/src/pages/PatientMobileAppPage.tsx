import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { formatDateTime } from '../lib/format';
import {
  Smartphone,
  CalendarCheck,
  FileText,
  Heart,
  Bell,
  ChevronRight,
  Clock,
  LogOut,
  Receipt,
} from 'lucide-react';
import { Button } from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { isValidEgyptianPhone } from '../lib/validators';

type Page = 'home' | 'appointments' | 'records' | 'surveys' | 'notifications' | 'bills' | 'documents' | 'messages';

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  doctor_name: string;
  type: string;
  status: string;
}

interface RecordEntry {
  id: string;
  type: string;
  date: string;
  title: string;
}

interface BillEntry {
  id: string;
  date: string;
  amount: number;
  status: string;
  description: string;
}

interface NotificationEntry {
  id: string;
  message: string;
  created_at: string;
  read: boolean;
}

export default function PatientMobileAppPage() {
  const { t } = useTranslation();

  const [page, setPage] = useState<Page>('home');
  const [mobileNum, setMobileNum] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [bills, setBills] = useState<BillEntry[]>([]);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);


  const handleRequestOtp = useCallback(async () => {
    const sanitized = sanitizeString(mobileNum.trim());
    if (!sanitized) {
      toast.error(t('patientApp.loginFailed'));
      return;
    }
    if (!isValidEgyptianPhone(sanitized)) {
      toast.error(t('validate.phone'));
      return;
    }
    setRequestingOtp(true);
    try {
      const slug = localStorage.getItem('tenantSlug') || 'demo';
      const res = await api.post('/portal/login', {
        phone: sanitized,
        tenantSlug: slug,
      });
      setOtpToken(res.data.data.token);
      setOtpStep('otp');
    } catch {
      toast.error(t('patientApp.loginFailed'));
    } finally {
      setRequestingOtp(false);
    }
  }, [mobileNum, t]);

  const handleVerifyOtp = useCallback(async () => {
    const sanitizedOtp = sanitizeString(otp.trim());
    if (!sanitizedOtp || sanitizedOtp.length !== 6) {
      toast.error(t('patientApp.otpFailed'));
      return;
    }
    setVerifyingOtp(true);
    try {
      const res = await api.post('/portal/verify', {
        token: otpToken,
        otp: sanitizedOtp,
      });
      const p = res.data.data.patient;
      setPatient(p);
      localStorage.setItem('portalToken', res.data.data.accessToken);
      setLoggedIn(true);

      const headers = { Authorization: `Bearer ${res.data.data.accessToken}` };
      const results = await Promise.allSettled([
        api.get('/portal/appointments', { headers }),
        api.get('/portal/records', { headers }),
        api.get('/portal/bills', { headers }),
      ]);
      if (results[0].status === 'fulfilled') setAppointments(results[0].value.data.data || []);
      if (results[1].status === 'fulfilled') setRecords(results[1].value.data.data || []);
      if (results[2].status === 'fulfilled') setBills(results[2].value.data.data || []);

    } catch {
      toast.error(t('patientApp.otpFailed'));
    } finally {
      setVerifyingOtp(false);
    }
  }, [otp, otpToken, t]);

  const handleLogout = useCallback(() => {
    setLoggedIn(false);
    setPatient(null);
    setMobileNum('');
    setOtp('');
    setOtpToken('');
    setOtpStep('phone');
    setPage('home');
    setAppointments([]);
    setRecords([]);
    setBills([]);
    setNotifications([]);
    localStorage.removeItem('portalToken');
  }, []);

  const navItems: Array<{ icon: typeof CalendarCheck; label: string; page: Page }> = [
    { icon: CalendarCheck, label: t('patientApp.appointments'), page: 'appointments' },
    { icon: FileText, label: t('patientApp.records'), page: 'records' },
    { icon: Heart, label: t('patientApp.feedback'), page: 'surveys' },
    { icon: Bell, label: t('patientApp.alerts'), page: 'notifications' },
    { icon: Receipt, label: t('patientApp.bills'), page: 'bills' },
  ];

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full">
          <Smartphone className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-center mb-6">{t('patientApp.title')}</h1>

          {otpStep === 'phone' && (
            <>
              <input
                className="w-full p-3 border rounded-lg mb-3 text-base"
                placeholder={t('patientApp.mobilePlaceholder')}
                value={mobileNum}
                onChange={(e) => setMobileNum(e.target.value)}
                inputMode="tel"
                type="tel"
              />
              <Button
                onClick={handleRequestOtp}
                loading={requestingOtp}
                className="w-full min-h-[48px] text-base font-bold"
              >
                {requestingOtp ? t('patientApp.requestingOtp') : t('patientApp.login')}
              </Button>
            </>
          )}

          {otpStep === 'otp' && (
            <>
              <input
                className="w-full p-3 border rounded-lg mb-3 text-base"
                placeholder={t('patientApp.otpPlaceholder')}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
              />
              <Button
                onClick={handleVerifyOtp}
                loading={verifyingOtp}
                className="w-full min-h-[48px] text-base font-bold"
              >
                {verifyingOtp ? t('patientApp.verifyingOtp') : t('patientApp.login')}
              </Button>
              <button
                onClick={() => setOtpStep('phone')}
                className="w-full text-sm text-blue-600 mt-3 text-center"
              >
                ← {t('patientApp.mobileNumber')}
              </button>
            </>
          )}

          <p className="text-center text-xs text-gray-400 mt-4">
            {t('patientApp.enterOtpHint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="w-full max-w-sm mx-auto bg-white shadow-2xl flex flex-col h-screen max-h-[800px]">
        <div className="bg-blue-600 text-white p-4 pt-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm opacity-75">{t('patientApp.title')}</p>
            <button onClick={handleLogout} className="p-1" type="button">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-lg font-semibold">
            {t('patientApp.hello', { name: patient?.firstName || '' })}
          </h2>
          <p className="text-sm opacity-75">{t('patientApp.whatCanWeHelp')}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {page === 'home' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {navItems.map((item) => (
                  <button
                    key={item.page}
                    onClick={() => setPage(item.page)}
                    className="bg-blue-50 p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-blue-100 transition-colors min-h-[80px]"
                    type="button"
                  >
                    <item.icon className="w-6 h-6 text-blue-600" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>

              {appointments.length > 0 && (
                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
                  <h3 className="font-semibold">{t('patientApp.upcomingAppointment')}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="w-4 h-4" />
                    <p className="text-sm">
                      {appointments[0].date} at {appointments[0].time} with{' '}
                      {sanitizeString(appointments[0].doctor_name)}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {page === 'appointments' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{t('patientApp.myAppointments')}</h3>
              {appointments.length > 0 ? (
                appointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="bg-white border rounded-xl p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {apt.date} {apt.time} - {sanitizeString(apt.doctor_name)}
                      </p>
                      <p className="text-xs text-gray-500">{apt.type}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-center py-8">{t('patientApp.noAppointments')}</p>
              )}
            </div>
          )}

          {page === 'records' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{t('patientApp.medicalRecords')}</h3>
              {records.length > 0 ? (
                records.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white border rounded-xl p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">{sanitizeString(rec.title)}</p>
                      <p className="text-xs text-gray-500">
                        {rec.type} - {rec.date}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-center py-8">{t('patientApp.noRecords')}</p>
              )}
            </div>
          )}

          {page === 'bills' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{t('patientApp.bills')}</h3>
              {bills.length > 0 ? (
                bills.map((bill) => (
                  <div
                    key={bill.id}
                    className="bg-white border rounded-xl p-4 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">{sanitizeString(bill.description)}</p>
                      <p className="text-xs text-gray-500">{bill.date}</p>
                    </div>
                    <span className="font-bold text-sm">{bill.amount} EGP</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-center py-8">{t('patientApp.noBills')}</p>
              )}
            </div>
          )}

          {page === 'surveys' && (
            <div className="text-center py-8 text-gray-400">
              <Heart className="w-12 h-12 mx-auto mb-2" />
              <p className="font-medium">{t('patientApp.noSurveys')}</p>
            </div>
          )}

          {page === 'notifications' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{t('patientApp.notifications')}</h3>
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`bg-white border rounded-xl p-4 ${n.read ? '' : 'border-l-4 border-l-blue-500'}`}
                  >
                    <p className="text-sm font-medium">{sanitizeString(n.message)}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-center py-8">{t('patientApp.noNotifications')}</p>
              )}
            </div>
          )}

          {page === 'messages' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{t('patientApp.messages')}</h3>
              <p className="text-gray-400 text-center py-8">{t('patientApp.noMessages')}</p>
            </div>
          )}
        </div>

        <div className="border-t bg-white p-2 flex justify-around">
          {[
            { page: 'home' as Page, label: t('patientApp.home') },
            { page: 'appointments' as Page, label: t('patientApp.appointments') },
            { page: 'records' as Page, label: t('patientApp.records') },
            { page: 'surveys' as Page, label: t('patientApp.feedback') },
            { page: 'notifications' as Page, label: t('patientApp.alerts') },
          ].map((item) => (
            <button
              key={item.page}
              onClick={() => setPage(item.page)}
              className={`p-2 text-center min-w-[48px] ${
                page === item.page ? 'text-blue-600 font-medium' : 'text-gray-500'
              }`}
              type="button"
            >
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
