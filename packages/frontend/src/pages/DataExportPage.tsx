import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Download, Plus, Clock, FileJson } from 'lucide-react';
import {
  PageLoader, EmptyState, Card, CardBody, Button, Badge, Select,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { formatDateTime } from '../lib/format';
import { Can } from '../components/auth/Authorization';

type ExportTab = 'export' | 'jobs' | 'definitions';

interface ExportModule {
  module: string;
  tables: string[];
  formats: string[];
}

interface ExportJob {
  id: string;
  module: string;
  format: string;
  recordCount: number;
  fileSize: number;
  status: string;
  trigger: string;
  startedAt: string;
}

interface ExportDefinition {
  id: string;
  name: string;
  module: string;
  format: string;
  columns: string[];
  dateRange: string;
  isScheduled: boolean;
  scheduleCron: string;
}

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'fhir_json', label: 'FHIR JSON (R4)' },
];

export default function DataExportPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ExportTab>('export');
  const [modules, setModules] = useState<ExportModule[]>([]);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [definitions, setDefinitions] = useState<ExportDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState('patients');
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [running, setRunning] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [modR, jobsR, defR] = await Promise.allSettled([
        api.get('/export/modules'),
        api.get('/export/jobs'),
        api.get('/export/definitions'),
      ]);
      if (modR.status === 'fulfilled') setModules((modR.value.data?.data ?? []) as ExportModule[]);
      if (jobsR.status === 'fulfilled') setJobs((jobsR.value.data?.data ?? []) as ExportJob[]);
      if (defR.status === 'fulfilled') setDefinitions((defR.value.data?.data ?? []) as ExportDefinition[]);
    } catch {
      toast.error(t('dataExport.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [modR, jobsR, defR] = await Promise.allSettled([
          api.get('/export/modules'),
          api.get('/export/jobs'),
          api.get('/export/definitions'),
        ]);
        if (!cancelled) {
          if (modR.status === 'fulfilled') setModules((modR.value.data?.data ?? []) as ExportModule[]);
          if (jobsR.status === 'fulfilled') setJobs((jobsR.value.data?.data ?? []) as ExportJob[]);
          if (defR.status === 'fulfilled') setDefinitions((defR.value.data?.data ?? []) as ExportDefinition[]);
        }
      } catch {
        if (!cancelled) toast.error(t('dataExport.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [t]);

  const handleExport = useCallback(async () => {
    setRunning(true);
    try {
      await api.post('/export/run', { module: selectedModule, format: selectedFormat });
      toast.success(t('dataExport.exportSuccess'));
      await loadData();
      setTab('jobs');
    } catch {
      toast.error(t('dataExport.exportError'));
    } finally {
      setRunning(false);
    }
  }, [selectedModule, selectedFormat, loadData, t]);

  if (loading) return <PageLoader message={t('common.loading')} />;

  const moduleOptions = modules.map((m) => ({ value: m.module, label: m.module }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dataExport.title')}</h1>
          <p className="text-gray-500 mt-1">
            {t('dataExport.moduleCount', { modules: modules.length })} · {t('dataExport.jobCount', { jobs: jobs.length })}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <Button variant={tab === 'export' ? 'primary' : 'secondary'} onClick={() => setTab('export')}>
          <Download className="w-4 h-4" /> {t('dataExport.exportData')}
        </Button>
        <Button variant={tab === 'jobs' ? 'primary' : 'secondary'} onClick={() => setTab('jobs')}>
          <Clock className="w-4 h-4" /> {t('dataExport.jobHistory')} ({jobs.length})
        </Button>
        <Button variant={tab === 'definitions' ? 'primary' : 'secondary'} onClick={() => setTab('definitions')}>
          <FileJson className="w-4 h-4" /> {t('dataExport.savedExports')} ({definitions.length})
        </Button>
      </div>

      {tab === 'export' && (
        <div className="max-w-lg mx-auto">
          <Card>
            <CardBody>
              <h2 className="text-lg font-semibold mb-4">{t('dataExport.runExport')}</h2>
              <div className="space-y-4">
                <Select
                  label={t('dataExport.module')}
                  options={moduleOptions.length > 0 ? moduleOptions : [{ value: 'patients', label: 'Patients' }]}
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                />
                <Select
                  label={t('dataExport.format')}
                  options={FORMAT_OPTIONS}
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value)}
                />
                <Can permission="data_export.export">
                  <Button className="w-full" loading={running} onClick={handleExport}>
                    <Download className="w-4 h-4" /> {t('dataExport.exportButton', { module: selectedModule, format: selectedFormat.toUpperCase() })}
                  </Button>
                </Can>
              </div>
            </CardBody>
          </Card>

          {modules.length > 0 && (
            <Card className="mt-4">
              <CardBody>
                <h3 className="font-semibold mb-3">{t('dataExport.availableModules')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {modules.map((m) => (
                    <div
                      key={m.module}
                      className={`p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedModule === m.module ? 'bg-primary-50 ring-1 ring-primary-200' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => setSelectedModule(m.module)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setSelectedModule(m.module); }}
                    >
                      <p className="font-medium text-sm capitalize">{sanitizeString(m.module)}</p>
                      <p className="text-xs text-gray-500">
                        {m.tables?.length} {t('dataExport.tables')} · {m.formats?.join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('dataExport.module')}</th>
                <th>{t('dataExport.format')}</th>
                <th>{t('dataExport.records')}</th>
                <th>{t('dataExport.size')}</th>
                <th>{t('common.status')}</th>
                <th>{t('dataExport.trigger')}</th>
                <th>{t('dataExport.started')}</th>
                <th>{t('dataExport.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title={t('dataExport.noJobs')} />
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="font-medium capitalize">{sanitizeString(j.module)}</td>
                    <td><Badge>{sanitizeString(j.format)}</Badge></td>
                    <td>{j.recordCount?.toLocaleString()}</td>
                    <td className="text-xs">
                      {j.fileSize ? `${(j.fileSize / 1024).toFixed(1)} KB` : '-'}
                    </td>
                    <td>
                      <Badge variant={j.status === 'completed' ? 'success' : j.status === 'failed' ? 'danger' : 'warning'}>
                        {sanitizeString(j.status)}
                      </Badge>
                    </td>
                    <td><Badge>{sanitizeString(j.trigger)}</Badge></td>
                    <td className="text-xs">{formatDateTime(j.startedAt)}</td>
                    <td>
                      <Can permission="data_export.export">
                        {j.status === 'completed' && (
                          <Button variant="ghost" size="sm">
                            <Download className="w-3 h-3" />
                          </Button>
                        )}
                      </Can>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'definitions' && (
        <div>
          <div className="flex gap-2 mb-4">
            <Can permission="data_export.create">
              <Button>
                <Plus className="w-4 h-4" /> {t('dataExport.newDefinition')}
              </Button>
            </Can>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('common.name', 'Name')}</th>
                  <th>{t('dataExport.module')}</th>
                  <th>{t('dataExport.format')}</th>
                  <th>{t('dataExport.columns')}</th>
                  <th>{t('dataExport.dateRange')}</th>
                  <th>{t('dataExport.scheduled')}</th>
                </tr>
              </thead>
              <tbody>
                {definitions.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState title={t('dataExport.noDefinitions')} />
                    </td>
                  </tr>
                ) : (
                  definitions.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="font-medium">{sanitizeString(d.name)}</td>
                      <td className="capitalize">{sanitizeString(d.module)}</td>
                      <td><Badge>{sanitizeString(d.format)}</Badge></td>
                      <td>{d.columns?.length || t('dataExport.allColumns')}</td>
                      <td className="text-xs">{sanitizeString(d.dateRange)}</td>
                      <td>
                        <Badge variant={d.isScheduled ? 'success' : 'gray'}>
                          {d.isScheduled ? sanitizeString(d.scheduleCron) : 'No'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
