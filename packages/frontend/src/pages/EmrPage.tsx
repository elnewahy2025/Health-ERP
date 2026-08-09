import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { emrApi } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { Plus, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface VitalsData {
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  heartRate: number;
  respiratoryRate: number;
  temperature: number;
  oxygenSaturation: number;
  height: number;
  weight: number;
  painLevel: number;
}

interface EmrFormData {
  patientId: string;
  encounterType: string;
  chiefComplaint: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  notes: string;
  vitals: VitalsData;
  addVitals: boolean;
}

const INITIAL_VITALS: VitalsData = {
  bloodPressureSystolic: 120, bloodPressureDiastolic: 80,
  heartRate: 72, respiratoryRate: 16, temperature: 37,
  oxygenSaturation: 98, height: 170, weight: 70, painLevel: 0,
};

const INITIAL_FORM: EmrFormData = {
  patientId: '', encounterType: 'new',
  chiefComplaint: '', subjective: '', objective: '',
  assessment: '', plan: '', notes: '',
  vitals: INITIAL_VITALS, addVitals: false,
};

const ENCOUNTER_TYPES = [
  { value: 'new', label: 'New' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'annual', label: 'Annual' },
  { value: 'preoperative', label: 'Pre-operative' },
  { value: 'postoperative', label: 'Post-operative' },
  { value: 'telemedicine', label: 'Telemedicine' },
];

const VITALS_FIELDS = [
  { key: 'bloodPressureSystolic' as const, labelKey: 'emr.bpSystolic', min: 50, max: 300 },
  { key: 'bloodPressureDiastolic' as const, labelKey: 'emr.bpDiastolic', min: 30, max: 200 },
  { key: 'heartRate' as const, labelKey: 'emr.heartRate', min: 30, max: 250 },
  { key: 'respiratoryRate' as const, labelKey: 'emr.respiratoryRate', min: 5, max: 60 },
  { key: 'temperature' as const, labelKey: 'emr.temperature', min: 30, max: 42, step: 0.1 },
  { key: 'oxygenSaturation' as const, labelKey: 'emr.o2Sat', min: 0, max: 100 },
  { key: 'painLevel' as const, labelKey: 'emr.painLevel', min: 0, max: 10 },
  { key: 'height' as const, labelKey: 'emr.height', min: 50, max: 250 },
  { key: 'weight' as const, labelKey: 'emr.weight', min: 20, max: 300 },
];

export default function EmrPage() {
  const { t } = useTranslation();
  interface EmrRecord {
  id: string;
  patientName: string;
  patientMrn: string;
  status: string;
  encounterDate: string;
  chiefComplaint: string;
  assessment: string;
  diagnosis: string;
  encounterType: string;
  type: string;
  createdAt: string;
}
  const [records, setRecords] = useState<EmrRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EmrFormData, string>>>({});
  const [newEmr, setNewEmr] = useState<EmrFormData>(INITIAL_FORM);

  const loadRecords = async () => {
    try {
      const data = await emrApi.list({ page, limit: 10 });
      setRecords(data.data);
      setPagination(data.pagination);
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRecords(); }, [page]);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof EmrFormData, string>> = {};
    if (!newEmr.patientId) errors.patientId = t('validate.patientRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setNewEmr(INITIAL_FORM);
    setFormErrors({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await emrApi.create({
        patientId: newEmr.patientId,
        encounterDate: new Date().toISOString().split('T')[0],
        encounterType: newEmr.encounterType,
        chiefComplaint: newEmr.chiefComplaint,
        subjective: newEmr.subjective,
        objective: newEmr.objective,
        assessment: newEmr.assessment,
        plan: newEmr.plan,
        notes: newEmr.notes,
        vitals: newEmr.addVitals ? newEmr.vitals : undefined,
      });
      toast.success('EMR record created');
      setShowNewModal(false);
      resetForm();
      loadRecords();
    } catch {
      toast.error('Failed to create EMR record');
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async (id: string) => {
    try { await emrApi.sign(id); toast.success('Record signed'); loadRecords(); }
    catch { toast.error('Failed to sign'); }
  };

  const handleVitalsChange = (field: keyof VitalsData, value: number) => {
    setNewEmr(prev => ({ ...prev, vitals: { ...prev.vitals, [field]: value } }));
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: 'badge-gray', completed: 'badge-info',
      signed: 'badge-success', amended: 'badge-warning',
    };
    return map[s] || 'badge-gray';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('emr.title')}</h1>
          <p className="text-gray-500 mt-1">{pagination.total} records</p>
        </div>
        <button onClick={() => setShowNewModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />{t('emr.new')}
        </button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{t('appointment.patient')}</th><th>{t('emr.date')}</th><th>{t('emr.type')}</th>
              <th>{t('emr.chiefComplaint')}</th><th>{t('emr.assessment')}</th><th>{t('common.status')}</th><th>{t('emr.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('common.noData')}</td></tr>
            ) : records.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td><p className="font-medium">{r.patientName}</p><p className="text-xs text-gray-500 font-mono">{r.patientMrn}</p></td>
                <td>{r.encounterDate}</td>
                <td><span className="badge-info">{r.encounterType}</span></td>
                <td className="max-w-xs truncate">{r.chiefComplaint || '-'}</td>
                <td>{r.assessment || '-'}</td>
                <td><span className={statusBadge(r.status)}>{r.status}</span></td>
                <td>
                  {r.status !== 'signed' && (
                    <button onClick={() => handleSign(r.id)} className="btn-ghost btn-sm text-green-600">
                      <FileText className="w-3.5 h-3.5" />Sign
                    </button>
                  )}
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
        title={t('emr.newRecord')}
        size="xl"
        footer={
          <>
            <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
            <button type="submit" form="emr-form" disabled={saving} className="btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
            </button>
          </>
        }>
        <form id="emr-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField
            value={newEmr.patientId}
            onChange={id => { setNewEmr(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId}
            required />

          <Select label={t('emr.type')} value={newEmr.encounterType}
            onChange={e => setNewEmr(prev => ({ ...prev, encounterType: e.target.value }))}
            options={ENCOUNTER_TYPES} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{t('emr.chiefComplaint')}</label>
              <textarea className="input" rows={2} value={newEmr.chiefComplaint}
                onChange={e => setNewEmr(prev => ({ ...prev, chiefComplaint: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{t('emr.subjective')}</label>
              <textarea className="input" rows={2} value={newEmr.subjective}
                onChange={e => setNewEmr(prev => ({ ...prev, subjective: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{t('emr.objective')}</label>
              <textarea className="input" rows={3} value={newEmr.objective}
                onChange={e => setNewEmr(prev => ({ ...prev, objective: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{t('emr.assessment')}</label>
              <textarea className="input" rows={3} value={newEmr.assessment}
                onChange={e => setNewEmr(prev => ({ ...prev, assessment: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('emr.plan')}</label>
            <textarea className="input" rows={3} value={newEmr.plan}
              onChange={e => setNewEmr(prev => ({ ...prev, plan: e.target.value }))} />
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={newEmr.addVitals}
              onChange={e => setNewEmr(prev => ({ ...prev, addVitals: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600" />
            <span className="text-sm font-medium">{t('emr.addVitals')}</span>
          </label>

          {newEmr.addVitals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
              {VITALS_FIELDS.map(field => (
                <Input
                  key={field.key}
                  label={t(field.labelKey)}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step || 1}
                  value={newEmr.vitals[field.key]}
                  onChange={e => handleVitalsChange(field.key, Number(e.target.value))} />
              ))}
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('emr.notes')}</label>
            <textarea className="input" rows={2} value={newEmr.notes}
              onChange={e => setNewEmr(prev => ({ ...prev, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
