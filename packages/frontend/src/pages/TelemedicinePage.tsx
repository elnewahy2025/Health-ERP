import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient as api } from '../lib/api';
import { Modal, Input, Select, PatientSearchField } from '../components/ui';
import { confirmDialog } from '../components/ui';
import { Plus, ExternalLink, Video, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AppointmentStatus } from '@healthcare/shared/types';

interface TelemedicineSession {
  id: string;
  sessionId: string;
  roomName: string;
  status: string;
  provider: string;
  meetingLink: string | null;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string | null;
  durationSeconds: number | null;
  recordingEnabled: boolean;
  notes: string | null;
  createdAt: string;
}

interface NewSessionForm {
  patientId: string;
  provider: string;
  meetingLink: string;
  recordingEnabled: boolean;
  notes: string;
}

const PROVIDER_OPTIONS = [
  { value: 'internal', labelKey: 'tele.internal' },
  { value: 'zoom', labelKey: 'tele.zoom' },
  { value: 'teams', labelKey: 'tele.teams' },
  { value: 'other', labelKey: 'tele.other' },
];

const INITIAL_FORM: NewSessionForm = {
  patientId: '',
  provider: 'internal',
  meetingLink: '',
  recordingEnabled: false,
  notes: '',
};

export default function TelemedicinePage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<TelemedicineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewSessionForm, string>>>({});
  const [newSession, setNewSession] = useState<NewSessionForm>(INITIAL_FORM);

  const loadSessions = async () => {
    try {
      const r = await api.get('/telemedicine/sessions');
      setSessions(r.data.data);
    } catch {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSessions(); }, []);

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof NewSessionForm, string>> = {};
    if (!newSession.patientId) errors.patientId = t('validate.tele.patientRequired');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setNewSession(INITIAL_FORM);
    setFormErrors({});
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      await api.post('/telemedicine/sessions', newSession);
      toast.success('Session created');
      setShowNewModal(false);
      resetForm();
      await loadSessions();
    } catch {
      toast.error('Failed to create session');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (id: string, status: string) => {
    const confirmed = await confirmDialog({ title: 'Start session', message: 'Start this session?', confirmLabel: 'Start', cancelLabel: 'Back' });
    if (!confirmed) return;
    try {
      await api.put(`/telemedicine/sessions/${id}/status`, { status });
      toast.success('Session started');
      await loadSessions();
    } catch {
      toast.error('Failed to update session');
    }
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '-';
    return `${Math.floor(seconds / 60)}m`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  const filtered = sessions.filter(s =>
    !search || s.patientName?.toLowerCase().includes(search.toLowerCase()) ||
    s.roomName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('tele.title')}</h1>
          <p className="text-gray-500 mt-1">{sessions.length} sessions</p>
        </div>
        <button onClick={() => setShowNewModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          {t('tele.newSession')}
        </button>
      </div>

      <div className="card mb-6">
        <div className="card-body">
          <Input
            type="search"
            placeholder={`${t('common.search')} sessions...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>{t('tele.room')}</th>
              <th>{t('tele.patient')}</th>
              <th>{t('tele.doctor')}</th>
              <th>{t('tele.status')}</th>
              <th>{t('tele.provider')}</th>
              <th>{t('tele.duration')}</th>
              <th>{t('tele.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">{t('tele.noSessions')}</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="font-mono text-xs text-primary-600">{s.roomName}</td>
                <td className="font-medium">{s.patientName}</td>
                <td>{s.doctorName || '-'}</td>
                <td>
                  <span className={`badge ${s.status === 'completed' ? 'badge-success' : s.status === 'active' ? 'badge-warning' : 'badge-info'}`}>
                    {s.status}
                  </span>
                </td>
                <td>{s.provider}</td>
                <td className="text-xs">{formatDuration(s.durationSeconds)}</td>
                <td>
                  <div className="flex gap-1">
                    {s.meetingLink && (
                      <a href={s.meetingLink} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm text-blue-600">
                        <ExternalLink className="w-3 h-3" />
                        {t('tele.join')}
                      </a>
                    )}
                    {s.status === 'scheduled' && (
                      <button onClick={() => handleStatus(s.id, 'active')} className="btn-ghost btn-sm text-green-600">
                        <Video className="w-3 h-3" />
                        Start
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={showNewModal}
        onClose={() => { setShowNewModal(false); resetForm(); }}
        title={t('tele.newSession')}
        size="lg"
        footer={
          <>
            <button onClick={() => { setShowNewModal(false); resetForm(); }} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
            </button>
          </>
        }>
        <form onSubmit={handleCreate} noValidate className="space-y-4">
          <PatientSearchField
            value={newSession.patientId}
            onChange={id => {
              setNewSession(prev => ({ ...prev, patientId: id }));
              setFormErrors(prev => { const n = { ...prev }; delete n.patientId; return n; });
            }}
            error={formErrors.patientId}
            required
          />

          <Select
            label={t('tele.provider')}
            value={newSession.provider}
            onChange={e => setNewSession(prev => ({ ...prev, provider: e.target.value }))}
            options={PROVIDER_OPTIONS.map(opt => ({ value: opt.value, label: t(opt.labelKey) }))}
          />

          <Input
            label="Meeting Link (optional)"
            type="url"
            placeholder="https://..."
            value={newSession.meetingLink}
            onChange={e => setNewSession(prev => ({ ...prev, meetingLink: e.target.value }))}
          />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={newSession.recordingEnabled}
              onChange={e => setNewSession(prev => ({ ...prev, recordingEnabled: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600" />
            <span className="text-sm">{t('tele.recording')}</span>
          </label>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">{t('tele.notes')}</label>
            <textarea className="input" rows={2} value={newSession.notes}
              onChange={e => setNewSession(prev => ({ ...prev, notes: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
