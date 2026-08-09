import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Upload, FileSpreadsheet, Check, AlertCircle, Download, History,
} from 'lucide-react';
import {
  Card, CardBody, Button, Select, Badge, Table, PageLoader,
  type Column,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { escapeHtml } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

/* ── Types ─────────────────────────────────────────────────────────── */

type ImportTab = 'import' | 'history';

interface ImportModule {
  module: string;
  table: string;
  columns: string[];
}

interface ImportResult {
  id: string;
  module: string;
  totalRows: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  status: string;
}

interface ImportJob {
  id: string;
  module: string;
  fileName: string;
  format: string;
  status: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  errors: Array<{ row: number; error: string }> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function parseCsvFile(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'gray'> = {
    completed: 'success',
    processing: 'info',
    failed: 'danger',
  };
  return map[status] ?? 'gray';
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function DataImportPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ImportTab>('import');
  const [loading, setLoading] = useState(true);

  /* ── Import state ── */
  const [modules, setModules] = useState<ImportModule[]>([]);
  const [importType, setImportType] = useState('patients');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  /* ── History state ── */
  const [jobs, setJobs] = useState<ImportJob[]>([]);

  /* ── Data fetching ── */

  const fetchModules = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/import/modules');
      setModules((data.data ?? []) as ImportModule[]);
    } catch {
      toast.error(t('dataImport.loadModulesFailed'));
    }
  }, [t]);

  const fetchJobs = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get('/import/jobs');
      setJobs((data.data ?? []) as ImportJob[]);
    } catch {
      toast.error(t('dataImport.loadHistoryFailed'));
    }
  }, [t]);

  /* ── Initial load ── */

  useEffect(() => {
    let cancelled = false;
    const loadAll = async (): Promise<void> => {
      setLoading(true);
      await Promise.allSettled([fetchModules(), fetchJobs()]);
      if (!cancelled) setLoading(false);
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [fetchModules, fetchJobs]);

  /* ── Tab data loading ── */

  useEffect(() => {
    if (tab !== 'history') return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const { data } = await api.get('/import/jobs');
        if (!cancelled) setJobs((data.data ?? []) as ImportJob[]);
      } catch {
        if (!cancelled) toast.error(t('dataImport.loadHistoryFailed'));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [tab, t]);

  /* ── File handling ── */

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) {
        toast.error(t('dataImport.parseError'));
        return;
      }
      const rows = parseCsvFile(text);
      if (rows.length === 0) {
        toast.error(t('dataImport.emptyFile'));
        return;
      }
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(selected);
  }, [t]);

  /* ── Import handler ── */

  const handleImport = useCallback(async (): Promise<void> => {
    if (!file) {
      toast.error(t('dataImport.noFile'));
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsvFile(text);
      if (rows.length === 0) {
        toast.error(t('dataImport.emptyFile'));
        setImporting(false);
        return;
      }

      const { data } = await api.post('/import/start', {
        module: importType,
        rows,
        fileName: file.name,
        format: file.name.endsWith('.csv') ? 'csv' : 'xlsx',
      });

      const importResult = (data.data ?? null) as ImportResult | null;
      setResult(importResult);

      if (importResult && importResult.errors?.length > 0) {
        toast.error(`${importResult.errors.length} rows had errors`);
      } else {
        toast.success(t('dataImport.importSuccess', { count: String(importResult?.successful ?? rows.length) } as Record<string, unknown>));
      }
      void fetchJobs();
    } catch {
      toast.error(t('dataImport.importFailed'));
    } finally {
      setImporting(false);
    }
  }, [file, importType, t, fetchJobs]);

  /* ── Template download ── */

  const handleDownloadTemplate = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get(`/import/template/${importType}`);
      const template = (data.data ?? null) as { columns: string[]; sample: Record<string, string> } | null;
      if (template?.columns) {
        const csv = [
          template.columns.join(','),
          template.columns.map((c) => `[${c.replace(/_/g, ' ')}]`).join(','),
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${importType}_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('dataImport.templateDownloaded'));
      }
    } catch {
      toast.error(t('dataImport.templateFailed'));
    }
  }, [importType, t]);

  /* ── Table columns ── */

  const jobColumns: Column<ImportJob>[] = [
    {
      key: 'module',
      header: t('dataImport.module'),
      render: (item) => <span className="font-medium capitalize">{escapeHtml(item.module)}</span>,
    },
    {
      key: 'fileName',
      header: t('dataImport.fileName'),
      render: (item) => <span>{escapeHtml(item.fileName)}</span>,
    },
    {
      key: 'totalRows',
      header: t('dataImport.rows'),
      render: (item) => <span>{item.totalRows}</span>,
    },
    {
      key: 'successfulRows',
      header: t('dataImport.successful'),
      render: (item) => <span className="text-green-600">{item.successfulRows}</span>,
    },
    {
      key: 'failedRows',
      header: t('dataImport.errors'),
      render: (item) => <span className="text-red-600">{item.failedRows}</span>,
    },
    {
      key: 'status',
      header: t('dataImport.status'),
      render: (item) => (
        <Badge variant={getStatusVariant(item.status)}>
          {t(`dataImport.${item.status}`) || item.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: t('dataImport.date'),
      render: (item) => <span>{formatDateTime(item.createdAt) || '-'}</span>,
    },
  ];

  /* ── Tabs ── */

  const tabs: Array<{ key: ImportTab; icon: React.ReactNode; label: string }> = [
    { key: 'import', icon: <Upload className="w-4 h-4" />, label: t('dataImport.importTab') },
    { key: 'history', icon: <History className="w-4 h-4" />, label: t('dataImport.historyTab') },
  ];

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-100 rounded-lg">
          <Upload className="w-6 h-6 text-cyan-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dataImport.title')}</h1>
          <p className="text-sm text-gray-500">{t('dataImport.subtitle')}</p>
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
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tabItem.icon}
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <PageLoader message={t('common.loading')} />
      ) : (
        <>
          {/* ── IMPORT TAB ── */}
          {tab === 'import' && (
            <div className="space-y-6">
              <Card>
                <CardBody className="p-6">
                  <div className="space-y-4">
                    <Select
                      label={t('dataImport.importType')}
                      value={importType}
                      onChange={(e) => setImportType(e.target.value)}
                      options={modules.map((m) => ({
                        value: m.module,
                        label: m.module.charAt(0).toUpperCase() + m.module.slice(1),
                      }))}
                    />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('dataImport.selectFile')}
                      </label>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>

                    {file && (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                        <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium">{escapeHtml(file.name)}</span>
                        <span className="text-xs text-gray-500">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        onClick={() => void handleImport()}
                        disabled={importing || !file}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        {importing ? t('dataImport.importing') : t('dataImport.startImport')}
                      </Button>
                      <Button variant="secondary" onClick={() => void handleDownloadTemplate()}>
                        <Download className="w-4 h-4 mr-1" />
                        {t('dataImport.downloadTemplate')}
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* Preview */}
              {preview.length > 0 && (
                <Card>
                  <CardBody className="p-4">
                    <h3 className="font-semibold mb-3">{t('dataImport.preview')}</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm border border-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            {Object.keys(preview[0]).map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-gray-700">
                                {escapeHtml(h)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {preview.map((row, idx) => (
                            <tr key={idx}>
                              {Object.values(row).map((v, j) => (
                                <td key={j} className="px-3 py-2 text-gray-600">
                                  {escapeHtml(String(v).substring(0, 50))}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Results */}
              {result && (
                <Card>
                  <CardBody className="p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      {result.errors?.length === 0 ? (
                        <Check className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                      )}
                      {t('dataImport.importResults')}
                    </h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-3 bg-blue-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-600">{result.totalRows}</p>
                        <p className="text-sm text-gray-500">{t('dataImport.totalRows')}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-600">{result.successful}</p>
                        <p className="text-sm text-gray-500">{t('dataImport.imported')}</p>
                      </div>
                      <div className="p-3 bg-yellow-50 rounded-lg text-center">
                        <p className="text-2xl font-bold text-yellow-600">{result.failed}</p>
                        <p className="text-sm text-gray-500">{t('dataImport.skipped')}</p>
                      </div>
                    </div>
                    {result.errors && result.errors.length > 0 && (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {result.errors.map((err, idx) => (
                          <div key={idx} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                            Row {err.row}: {escapeHtml(err.error)}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === 'history' && (
            <Card>
              <CardBody className="p-0">
                <Table<ImportJob>
                  columns={jobColumns}
                  data={jobs}
                  loading={false}
                  emptyMessage={t('dataImport.noHistory')}
                />
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
