import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Upload, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';

type ImportTab = 'import' | 'history';

interface ImportModule {
  module: string;
  table: string;
  columns: string[];
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
  errors: ImportError[];
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

interface ImportError {
  row: number;
  error: string;
}

interface ImportResult {
  id: string;
  module: string;
  totalRows: number;
  successful: number;
  failed: number;
  errors: ImportError[];
  status: string;
}

export default function BulkImportPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ImportTab>('import');
  const [modules, setModules] = useState<ImportModule[]>([]);
  const [selectedModule, setSelectedModule] = useState('patients');
  const [rows, setRows] = useState('');
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [modR, jobsR] = await Promise.allSettled([
        api.get('/import/modules'),
        api.get('/import/jobs'),
      ]);
      if (modR.status === 'fulfilled') setModules((modR.value.data?.data ?? []) as ImportModule[]);
      if (jobsR.status === 'fulfilled') setJobs((jobsR.value.data?.data ?? []) as ImportJob[]);
    } catch {
      toast.error(t('bulkImport.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [modR, jobsR] = await Promise.allSettled([
          api.get('/import/modules'),
          api.get('/import/jobs'),
        ]);
        if (!cancelled) {
          if (modR.status === 'fulfilled') setModules((modR.value.data?.data ?? []) as ImportModule[]);
          if (jobsR.status === 'fulfilled') setJobs((jobsR.value.data?.data ?? []) as ImportJob[]);
        }
      } catch {
        if (!cancelled) toast.error(t('bulkImport.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const doImport = useCallback(async () => {
    if (!rows.trim()) return;
    setImporting(true);
    setResult(null);
    try {
      const modConfig = modules.find((m) => m.module === selectedModule);
      const parsedRows = rows.split('\n').filter((l) => l.trim()).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        const headers = modConfig?.columns ?? [];
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { if (cols[i]) row[h] = cols[i]; });
        return row;
      });
      const r = await api.post('/import/start', {
        module: selectedModule,
        rows: parsedRows,
        fileName: `${selectedModule}_manual.csv`,
      });
      const data = r.data?.data as ImportResult | undefined;
      if (data) setResult(data);
      await loadData();
      toast.success(t('bulkImport.importSuccess'));
    } catch (err: unknown) {
      const error = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setResult({
        id: '',
        module: selectedModule,
        totalRows: 0,
        successful: 0,
        failed: 0,
        errors: [],
        status: 'failed',
      });
      toast.error(error || t('bulkImport.importError'));
    } finally {
      setImporting(false);
    }
  }, [rows, selectedModule, modules, loadData, t]);

  const rowCount = rows.split('\n').filter((l) => l.trim()).length;

  if (loading) return <PageLoader message={t('common.loading')} />;

  const modConfig = modules.find((m) => m.module === selectedModule);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('bulkImport.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('bulkImport.moduleCount', { count: modules.length })}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'import' ? 'primary' : 'secondary'} onClick={() => setTab('import')}>
          <Upload className="w-4 h-4" /> {t('bulkImport.importData')}
        </Button>
        <Button variant={tab === 'history' ? 'primary' : 'secondary'} onClick={() => setTab('history')}>
          <FileSpreadsheet className="w-4 h-4" /> {t('bulkImport.jobHistory')} ({jobs.length})
        </Button>
      </div>

      {tab === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardBody>
                <h2 className="text-lg font-semibold mb-4">
                  {t('bulkImport.importModule', { module: selectedModule })}
                </h2>

                {modules.length > 0 ? (
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {modules.map((m) => (
                      <button
                        key={m.module}
                        onClick={() => setSelectedModule(m.module)}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer capitalize transition-colors ${
                          selectedModule === m.module
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {sanitizeString(m.module)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState title={t('bulkImport.noModules')} />
                )}

                {modConfig && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">
                      {t('bulkImport.expectedColumns')}{' '}
                      <code className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">
                        {modConfig.columns.join(', ')}
                      </code>
                    </p>
                    <textarea
                      className="w-full h-64 rounded-lg border border-gray-300 p-3 text-xs font-mono resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder={t('bulkImport.pastePlaceholder')}
                      value={rows}
                      onChange={(e) => setRows(e.target.value)}
                    />
                  </div>
                )}

                <Button
                  onClick={doImport}
                  loading={importing}
                  disabled={!rows.trim() || importing}
                >
                  <Upload className="w-4 h-4" /> {t('bulkImport.importRows', { count: rowCount })}
                </Button>
              </CardBody>
            </Card>
          </div>

          <div>
            {result && (
              <Card className={`mb-4 ${
                result.status === 'completed' ? 'border-green-300' :
                result.status === 'failed' ? 'border-red-300' : 'border-yellow-300'
              }`}>
                <CardBody>
                  <div className="flex items-center gap-2 mb-3">
                    {result.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : result.status === 'failed' ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    )}
                    <h3 className="font-semibold capitalize">{t('bulkImport.status')}: {result.status}</h3>
                  </div>
                  {result.totalRows > 0 && (
                    <div className="text-sm space-y-1">
                      <p>{t('bulkImport.total')}: {result.totalRows}</p>
                      <p className="text-green-600">✓ {t('bulkImport.successful')}: {result.successful}</p>
                      <p className="text-red-600">✗ {t('bulkImport.failed')}: {result.failed}</p>
                    </div>
                  )}
                  {result.errors.length > 0 && (
                    <div className="mt-3 max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium text-red-600 mb-1">{t('bulkImport.errors')}:</p>
                      {result.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-500">
                          Row {e.row}: {sanitizeString(e.error)}
                        </p>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {modConfig && (
              <Card>
                <CardBody>
                  <h3 className="font-semibold mb-3">
                    {t('bulkImport.template', { module: selectedModule })}
                  </h3>
                  <div className="text-xs space-y-1">
                    {modConfig.columns.map((c) => (
                      <div key={c} className="flex items-center gap-2">
                        <code className="bg-gray-100 px-1.5 py-0.5 rounded flex-1">{c}</code>
                        <span className="text-gray-400">{c.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('bulkImport.status')}</th>
                <th>{t('bulkImport.file')}</th>
                <th>{t('bulkImport.total')}</th>
                <th>{t('bulkImport.successful')}</th>
                <th>{t('bulkImport.failed')}</th>
                <th>{t('common.status')}</th>
                <th>{t('bulkImport.date')}</th>
                <th>{t('bulkImport.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title={t('bulkImport.noJobs')} />
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="font-medium capitalize">{sanitizeString(j.module)}</td>
                    <td className="text-xs max-w-xs truncate">{sanitizeString(j.fileName)}</td>
                    <td>{j.totalRows}</td>
                    <td className="text-green-600">{j.successfulRows}</td>
                    <td className="text-red-600">{j.failedRows}</td>
                    <td>
                      <Badge variant={j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : 'warning'}>
                        {sanitizeString(j.status)}
                      </Badge>
                    </td>
                    <td className="text-xs">{formatDateTime(j.createdAt)}</td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedJob(j)}>
                        {t('bulkImport.details')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        title={`${t('bulkImport.details')}: ${selectedJob?.fileName ?? ''}`}
        size="md"
      >
        {selectedJob && (
          <div className="space-y-2 text-sm">
            <p><strong>{t('bulkImport.status')}:</strong> {sanitizeString(selectedJob.status)}</p>
            <p>
              <strong>{t('bulkImport.total')}:</strong> {selectedJob.totalRows} ·{' '}
              <strong>{t('bulkImport.successful')}:</strong> {selectedJob.successfulRows} ·{' '}
              <strong>{t('bulkImport.failed')}:</strong> {selectedJob.failedRows}
            </p>
            <p>
              <strong>{t('bulkImport.started')}:</strong> {formatDateTime(selectedJob.startedAt) || '-'}
            </p>
            <p>
              <strong>{t('bulkImport.completedDate')}:</strong> {formatDateTime(selectedJob.completedAt) || '-'}
            </p>
            {selectedJob.errors?.length > 0 && (
              <div>
                <strong>{t('bulkImport.errors')}:</strong>
                {selectedJob.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-red-500 mt-1">
                    Row {e.row || i + 1}: {sanitizeString(e.error || String(e))}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
