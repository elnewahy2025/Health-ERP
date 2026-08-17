import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Shield, Download, Activity, Eye, Clock } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  Input,
  Select,
  PageLoader,
  EmptyState,
  Modal,
} from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { Can } from '../components/auth/Authorization';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: string;
  ip_address: string;
  created_at: string;
  user_id: string;
}

interface AuditLogParams {
  page: number;
  limit: number;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
}

export default function AuditLogsAdvancedPage() {
  const { t } = useTranslation();

  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);

  const loadLogs = useCallback(
    async (page: number, params?: Partial<AuditLogParams>) => {
      setLoading(true);
      try {
        const queryParams: AuditLogParams = {
          page,
          limit: 50,
          ...params,
        };
        const res = await api.get('/audit-logs', { params: queryParams });
        const data: AuditEntry[] = res.data.data || [];
        setLogs(data);
        setTotalPages(res.data.pagination?.totalPages || 1);

        const uniqueActions = [...new Set(data.map((l: AuditEntry) => l.action))];
        const uniqueEntities = [...new Set(data.map((l: AuditEntry) => l.entity_type).filter(Boolean))];
        setActionTypes(uniqueActions);
        setEntityTypes(uniqueEntities);
      } catch {
        toast.error(t('auditAdv.failedLoad'));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );


  const handleFilterChange = useCallback(
    (newAction: string, newEntity: string, newFrom: string, newTo: string) => {
      setActionFilter(newAction);
      setEntityFilter(newEntity);
      setFromDate(newFrom);
      setToDate(newTo);
      setCurrentPage(1);
      const params: Partial<AuditLogParams> = {};
      if (newAction) params.action = newAction;
      if (newEntity) params.entityType = newEntity;
      if (newFrom) params.fromDate = newFrom;
      if (newTo) params.toDate = newTo;
      loadLogs(1, params);
    },
    [loadLogs],
  );

  const handleExport = useCallback(
    async (format: string) => {
      try {
        const params: Record<string, string> = { format };
        if (actionFilter) params.action = actionFilter;
        if (entityFilter) params.entityType = entityFilter;
        if (fromDate) params.fromDate = fromDate;
        if (toDate) params.toDate = toDate;
        const res = await api.get('/audit/logs/export', {
          params,
          responseType: 'blob',
        });
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('auditAdv.exportDownloaded'));
      } catch {
        toast.error(t('auditAdv.exportFailed'));
      }
    },
    [actionFilter, entityFilter, fromDate, toDate, t],
  );

  const filteredLogs = logs.filter((l) => {
    if (searchTerm && !JSON.stringify(l).toLowerCase().includes(searchTerm.toLowerCase()))
      return false;
    return true;
  });

  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      const params: Partial<AuditLogParams> = {};
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entityType = entityFilter;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      loadLogs(newPage, params);
    },
    [actionFilter, entityFilter, fromDate, toDate, loadLogs],
  );

  const parseMetadata = useCallback((metadata: string): Record<string, unknown> => {
    try {
      return JSON.parse(metadata || '{}');
    } catch {
      return {};
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Shield className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('auditAdv.title')}</h1>
            <p className="text-sm text-gray-500">{t('auditAdv.subtitle')}</p>
          </div>
        </div>
        <Can permission="audit.export">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExport('csv')}
              icon={<Download className="w-4 h-4" />}
            >
              {t('auditAdv.exportCsv')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExport('json')}
              icon={<Download className="w-4 h-4" />}
            >
              {t('auditAdv.exportJson')}
            </Button>
          </div>
        </Can>
      </div>

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Input
              label={t('auditAdv.search')}
              placeholder={t('auditAdv.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select
              label={t('auditAdv.action')}
              value={actionFilter}
              onChange={(e) =>
                handleFilterChange(e.target.value, entityFilter, fromDate, toDate)
              }
              options={[
                { value: '', label: t('auditAdv.allActions') },
                ...actionTypes.map((a) => ({ value: a, label: a })),
              ]}
            />
            <Select
              label={t('auditAdv.entity')}
              value={entityFilter}
              onChange={(e) =>
                handleFilterChange(actionFilter, e.target.value, fromDate, toDate)
              }
              options={[
                { value: '', label: t('auditAdv.allEntities') },
                ...entityTypes.map((e) => ({ value: e, label: e })),
              ]}
            />
            <Input
              label={t('auditAdv.from')}
              type="date"
              value={fromDate}
              onChange={(e) =>
                handleFilterChange(actionFilter, entityFilter, e.target.value, toDate)
              }
            />
            <Input
              label={t('auditAdv.to')}
              type="date"
              value={toDate}
              onChange={(e) =>
                handleFilterChange(actionFilter, entityFilter, fromDate, e.target.value)
              }
            />
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <PageLoader message={t('auditAdv.loadingLogs')} />
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-12 h-12" />}
          title={t('auditAdv.noLogs')}
          message={t('auditAdv.adjustFilters')}
        />
      ) : (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <Card
              key={log.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => setSelected(log)}
            >
              <CardBody className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold bg-indigo-500">
                      {log.action.split('.').pop()?.charAt(0)?.toUpperCase() || 'A'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {sanitizeString(log.action)}
                      </span>
                      {log.entity_type && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {sanitizeString(log.entity_type)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <Clock className="w-3 h-3 inline" />{' '}
                      {new Date(log.created_at).toLocaleString()}
                      {log.ip_address && <> • IP: {sanitizeString(log.ip_address)}</>}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-gray-400" />
                </div>
              </CardBody>
            </Card>
          ))}

          {totalPages > 1 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {t('auditAdv.pageOf', { current: currentPage, total: totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  {t('auditAdv.prev')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  {t('auditAdv.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={t('auditAdv.auditLogDetail')}
          size="lg"
          footer={
            <Button onClick={() => setSelected(null)} variant="secondary">
              {t('auditAdv.close')}
            </Button>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('auditAdv.actionLabel')}</span>
              <span className="font-medium">{sanitizeString(selected.action)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('auditAdv.entityLabel')}</span>
              <span>{selected.entity_type ? sanitizeString(selected.entity_type) : t('auditAdv.na')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('auditAdv.entityIdLabel')}</span>
              <span className="font-mono text-xs">
                {selected.entity_id ? sanitizeString(selected.entity_id) : t('auditAdv.na')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('auditAdv.userLabel')}</span>
              <span>{selected.user_id ? sanitizeString(selected.user_id) : t('auditAdv.system')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('auditAdv.ipLabel')}</span>
              <span>{selected.ip_address ? sanitizeString(selected.ip_address) : t('auditAdv.na')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{t('auditAdv.timeLabel')}</span>
              <span>{new Date(selected.created_at).toLocaleString()}</span>
            </div>
            {selected.metadata && (
              <div>
                <span className="text-gray-500">{t('auditAdv.metadataLabel')}</span>
                <pre className="mt-1 bg-gray-50 p-3 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(parseMetadata(selected.metadata), null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
