import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { Plus, Search, Loader2, Trash2, FlaskConical, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';

interface LabTest {
  testCode: string;
  testName: string;
  specimenType: string;
  referenceRange: string;
  unit: string;
}

interface LabOrderForm {
  patientId: string;
  priority: string;
  clinicalNotes: string;
  tests: LabTest[];
}

const INITIAL_FORM: LabOrderForm = {
  patientId: '', priority: 'routine', clinicalNotes: '', tests: [],
};

const PRIORITY_OPTIONS = [
  { value: 'routine', labelKey: 'lab.routine' },
  { value: 'urgent', labelKey: 'lab.urgent' },
  { value: 'stat', labelKey: 'lab.stat' },
];

export default function LaboratoryPage() {
  const { t } = useTranslation();
  interface LabOrder {
  id: string;
  orderNumber: string;
  patientName: string;
  patientMrn: string;
  status: string;
  priority: string;
  orderDate: string;
  clinicalNotes: string;
  createdAt: string;
}
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);
  const catalogRef = useRef<HTMLDivElement>(null);

  const [formErrors, setFormErrors] = useState<Partial<Record<keyof LabOrderForm, string>>>({});
  const [newOrder, setNewOrder] = useState<LabOrderForm>(INITIAL_FORM);

  useEffect(() => {
    Promise.all([
      api.get('/lab/orders').then(r => setOrders(r.data.data)).catch(() => {}),
      api.get('/lab/catalog').then(r => setCatalog(r.data.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (catalogRef.current && !catalogRef.current.contains(e.target as Node)) setShowCatalogDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filteredCatalog = catalog.filter(c =>
    !catalogSearch || c.testName?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    c.testCode?.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    c.specimenType?.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  const addTest = (test: LabTest) => {
    if (newOrder.tests.some(t => t.testCode === test.testCode)) { toast.error('Test already added'); return; }
    setNewOrder(prev => ({ ...prev, tests: [...prev.tests, test] }));
    setCatalogSearch('');
    setShowCatalogDropdown(false);
    setFormErrors(prev => { const n = { ...prev }; delete n.tests; return n; });
  };

  const removeTest = (index: number) => {
    setNewOrder(prev => ({ ...prev, tests: prev.tests.filter((_, i) => i !== index) }));
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof LabOrderForm, string>> = {};
    if (!newOrder.patientId) errors.patientId = t('validate.lab.patientRequired');
    if (!newOrder.priority) errors.priority = t('validate.lab.priorityRequired');
    if (newOrder.tests.length === 0) errors.tests = t('validate.lab.testsRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => { setNewOrder(INITIAL_FORM); setFormErrors({}); setCatalogSearch(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await api.post('/lab/orders', newOrder);
      toast.success('Lab order created');
      setShowNewModal(false);
      resetForm();
      const r = await api.get('/lab/orders');
      setOrders(r.data.data);
    } catch { toast.error('Failed to create lab order'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const filtered = orders.filter(o =>
    !search || o.patientName?.toLowerCase().includes(search.toLowerCase()) || o.orderNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('lab.title')}</h1><p className="text-gray-500 mt-1">{orders.length} orders</p></div>
        <Can permission="laboratory.create">
          <button onClick={() => setShowNewModal(true)} className="btn-primary"><Plus className="w-4 h-4" />{t('lab.newOrder')}</button>
        </Can>
      </div>

      <div className="card mb-6"><div className="card-body">
        <Input type="search" placeholder={`${t('common.search')} orders...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div></div>

      <div className="table-container">
        <table>
          <thead><tr><th>{t('lab.orderNumber')}</th><th>{t('lab.patient')}</th><th>{t('lab.status')}</th><th>{t('lab.priority')}</th><th>{t('lab.date')}</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={5} className="text-center py-12 text-gray-500">{t('lab.noOrders')}</td></tr> :
              filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="font-mono text-xs text-primary-600">{o.orderNumber}</td>
                  <td><p className="font-medium">{o.patientName}</p><p className="text-xs text-gray-500 font-mono">{o.patientMrn}</p></td>
                  <td><span className={`badge ${o.status === 'completed' ? 'badge-success' : 'badge-info'}`}>{o.status}</span></td>
                  <td><span className={`badge ${o.priority === 'urgent' ? 'badge-danger' : o.priority === 'stat' ? 'badge-warning' : 'badge-info'}`}>{t(`lab.${o.priority}`)}</span></td>
                  <td className="text-xs">{o.orderDate}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); resetForm(); }}
        title={t('lab.newOrder')}
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
            <Can permission="laboratory.create">
              <button type="submit" form="lab-form" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
              </button>
            </Can>
          </>
        }>
        <form id="lab-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField
            value={newOrder.patientId}
            onChange={id => { setNewOrder(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId} required />

          <Select label={t('lab.priority')} value={newOrder.priority}
            onChange={e => { setNewOrder(prev => ({ ...prev, priority: e.target.value })); setFormErrors(prev => { const n = { ...prev }; delete n.priority; return n; }); }}
            options={PRIORITY_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))}
            error={formErrors.priority} />

          <div ref={catalogRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('lab.selectTests')} *</label>
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 left-3 w-4 h-4 text-gray-400" />
              <input type="text" className="input pl-10" placeholder={t('lab.searchTests')}
                value={catalogSearch}
                onChange={e => { setCatalogSearch(e.target.value); setShowCatalogDropdown(e.target.value.length >= 1); }}
                onFocus={() => catalogSearch.length >= 1 && setShowCatalogDropdown(true)} />
            </div>
            {showCatalogDropdown && filteredCatalog.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredCatalog.slice(0, 20).map(c => (
                  <button key={c.testCode} type="button" onClick={() => addTest(c)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between">
                    <div><p className="text-sm font-medium">{c.testName}</p><p className="text-xs text-gray-500">{c.testCode} | {c.specimenType}</p></div>
                    <Plus className="w-4 h-4 text-primary-600" />
                  </button>
                ))}
              </div>
            )}
            {showCatalogDropdown && filteredCatalog.length === 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg p-4 text-center text-gray-500">{t('lab.noResults')}</div>
            )}
            {formErrors.tests && <p className="mt-1 text-sm text-red-600">{formErrors.tests}</p>}
          </div>

          {newOrder.tests.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('lab.addedTests')} ({newOrder.tests.length})</label>
              <div className="space-y-2">
                {newOrder.tests.map((test, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div><p className="text-sm font-medium">{test.testName}</p><p className="text-xs text-gray-500">{test.testCode} | {test.specimenType}</p></div>
                    <button type="button" onClick={() => removeTest(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('lab.clinicalNotes')}</label>
            <textarea className="input" rows={2} value={newOrder.clinicalNotes}
              onChange={e => setNewOrder(prev => ({ ...prev, clinicalNotes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
