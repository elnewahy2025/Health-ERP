import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { patientsApi } from '../lib/api';
import { isValidPhone, isValidNationalId, isValidEmail, isValidName } from '../lib/validators';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { Plus, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '../lib/format';
import { Can } from '../components/auth/Authorization';

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

const INITIAL_FORM: PatientFormData = {
  firstName: '', lastName: '', dateOfBirth: '', gender: 'male',
  phone: '', email: '', bloodType: '', nationality: '', nationalId: '',
};

export default function PatientsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  interface PatientListItem { id: string; firstName: string; lastName: string; phone: string; status: string; medicalRecordNumber?: string; dateOfBirth?: string; gender?: string; bloodType?: string; createdAt?: string; }
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PatientFormData, string>>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [newPatient, setNewPatient] = useState<PatientFormData>(INITIAL_FORM);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const data = await patientsApi.list({ page, limit: 10, search: search || undefined });
      setPatients(data.data);
      setPagination(data.pagination);
    } catch {
      toast.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPatients(); }, [page, search]);

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
        if (!isValidPhone(value)) return 'Enter a valid phone number';
        return null;
      case 'email':
        if (value && !isValidEmail(value)) return 'Enter a valid email address';
        return null;
      case 'nationalId':
        if (!value.trim()) return 'National ID is required';
        if (!isValidNationalId(value)) return 'Enter a valid national identifier';
        return null;
      default:
        return null;
    }
  };

  const validateAll = (): boolean => {
    const errors: Partial<Record<keyof PatientFormData, string>> = {};
    const requiredFields: (keyof PatientFormData)[] = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'phone', 'nationalId'];
    for (const field of requiredFields) {
      const error = validateField(field, newPatient[field]);
      if (error) errors[field] = error;
    }
    if (newPatient.email) {
      const error = validateField('email', newPatient.email);
      if (error) errors.email = error;
    }
    if (newPatient.nationalId) {
      const error = validateField('nationalId', newPatient.nationalId);
      if (error) errors.nationalId = error;
    }
    setFormErrors(errors);
    setTouchedFields({ firstName: true, lastName: true, dateOfBirth: true, gender: true, phone: true, email: true, nationalId: true });
    return Object.keys(errors).length === 0;
  };

  const handleFieldChange = (field: keyof PatientFormData, value: string) => {
    setNewPatient(prev => ({ ...prev, [field]: value }));
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
    const error = validateField(field, newPatient[field]);
    setFormErrors(prev => {
      const next = { ...prev };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;
    setSaving(true);
    try {
      await patientsApi.create(newPatient);
      toast.success('Patient created successfully');
      setShowNewModal(false);
      setNewPatient(INITIAL_FORM);
      setFormErrors({});
      setTouchedFields({});
      loadPatients();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(axiosErr?.response?.data?.error || 'Failed to create patient');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete patient',
      message: 'Delete this patient? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep patient',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await patientsApi.delete(id);
      toast.success('Patient deleted');
      loadPatients();
    } catch {
      toast.error('Failed to delete patient');
    }
  };

  const getFieldError = (field: keyof PatientFormData) => {
    if (!touchedFields[field]) return undefined;
    return formErrors[field];
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('patient.title')}</h1>
          <p className="text-gray-500 mt-1">{pagination.total} total patients</p>
        </div>
        <Can permission="patients.create">
          <button onClick={() => setShowNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('patient.new')}
          </button>
        </Can>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <Input
            type="search"
            placeholder={`${t('common.search')} by name, MRN, phone...`}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{t('patient.mrn')}</th>
              <th>{t('patient.firstName')}</th>
              <th>{t('patient.lastName')}</th>
              <th>{t('patient.dob')}</th>
              <th>{t('patient.registered')}</th>
              <th>{t('patient.gender')}</th>
              <th>{t('patient.phone')}</th>
              <th>{t('patient.bloodType')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary-600" /></td></tr>
            ) : patients.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-gray-500">{t('common.noData')}</td></tr>
            ) : (
              patients.map((p: PatientListItem) => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td className="font-mono text-xs text-primary-600">{p.medicalRecordNumber}</td>
                  <td className="font-medium">{p.firstName}</td>
                  <td>{p.lastName}</td>
                  <td>{formatDate(p.dateOfBirth) || '-'}</td>
                  <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
                  <td>{p.gender === 'male' ? t('patient.gender.male') : t('patient.gender.female')}</td>
                  <td dir="ltr" className="text-left">{p.phone}</td>
                  <td><span className="badge-info">{p.bloodType || '-'}</span></td>
                  <td><span className={p.status === 'active' ? 'badge-success' : 'badge-gray'}>{p.status}</span></td>
                  <td>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Link to={`/patients/${p.id}`} className="btn-ghost btn-sm">{t('common.edit')}</Link>
                      <button onClick={() => handleDelete(p.id)} className="btn-ghost btn-sm text-red-600">{t('common.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} of {pagination.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary btn-sm"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="btn-secondary btn-sm"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <Modal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); setFormErrors({}); setTouchedFields({}); }}
        title={t('patient.new')}
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowNewModal(false); setFormErrors({}); setTouchedFields({}); }} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" form="patient-form" disabled={saving} className="btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
            </button>
          </>
        }>
        <form id="patient-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`${t('patient.firstName')} *`} value={newPatient.firstName}
              onChange={e => handleFieldChange('firstName', e.target.value)}
              onBlur={() => handleFieldBlur('firstName')}
              error={getFieldError('firstName')} required />
            <Input label={`${t('patient.lastName')} *`} value={newPatient.lastName}
              onChange={e => handleFieldChange('lastName', e.target.value)}
              onBlur={() => handleFieldBlur('lastName')}
              error={getFieldError('lastName')} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`${t('patient.dob')} *`} type="date" value={newPatient.dateOfBirth}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => handleFieldChange('dateOfBirth', e.target.value)}
              onBlur={() => handleFieldBlur('dateOfBirth')}
              error={getFieldError('dateOfBirth')} required />
            <Select label={`${t('patient.gender')} *`} value={newPatient.gender}
              onChange={e => handleFieldChange('gender', e.target.value)}
              onBlur={() => handleFieldBlur('gender')}
              error={getFieldError('gender')}
              options={[{ value: 'male', label: t('patient.gender.male') }, { value: 'female', label: t('patient.gender.female') }]} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`${t('patient.phone')} *`} placeholder="e.g., +1234567890" value={newPatient.phone}
              onChange={e => handleFieldChange('phone', e.target.value)}
              onBlur={() => handleFieldBlur('phone')}
              error={getFieldError('phone')} helpText="International or local phone format" required />
            <Input label={t('patient.email')} type="email" value={newPatient.email}
              onChange={e => handleFieldChange('email', e.target.value)}
              onBlur={() => handleFieldBlur('email')}
              error={getFieldError('email')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('patient.bloodType')} value={newPatient.bloodType}
              onChange={e => handleFieldChange('bloodType', e.target.value)}
              placeholder={t('common.filter')}
              options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(v => ({ value: v, label: v }))} />
            <Input label={`${t('patient.nationalId')} *`} placeholder="National ID or clinic identifier" maxLength={32}
              value={newPatient.nationalId}
              onChange={e => handleFieldChange('nationalId', e.target.value.substring(0, 32))}
              onBlur={() => handleFieldBlur('nationalId')}
              error={getFieldError('nationalId')} helpText="Clinic-issued or national identifier" required />
          </div>
          <Input label={t('patient.nationality')} value={newPatient.nationality}
            onChange={e => handleFieldChange('nationality', e.target.value)} />
        </form>
      </Modal>
    </div>
  );
}
