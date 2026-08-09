import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Bot, Sparkles, FileText, Stethoscope, Check, AlertTriangle, Info } from 'lucide-react';
import {
  Card, CardBody, Button, Input, Select, Badge, PageLoader, EmptyState,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString, escapeHtml } from '../lib/sanitize';
import { formatDate } from '../lib/format';

/* ── Types ─────────────────────────────────────────────────────────── */

type AiTab = 'notes' | 'diagnosis';

interface ClinicalNote {
  id: string;
  patient_id: string;
  note_type: string;
  raw_notes: string;
  generated_note: string;
  summary: string;
  status: string;
  created_at: string;
}

interface DiagnosisSuggestion {
  code: string;
  label: string;
  icd10_code: string;
  confidence: number;
  description: string;
  reasoning: string;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function getConfidenceVariant(score: number): 'success' | 'warning' | 'danger' {
  if (score > 0.7) return 'success';
  if (score > 0.4) return 'warning';
  return 'danger';
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function ClinicalAIPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AiTab>('notes');

  /* ── Notes state ── */
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedNote, setSelectedNote] = useState<ClinicalNote | null>(null);
  const [noteForm, setNoteForm] = useState({ patientId: '', rawNotes: '', noteType: 'consultation' });
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});

  /* ── Diagnosis state ── */
  const [diagForm, setDiagForm] = useState({ patientId: '', symptoms: '' });
  const [diagErrors, setDiagErrors] = useState<Record<string, string>>({});
  const [diagResults, setDiagResults] = useState<DiagnosisSuggestion[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [lastDiagId, setLastDiagId] = useState('');

  /* ── Load notes ── */

  const fetchNotes = useCallback(async (patientId?: string): Promise<void> => {
    setNotesLoading(true);
    try {
      const pid = patientId || noteForm.patientId || '00000000-0000-0000-0000-000000000000';
      const { data } = await api.get(`/ai/clinical-notes/patient/${pid}`, { params: { limit: '50' } });
      setNotes((data.data ?? []) as ClinicalNote[]);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [noteForm.patientId]);

  /* ── Generate note ── */

  const handleGenerate = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!noteForm.patientId.trim()) errors.patientId = t('common.required');
    if (!noteForm.rawNotes.trim()) errors.rawNotes = t('common.required');
    setNoteErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setGenerating(true);
    try {
      const { data } = await api.post('/ai/clinical-notes/generate', {
        patientId: noteForm.patientId.trim(),
        rawNotes: sanitizeString(noteForm.rawNotes),
        noteType: noteForm.noteType,
      });
      toast.success(t('ai.noteGenerated'));
      setNoteForm((f) => ({ ...f, rawNotes: '' }));
      setSelectedNote((data.data ?? null) as ClinicalNote);
      void fetchNotes(noteForm.patientId);
    } catch {
      toast.error(t('ai.noteGenerateFailed'));
    } finally {
      setGenerating(false);
    }
  }, [noteForm, t, fetchNotes]);

  /* ── Diagnose ── */

  const handleDiagnose = useCallback(async (): Promise<void> => {
    const errors: Record<string, string> = {};
    if (!diagForm.patientId.trim()) errors.patientId = t('common.required');
    if (!diagForm.symptoms.trim()) errors.symptoms = t('common.required');
    setDiagErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setDiagLoading(true);
    try {
      const { data } = await api.post('/ai/diagnosis/suggest', {
        patientId: diagForm.patientId.trim(),
        symptoms: sanitizeString(diagForm.symptoms),
      });
      setDiagResults((data.data?.suggestions ?? []) as DiagnosisSuggestion[]);
      setLastDiagId((data.data?.id ?? '') as string);
    } catch {
      toast.error(t('ai.diagnosisFailed'));
    } finally {
      setDiagLoading(false);
    }
  }, [diagForm, t]);

  /* ── Feedback ── */

  const handleFeedback = useCallback(async (code: string, accepted: boolean): Promise<void> => {
    if (!lastDiagId) return;
    try {
      await api.post(`/ai/diagnosis/${lastDiagId}/feedback`, {
        selectedCode: code,
        wasAccepted: accepted,
      });
      toast.success(accepted ? t('ai.diagnosisAccepted') : t('ai.feedbackRecorded'));
    } catch { /* non-critical */ }
  }, [lastDiagId, t]);

  /* ── Tabs ── */

  const tabs: Array<{ key: AiTab; icon: React.ReactNode; label: string }> = [
    { key: 'notes', icon: <Sparkles className="w-4 h-4" />, label: t('ai.notesTab') },
    { key: 'diagnosis', icon: <Stethoscope className="w-4 h-4" />, label: t('ai.diagnosisTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Bot className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('ai.title')}</h1>
          <p className="text-sm text-gray-500">{t('ai.subtitle')}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tabItem.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tabItem.icon}
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* ── CLINICAL NOTES TAB ── */}
      {tab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Generator Form */}
          <Card>
            <CardBody className="p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                {t('ai.generateNote')}
              </h3>
              <div className="space-y-4">
                <Input
                  label={t('ai.patientId')}
                  placeholder={t('ai.patientIdPlaceholder')}
                  value={noteForm.patientId}
                  onChange={(e) => setNoteForm((f) => ({ ...f, patientId: e.target.value }))}
                  error={noteErrors.patientId}
                />
                <Select
                  label={t('ai.noteType')}
                  value={noteForm.noteType}
                  onChange={(e) => setNoteForm((f) => ({ ...f, noteType: e.target.value }))}
                  options={[
                    { value: 'consultation', label: t('ai.consultation') },
                    { value: 'follow_up', label: t('ai.followUp') },
                    { value: 'emergency', label: t('ai.emergency') },
                  ]}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('ai.rawNotes')}
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-3 h-28 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    placeholder={t('ai.rawNotesPlaceholder')}
                    value={noteForm.rawNotes}
                    onChange={(e) => setNoteForm((f) => ({ ...f, rawNotes: e.target.value }))}
                  />
                  {noteErrors.rawNotes && <p className="text-xs text-red-600 mt-1">{noteErrors.rawNotes}</p>}
                </div>
                <Button onClick={() => void handleGenerate()} disabled={generating}>
                  <Sparkles className="w-4 h-4 mr-1" />
                  {generating ? t('ai.generating') : t('ai.generate')}
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Preview / History */}
          <Card>
            <CardBody className="p-6">
              <h3 className="font-semibold mb-3">{t('ai.notesHistory')}</h3>
              {selectedNote ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge>{selectedNote.note_type}</Badge>
                    <Badge variant={selectedNote.status === 'completed' ? 'success' : 'info'}>
                      {selectedNote.status}
                    </Badge>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                    {escapeHtml(selectedNote.generated_note)}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedNote(null)}>
                    {t('ai.closePreview')}
                  </Button>
                </div>
              ) : notesLoading ? (
                <PageLoader message={t('common.loading')} />
              ) : notes.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-8 h-8 text-gray-400" />}
                  title={t('ai.noNotes')}
                  message={t('ai.generateFirst')}
                />
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {notes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSelectedNote(n)}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-indigo-600">{escapeHtml(n.note_type)}</span>
                        <span className="text-xs text-gray-400">
                          {formatDate(n.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {escapeHtml(n.summary || n.generated_note?.substring(0, 100) || '')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── DIAGNOSIS TAB ── */}
      {tab === 'diagnosis' && (
        <div className="space-y-6">
          <Card>
            <CardBody className="p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-indigo-500" />
                {t('ai.diagnosisTitle')}
              </h3>
              <p className="text-sm text-gray-500 mb-4">{t('ai.diagnosisDescription')}</p>
              <div className="space-y-4">
                <Input
                  label={t('ai.patientId')}
                  placeholder={t('ai.patientIdPlaceholder')}
                  value={diagForm.patientId}
                  onChange={(e) => setDiagForm((f) => ({ ...f, patientId: e.target.value }))}
                  error={diagErrors.patientId}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('ai.symptoms')}
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-lg p-3 h-28 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    placeholder={t('ai.symptomsPlaceholder')}
                    value={diagForm.symptoms}
                    onChange={(e) => setDiagForm((f) => ({ ...f, symptoms: e.target.value }))}
                  />
                  {diagErrors.symptoms && <p className="text-xs text-red-600 mt-1">{diagErrors.symptoms}</p>}
                </div>
                <Button onClick={() => void handleDiagnose()} disabled={diagLoading}>
                  <Stethoscope className="w-4 h-4 mr-1" />
                  {diagLoading ? t('ai.analyzing') : t('ai.getSuggestions')}
                </Button>
              </div>
            </CardBody>
          </Card>

          {diagResults.length > 0 && (
            <Card>
              <CardBody className="p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  {t('ai.suggestedDiagnoses')}
                </h3>
                <div className="space-y-3">
                  {diagResults.map((d, idx) => (
                    <div key={idx} className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold text-gray-900">{escapeHtml(d.label)}</span>
                          <span className="ml-2 text-xs text-gray-500 font-mono">{escapeHtml(d.icd10_code)}</span>
                        </div>
                        <Badge variant={getConfidenceVariant(d.confidence)}>
                          {(d.confidence * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{escapeHtml(d.description)}</p>
                      <p className="text-xs text-gray-400 mb-2 italic">{escapeHtml(d.reasoning)}</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void handleFeedback(d.code, true)}>
                          <Check className="w-3 h-3 mr-1" />
                          {t('ai.accept')}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void handleFeedback(d.code, false)}>
                          {t('ai.reject')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-700">{t('ai.aiDisclaimer')}</p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
