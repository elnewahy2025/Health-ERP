import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface HomeVisitForm {
  patientId: string;
  visitType: string;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  notes: string;
}

const INITIAL_FORM: HomeVisitForm = {
  patientId: '', visitType: 'checkup', scheduledDate: '', scheduledTime: '', address: '', notes: '',
};

const VISIT_TYPES = [
  { value: 'checkup', labelKey: 'homeVisit.checkup' }, { value: 'followup', labelKey: 'homeVisit.followup' },
  { value: 'emergency', labelKey: 'homeVisit.emergency' }, { value: 'vaccination', labelKey: 'homeVisit.vaccination' },
  { value: 'physiotherapy', labelKey: 'homeVisit.physiotherapy' },
];

export default function HomeVisitsPage() {
  const { t } = useTranslation();
  interface HomeVisit {
  id: string;
  visitNumber: string;
  patientName: string;
  visitType: string;
  visitDate: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  reason: string;
  assignedToName: string;
  createdAt: string;
}
  const [visits, setVisits] = useState<HomeVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof HomeVisitForm, string>>>({});
  const [newVisit, setNewVisit] = useState<HomeVisitForm>(INITIAL_FORM);

  useEffect(() => {
    api.get('/home-visits').then(r => setVisits(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof HomeVisitForm, string>> = {};
    if (!newVisit.patientId) errors.patientId = t('validate.homeVisit.patientRequired');
    if (!newVisit.scheduledDate) errors.scheduledDate = t('validate.homeVisit.dateRequired');
    if (!newVisit.address.trim()) errors.address = t('validate.homeVisit.addressRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => { setNewVisit(INITIAL_FORM); setFormErrors({}); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await api.post('/home-visits', newVisit);
      toast.success('Home visit scheduled');
      setShowNewModal(false);
      resetForm();
      const r = await api.get('/home-visits');
      setVisits(r.data.data);
    } catch { toast.error('Failed to schedule visit'); }
    finally { setSaving(false); }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const confirmed = await confirmDialog({ title: 'Update visit', message: `Mark visit as ${status}?`, confirmLabel: 'Yes', cancelLabel: 'No' });
    if (!confirmed) return;
    try {
      await api.put(`/home-visits/${id}`, { status });
      toast.success(`Visit ${status}`);
      const r = await api.get('/home-visits');
      setVisits(r.data.data);
    } catch { toast.error('Failed to update visit'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const filtered = visits.filter(v =>
    !search || v.patientName?.toLowerCase().includes(search.toLowerCase()) || v.visitNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('homeVisit.title')}</h1><p className="text-gray-500 mt-1">{visits.length} visits</p></div>
        <button onClick={() => setShowNewModal(true)} className="btn-primary"><Plus className="w-4 h-4" />{t('homeVisit.schedule')}</button>
      </div>

      <div className="card mb-6"><div className="card-body">
        <Input type="search" placeholder={`${t('common.search')} visits...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div></div>

      <div className="table-container">
        <table>
          <thead><tr><th>{t('homeVisit.visitNumber')}</th><th>{t('homeVisit.patient')}</th><th>{t('homeVisit.type')}</th><th>{t('homeVisit.date')}</th><th>{t('homeVisit.assignedTo')}</th><th>{t('homeVisit.status')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('homeVisit.noVisits')}</td></tr> :
              filtered.map(v => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="font-mono text-xs text-primary-600">{v.visitNumber}</td>
                  <td className="font-medium">{v.patientName}</td>
                  <td><span className="badge-info">{v.visitType}</span></td>
                  <td className="text-xs">{v.scheduledDate}{v.scheduledTime ? ` ${v.scheduledTime}` : ''}</td>
                  <td>{v.assignedToName || '-'}</td>
                  <td><span className={`badge ${v.status === 'completed' ? 'badge-success' : v.status === 'cancelled' ? 'badge-danger' : v.status === 'in_progress' ? 'badge-warning' : 'badge-info'}`}>{v.status}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {v.status === 'scheduled' && <button onClick={() => handleUpdateStatus(v.id, 'in_progress')} className="btn-ghost btn-sm text-blue-600">{t('common.start')}</button>}
                      {v.status === 'in_progress' && <button onClick={() => handleUpdateStatus(v.id, 'completed')} className="btn-ghost btn-sm text-green-600">{t('common.complete')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal open={showNewModal} onClose={() => { setShowNewModal(false); resetForm(); }} title={t('homeVisit.schedule')} size="lg"
        footer={<>
          <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
          <button type="submit" form="hv-form" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
        </>}>
        <form id="hv-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField value={newVisit.patientId}
            onChange={id => { setNewVisit(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId} required />

          <Select label={t('homeVisit.type')} value={newVisit.visitType}
            onChange={e => setNewVisit(prev => ({ ...prev, visitType: e.target.value }))}
            options={VISIT_TYPES.map(o => ({ value: o.value, label: t(o.labelKey) }))} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`${t('homeVisit.date')} *`} type="date" value={newVisit.scheduledDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setNewVisit(prev => ({ ...prev, scheduledDate: e.target.value }))}
              error={formErrors.scheduledDate} required />
            <Input label={t('homeVisit.time')} type="time" value={newVisit.scheduledTime}
              onChange={e => setNewVisit(prev => ({ ...prev, scheduledTime: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('homeVisit.address')} *</label>
            <textarea className={`input ${formErrors.address ? 'border-red-500' : ''}`} rows={2} placeholder="Full address for the visit..."
              value={newVisit.address} onChange={e => setNewVisit(prev => ({ ...prev, address: e.target.value }))} />
            {formErrors.address && <p className="text-sm text-red-600">{formErrors.address}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('homeVisit.notes')}</label>
            <textarea className="input" rows={2} placeholder="Special instructions..." value={newVisit.notes}
              onChange={e => setNewVisit(prev => ({ ...prev, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
