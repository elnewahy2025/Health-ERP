import { useState, useEffect } from 'react';
import type { Appointment } from '../types/appointment';
import { useTranslation } from 'react-i18next';
import { appointmentsApi, commonApi } from '../lib/api';
import { isValidTime, isFutureDate } from '../lib/validators';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { Plus, Loader2, CalendarCheck, CheckCircle2, Ban } from 'lucide-react';
import toast from 'react-hot-toast';

interface AppointmentFormData {
  patientId: string;
  doctorId: string;
  branchId: string;
  appointmentDate: string;
  startTime: string;
  duration: number;
  type: string;
  reason: string;
  isWalkIn: boolean;
  isVirtual: boolean;
}

const INITIAL_FORM: AppointmentFormData = {
  patientId: '', doctorId: '', branchId: '',
  appointmentDate: new Date().toISOString().split('T')[0],
  startTime: '09:00', duration: 15,
  type: 'consultation', reason: '', isWalkIn: false, isVirtual: false,
};

const APPOINTMENT_TYPES = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'checkup', label: 'Check-up' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'telemedicine', label: 'Telemedicine' },
  { value: 'vaccination', label: 'Vaccination' },
];

const DURATION_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
];

export default function AppointmentsPage() {
  const { t } = useTranslation();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AppointmentFormData, string>>>({});
  const [newAppointment, setNewAppointment] = useState<AppointmentFormData>(INITIAL_FORM);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    commonApi.doctors().then(setDoctors).catch(() => {});
    commonApi.branches().then((data) => {
      setBranches(data);
      if (data.length === 1) {
        setNewAppointment(prev => prev.branchId ? prev : { ...prev, branchId: data[0].id });
      }
    }).catch(() => {});
  }, []);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await appointmentsApi.list({ page, limit: 10, date: filterDate || undefined, status: filterStatus || undefined });
      setAppointments(data.data);
      setPagination(data.pagination);
    } catch {
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAppointments(); }, [page, filterDate, filterStatus]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof AppointmentFormData, string>> = {};
    if (!newAppointment.patientId) errors.patientId = t('validate.selectPatient');
    if (!newAppointment.doctorId) errors.doctorId = t('validate.selectDoctor');
    if (!newAppointment.branchId) errors.branchId = t('validate.selectBranch');
    if (!newAppointment.appointmentDate) errors.appointmentDate = t('validate.required');
    if (!isFutureDate(newAppointment.appointmentDate) && newAppointment.appointmentDate !== new Date().toISOString().split('T')[0]) {
      errors.appointmentDate = t('validate.futureDate');
    }
    if (!newAppointment.startTime) errors.startTime = t('validate.required');
    if (!isValidTime(newAppointment.startTime)) errors.startTime = t('validate.invalidTime');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setNewAppointment(INITIAL_FORM);
    setFormErrors({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await appointmentsApi.create(newAppointment);
      toast.success('Appointment created');
      setShowNewModal(false);
      resetForm();
      loadAppointments();
    } catch {
      toast.error('Failed to create appointment');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckIn = async (id: string) => {
    try { await appointmentsApi.checkIn(id); toast.success('Checked in'); loadAppointments(); }
    catch { toast.error('Failed to check in'); }
  };

  const handleComplete = async (id: string) => {
    try { await appointmentsApi.complete(id); toast.success('Completed'); loadAppointments(); }
    catch { toast.error('Failed to complete'); }
  };

  const handleCancel = async (id: string) => {
    const reason = await confirmDialog({
      title: 'Cancel appointment',
      message: 'Appointments cancelled within 24 hours need a reason. You can cancel at any time.',
      confirmLabel: 'Cancel appointment',
      cancelLabel: 'Keep appointment',
      inputLabel: 'Reason',
      inputPlaceholder: 'e.g. Patient request, schedule conflict',
      danger: true,
    });
    if (reason === null) return;
    try {
      await appointmentsApi.cancel(id, (reason as string) || undefined);
      toast.success('Cancelled');
      loadAppointments();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(axiosErr?.response?.data?.message || axiosErr?.response?.data?.error || 'Failed to cancel');
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: 'badge-info', confirmed: 'badge-info',
      checked_in: 'badge-warning', in_progress: 'badge-warning',
      completed: 'badge-success', cancelled: 'badge-danger', no_show: 'badge-gray',
    };
    return map[status] || 'badge-gray';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('appointment.title')}</h1>
          <p className="text-gray-500 mt-1">{pagination.total} appointments</p>
        </div>
        <button onClick={() => setShowNewModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />{t('appointment.new')}
        </button>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row flex-wrap gap-4">
            <Input label={t('appointment.date')} type="date" value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setPage(1); }} />
            <Select label={t('common.status')} value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              placeholder={t('common.filter')}
              options={[
                { value: 'scheduled', label: t('appointment.status.scheduled') },
                { value: 'confirmed', label: t('appointment.status.confirmed') },
                { value: 'checked_in', label: t('appointment.status.checkedIn') },
                { value: 'in_progress', label: t('appointment.status.inProgress') },
                { value: 'completed', label: t('appointment.status.completed') },
                { value: 'cancelled', label: t('appointment.status.cancelled') },
                { value: 'no_show', label: t('appointment.status.noShow') },
              ]} />
          </div>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{t('appointment.patient')}</th><th>{t('appointment.date')}</th><th>{t('appointment.time')}</th>
              <th>{t('appointment.type')}</th><th>{t('appointment.doctor')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {appointments.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('common.noData')}</td></tr>
            ) : appointments.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td><p className="font-medium">{a.patientName}</p><p className="text-xs text-gray-500 font-mono">{a.patientMrn}</p></td>
                <td>{a.appointmentDate?.substring(0, 10)}</td><td>{a.startTime} - {a.endTime}</td>
                <td><span className="badge-info">{a.type}</span></td>
                <td>{a.doctorName || '-'}</td>
                <td><span className={statusBadge(a.status)}>{a.status}</span></td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {(a.status === 'scheduled' || a.status === 'confirmed') && <button onClick={() => handleCheckIn(a.id)} className="btn-ghost btn-sm"><CalendarCheck className="w-3.5 h-3.5" />{t('appointment.status.checkedIn')}</button>}
                    {a.status === 'checked_in' && <button onClick={() => handleComplete(a.id)} className="btn-ghost btn-sm text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />{t('appointment.status.completed')}</button>}
                    {(a.status === 'scheduled' || a.status === 'confirmed') && <button onClick={() => handleCancel(a.id)} className="btn-ghost btn-sm text-red-600"><Ban className="w-3.5 h-3.5" />{t('appointment.status.cancelled')}</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary btn-sm">←</button>
          <span className="text-sm text-gray-600">Page {page} / {pagination.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="btn-secondary btn-sm">→</button>
        </div>
      )}

      <Modal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); resetForm(); }}
        title={t('appointment.new')}
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" form="appointment-form" disabled={saving} className="btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.create')}
            </button>
          </>
        }>
        <form id="appointment-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField
            value={newAppointment.patientId}
            onChange={id => { setNewAppointment(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId}
            required />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={`${t('appointment.doctor')} *`} value={newAppointment.doctorId}
              onChange={e => { setNewAppointment(prev => ({ ...prev, doctorId: e.target.value })); setFormErrors(prev => { const n = { ...prev }; delete n.doctorId; return n; }); }}
              placeholder={t('appointment.selectDoctor')}
              error={formErrors.doctorId}
              options={doctors.map(d => ({ value: d.id, label: d.name }))} />
            <Select label={`${t('appointment.branch')} *`} value={newAppointment.branchId}
              onChange={e => { setNewAppointment(prev => ({ ...prev, branchId: e.target.value })); setFormErrors(prev => { const n = { ...prev }; delete n.branchId; return n; }); }}
              placeholder={t('appointment.selectBranch')}
              error={formErrors.branchId}
              options={branches.map(b => ({ value: b.id, label: b.name }))} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`${t('appointment.date')} *`} type="date" value={newAppointment.appointmentDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setNewAppointment(prev => ({ ...prev, appointmentDate: e.target.value }))}
              error={formErrors.appointmentDate} required />
            <Input label={`${t('appointment.time')} *`} type="time" value={newAppointment.startTime}
              onChange={e => setNewAppointment(prev => ({ ...prev, startTime: e.target.value }))}
              error={formErrors.startTime} required />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('appointment.type')} value={newAppointment.type}
              onChange={e => setNewAppointment(prev => ({ ...prev, type: e.target.value }))}
              options={APPOINTMENT_TYPES} />
            <Select label={t('appointment.duration')} value={String(newAppointment.duration)}
              onChange={e => setNewAppointment(prev => ({ ...prev, duration: Number(e.target.value) }))}
              options={DURATION_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))} />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('appointment.reason')}</label>
            <textarea className="input" rows={2} value={newAppointment.reason}
              onChange={e => setNewAppointment(prev => ({ ...prev, reason: e.target.value }))} />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newAppointment.isWalkIn}
                onChange={e => setNewAppointment(prev => ({ ...prev, isWalkIn: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600" />
              <span className="text-sm">{t('appointment.walkIn')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newAppointment.isVirtual}
                onChange={e => setNewAppointment(prev => ({ ...prev, isVirtual: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600" />
              <span className="text-sm">{t('appointment.virtual')}</span>
            </label>
          </div>
        </form>
      </Modal>
    </div>
  );
}
