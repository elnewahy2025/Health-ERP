import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CalendarPlus, UserCheck, CheckCircle } from 'lucide-react';
import {
  EmptyState, Card, CardBody, Button, Badge, Input, Select,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';

type BookingTab = 'public' | 'manage';
type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

interface Doctor {
  id: string;
  name: string;
  email: string;
}

interface Slot {
  id: string;
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotType: string;
  available: boolean;
}

interface BookingRequest {
  id: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  reason: string;
  status: BookingStatus;
  source: string;
  slotDate: string;
  slotTime: string;
  doctorName: string | null;
  createdAt: string;
}

const PHONE_REGEX = /^\+?[0-9]{10,15}$/;

/** "09:30" -> "9:30 AM" (24h stays as-is when it cannot be parsed). */
function formatTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  const mm = m[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${period}`;
}

export default function OnlineBookingPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<BookingTab>('public');
  const [tenantSlug, setTenantSlug] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [reason, setReason] = useState('');
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadDoctors = useCallback(async () => {
    if (!tenantSlug.trim()) return;
    setLoading(true);
    try {
      const r = await api.get('/booking/doctors', { params: { tenantSlug: sanitizeString(tenantSlug) } });
      setDoctors((r.data?.data ?? []) as Doctor[]);
    } catch {
      toast.error(t('booking.loadError'));
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, t]);

  const loadSlots = useCallback(async () => {
    if (!tenantSlug.trim() || !selectedDoctor) return;
    if (!selectedDate) {
      setErrors((prev) => ({ ...prev, date: t('booking.selectDate') }));
      return;
    }
    setLoading(true);
    try {
      const r = await api.get('/booking/slots', { params: { tenantSlug: sanitizeString(tenantSlug), doctorId: selectedDoctor, date: selectedDate } });
      setSlots((r.data?.data ?? []) as Slot[]);
      setErrors((prev) => ({ ...prev, date: '' }));
    } catch {
      toast.error(t('booking.loadError'));
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, selectedDoctor, selectedDate, t]);

  useEffect(() => {
    if (tab === 'manage') {
      let cancelled = false;
      const load = async () => {
        try {
          const r = await api.get('/booking/manage/requests');
          if (!cancelled) setRequests((r.data?.data ?? []) as BookingRequest[]);
        } catch {
          if (!cancelled) toast.error(t('booking.loadError'));
        }
      };
      void load();
      return () => { cancelled = true; };
    }
    return undefined;
  }, [tab, t]);

  const validateBookingForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!patientName.trim()) newErrors.patientName = t('booking.invalidName');
    if (!PHONE_REGEX.test(patientPhone.replace(/\s/g, ''))) newErrors.patientPhone = t('booking.invalidPhone');
    if (!selectedSlot) newErrors.slot = t('booking.selectSlot');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [patientName, patientPhone, selectedSlot, t]);

  const doBooking = useCallback(async () => {
    if (!validateBookingForm()) return;
    setLoading(true);
    try {
      await api.post('/booking/request', {
        slotId: selectedSlot,
        patientName: sanitizeString(patientName),
        patientPhone: sanitizeString(patientPhone),
        patientEmail: patientEmail ? sanitizeString(patientEmail) : undefined,
        reason: reason ? sanitizeString(reason) : undefined,
        tenantSlug: sanitizeString(tenantSlug),
      });
      setBookingSubmitted(true);
      toast.success(t('booking.submitSuccess'));
    } catch {
      toast.error(t('booking.submitError'));
    } finally {
      setLoading(false);
    }
  }, [selectedSlot, patientName, patientPhone, patientEmail, reason, tenantSlug, validateBookingForm, t]);

  const handleConfirmRequest = useCallback(async (id: string) => {
    try {
      await api.put(`/booking/manage/requests/${id}`, { status: 'confirmed' });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'confirmed' as BookingStatus } : r)));
      toast.success(t('booking.statusUpdateSuccess'));
    } catch {
      toast.error(t('booking.statusUpdateError'));
    }
  }, [t]);

  const handleCancelRequest = useCallback(async (id: string) => {
    try {
      await api.put(`/booking/manage/requests/${id}`, { status: 'cancelled' });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' as BookingStatus } : r)));
      toast.success(t('booking.statusUpdateSuccess'));
    } catch {
      toast.error(t('booking.statusUpdateError'));
    }
  }, [t]);

  const resetForm = useCallback(() => {
    setBookingSubmitted(false);
    setSelectedDate('');
    setSelectedSlot('');
    setPatientName('');
    setPatientPhone('');
    setPatientEmail('');
    setReason('');
    setErrors({});
  }, []);

  const doctorOptions = doctors.map((d) => ({ value: d.id, label: d.name }));

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('booking.title')}</h1></div>
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={tab === 'public' ? 'primary' : 'secondary'}
          onClick={() => setTab('public')}
        >
          <CalendarPlus className="w-4 h-4" /> {t('booking.publicBooking')}
        </Button>
        <Button
          variant={tab === 'manage' ? 'primary' : 'secondary'}
          onClick={() => setTab('manage')}
        >
          <UserCheck className="w-4 h-4" /> {t('booking.manageRequests')}
        </Button>
      </div>

      {tab === 'public' && (
        <div className="max-w-2xl mx-auto">
          {!bookingSubmitted ? (
            <Card className="mb-6">
              <CardBody>
                <h2 className="text-lg font-semibold mb-4">{t('booking.bookAppointment')}</h2>
                <div className="space-y-4">
                  <Input
                    label={t('booking.orgCode')}
                    placeholder={t('booking.orgCodePlaceholder')}
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    error={errors.tenantSlug}
                  />
                  <Button onClick={loadDoctors} disabled={!tenantSlug.trim()} loading={loading}>
                    {t('booking.findDoctors')}
                  </Button>

                  {doctors.length > 0 && (
                    <>
                      <Select
                        label={t('booking.selectDoctor')}
                        options={doctorOptions}
                        value={selectedDoctor}
                        onChange={(e) => { setSelectedDoctor(e.target.value); setSlots([]); setSelectedSlot(''); setErrors((prev) => ({ ...prev, date: '' })); }}
                        placeholder={t('booking.chooseDoctor')}
                      />
                      <Input
                        type="date"
                        label={t('booking.selectDate')}
                        value={selectedDate}
                        onChange={(e) => { setSelectedDate(e.target.value); setSlots([]); setSelectedSlot(''); setErrors((prev) => ({ ...prev, date: '' })); }}
                        min={new Date().toISOString().split('T')[0]}
                        error={errors.date}
                      />
                      <Button onClick={loadSlots} disabled={!selectedDoctor} loading={loading}>
                        {t('booking.showSlots')}
                      </Button>
                    </>
                  )}

                  {slots.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium">{t('booking.availableSlots')}</label>
                        {slots[0]?.date && (
                          <span className="text-sm text-gray-500">
                            {sanitizeString(slots[0].date)}
                          </span>
                        )}
                      </div>
                      {errors.slot && <p className="text-xs text-red-600 mb-1">{errors.slot}</p>}
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                        {slots.map((s) => (
                          <button
                            key={s.id}
                            disabled={!s.available}
                            className={`py-3 px-2 rounded-xl border-2 text-center text-sm font-medium transition-all ${
                              !s.available
                                ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                                : selectedSlot === s.id
                                  ? 'border-primary-600 bg-primary-50 text-primary-700 shadow-md'
                                  : 'border-gray-200 hover:border-primary-300 text-gray-700'
                            }`}
                            onClick={() => setSelectedSlot(s.id)}
                          >
                            {formatTime(s.startTime)}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        {t('booking.slotDuration')}
                      </p>
                    </div>
                  )}

                  {selectedSlot && (
                    <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                      <h4 className="font-medium">{t('booking.yourInformation')}</h4>
                      <Input
                        placeholder={t('booking.fullName')}
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        error={errors.patientName}
                      />
                      <Input
                        placeholder={t('booking.phone')}
                        value={patientPhone}
                        onChange={(e) => setPatientPhone(e.target.value)}
                        error={errors.patientPhone}
                      />
                      <Input
                        placeholder={t('booking.emailOptional')}
                        value={patientEmail}
                        onChange={(e) => setPatientEmail(e.target.value)}
                      />
                      <Input
                        placeholder={t('booking.reasonOptional')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <Button className="w-full" onClick={doBooking} loading={loading}>
                        {t('booking.confirmBooking')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-2">{t('booking.submitted')}</h3>
                <p className="text-gray-500 mb-4">{t('booking.submittedMessage')}</p>
                <Button onClick={resetForm}>{t('booking.bookAnother')}</Button>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === 'manage' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('booking.patient')}</th>
                <th>{t('booking.phone')}</th>
                <th>{t('booking.doctor')}</th>
                <th>{t('booking.dateTime')}</th>
                <th>{t('booking.source')}</th>
                <th>{t('common.status')}</th>
                <th>{t('booking.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title={t('booking.noRequests')} />
                  </td>
                </tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="font-medium">{sanitizeString(r.patientName)}</td>
                    <td className="text-xs">{sanitizeString(r.patientPhone)}</td>
                    <td className="text-xs">{sanitizeString(r.doctorName || '-')}</td>
                    <td className="text-xs">{sanitizeString(r.slotDate)} {sanitizeString(r.slotTime)}</td>
                    <td><Badge>{sanitizeString(r.source)}</Badge></td>
                    <td>
                      <Badge variant={r.status === 'confirmed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'warning'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {r.status === 'pending' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleConfirmRequest(r.id)}>
                              {t('booking.confirm')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleCancelRequest(r.id)}>
                              {t('booking.cancel')}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
