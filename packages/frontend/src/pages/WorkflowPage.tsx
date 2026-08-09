import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { workflowApi, type WorkflowDefinition, type WorkflowInstance } from '../lib/api';
import { Modal, Input, Select, Button, Badge, EmptyState, PageLoader } from '../components/ui';
import { Plus, GitBranch, PlayCircle } from 'lucide-react';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import toast from 'react-hot-toast';

type TabType = 'definitions' | 'instances';

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
  if (!form.name.trim()) errors.name = t('workflow.nameRequired');
  return errors;
}

export default function WorkflowPage() {
  const { t } = useTranslation();

  const [tab, setTab] = useState<TabType>('definitions');
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
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
        const [defData, instData] = await Promise.allSettled([
          workflowApi.listDefinitions(),
          workflowApi.listInstances(),
        ]);
        if (!cancelled) {
          if (defData.status === 'fulfilled') setDefinitions(defData.value);
          if (instData.status === 'fulfilled') setInstances(instData.value);
          if (defData.status === 'rejected' && instData.status === 'rejected') {
            toast.error(t('workflow.loadFailed'));
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
      await workflowApi.createDefinition({
        name: sanitizeString(form.name),
        slug: form.slug || undefined,
        category: form.category,
        description: form.description || undefined,
        isActive: form.isActive,
      });
      toast.success(t('workflow.createSuccess'));
      closeModal();
      const data = await workflowApi.listDefinitions();
      setDefinitions(data);
    } catch {
      toast.error(t('workflow.createFailed'));
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
    { value: 'billing', label: t('workflow.catBilling') },
    { value: 'onboarding', label: t('workflow.catOnboarding') },
  ];

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('workflow.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('workflow.runCount', { count: definitions.length, count2: instances.length })}
          </p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowModal(true)}>
          {t('workflow.newDefinition')}
        </Button>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'definitions' ? 'primary' : 'secondary'} onClick={() => { setTab('definitions'); setSearch(''); }}
          icon={<GitBranch className="w-4 h-4" />}>
          {t('workflow.definitions')} ({definitions.length})
        </Button>
        <Button variant={tab === 'instances' ? 'primary' : 'secondary'} onClick={() => { setTab('instances'); setSearch(''); }}
          icon={<PlayCircle className="w-4 h-4" />}>
          {t('workflow.instances')} ({instances.length})
        </Button>
      </div>

      {/* Search */}
      {tab === 'definitions' && (
        <div className="mb-4 max-w-md">
          <Input placeholder={t('workflow.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Definitions Tab */}
      {tab === 'definitions' && (
        filteredDefinitions.length === 0 ? (
          <EmptyState title={t('workflow.noDefinitions')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.name')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.slug')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.category')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.steps')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.isActive')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredDefinitions.map((def) => (
                    <tr key={def.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{def.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{def.slug}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><Badge>{def.category}</Badge></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{Array.isArray(def.steps) ? def.steps.length : 0}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={def.isActive ? 'success' : 'gray'}>{def.isActive ? t('workflow.yes') : t('workflow.no')}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Instances Tab */}
      {tab === 'instances' && (
        instances.length === 0 ? (
          <EmptyState title={t('workflow.noInstances')} message={t('common.noData')} />
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.id')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.definitions')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.reference')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.steps')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('workflow.started')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {instances.map((inst) => (
                    <tr key={inst.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-700">{inst.id.slice(0, 8)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{inst.definitionName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {inst.referenceType ? `${inst.referenceType}:${inst.referenceId?.slice(0, 8)}` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {t('workflow.step', { step: inst.currentStep })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={inst.status === 'active' ? 'success' : inst.status === 'completed' ? 'info' : 'gray'}>{inst.status}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDateTime(inst.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* New Definition Modal */}
      <Modal open={showModal} onClose={closeModal} title={t('workflow.newDefinition')} size="lg"
        footer={<>
          <Button variant="secondary" onClick={closeModal}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={() => { const f = document.getElementById('wf-form'); if (f) (f as HTMLFormElement).requestSubmit(); }}>{t('common.save')}</Button>
        </>}
      >
        <form id="wf-form" onSubmit={handleCreate} className="space-y-4">
          <Input label={t('workflow.name')} value={form.name}
            onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFormErrors((p) => ({ ...p, name: undefined })); }}
            error={formErrors.name} required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('workflow.slug')} value={form.slug}
              onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              helpText="Auto-generated from name if empty" />
            <Select label={t('workflow.category')} options={categoryOptions} value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
          </div>
          <Input label={t('workflow.description')} value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
