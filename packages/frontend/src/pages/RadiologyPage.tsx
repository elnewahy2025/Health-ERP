import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';

interface RadiologyOrderForm {
  patientId: string;
  studyType: string;
  bodyPart: string;
  priority: string;
  clinicalIndication: string;
}

const INITIAL_FORM: RadiologyOrderForm = {
  patientId: '', studyType: '', bodyPart: '', priority: 'routine', clinicalIndication: '',
};

const STUDY_TYPES = [
  'X-Ray', 'CT Scan', 'MRI', 'Ultrasound', 'Mammography',
  'DEXA', 'Fluoroscopy', 'Nuclear Medicine', 'PET Scan', 'Angiography',
];

export default function RadiologyPage() {
  const { t } = useTranslation();
  interface RadiologyOrder {
  id: string;
  orderNumber: string;
  patientName: string;
  patientMrn: string;
  studyType: string;
  bodyPart: string;
  status: string;
  priority: string;
  orderDate: string;
  findings: string;
  createdAt: string;
}
  const [orders, setOrders] = useState<RadiologyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RadiologyOrderForm, string>>>({});
  const [newOrder, setNewOrder] = useState<RadiologyOrderForm>(INITIAL_FORM);

  useEffect(() => {
    api.get('/radiology/orders').then(r => setOrders(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof RadiologyOrderForm, string>> = {};
    if (!newOrder.patientId) errors.patientId = t('validate.rad.patientRequired');
    if (!newOrder.studyType) errors.studyType = t('validate.rad.studyTypeRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => { setNewOrder(INITIAL_FORM); setFormErrors({}); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await api.post('/radiology/orders', newOrder);
      toast.success('Radiology order created');
      setShowNewModal(false);
      resetForm();
      const r = await api.get('/radiology/orders');
      setOrders(r.data.data);
    } catch { toast.error('Failed to create radiology order'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const filtered = orders.filter(o =>
    !search || o.patientName?.toLowerCase().includes(search.toLowerCase()) || o.orderNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('radiology.title')}</h1><p className="text-gray-500 mt-1">{orders.length} orders</p></div>
        <Can permission="radiology.create">
          <button onClick={() => setShowNewModal(true)} className="btn-primary"><Plus className="w-4 h-4" />{t('radiology.newOrder')}</button>
        </Can>
      </div>

      <div className="card mb-6"><div className="card-body">
        <Input type="search" placeholder={`${t('common.search')} orders...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div></div>

      <div className="table-container">
        <table>
          <thead><tr><th>{t('radiology.orderNumber')}</th><th>{t('radiology.patient')}</th><th>{t('radiology.studyType')}</th><th>{t('radiology.bodyPart')}</th><th>{t('radiology.status')}</th><th>{t('radiology.priority')}</th><th>{t('radiology.date')}</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('radiology.noOrders')}</td></tr> :
              filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="font-mono text-xs text-primary-600">{o.orderNumber}</td>
                  <td><p className="font-medium">{o.patientName}</p><p className="text-xs text-gray-500 font-mono">{o.patientMrn}</p></td>
                  <td><span className="badge-info">{o.studyType}</span></td>
                  <td>{o.bodyPart || '-'}</td>
                  <td><span className={`badge ${o.status === 'completed' ? 'badge-success' : 'badge-info'}`}>{o.status}</span></td>
                  <td><span className={`badge ${o.priority === 'urgent' ? 'badge-danger' : 'badge-info'}`}>{o.priority}</span></td>
                  <td className="text-xs">{o.orderDate}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); resetForm(); }}
        title={t('radiology.newOrder')}
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
            <Can permission="radiology.create">
              <button type="submit" form="rad-form" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
              </button>
            </Can>
          </>
        }>
        <form id="rad-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField
            value={newOrder.patientId}
            onChange={id => { setNewOrder(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId} required />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={`${t('radiology.studyType')} *`} value={newOrder.studyType}
              onChange={e => { setNewOrder(prev => ({ ...prev, studyType: e.target.value })); setFormErrors(prev => { const n = { ...prev }; delete n.studyType; return n; }); }}
              options={STUDY_TYPES.map(s => ({ value: s, label: s }))}
              placeholder="Select study type"
              error={formErrors.studyType} />
            <Input label={t('radiology.bodyPart')} placeholder="e.g. Chest, Abdomen, Knee..."
              value={newOrder.bodyPart}
              onChange={e => setNewOrder(prev => ({ ...prev, bodyPart: e.target.value }))} />
          </div>

          <Select label={t('radiology.priority')} value={newOrder.priority}
            onChange={e => setNewOrder(prev => ({ ...prev, priority: e.target.value }))}
            options={[
              { value: 'routine', label: t('lab.routine') },
              { value: 'urgent', label: t('lab.urgent') },
              { value: 'stat', label: t('lab.stat') },
            ]} />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('radiology.clinicalIndication')}</label>
            <textarea className="input" rows={3} placeholder="Reason for study, symptoms, relevant history..."
              value={newOrder.clinicalIndication}
              onChange={e => setNewOrder(prev => ({ ...prev, clinicalIndication: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
