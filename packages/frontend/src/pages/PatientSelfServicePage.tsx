import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Calendar, Clock, User, CreditCard, CheckCircle,
  ArrowRight, ArrowLeft, Stethoscope, FlaskConical, PillBottle,
  ChevronRight,
} from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, Table,
  PageLoader, EmptyState, Modal, type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import { isValidDate, isFutureDate } from '../lib/validators';

/* ── Types ─────────────────────────────────────────────────────────── */

type SelfServiceTab = 'book' | 'appointments' | 'lab' | 'prescriptions' | 'invoices';

interface Doctor {
  id: string;
  name: string;
  email: string;
}

interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  endTime: string;
  type: string;
  status: string;
  reason: string;
}

interface LabOrder {
  id: string;
  testName: string;
  status: string;
  orderedDate: string;
  notes: string;
}

interface Prescription {
  id: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  prescribedDate: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  dueAmount: number;
  status: string;
  issuedAt: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const APPOINTMENT_TYPES = [
  { value: 'consultation', label: 'selfService.consultation' },
  { value: 'follow_up', label: 'selfService.followUp' },
  { value: 'emergency', label: 'selfService.emergency' },
  { value: 'checkup', label: 'selfService.checkup' },
] as const;

const PAGE_SIZE = 10;
const CURRENCY = 'EGP';

/* ── Helpers ───────────────────────────────────────────────────────── */

function getStatusBadgeVariant(
  status: string
): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
    confirmed: 'success',
    completed: 'success',
    paid: 'success',
    normal: 'success',
    scheduled: 'info',
    pending: 'warning',
    in_progress: 'warning',
    abnormal: 'warning',
    cancelled: 'danger',
    critical: 'danger',
    unpaid: 'danger',
  };
  return map[status] ?? 'gray';
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function PatientSelfServicePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SelfServiceTab>('book');
  const [loading, setLoading] = useState(true);

  /* ── Booking state ── */
  const [step, setStep] = useState(1);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [reason, setReason] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  /* ── Data state ── */
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  /* ── Pagination ── */
  const [appointmentsPage, setAppointmentsPage] = useState(1);
  const [labPage, setLabPage] = useState(1);
  const [prescriptionsPage, setPrescriptionsPage] = useState(1);
  const [invoicesPage, setInvoicesPage] = useState(1);

  /* ── Data fetching ── */

  const fetchDoctors = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/doctors');
      setDoctors((data.data ?? []) as Doctor[]);
    } catch {
      toast.error(t('selfService.loadDoctorsFailed'));
    }
  }, [t]);

  const fetchAppointments = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/appointments', { params: { limit: 50 } });
      const rows = (data.data?.rows ?? data.data ?? []) as Appointment[];
      setAppointments(rows);
    } catch {
      toast.error(t('selfService.loadAppointmentsFailed'));
    }
  }, [t]);

  const fetchLabOrders = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/lab/orders', { params: { limit: 50 } });
      const rows = (data.data?.rows ?? data.data ?? []) as LabOrder[];
      setLabOrders(rows);
    } catch {
      toast.error(t('selfService.loadLabFailed'));
    }
  }, [t]);

  const fetchPrescriptions = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/pharmacy/prescriptions', { params: { limit: 50 } });
      const rows = (data.data?.rows ?? data.data ?? []) as Prescription[];
      setPrescriptions(rows);
    } catch {
      toast.error(t('selfService.loadPrescriptionsFailed'));
    }
  }, [t]);

  const fetchInvoices = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/invoices', { params: { limit: 50 } });
      const rows = (data.data?.rows ?? data.data ?? []) as Invoice[];
      setInvoices(rows);
    } catch {
      toast.error(t('selfService.loadInvoicesFailed'));
    }
  }, [t]);

  /* ── Initial load (single useEffect, cancellation flag) ── */

  useEffect(() => {
    let cancelled = false;

    const loadAll = async (): Promise<void> => {
      setLoading(true);
      const results = await Promise.allSettled([
        fetchDoctors(),
        fetchAppointments(),
      ]);
      if (!cancelled) {
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
          void failed;
        }
        setLoading(false);
      }
    };

    void loadAll();
    return () => { cancelled = true; };
  }, [fetchDoctors, fetchAppointments]);

  /* ── Tab-specific data loading ── */

  useEffect(() => {
    let cancelled = false;

    const loadTabData = async (): Promise<void> => {
      setLoading(true);
      let promise: Promise<unknown> = Promise.resolve();

      switch (activeTab) {
        case 'appointments':
          promise = fetchAppointments();
          break;
        case 'lab':
          promise = fetchLabOrders();
          break;
        case 'prescriptions':
          promise = fetchPrescriptions();
          break;
        case 'invoices':
          promise = fetchInvoices();
          break;
        default:
          break;
      }

      await promise;
      if (!cancelled) setLoading(false);
    };

    if (activeTab !== 'book') {
      void loadTabData();
    }

    return () => { cancelled = true; };
  }, [activeTab, fetchAppointments, fetchLabOrders, fetchPrescriptions, fetchInvoices]);

  /* ── Booking logic ── */

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? null;
  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null;

  const handleNextStep = useCallback((): void => {
    if (step === 1 && !selectedDoctorId) {
      toast.error(t('selfService.completeAll'));
      return;
    }
    if (step === 2 && (!selectedDate || !isValidDate(selectedDate))) {
      toast.error(t('selfService.completeAll'));
      return;
    }
    if (step === 3 && !selectedSlotId) {
      toast.error(t('selfService.completeAll'));
      return;
    }
    setStep((s) => Math.min(s + 1, 4));
  }, [step, selectedDoctorId, selectedDate, selectedSlotId, t]);

  const handlePrevStep = useCallback((): void => {
    setStep((s) => Math.max(s - 1, 1));
  }, []);

  const handleDateChange = useCallback(
    (value: string): void => {
      setSelectedDate(value);
      setSelectedSlotId('');
      setSlots([]);
      if (value && isValidDate(value) && isFutureDate(value)) {
        void api
          .get('/booking/slots', {
            params: { doctorId: selectedDoctorId, date: value },
          })
          .then(({ data }) => {
            setSlots((data.data ?? []) as TimeSlot[]);
          })
          .catch(() => {
            setSlots([]);
          });
      }
    },
    [selectedDoctorId]
  );

  const handleBookingConfirm = useCallback(async (): Promise<void> => {
    if (!selectedDoctorId || !selectedDate || !selectedSlotId) {
      toast.error(t('selfService.completeAll'));
      return;
    }
    setBookingLoading(true);
    try {
      await api.post('/appointments', {
        doctor_id: selectedDoctorId,
        appointment_date: selectedDate,
        start_time: selectedSlot?.startTime ?? '',
        end_time: selectedSlot?.endTime ?? '',
        appointment_type: appointmentType,
        reason: sanitizeString(reason),
      });
      setBookingSuccess(true);
      setShowConfirmModal(false);
      toast.success(t('selfService.bookingSuccess'));
      void fetchAppointments();
    } catch {
      toast.error(t('selfService.bookingFailed'));
    } finally {
      setBookingLoading(false);
    }
  }, [
    selectedDoctorId, selectedDate, selectedSlotId, selectedSlot,
    appointmentType, reason, t, fetchAppointments,
  ]);

  const resetBooking = useCallback((): void => {
    setStep(1);
    setSelectedDoctorId('');
    setSelectedDate('');
    setSelectedSlotId('');
    setAppointmentType('consultation');
    setReason('');
    setBookingSuccess(false);
    setSlots([]);
  }, []);

  /* ── Table columns ── */

  const appointmentColumns: Column<Appointment>[] = [
    {
      key: 'date',
      header: t('selfService.date'),
      render: (item) => <span className="font-medium">{escapeHtml(item.date)}</span>,
    },
    {
      key: 'time',
      header: t('selfService.time'),
      render: (item) => <span>{escapeHtml(item.time)}</span>,
    },
    {
      key: 'type',
      header: t('selfService.type'),
      render: (item) => <Badge variant="info">{t(`selfService.${item.type}`) || item.type}</Badge>,
    },
    {
      key: 'status',
      header: t('selfService.status'),
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>
          {t(`selfService.${item.status}`) || item.status}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: t('selfService.reasonCol'),
      render: (item) => (
        <span className="text-gray-600 truncate max-w-[200px] block">
          {escapeHtml(item.reason || '-')}
        </span>
      ),
    },
  ];

  const labColumns: Column<LabOrder>[] = [
    {
      key: 'testName',
      header: t('selfService.testName'),
      render: (item) => <span className="font-medium">{escapeHtml(item.testName)}</span>,
    },
    {
      key: 'status',
      header: t('selfService.status'),
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>
          {t(`selfService.${item.status}`) || item.status}
        </Badge>
      ),
    },
    {
      key: 'orderedDate',
      header: t('selfService.date'),
      render: (item) => <span>{escapeHtml(item.orderedDate)}</span>,
    },
    {
      key: 'notes',
      header: t('common.reason'),
      render: (item) => (
        <span className="text-gray-600 truncate max-w-[200px] block">
          {escapeHtml(item.notes || '-')}
        </span>
      ),
    },
  ];

  const prescriptionColumns: Column<Prescription>[] = [
    {
      key: 'medication',
      header: t('selfService.medication'),
      render: (item) => <span className="font-medium">{escapeHtml(item.medication)}</span>,
    },
    {
      key: 'dosage',
      header: t('selfService.dosage'),
      render: (item) => <span>{escapeHtml(item.dosage)}</span>,
    },
    {
      key: 'frequency',
      header: t('selfService.frequency'),
      render: (item) => <span>{escapeHtml(item.frequency)}</span>,
    },
    {
      key: 'duration',
      header: t('selfService.duration'),
      render: (item) => <span>{escapeHtml(item.duration)}</span>,
    },
    {
      key: 'prescribedDate',
      header: t('selfService.prescribedDate'),
      render: (item) => <span>{escapeHtml(item.prescribedDate)}</span>,
    },
  ];

  const invoiceColumns: Column<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: t('selfService.invoiceNumber'),
      render: (item) => <span className="font-medium">{escapeHtml(item.invoiceNumber)}</span>,
    },
    {
      key: 'total',
      header: t('selfService.amount'),
      render: (item) => (
        <span>{item.total?.toLocaleString('ar-EG')} {CURRENCY}</span>
      ),
    },
    {
      key: 'status',
      header: t('selfService.status'),
      render: (item) => (
        <Badge variant={getStatusBadgeVariant(item.status)}>
          {t(`selfService.${item.status}`) || item.status}
        </Badge>
      ),
    },
    {
      key: 'issuedAt',
      header: t('selfService.invoiceDate'),
      render: (item) => <span>{formatDateTime(item.issuedAt) || '-'}</span>,
    },
  ];

  /* ── Step indicators ── */

  const steps = [
    { num: 1, label: t('selfService.stepDoctor') },
    { num: 2, label: t('selfService.stepDate') },
    { num: 3, label: t('selfService.stepTime') },
    { num: 4, label: t('selfService.stepConfirm') },
  ];

  /* ── Pagination helpers ── */

  function paginate<T>(data: T[], page: number): { paged: T[]; totalPages: number } {
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return { paged: data.slice(start, start + PAGE_SIZE), totalPages };
  }

  /* ── Tabs config ── */

  const tabs: Array<{ key: SelfServiceTab; icon: React.ReactNode; label: string }> = [
    { key: 'book', icon: <Calendar className="w-4 h-4" />, label: t('selfService.bookTab') },
    { key: 'appointments', icon: <Clock className="w-4 h-4" />, label: t('selfService.appointmentsTab') },
    { key: 'lab', icon: <FlaskConical className="w-4 h-4" />, label: t('selfService.labTab') },
    { key: 'prescriptions', icon: <PillBottle className="w-4 h-4" />, label: t('selfService.prescriptionsTab') },
    { key: 'invoices', icon: <CreditCard className="w-4 h-4" />, label: t('selfService.invoicesTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <User className="w-6 h-6 text-primary-600" />
          {t('selfService.title')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t('selfService.subtitle')}</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'book') resetBooking(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {loading && activeTab !== 'book' ? (
          <PageLoader message={t('common.loading')} />
        ) : (
          <>
            {/* ── BOOK TAB ── */}
            {activeTab === 'book' && (
              <Card>
                <CardBody className="p-6">
                  {bookingSuccess ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {t('selfService.bookingSuccess')}
                      </h3>
                      <Button onClick={resetBooking} className="mt-4">
                        {t('selfService.bookNow')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Step Indicators */}
                      <div className="flex items-center justify-center gap-2 mb-8">
                        {steps.map((s, idx) => (
                          <div key={s.num} className="flex items-center">
                            <div
                              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                                step >= s.num
                                  ? 'bg-primary-600 text-white'
                                  : 'bg-gray-200 text-gray-500'
                              }`}
                            >
                              {s.num}
                            </div>
                            <span className="ml-2 text-sm text-gray-600 hidden sm:inline">
                              {s.label}
                            </span>
                            {idx < steps.length - 1 && (
                              <ChevronRight className="w-4 h-4 text-gray-400 mx-2 hidden sm:block" />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Step 1: Select Doctor */}
                      {step === 1 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">
                            {t('selfService.selectDoctor')}
                          </h3>
                          {doctors.length === 0 ? (
                            <EmptyState
                              icon={<Stethoscope className="w-8 h-8 text-gray-400" />}
                              title={t('selfService.noDoctors')}
                              message={t('selfService.loadDoctorsFailed')}
                            />
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              {doctors.map((doc) => (
                                <button
                                  key={doc.id}
                                  onClick={() => setSelectedDoctorId(doc.id)}
                                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                                    selectedDoctorId === doc.id
                                      ? 'border-primary-600 bg-primary-50 shadow-md'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                                      <Stethoscope className="w-5 h-5 text-primary-600" />
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-900">
                                        {escapeHtml(doc.name)}
                                      </p>
                                      <p className="text-sm text-gray-500">
                                        {escapeHtml(doc.email)}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Step 2: Select Date */}
                      {step === 2 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">
                            {t('selfService.selectDate')}
                          </h3>
                          <div className="max-w-md">
                            <Input
                              type="date"
                              label={t('selfService.selectDate')}
                              value={selectedDate}
                              onChange={(e) => handleDateChange(e.target.value)}
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </div>
                        </div>
                      )}

                      {/* Step 3: Select Time Slot */}
                      {step === 3 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">
                            {t('selfService.selectTime')}
                          </h3>
                          {slots.length === 0 ? (
                            <EmptyState
                              icon={<Clock className="w-8 h-8 text-gray-400" />}
                              title={t('selfService.noSlots')}
                            />
                          ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                              {slots.map((slot) => (
                                <button
                                  key={slot.id}
                                  disabled={!slot.available}
                                  onClick={() => setSelectedSlotId(slot.id)}
                                  className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${
                                    !slot.available
                                      ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                                      : selectedSlotId === slot.id
                                        ? 'border-primary-600 bg-primary-50 text-primary-700 shadow-md'
                                        : 'border-gray-200 hover:border-primary-300 text-gray-700'
                                  }`}
                                >
                                  {escapeHtml(slot.startTime)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Step 4: Confirm */}
                      {step === 4 && (
                        <div className="space-y-6">
                          <h3 className="text-lg font-semibold">
                            {t('selfService.confirmBooking')}
                          </h3>

                          <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t('selfService.doctor')}</span>
                              <span className="font-medium">{escapeHtml(selectedDoctor?.name ?? '')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t('selfService.date')}</span>
                              <span className="font-medium">{escapeHtml(selectedDate)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t('selfService.time')}</span>
                              <span className="font-medium">{escapeHtml(selectedSlot?.startTime ?? '')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">{t('selfService.type')}</span>
                              <Badge variant="info">
                                {t(`selfService.${appointmentType}`)}
                              </Badge>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Select
                              label={t('selfService.appointmentType')}
                              value={appointmentType}
                              onChange={(e) => setAppointmentType(e.target.value)}
                              options={APPOINTMENT_TYPES.map((opt) => ({
                                value: opt.value,
                                label: t(opt.label),
                              }))}
                            />
                            <Input
                              label={t('selfService.reason')}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder={t('selfService.reasonPlaceholder')}
                              maxLength={500}
                            />
                          </div>
                        </div>
                      )}

                      {/* Navigation Buttons */}
                      <div className="flex justify-between mt-8 pt-4 border-t border-gray-200">
                        {step > 1 ? (
                          <Button variant="secondary" onClick={handlePrevStep}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            {t('selfService.back')}
                          </Button>
                        ) : (
                          <div />
                        )}
                        {step < 4 ? (
                          <Button onClick={handleNextStep}>
                            {t('selfService.next')}
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>
                        ) : (
                          <Button
                            onClick={() => setShowConfirmModal(true)}
                            loading={bookingLoading}
                            disabled={bookingLoading}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {t('selfService.confirmBooking')}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>
            )}

            {/* ── APPOINTMENTS TAB ── */}
            {activeTab === 'appointments' && (
              <Card>
                <CardBody className="p-0">
                  <Table<Appointment>
                    columns={appointmentColumns}
                    data={paginate(appointments, appointmentsPage).paged}
                    loading={false}
                    emptyMessage={t('selfService.noAppointments')}
                    pagination={{
                      page: appointmentsPage,
                      totalPages: paginate(appointments, appointmentsPage).totalPages,
                      total: appointments.length,
                      onPageChange: setAppointmentsPage,
                    }}
                  />
                </CardBody>
              </Card>
            )}

            {/* ── LAB TAB ── */}
            {activeTab === 'lab' && (
              <Card>
                <CardBody className="p-0">
                  <Table<LabOrder>
                    columns={labColumns}
                    data={paginate(labOrders, labPage).paged}
                    loading={false}
                    emptyMessage={t('selfService.noLabResults')}
                    pagination={{
                      page: labPage,
                      totalPages: paginate(labOrders, labPage).totalPages,
                      total: labOrders.length,
                      onPageChange: setLabPage,
                    }}
                  />
                </CardBody>
              </Card>
            )}

            {/* ── PRESCRIPTIONS TAB ── */}
            {activeTab === 'prescriptions' && (
              <Card>
                <CardBody className="p-0">
                  <Table<Prescription>
                    columns={prescriptionColumns}
                    data={paginate(prescriptions, prescriptionsPage).paged}
                    loading={false}
                    emptyMessage={t('selfService.noPrescriptions')}
                    pagination={{
                      page: prescriptionsPage,
                      totalPages: paginate(prescriptions, prescriptionsPage).totalPages,
                      total: prescriptions.length,
                      onPageChange: setPrescriptionsPage,
                    }}
                  />
                </CardBody>
              </Card>
            )}

            {/* ── INVOICES TAB ── */}
            {activeTab === 'invoices' && (
              <Card>
                <CardBody className="p-0">
                  <Table<Invoice>
                    columns={invoiceColumns}
                    data={paginate(invoices, invoicesPage).paged}
                    loading={false}
                    emptyMessage={t('selfService.noInvoices')}
                    pagination={{
                      page: invoicesPage,
                      totalPages: paginate(invoices, invoicesPage).totalPages,
                      total: invoices.length,
                      onPageChange: setInvoicesPage,
                    }}
                  />
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>

      {/* ── Confirm Booking Modal ── */}
      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={t('selfService.confirmBooking')}
        size="sm"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void handleBookingConfirm()}
              loading={bookingLoading}
              disabled={bookingLoading}
            >
              {t('selfService.bookNow')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('selfService.doctor')}</span>
            <span className="font-medium">{escapeHtml(selectedDoctor?.name ?? '')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('selfService.date')}</span>
            <span className="font-medium">{escapeHtml(selectedDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('selfService.time')}</span>
            <span className="font-medium">{escapeHtml(selectedSlot?.startTime ?? '')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('selfService.type')}</span>
            <Badge variant="info">{t(`selfService.${appointmentType}`)}</Badge>
          </div>
          {reason && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('selfService.reason')}</span>
              <span className="font-medium">{escapeHtml(reason)}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
