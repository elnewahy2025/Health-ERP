import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileText } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Input, Select, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';

interface PrintTemplate {
  id: string;
  name: string;
  code: string;
  category: string;
  documentType: string;
  variables: string[];
  paperSize: string;
  isDefault: boolean;
  isActive: boolean;
}

export default function PrintTemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', category: 'clinical',
    documentType: '', paperSize: 'A4', contentHtml: '',
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.get('/print/templates');
        if (!cancelled) setTemplates((r.data?.data ?? []) as PrintTemplate[]);
      } catch {
        if (!cancelled) toast.error(t('printTemplates.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (tpl) =>
        tpl.name?.toLowerCase().includes(q) ||
        tpl.documentType?.includes(q) ||
        tpl.category?.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const documentTypes = useMemo(() => {
    const types = templates.map((tpl) => tpl.documentType);
    return [...new Set(types)].filter(Boolean);
  }, [templates]);

  const handleFilterByType = useCallback((docType: string) => {
    setSearch(docType);
  }, []);

  const clearFilter = useCallback(() => {
    setSearch('');
  }, []);

  const openCreate = useCallback(() => {
    setForm({ name: '', code: '', category: 'clinical', documentType: '', paperSize: 'A4', contentHtml: '' });
    setShowCreate(true);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.code.trim() || !form.documentType.trim()) {
      toast.error(t('printTemplates.loadError'));
      return;
    }
    setCreating(true);
    try {
      await api.post('/print/templates', {
        name: sanitizeString(form.name.trim()),
        code: sanitizeString(form.code.trim().toLowerCase().replace(/\s+/g, '_')),
        category: sanitizeString(form.category),
        documentType: sanitizeString(form.documentType.trim().toLowerCase().replace(/\s+/g, '_')),
        paperSize: form.paperSize,
        contentHtml: form.contentHtml.trim() ? form.contentHtml : undefined,
        variables: [],
      });
      toast.success(t('printTemplates.created'));
      setShowCreate(false);
      const r = await api.get('/print/templates');
      setTemplates((r.data?.data ?? []) as PrintTemplate[]);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 409 ? t('printTemplates.duplicateCode') : t('printTemplates.createError'));
    } finally {
      setCreating(false);
    }
  }, [form, t]);

  if (loading) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('printTemplates.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('printTemplates.templateCount', { count: templates.length })}
          </p>
        </div>
        <Button onClick={openCreate}>
          <FileText className="w-4 h-4" /> {t('printTemplates.newTemplate')}
        </Button>
      </div>

      <Card className="mb-6">
        <CardBody>
          <Input
            placeholder={t('printTemplates.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </CardBody>
      </Card>
      <Card className="mb-6">
        <CardBody>
          <p className="text-sm font-medium text-gray-700">{t('printTemplates.builtInVariables')}</p>
          <p className="text-xs text-gray-500 mt-1 font-mono break-words">
            {'{{clinic_name}} · {{clinic_legal_name}} · {{clinic_license_number}} · {{clinic_tax_number}} · {{clinic_currency}} · {{document_number}} · {{document_date}} · {{invoice_total}} · {{receipt_amount}} · {{receipt_method}}'}
          </p>
        </CardBody>
      </Card>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer ${
            !search ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
          }`}
          onClick={clearFilter}
        >
          {t('printTemplates.all')} ({templates.length})
        </button>
        {documentTypes.map((dt) => {
          const count = templates.filter((tpl) => tpl.documentType === dt).length;
          return (
            <button
              key={dt}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer capitalize ${
                search === dt ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
              }`}
              onClick={() => handleFilterByType(dt)}
            >
              {sanitizeString(dt.replace(/_/g, ' '))} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <EmptyState title={t('printTemplates.noTemplates')} />
        ) : (
          filtered.map((tpl) => (
            <Card key={tpl.id}>
              <CardBody>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <h3 className="font-semibold">{sanitizeString(tpl.name)}</h3>
                  </div>
                  <Badge>{sanitizeString(tpl.category)}</Badge>
                </div>
                <p className="text-xs font-mono text-gray-500 mb-1">{sanitizeString(tpl.code)}</p>
                <p className="text-xs text-gray-500 mb-3 capitalize">
                  {t('printTemplates.documentType')}: {sanitizeString(tpl.documentType.replace(/_/g, ' '))}
                  {' · '}{t('printTemplates.paper')}: {sanitizeString(tpl.paperSize)}
                </p>
                <div className="flex gap-2">
                  <Badge>{tpl.variables?.length ?? 0} {t('printTemplates.variables')}</Badge>
                  {tpl.isDefault && <Badge variant="success">{t('printTemplates.default')}</Badge>}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('printTemplates.newTemplate')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              {t('notifTmpl.cancel')}
            </Button>
            <Button onClick={handleCreate} loading={creating}>
              {t('notifTmpl.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('printTemplates.name')}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={120}
          />
          <Input
            label={t('printTemplates.code')}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="invoice_default"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t('printTemplates.category')}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              options={[
                { value: 'clinical', label: 'Clinical' },
                { value: 'financial', label: 'Financial' },
                { value: 'administrative', label: 'Administrative' },
              ]}
            />
            <Input
              label={t('printTemplates.documentType')}
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value }))}
              placeholder="invoice"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label={t('printTemplates.paper')}
              value={form.paperSize}
              onChange={(e) => setForm((f) => ({ ...f, paperSize: e.target.value }))}
              options={[
                { value: 'A4', label: 'A4' },
                { value: 'A5', label: 'A5' },
                { value: 'Letter', label: 'Letter' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('printTemplates.preview')} (HTML)
            </label>
            <textarea
              className="w-full border rounded-lg p-3 min-h-[120px] font-mono text-sm"
              value={form.contentHtml}
              onChange={(e) => setForm((f) => ({ ...f, contentHtml: e.target.value }))}
              placeholder="<h1>{{patientName}}</h1>"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
