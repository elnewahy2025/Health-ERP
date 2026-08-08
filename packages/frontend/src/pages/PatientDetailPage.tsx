import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { patientsApi, emrApi, billingApi } from '../lib/api';
import { isValidEgyptianPhone, isValidEgyptianNationalId, isValidEmail, isValidName } from '../lib/validators';
import { Input, Select } from '../components/ui';
import { ArrowLeft, Calendar, Receipt, Pencil, Eye, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface PatientFormData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  phone: string;
  email: string;
  bloodType: string;
  nationality: string;
  nationalId: string;
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  interface PatientDetail { id: string; firstName: string; lastName: string; email?: string; phone: string; gender: string; dateOfBirth: string; bloodType: string; nationality: string; status: string; medicalRecordNumber: string; nationalId?: string; updatedAt?: string; recentAppointments: AppointmentSummary[]; recentInvoices: InvoiceSummary[]; }
interface AppointmentSummary { id: string; appointmentDate: string; appointment_date?: string; start_time?: string; status: string; type: string; doctorName?: string; }
interface InvoiceSummary { id: string; total: number; status: string; createdAt: string; invoice_number?: string; }
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PatientFormData | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PatientFormData, string>>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  const toForm = (p: PatientDetail): PatientFormData => ({
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    dateOfBirth: (p.dateOfBirth || '').substring(0, 10),
    gender: p.gender === 'female' ? 'female' : 'male',
    phone: p.phone || '',
    email: p.email || '',
    bloodType: p.bloodType || '',
    nationality: p.nationality || '',
    nationalId: p.nationalId || '',
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    patientsApi.get(id)
      .then((data) => { setPatient(data); setForm(toForm(data)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
  );
  if (!patient) return <div className="text-center py-12 text-gray-500">Patient not found</div>;

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-2 border-b border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '-'}</span>
    </div>
  );

  const validateField = (field: keyof PatientFormData, value: string): string | null => {
    switch (field) {
      case 'firstName':
        if (!value.trim()) return 'First name is required';
        if (!isValidName(value)) return 'Only letters, spaces, hyphens allowed';
        if (value.length < 2) return 'Must be at least 2 characters';
        return null;
      case 'lastName':
        if (!value.trim()) return 'Last name is required';
        if (!isValidName(value)) return 'Only letters, spaces, hyphens allowed';
        if (value.length < 2) return 'Must be at least 2 characters';
        return null;
      case 'dateOfBirth':
        if (!value) return 'Date of birth is required';
        if (new Date(value) > new Date()) return 'Date cannot be in the future';
        return null;
      case 'gender':
        if (!value) return 'Gender is required';
        return null;
      case 'phone':
        if (!value.trim()) return 'Phone number is required';
        if (!isValidEgyptianPhone(value)) return 'Enter a valid Egyptian phone (e.g. 01012345678)';
        return null;
      case 'email':
        if (value && !isValidEmail(value)) return 'Enter a valid email address';
        return null;
      case 'nationalId':
        if (!value.trim()) return 'National ID is required';
        if (!isValidEgyptianNationalId(value)) return 'Enter a valid 14-digit National ID';
        return null;
      default:
        return null;
    }
  };

  const validateAll = (): boolean => {
    if (!form) return false;
    const errors: Partial<Record<keyof PatientFormData, string>> = {};
    const requiredFields: (keyof PatientFormData)[] = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'phone', 'nationalId'];
    for (const field of requiredFields) {
      const error = validateField(field, form[field]);
      if (error) errors[field] = error;
    }
    if (form.email) {
      const error = validateField('email', form.email);
      if (error) errors.email = error;
    }
    if (form.nationalId) {
      const error = validateField('nationalId', form.nationalId);
      if (error) errors.nationalId = error;
    }
    setFormErrors(errors);
    setTouchedFields({ firstName: true, lastName: true, dateOfBirth: true, gender: true, phone: true, email: true, nationalId: true });
    return Object.keys(errors).length === 0;
  };

  const handleFieldChange = (field: keyof PatientFormData, value: string) => {
    setForm(prev => prev ? { ...prev, [field]: value } : prev);
    if (touchedFields[field]) {
      const error = validateField(field, value);
      setFormErrors(prev => {
        const next = { ...prev };
        if (error) next[field] = error;
        else delete next[field];
        return next;
      });
    }
  };

  const handleFieldBlur = (field: keyof PatientFormData) => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));
    if (!form) return;
    const error = validateField(field, form[field]);
    setFormErrors(prev => {
      const next = { ...prev };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  };

  const getFieldError = (field: keyof PatientFormData) => {
    if (!touchedFields[field]) return undefined;
    return formErrors[field];
  };

  const startEdit = () => {
    setForm(toForm(patient));
    setFormErrors({});
    setTouchedFields({});
    setEditing(true);
  };

  const cancelEdit = () => {
    setForm(toForm(patient));
    setFormErrors({});
    setTouchedFields({});
    setEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form) return;
    if (!validateAll()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (patient.updatedAt) payload._updatedAt = patient.updatedAt;
      const updated = await patientsApi.update(id, payload);
      setPatient(prev => prev ? { ...prev, ...updated } : updated);
      setEditing(false);
      setFormErrors({});
      setTouchedFields({});
      toast.success('Patient updated successfully');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
      toast.error(axiosErr?.response?.data?.message || axiosErr?.response?.data?.error || 'Failed to update patient');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-4">
          <Link to="/patients" className="btn-ghost btn-sm"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title">{patient.firstName} {patient.lastName}</h1>
              <span className="badge-success">{patient.status}</span>
            </div>
            <p className="text-sm text-gray-500 font-mono">{patient.medicalRecordNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={cancelEdit} className="btn-ghost btn-sm"><Eye className="w-4 h-4" /> {t('common.view')}</button>
              <button type="submit" form="patient-edit-form" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
              </button>
            </>
          ) : (
            <button onClick={startEdit} className="btn-secondary"><Pencil className="w-4 h-4" /> {t('common.edit')}</button>
          )}
          <Link to={`/appointments?patientId=${patient.id}`} className="btn-primary">
            <Calendar className="w-4 h-4" /> New Appointment
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Info */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold">{t('patient.details')}</h2></div>
          <div className="card-body">
            {editing && form ? (
              <form id="patient-edit-form" onSubmit={handleSave} noValidate className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label={`${t('patient.firstName')} *`} value={form.firstName}
                    onChange={e => handleFieldChange('firstName', e.target.value)}
                    onBlur={() => handleFieldBlur('firstName')}
                    error={getFieldError('firstName')} required />
                  <Input label={`${t('patient.lastName')} *`} value={form.lastName}
                    onChange={e => handleFieldChange('lastName', e.target.value)}
                    onBlur={() => handleFieldBlur('lastName')}
                    error={getFieldError('lastName')} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label={`${t('patient.dob')} *`} type="date" value={form.dateOfBirth}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => handleFieldChange('dateOfBirth', e.target.value)}
                    onBlur={() => handleFieldBlur('dateOfBirth')}
                    error={getFieldError('dateOfBirth')} required />
                  <Select label={`${t('patient.gender')} *`} value={form.gender}
                    onChange={e => handleFieldChange('gender', e.target.value)}
                    onBlur={() => handleFieldBlur('gender')}
                    error={getFieldError('gender')}
                    options={[{ value: 'male', label: t('patient.gender.male') }, { value: 'female', label: t('patient.gender.female') }]} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label={`${t('patient.phone')} *`} placeholder="01012345678" value={form.phone}
                    onChange={e => handleFieldChange('phone', e.target.value)}
                    onBlur={() => handleFieldBlur('phone')}
                    error={getFieldError('phone')} required />
                  <Input label={t('patient.email')} type="email" value={form.email}
                    onChange={e => handleFieldChange('email', e.target.value)}
                    onBlur={() => handleFieldBlur('email')}
                    error={getFieldError('email')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label={t('patient.bloodType')} value={form.bloodType}
                    onChange={e => handleFieldChange('bloodType', e.target.value)}
                    placeholder={t('common.filter')}
                    options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(v => ({ value: v, label: v }))} />
                  <Input label={`${t('patient.nationalId')} *`} placeholder="14-digit National ID" maxLength={14}
                    value={form.nationalId}
                    onChange={e => handleFieldChange('nationalId', e.target.value.replace(/\D/g, '').substring(0, 14))}
                    onBlur={() => handleFieldBlur('nationalId')}
                    error={getFieldError('nationalId')} required />
                </div>
                <Input label={t('patient.nationality')} value={form.nationality}
                  onChange={e => handleFieldChange('nationality', e.target.value)} />
              </form>
            ) : (
              <>
                <InfoRow label="MRN" value={patient.medicalRecordNumber} />
                <InfoRow label={t('patient.dob')} value={patient.dateOfBirth} />
                <InfoRow label={t('patient.gender')} value={patient.gender} />
                <InfoRow label={t('patient.phone')} value={patient.phone} />
                <InfoRow label={t('patient.email')} value={patient.email || '-'} />
                <InfoRow label={t('patient.bloodType')} value={patient.bloodType} />
                <InfoRow label={t('patient.nationalId')} value={patient.nationalId || '-'} />
                <InfoRow label={t('patient.nationality')} value={patient.nationality} />
              </>
            )}
          </div>
        </div>

        {/* Recent Appointments */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold">Recent Appointments</h2></div>
          <div className="card-body">
            {patient.recentAppointments?.length > 0 ? (
              <div className="space-y-3">
                {patient.recentAppointments.map((a: AppointmentSummary) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Calendar className="w-8 h-8 text-blue-500 bg-blue-50 p-1.5 rounded-lg" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.type}</p>
                      <p className="text-xs text-gray-500">{a.appointment_date} {a.start_time}</p>
                    </div>
                    <span className={`badge ${
                      a.status === 'completed' ? 'badge-success' :
                      a.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                    }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">{t('common.noData')}</p>}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold">Recent Invoices</h2></div>
          <div className="card-body">
            {patient.recentInvoices?.length > 0 ? (
              <div className="space-y-3">
                {patient.recentInvoices.map((inv: InvoiceSummary) => (
                  <div key={inv.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Receipt className="w-8 h-8 text-purple-500 bg-purple-50 p-1.5 rounded-lg" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{inv.invoice_number}</p>
                      <p className="text-xs text-gray-500">{inv.total} EGP</p>
                    </div>
                    <span className={`badge ${
                      inv.status === 'paid' ? 'badge-success' :
                      inv.status === 'overdue' ? 'badge-danger' : 'badge-warning'
                    }`}>{inv.status}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">{t('common.noData')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
