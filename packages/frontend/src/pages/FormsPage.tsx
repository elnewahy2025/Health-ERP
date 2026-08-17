import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formsApi, type FormDefinition, type FormSubmission } from '../lib/api';
import { Modal, Input, Select, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, ClipboardList, FileJson } from 'lucide-react';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import toast from 'react-hot-toast';
import { Can } from '../components/auth/Authorization';

type TabType = 'definitions' | 'submissions';

interface DefinitionForm {
  name: string;
  slug: string;
  category: string;
  description: string;
  isActive: boolean;
}

interface DefinitionFormErrors {
  name?: string;
}

const INITIAL_FORM: DefinitionForm = {
  name: '', slug: '', category: 'general', description: '', isActive: true,
};

function validateDefinitionForm(form: DefinitionForm, t: (key: string) => string): DefinitionFormErrors {
  const errors: DefinitionFormErrors = {};
  if (!form.name.trim()) errors.name = t('forms.nameRequired');
  return errors;
}

export default function FormsPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('definitions');
  const [definitions, setDefinitions] = useState<FormDefinition[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DefinitionForm>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<DefinitionFormErrors>({});

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const [defData, subData] = await Promise.allSettled([
          formsApi.listDefinitions(),
          formsApi.listSubmissions(),
        ]);
        if (!cancelled) {
          if (defData.status === 'fulfilled') setDefinitions(defData.value);
          if (subData.status === 'fulfilled') setSubmissions(subData.value);
          if (defData.status === 'rejected' && subData.status === 'rejected') {
            toast.error(t('forms.loadFailed'));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  const filteredDefinitions = definitions.filter((d) => {
    if (!search) return true;
    return d.name.toLowerCase().includes(search.toLowerCase()) || d.slug.toLowerCase().includes(search.toLowerCase());
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateDefinitionForm(form, t);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await formsApi.createDefinition({
        name: sanitizeString(form.name),
        slug: form.slug || undefined,
        category: form.category,
        description: form.description || undefined,
        isActive: form.isActive,
      });
      toast.success(t('forms.createSuccess'));
      closeModal();
      const data = await formsApi.listDefinitions();
      setDefinitions(data);
    } catch {
      toast.error(t('forms.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormErrors({});
  };

  const categoryOptions = [
    { value: 'general', label: t('workflow.catGeneral') },
    { value: 'clinical', label: t('workflow.catClinical') },
    { value: 'administrative', label: t('workflow.catAdministrative') },
    { value: 'consent', label: t('dms.consent') },
    { value: 'feedback', label: t('crm.feedback') },
  ];

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('forms.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('forms.formCount', { count: definitions.length })}, {t('forms.submissionCount', { count: submissions.length })}
          </p>
        </div>
        <Can permission="forms.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
            {t('forms.newForm')}
          </Button>
        </Can>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'definitions' ? 'primary' : 'secondary'} onClick={() => { setTab('definitions'); setSearch(''); }}
          icon={<FileJson className="w-4 h-4" />}>
          {t('forms.definitions')} ({definitions.length})
        </Button>
        <Button variant={tab === 'submissions' ? 'primary' : 'secondary'} onClick={() => { setTab('submissions'); setSearch(''); }}
          icon={<ClipboardList className="w-4 h-4" />}>
          {t('forms.submissions')} ({submissions.length})
        </Button>
      </div>

      {/* Search */}
      {tab === 'definitions' && (
        <div className="mb-4 max-w-md">
          <Input placeholder={t('forms.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Definitions Tab */}
      {tab === 'definitions' && (
        filteredDefinitions.length === 0 ? (
          <EmptyState title={t('forms.noDefinitions')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.slug')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.category')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.version')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.isActive')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredDefinitions.map((def) => (
                    <tr key={def.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{def.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{def.slug}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{def.category}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">v{def.version}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={def.isActive ? 'success' : 'gray'}>{def.isActive ? t('forms.yes') : t('forms.no')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Submissions Tab */}
      {tab === 'submissions' && (
        submissions.length === 0 ? (
          <EmptyState title={t('forms.noSubmissions')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.id')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.definitions')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.patient')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('forms.submitted')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{sub.id.slice(0, 8)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sub.formName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{sub.patientName || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{sub.status}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDateTime(sub.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* New Definition Modal */}
      <Modal open={showModal} onClose={closeModal} title={t('forms.newForm')} size="lg"
        footer={<>
          <Button variant="secondary" onClick={closeModal}>{t('common.cancel')}</Button>
          <Can permission="forms.create">
            <Button loading={saving} onClick={() => { const f = document.getElementById('form-def'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
          </Can>
        </>}
      >
        <form id="form-def" onSubmit={handleCreate} className="space-y-4">
          <Input label={t('forms.name')} value={form.name}
            onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFormErrors((p) => ({ ...p, name: undefined })); }}
            error={formErrors.name} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('forms.slug')} value={form.slug}
              onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              helpText="Auto-generated from name if empty" />
            <Select label={t('forms.category')} options={categoryOptions} value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <Input label={t('forms.description')} value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
