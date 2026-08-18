import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { Plus, Package, ListChecks, Search, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDateTime } from '../lib/format';
import { Can } from '../components/auth/Authorization';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

interface DrugItem {
  drugName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
  refills: number;
  instructions: string;
}

interface RxForm {
  patientId: string;
  notes: string;
  items: DrugItem[];
}

const INITIAL_DRUG_ITEM: DrugItem = {
  drugName: '', dosage: '', route: 'oral', frequency: 'daily',
  duration: '', quantity: 1, refills: 0, instructions: '',
};

const INITIAL_RX: RxForm = { patientId: '', notes: '', items: [] };

const ROUTE_OPTIONS = [
  { value: 'oral', label: 'Oral' }, { value: 'iv', label: 'IV' },
  { value: 'im', label: 'IM' }, { value: 'sc', label: 'SC' },
  { value: 'topical', label: 'Topical' }, { value: 'rectal', label: 'Rectal' },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' }, { value: 'twice_daily', label: 'Twice Daily' },
  { value: 'three_times', label: 'Three Times' }, { value: 'four_times', label: 'Four Times' },
  { value: 'as_needed', label: 'As Needed' },
];

export default function PharmacyPage() {
  const formatMoney = useClinicMoney();
  const { t } = useTranslation();
  const [tab, setTab] = useState<'inventory' | 'prescriptions'>('inventory');
  interface PharmacyDrug {
  id: string;
  drugName: string;
  genericName: string;
  brandName: string;
  stockQuantity: number;
  reorderLevel: number;
  unitPrice: number;
  expiryDate: string;
  status: string;
}
interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientName: string;
  status: string;
  notes: string;
  items: Array<{ id: string; drugName: string; dosage: string; quantity: number; quantityDispensed: number; status: string }>;
  createdAt: string;
}
  const [inventory, setInventory] = useState<PharmacyDrug[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewDrugModal, setShowNewDrugModal] = useState(false);
  const [showNewRxModal, setShowNewRxModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [drugForm, setDrugForm] = useState({
    drugName: '', genericName: '', brandName: '', dosageForm: 'tablet',
    strength: '', stockQuantity: 0, reorderLevel: 10, unitPrice: 0,
    batchNumber: '', expiryDate: '', manufacturer: '',
  });
  const [drugErrors, setDrugErrors] = useState<Partial<Record<string, string>>>({});

  const [rxForm, setRxForm] = useState<RxForm>(INITIAL_RX);
  const [rxErrors, setRxErrors] = useState<Partial<Record<keyof RxForm, string>>>({});
  const [drugItem, setDrugItem] = useState<DrugItem>(INITIAL_DRUG_ITEM);
  const [drugItemErrors, setDrugItemErrors] = useState<Partial<Record<keyof DrugItem, string>>>({});

  useEffect(() => {
    Promise.all([
      api.get('/pharmacy/inventory').then(r => setInventory(r.data.data)).catch(() => []),
      api.get('/pharmacy/prescriptions').then(r => setPrescriptions(r.data.data)).catch(() => []),
    ]).finally(() => setLoading(false));
  }, []);

  const validateDrug = (): boolean => {
    const errors: Partial<Record<string, string>> = {};
    if (!drugForm.drugName.trim()) errors.drugName = t('validate.pharmacy.drugNameRequired');
    if (drugForm.stockQuantity < 0) errors.stockQuantity = 'Stock cannot be negative';
    setDrugErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateDrug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateDrug()) return;
    setSaving(true);
    try {
      await api.post('/pharmacy/inventory', drugForm);
      toast.success('Drug added');
      setShowNewDrugModal(false);
      setDrugForm({ drugName: '', genericName: '', brandName: '', dosageForm: 'tablet', strength: '', stockQuantity: 0, reorderLevel: 10, unitPrice: 0, batchNumber: '', expiryDate: '', manufacturer: '' });
      setDrugErrors({});
      const r = await api.get('/pharmacy/inventory');
      setInventory(r.data.data);
    } catch { toast.error('Failed to add drug'); }
    finally { setSaving(false); }
  };

  const validateRx = (): boolean => {
    const errors: Partial<Record<keyof RxForm, string>> = {};
    if (!rxForm.patientId) errors.patientId = t('validate.pharmacy.patientRequired');
    if (rxForm.items.length === 0) errors.items = t('validate.pharmacy.itemsRequired');
    setRxErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetRxForm = () => { setRxForm(INITIAL_RX); setRxErrors({}); setDrugItem(INITIAL_DRUG_ITEM); };

  const addDrugItem = () => {
    if (!drugItem.drugName.trim()) { setDrugItemErrors({ drugName: t('validate.pharmacy.drugNameRequired') }); return; }
    setDrugItemErrors({});
    setRxForm(prev => ({ ...prev, items: [...prev.items, { ...drugItem }] }));
    setDrugItem(INITIAL_DRUG_ITEM);
    setRxErrors(prev => { const n = { ...prev }; delete n.items; return n; });
  };

  const removeDrugItem = (index: number) => {
    setRxForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const handleCreateRx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRx()) return;
    setSaving(true);
    try {
      await api.post('/pharmacy/prescriptions', { patientId: rxForm.patientId, notes: rxForm.notes, items: rxForm.items });
      toast.success('Prescription created');
      setShowNewRxModal(false);
      resetRxForm();
      const r = await api.get('/pharmacy/prescriptions');
      setPrescriptions(r.data.data);
    } catch { toast.error('Failed to create prescription'); }
    finally { setSaving(false); }
  };

  const handleDispense = async (id: string) => {
    const confirmed = await confirmDialog({ title: 'Dispense prescription', message: 'Dispense this prescription now?', confirmLabel: 'Dispense', cancelLabel: 'Back', danger: true });
    if (!confirmed) return;
    try {
      await api.post(`/pharmacy/prescriptions/${id}/dispense`, { items: [] });
      toast.success('Prescription dispensed');
      const r = await api.get('/pharmacy/prescriptions');
      setPrescriptions(r.data.data);
    } catch { toast.error('Failed to dispense'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('pharmacy.title')}</h1></div>
        <Can permission="pharmacy.create" scope="branch">
          <button onClick={() => tab === 'inventory' ? setShowNewDrugModal(true) : setShowNewRxModal(true)} className="btn-primary">
            {tab === 'inventory' ? <><Package className="w-4 h-4" />{t('pharmacy.addDrug')}</> : <><Plus className="w-4 h-4" />{t('pharmacy.newPrescription')}</>}
          </button>
        </Can>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('inventory')} className={`btn ${tab === 'inventory' ? 'btn-primary' : 'btn-secondary'}`}><Package className="w-4 h-4" />{t('pharmacy.inventory')} ({inventory.length})</button>
        <button onClick={() => setTab('prescriptions')} className={`btn ${tab === 'prescriptions' ? 'btn-primary' : 'btn-secondary'}`}><ListChecks className="w-4 h-4" />{t('pharmacy.prescriptions')} ({prescriptions.length})</button>
      </div>

      <div className="card mb-6"><div className="card-body">
        <Input type="search" placeholder={`${t('common.search')}...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div></div>

      {tab === 'inventory' && (
        <div className="table-container">
          <table>
            <thead><tr><th>{t('pharmacy.drugName')}</th><th>{t('pharmacy.genericName')}</th><th>{t('pharmacy.stock')}</th><th>{t('pharmacy.reorderLevel')}</th><th>{t('pharmacy.price')}</th><th>{t('pharmacy.expiry')}</th><th>{t('pharmacy.status')}</th></tr></thead>
            <tbody>
              {inventory.filter(d => !search || d.drugName?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('pharmacy.noInventory')}</td></tr>
              ) : inventory.filter(d => !search || d.drugName?.toLowerCase().includes(search.toLowerCase())).map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="font-medium">{d.drugName}</td>
                  <td className="text-xs text-gray-500">{d.genericName || '-'}</td>
                  <td><span className={`font-medium ${d.stockQuantity < d.reorderLevel ? 'text-red-600' : 'text-green-600'}`}>{d.stockQuantity}</span></td>
                  <td className="text-xs">{d.reorderLevel}</td>
                  <td>{d.unitPrice ? formatMoney(d.unitPrice) : '-'}</td>
                  <td className="text-xs">{d.expiryDate || '-'}</td>
                  <td><span className={`badge ${d.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{d.status || 'active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="table-container">
          <table>
            <thead><tr><th>{t('pharmacy.rxNumber')}</th><th>{t('pharmacy.patient')}</th><th>{t('pharmacy.items')}</th><th>{t('pharmacy.status')}</th><th>{t('pharmacy.date')}</th><th>{t('pharmacy.actions')}</th></tr></thead>
            <tbody>
              {prescriptions.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-gray-500">{t('pharmacy.noPrescriptions')}</td></tr> :
                prescriptions.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="font-mono text-xs text-primary-600">{p.prescriptionNumber}</td>
                    <td className="font-medium">{p.patientName}</td>
                    <td>{p.items?.length || 0} items</td>
                    <td><span className={`badge ${p.status === 'dispensed' ? 'badge-success' : 'badge-info'}`}>{p.status}</span></td>
                    <td className="text-xs">{formatDateTime(p.createdAt)}</td>
                    <td><Can permission="pharmacy.approve" scope="branch">{p.status !== 'dispensed' && <button onClick={() => handleDispense(p.id)} className="btn-ghost btn-sm text-green-600">{t('pharmacy.dispense')}</button>}</Can></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showNewDrugModal} onClose={() => setShowNewDrugModal(false)} title={t('pharmacy.addDrug')} size="lg"
        footer={<>
          <button onClick={() => setShowNewDrugModal(false)} className="btn-secondary">{t('common.cancel')}</button>
          <Can permission="pharmacy.create" scope="branch">
            <button type="submit" form="drug-form" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
          </Can>
        </>}>
        <form id="drug-form" onSubmit={handleCreateDrug} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={`${t('pharmacy.drugName')} *`} value={drugForm.drugName} onChange={e => setDrugForm(prev => ({ ...prev, drugName: e.target.value }))} error={drugErrors.drugName} required />
            <Input label={t('pharmacy.genericName')} value={drugForm.genericName} onChange={e => setDrugForm(prev => ({ ...prev, genericName: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label={t('pharmacy.brandName')} value={drugForm.brandName} onChange={e => setDrugForm(prev => ({ ...prev, brandName: e.target.value }))} />
            <Select label={t('pharmacy.dosageForm')} value={drugForm.dosageForm} onChange={e => setDrugForm(prev => ({ ...prev, dosageForm: e.target.value }))}
              options={[{ value: 'tablet', label: 'Tablet' }, { value: 'capsule', label: 'Capsule' }, { value: 'syrup', label: 'Syrup' }, { value: 'injection', label: 'Injection' }, { value: 'cream', label: 'Cream' }, { value: 'drops', label: 'Drops' }]} />
            <Input label={t('pharmacy.strength')} placeholder="e.g. 500mg" value={drugForm.strength} onChange={e => setDrugForm(prev => ({ ...prev, strength: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label={`${t('pharmacy.stock')} *`} type="number" min="0" value={drugForm.stockQuantity} onChange={e => setDrugForm(prev => ({ ...prev, stockQuantity: Number(e.target.value) }))} error={drugErrors.stockQuantity} required />
            <Input label={t('pharmacy.reorderLevel')} type="number" min="0" value={drugForm.reorderLevel} onChange={e => setDrugForm(prev => ({ ...prev, reorderLevel: Number(e.target.value) }))} />
            <Input label={t('pharmacy.price')} type="number" min="0" step="0.01" value={drugForm.unitPrice} onChange={e => setDrugForm(prev => ({ ...prev, unitPrice: Number(e.target.value) }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label={t('pharmacy.batchNumber')} value={drugForm.batchNumber} onChange={e => setDrugForm(prev => ({ ...prev, batchNumber: e.target.value }))} />
            <Input label={t('pharmacy.expiry')} type="date" value={drugForm.expiryDate} onChange={e => setDrugForm(prev => ({ ...prev, expiryDate: e.target.value }))} />
            <Input label={t('pharmacy.manufacturer')} value={drugForm.manufacturer} onChange={e => setDrugForm(prev => ({ ...prev, manufacturer: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal open={showNewRxModal} onClose={() => { setShowNewRxModal(false); resetRxForm(); }} title={t('pharmacy.newPrescription')} size="xl"
        footer={<>
          <button onClick={() => { setShowNewRxModal(false); resetRxForm(); }} className="btn-secondary">{t('common.cancel')}</button>
          <Can permission="pharmacy.create" scope="branch">
            <button type="submit" form="rx-form" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
          </Can>
        </>}>
        <form id="rx-form" onSubmit={handleCreateRx} noValidate className="space-y-4">
          <PatientSearchField value={rxForm.patientId}
            onChange={id => { setRxForm(prev => ({ ...prev, patientId: id })); setRxErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={rxErrors.patientId} required />

          <div className="p-4 bg-gray-50 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">{t('pharmacy.addDrugItem')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={`${t('pharmacy.drugName')} *`} value={drugItem.drugName} onChange={e => { setDrugItem(prev => ({ ...prev, drugName: e.target.value })); setDrugItemErrors({}); }} error={drugItemErrors.drugName} />
              <Input label={t('pharmacy.dosage')} placeholder="e.g. 500mg" value={drugItem.dosage} onChange={e => setDrugItem(prev => ({ ...prev, dosage: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Select label={t('pharmacy.route')} value={drugItem.route} onChange={e => setDrugItem(prev => ({ ...prev, route: e.target.value }))} options={ROUTE_OPTIONS} />
              <Select label={t('pharmacy.frequency')} value={drugItem.frequency} onChange={e => setDrugItem(prev => ({ ...prev, frequency: e.target.value }))} options={FREQUENCY_OPTIONS} />
              <Input label={t('pharmacy.duration')} placeholder="e.g. 7 days" value={drugItem.duration} onChange={e => setDrugItem(prev => ({ ...prev, duration: e.target.value }))} />
              <Input label={t('pharmacy.quantity')} type="number" min="1" value={drugItem.quantity} onChange={e => setDrugItem(prev => ({ ...prev, quantity: Number(e.target.value) }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label={t('pharmacy.refills')} type="number" min="0" value={drugItem.refills} onChange={e => setDrugItem(prev => ({ ...prev, refills: Number(e.target.value) }))} />
              <Input label={t('pharmacy.instructions')} placeholder="e.g. Take with food" value={drugItem.instructions} onChange={e => setDrugItem(prev => ({ ...prev, instructions: e.target.value }))} />
            </div>
            <button type="button" onClick={addDrugItem} className="btn-secondary btn-sm"><Plus className="w-3.5 h-3.5" />{t('pharmacy.addDrugItem')}</button>
          </div>

          {rxForm.items.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('pharmacy.drugItems')} ({rxForm.items.length})</label>
              <div className="space-y-2">
                {rxForm.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div><p className="text-sm font-medium">{item.drugName} - {item.dosage}</p><p className="text-xs text-gray-500">{item.route} | {item.frequency} | {item.duration} | Qty: {item.quantity}</p></div>
                    <button type="button" onClick={() => removeDrugItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {rxErrors.items && <p className="text-sm text-red-600">{rxErrors.items}</p>}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('pharmacy.notes')}</label>
            <textarea className="input" rows={2} value={rxForm.notes} onChange={e => setRxForm(prev => ({ ...prev, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
