import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { Plus, Loader2, CheckCircle2, Play } from 'lucide-react';
import toast from 'react-hot-toast';

interface NursingTaskForm {
  patientId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  dueAt: string;
}

const INITIAL_FORM: NursingTaskForm = {
  patientId: '', title: '', description: '', category: 'general', priority: 'normal', dueAt: '',
};

const CATEGORY_OPTIONS = [
  { value: 'general', labelKey: 'nursing.general' }, { value: 'medication', labelKey: 'nursing.medication' },
  { value: 'vitals', labelKey: 'nursing.vitals' }, { value: 'wound_care', labelKey: 'nursing.woundCare' },
  { value: 'patient_education', labelKey: 'nursing.patientEducation' }, { value: 'discharge', labelKey: 'nursing.discharge' },
];

export default function NursingPage() {
  const { t } = useTranslation();
  interface NursingTask {
  id: string;
  title: string;
  description: string;
  patientName: string;
  taskType: string;
  category: string;
  priority: string;
  status: string;
  dueDate: string;
  dueAt: string;
  createdAt: string;
}
  const [tasks, setTasks] = useState<NursingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NursingTaskForm, string>>>({});
  const [newTask, setNewTask] = useState<NursingTaskForm>(INITIAL_FORM);

  const loadTasks = async () => {
    try { const r = await api.get('/nursing/tasks'); setTasks(r.data.data); }
    catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTasks(); }, []);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof NursingTaskForm, string>> = {};
    if (!newTask.patientId) errors.patientId = t('validate.nursing.patientRequired');
    if (!newTask.title.trim()) errors.title = t('validate.nursing.titleRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => { setNewTask(INITIAL_FORM); setFormErrors({}); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await api.post('/nursing/tasks', newTask);
      toast.success('Task created');
      setShowNewModal(false);
      resetForm();
      await loadTasks();
    } catch { toast.error('Failed to create task'); }
    finally { setSaving(false); }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    const msg = status === 'completed' ? 'Mark as completed?' : 'Start this task?';
    const confirmed = await confirmDialog({ title: 'Update task', message: msg, confirmLabel: 'Yes', cancelLabel: 'No' });
    if (!confirmed) return;
    setActionLoading(id);
    try {
      await api.put(`/nursing/tasks/${id}`, { status });
      toast.success(status === 'completed' ? 'Task completed' : 'Task started');
      await loadTasks();
    } catch { toast.error('Failed to update task'); }
    finally { setActionLoading(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const filtered = tasks.filter(task => !filter || task.status === filter);
  const filterButtons = [
    { key: '', label: t('nursing.all'), count: tasks.length },
    { key: 'pending', label: t('nursing.pending'), count: tasks.filter(t => t.status === 'pending').length },
    { key: 'in_progress', label: t('nursing.inProgress'), count: tasks.filter(t => t.status === 'in_progress').length },
    { key: 'completed', label: t('nursing.completed'), count: tasks.filter(t => t.status === 'completed').length },
  ];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">{t('nursing.title')}</h1><p className="text-gray-500 mt-1">{tasks.length} tasks</p></div>
        <button onClick={() => setShowNewModal(true)} className="btn-primary"><Plus className="w-4 h-4" />{t('nursing.newTask')}</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filterButtons.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`btn ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`}>{f.label} ({f.count})</button>
        ))}
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>{t('nursing.title_')}</th><th>{t('nursing.patient')}</th><th>{t('nursing.category')}</th><th>{t('nursing.priority')}</th><th>{t('nursing.status')}</th><th>{t('nursing.dueAt')}</th><th>{t('common.actions')}</th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('nursing.noTasks')}</td></tr> :
              filtered.map(task => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td><p className="font-medium">{task.title}</p>{task.description && <p className="text-xs text-gray-500 truncate max-w-xs">{task.description}</p>}</td>
                  <td className="font-medium">{task.patientName}</td>
                  <td><span className="badge-info">{t(`nursing.${task.category}`) || task.category}</span></td>
                  <td><span className={`badge ${task.priority === 'urgent' ? 'badge-danger' : task.priority === 'high' ? 'badge-warning' : 'badge-info'}`}>{t(`nursing.${task.priority}`) || task.priority}</span></td>
                  <td><span className={`badge ${task.status === 'completed' ? 'badge-success' : task.status === 'in_progress' ? 'badge-warning' : 'badge-gray'}`}>{task.status}</span></td>
                  <td className="text-xs">{formatDateTime(task.dueAt) || '-'}</td>
                  <td>
                    <div className="flex gap-1">
                      {task.status === 'pending' && <button onClick={() => handleUpdateStatus(task.id, 'in_progress')} disabled={actionLoading === task.id} className="btn-ghost btn-sm text-blue-600">
                        {actionLoading === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}Start</button>}
                      {task.status === 'in_progress' && <button onClick={() => handleUpdateStatus(task.id, 'completed')} disabled={actionLoading === task.id} className="btn-ghost btn-sm text-green-600">
                        {actionLoading === task.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}Complete</button>}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Modal open={showNewModal} onClose={() => { setShowNewModal(false); resetForm(); }} title={t('nursing.newTask')} size="lg"
        footer={<>
          <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">{t('common.cancel')}</button>
          <button type="submit" form="nursing-form" disabled={saving} className="btn-primary">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
        </>}>
        <form id="nursing-form" onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField value={newTask.patientId}
            onChange={id => { setNewTask(prev => ({ ...prev, patientId: id })); setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; }); }}
            error={formErrors.patientId} required />

          <Input label={`${t('nursing.title_')} *`} placeholder="e.g. Administer IV antibiotics" value={newTask.title}
            onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
            error={formErrors.title} required />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('nursing.description')}</label>
            <textarea className="input" rows={2} placeholder="Task details..." value={newTask.description}
              onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={t('nursing.category')} value={newTask.category}
              onChange={e => setNewTask(prev => ({ ...prev, category: e.target.value }))}
              options={CATEGORY_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))} />
            <Select label={t('nursing.priority')} value={newTask.priority}
              onChange={e => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
              options={[{ value: 'normal', label: t('nursing.normal') }, { value: 'high', label: t('nursing.high') }, { value: 'urgent', label: t('nursing.urgent') }]} />
          </div>

          <Input label={t('nursing.dueAt')} type="datetime-local" value={newTask.dueAt}
            onChange={e => setNewTask(prev => ({ ...prev, dueAt: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
