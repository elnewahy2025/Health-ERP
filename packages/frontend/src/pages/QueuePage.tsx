import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { ListOrdered, SkipForward, CheckCircle, XCircle, Plus, Loader2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface QueueEntryForm {
  patientId: string;
  serviceType: string;
  priority: number;
}

const INITIAL_FORM: QueueEntryForm = { patientId: '', serviceType: 'consultation', priority: 0 };

const SERVICE_TYPES = [
  { value: 'consultation', label: 'Consultation' }, { value: 'followup', label: 'Follow-up' },
  { value: 'emergency', label: 'Emergency' }, { value: 'lab', label: 'Laboratory' },
  { value: 'radiology', label: 'Radiology' }, { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'vaccination', label: 'Vaccination' },
];

export default function QueuePage() {
  const { t } = useTranslation();
  interface QueueEntry {
  id: string;
  queueNumber: number;
  position: number;
  patientName: string;
  serviceType: string;
  status: string;
  startedAt: string;
  createdAt: string;
}
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof QueueEntryForm, string>>>({});
  const [newEntry, setNewEntry] = useState<QueueEntryForm>(INITIAL_FORM);

  const loadQueue = async () => {
    try { const r = await api.get('/queue'); setQueue(r.data.data); }
    catch { toast.error('Failed to load queue'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadQueue(); }, []);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof QueueEntryForm, string>> = {};
    if (!newEntry.patientId) errors.patientId = t('validate.queue.patientRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => { setNewEntry(INITIAL_FORM); setFormErrors({}); };

  const handleAddToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await api.post('/queue', newEntry);
      toast.success('Patient added to queue');
      setShowAddModal(false);
      resetForm();
      await loadQueue();
    } catch { toast.error('Failed to add to queue'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    const msg = status === 'completed' ? 'Mark as completed?' : status === 'skipped' ? 'Skip this patient?' : 'Call this patient?';
    const confirmed = await confirmDialog({ title: 'Update queue', message: msg, confirmLabel: 'Yes', cancelLabel: 'No' });
    if (!confirmed) return;
    setActionLoading(id);
    try {
      await api.put(`/queue/${id}/status`, { status });
      toast.success(status === 'completed' ? 'Completed' : status === 'skipped' ? 'Skipped' : 'Called');
      await loadQueue();
    } catch { toast.error('Failed to update queue'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const waiting = queue.filter(e => e.status === 'waiting');
  const inProgress = queue.filter(e => e.status === 'in_progress');

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('queue.title')}</h1><p className="text-gray-500 mt-1">{waiting.length} waiting, {inProgress.length} in progress</p></div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary"><Plus className="w-4 h-4" />{t('queue.addToQueue')}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header"><h3 className="font-semibold flex items-center gap-2"><ListOrdered className="w-5 h-5 text-primary-600" />{t('queue.waiting')} ({waiting.length})</h3></div>
          <div className="card-body">
            {waiting.length === 0 ? <p className="text-gray-500 text-sm">{t('queue.queueEmpty')}</p> : (
              <div className="space-y-2">
                {waiting.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-lg font-bold text-primary-600 w-8 text-center">{e.position}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-sm font-medium truncate">{e.patientName}</p><span className="font-mono text-xs text-gray-400">{e.queueNumber}</span></div>
                      <p className="text-xs text-gray-500">{e.serviceType}</p>
                    </div>
                    <button onClick={() => updateStatus(e.id, 'in_progress')} disabled={actionLoading === e.id} className="btn-primary btn-sm">
                      {actionLoading === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />}{t('queue.call')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="font-semibold flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" />{t('queue.inProgress')} ({inProgress.length})</h3></div>
          <div className="card-body">
            {inProgress.length === 0 ? <p className="text-gray-500 text-sm">{t('queue.noActiveVisits')}</p> : (
              <div className="space-y-2">
                {inProgress.map(e => (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-sm font-medium truncate">{e.patientName}</p><span className="font-mono text-xs text-gray-400">{e.queueNumber}</span></div>
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{e.serviceType}{e.startedAt && <span className="ml-1">• {new Date(e.startedAt).toLocaleTimeString()}</span>}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => updateStatus(e.id, 'completed')} disabled={actionLoading === e.id} className="btn-ghost btn-sm text-green-600">
                        {actionLoading === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}{t('queue.done')}
                      </button>
                      <button onClick={() => updateStatus(e.id, 'skipped')} disabled={actionLoading === e.id} className="btn-ghost btn-sm text-gray-500"><XCircle className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={showAddModal} onClose={() => { setShowAddModal(false); resetForm(); }} title={t('queue.addToQueue')}
        footer={<>
          <button onClick={() => { setShowAddModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
          <button type="submit" form="queue-form" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('queue.addToQueue')}</button>
        </>}>
        <form id="queue-form" onSubmit={handleAddToQueue} noValidate className="space-y-4">
          <PatientSearchField value={newEntry.patientId}
            onChange={id => { setNewEntry(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId} required />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('queue.serviceType')} value={newEntry.serviceType}
              onChange={e => setNewEntry(prev => ({ ...prev, serviceType: e.target.value }))}
              options={SERVICE_TYPES} />
            <Select label="Priority" value={String(newEntry.priority)}
              onChange={e => setNewEntry(prev => ({ ...prev, priority: Number(e.target.value) }))}
              options={[{ value: '0', label: 'Normal' }, { value: '1', label: 'High' }, { value: '2', label: 'Urgent' }]} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
