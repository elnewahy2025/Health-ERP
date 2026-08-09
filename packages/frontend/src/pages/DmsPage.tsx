import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { dmsApi, type DocumentItem, type DocumentCategory } from '../lib/api';
import { FileUpload, ImageViewer, Button, Select, Modal, EmptyState, PageLoader } from '../components/ui';
import { FileText, Search, Download, Trash2, Eye, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDate } from '../lib/format';

const CATEGORY_COLORS: Record<string, string> = {
  lab_report: 'bg-blue-100 text-blue-800',
  radiology_report: 'bg-purple-100 text-purple-800',
  prescription: 'bg-green-100 text-green-800',
  consent: 'bg-yellow-100 text-yellow-800',
  id_scan: 'bg-gray-100 text-gray-800',
  insurance: 'bg-blue-100 text-blue-800',
  medical_record: 'bg-indigo-100 text-indigo-800',
  discharge_summary: 'bg-orange-100 text-orange-800',
  referral: 'bg-teal-100 text-teal-800',
  other: 'bg-gray-100 text-gray-800',
};

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function DmsPage() {
  const { t } = useTranslation();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [docData, catData] = await Promise.allSettled([
          dmsApi.list({ search: search || undefined, category: categoryFilter || undefined }),
          dmsApi.categories(),
        ]);
        if (!cancelled) {
          if (docData.status === 'fulfilled') setDocuments(docData.value.data);
          if (catData.status === 'fulfilled') setCategories(catData.value);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, categoryFilter, t]);

  const handleUpload = async (file: File, metadata: { title: string; category: string; patientId?: string; description?: string }) => {
    try {
      await dmsApi.upload(file, metadata);
      toast.success(t('dms.uploadSuccess'));
      setShowUpload(false);
      const data = await dmsApi.list({ search: search || undefined, category: categoryFilter || undefined });
      setDocuments(data.data);
    } catch {
      toast.error(t('dms.uploadFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await dmsApi.delete(id);
      toast.success(t('dms.deleteSuccess'));
      setShowDeleteConfirm(null);
      const data = await dmsApi.list({ search: search || undefined, category: categoryFilter || undefined });
      setDocuments(data.data);
    } catch {
      toast.error(t('dms.deleteFailed'));
    } finally {
      setDeleting(null);
    }
  };

  const categoryOptions = categories.map((c) => ({ value: c.key, label: c.label }));
  const allCategoriesOption = [{ value: '', label: t('dms.allCategories') }, ...categoryOptions];

  const categoryLabel = (cat: string): string => {
    const key = `dms.${cat.replace(/_/g, '')}`;
    const translated = t(key);
    return translated !== key ? translated : cat.replace(/_/g, ' ');
  };

  if (loading && documents.length === 0) return <PageLoader message={t('common.loading')} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileText className="w-6 h-6" /> {t('dms.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('dms.files', { count: documents.length })}</p>
        </div>
        <Button icon={<FileText className="w-4 h-4" />} onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? t('dms.closeUpload') : t('dms.uploadFile')}
        </Button>
      </div>

      {/* Upload Area */}
      {showUpload && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
          <FileUpload onUpload={handleUpload} categories={categories} showPatientSelect />
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-10"
            placeholder={t('dms.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          options={allCategoriesOption}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="sm:w-48"
        />
      </div>

      {/* Document Grid */}
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-8 h-8 text-gray-400" />}
          title={t('dms.noDocuments')}
          message={t('common.noData')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                {doc.mimeType?.startsWith('image/') ? (
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                    <ImageIcon className="w-6 h-6 text-blue-600" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-gray-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-500 truncate">{doc.fileName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
                  {categoryLabel(doc.category)}
                </span>
                {doc.version > 1 && (
                  <span className="text-xs text-gray-400">{t('dms.version', { version: doc.version })}</span>
                )}
                <span className="text-xs text-gray-400 ml-auto">{formatSize(doc.fileSize)}</span>
              </div>

              {doc.patientName && (
                <p className="text-xs text-gray-500 mt-1">{t('dms.patient')}: {doc.patientName}</p>
              )}

              <div className="flex gap-1 mt-3">
                <Button variant="ghost" size="sm" onClick={() => setViewingDoc(doc)} icon={<Eye className="w-3 h-3" />}>
                  {t('dms.view')}
                </Button>
                <a href={dmsApi.attachmentUrl(doc.id)} download>
                  <Button variant="ghost" size="sm" icon={<Download className="w-3 h-3" />}>
                    {t('dms.download')}
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(doc.id)}
                  icon={<Trash2 className="w-3 h-3 text-red-500" />}
                />
              </div>

              <p className="text-xs text-gray-400 mt-2">
                {formatDate(doc.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title={t('dms.delete')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={!!deleting} onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}>
              {t('dms.delete')}
            </Button>
          </>
        }
      >
        <p className="text-gray-700">{t('dms.deleteConfirm')}</p>
      </Modal>

      {/* Image/File Viewer */}
      {viewingDoc && (
        <ImageViewer
          src={dmsApi.downloadUrl(viewingDoc.id)}
          title={viewingDoc.title}
          mimeType={viewingDoc.mimeType || 'application/octet-stream'}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}
