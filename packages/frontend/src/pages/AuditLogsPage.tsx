import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, PageLoader, EmptyState, Select, Badge } from '../components/ui';
import { auditApi } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';

interface AuditLog {
  id: string;
  action: string;
  user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  created_at: string;
  details?: Record<string, unknown>;
}

interface Pagination {
  total: number;
  totalPages: number;
}

const actionColor = (action: string): string => {
  if (action.includes('login')) return 'text-green-600';
  if (action.includes('delete') || action.includes('disable')) return 'text-red-600';
  if (action.includes('create')) return 'text-blue-600';
  if (action.includes('update') || action.includes('change')) return 'text-yellow-600';
  return 'text-gray-600';
};

export default function AuditLogsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, totalPages: 0 });
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const loadLogs = useCallback(async (page: number, action?: string, entity?: string) => {
    setLoading(true);
    try {
      const data = await auditApi.list({
        page,
        limit: 20,
        action: action || undefined,
        entityType: entity || undefined,
      });
      setLogs(data.data || []);
      setPagination(data.pagination || { total: 0, totalPages: 0 });
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActionTypes = useCallback(async () => {
    try {
      const types = await auditApi.actionTypes();
      setActionTypes(types || []);
    } catch {
      setActionTypes([]);
    }
  }, []);

  const handleLoad = useCallback(() => {
    loadLogs(currentPage, actionFilter, entityFilter);
    loadActionTypes();
  }, [currentPage, actionFilter, entityFilter, loadLogs, loadActionTypes]);

  const handleActionFilter = useCallback(
    (value: string) => {
      setActionFilter(value);
      setCurrentPage(1);
      loadLogs(1, value, entityFilter);
    },
    [entityFilter, loadLogs],
  );

  const handleEntityFilter = useCallback(
    (value: string) => {
      setEntityFilter(value);
      setCurrentPage(1);
      loadLogs(1, actionFilter, value);
    },
    [actionFilter, loadLogs],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      loadLogs(newPage, actionFilter, entityFilter);
    },
    [actionFilter, entityFilter, loadLogs],
  );

  const toggleSelect = useCallback(
    (log: AuditLog) => {
      setSelected(selected?.id === log.id ? null : log);
    },
    [selected],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="w-6 h-6" /> {t('audit.title')}
          </h1>
          <p className="text-gray-500 mt-1">
            {t('audit.entries', { count: pagination.total })}
          </p>
        </div>
        <Button onClick={handleLoad} loading={loading}>
          {t('audit.title')}
        </Button>
      </div>

      <div className="bg-white border rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select
              label={t('audit.actionFilter')}
              value={actionFilter}
              onChange={(e) => handleActionFilter(e.target.value)}
              options={[
                { value: '', label: t('audit.allActions') },
                ...actionTypes.map((a) => ({ value: a, label: a })),
              ]}
            />
          </div>
          <div className="flex-1">
            <Select
              label={t('audit.entityFilter')}
              value={entityFilter}
              onChange={(e) => handleEntityFilter(e.target.value)}
              options={[
                { value: '', label: t('audit.allEntities') },
                { value: 'user', label: t('audit.userEntity') },
                { value: 'patient', label: t('audit.patientEntity') },
                { value: 'appointment', label: t('audit.appointmentEntity') },
                { value: 'invoice', label: t('audit.invoiceEntity') },
              ]}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <PageLoader message={t('audit.loadingLogs')} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<History className="w-12 h-12" />}
          title={t('audit.noLogs')}
          message={t('audit.noLogs')}
        />
      ) : (
        <>
          <div className="overflow-x-auto bg-white border rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('audit.time')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('audit.action')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('audit.user')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('audit.entity')}</th>
                  <th className="text-left p-3 text-sm font-medium text-gray-600">{t('audit.ipAddress')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleSelect(log)}
                  >
                    <td className="p-3 text-xs text-gray-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className={`font-medium text-sm ${actionColor(log.action)}`}>
                        {sanitizeString(log.action)}
                      </span>
                    </td>
                    <td className="p-3 text-sm font-mono text-gray-600">
                      {log.user_id ? sanitizeString(log.user_id.substring(0, 8)) + '...' : '—'}
                    </td>
                    <td className="p-3">
                      {log.entity_type ? (
                        <Badge variant="gray">
                          {sanitizeString(log.entity_type)}{' '}
                          {log.entity_id ? sanitizeString(log.entity_id.substring(0, 8)) : ''}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-500">
                      {log.ip_address ? sanitizeString(log.ip_address) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="bg-white border rounded-lg p-4 dark:bg-gray-900 dark:border-gray-800">
              <h3 className="font-semibold mb-2">{t('audit.action')}: {sanitizeString(selected.action)}</h3>
              <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded overflow-x-auto">
                {JSON.stringify(selected.details || {}, null, 2)}
              </pre>
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {t('audit.pageOf', { current: currentPage, total: pagination.totalPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  size="sm"
                  variant="secondary"
                  icon={<ChevronLeft className="w-4 h-4" />}
                />
                <Button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === pagination.totalPages}
                  size="sm"
                  variant="secondary"
                  icon={<ChevronRight className="w-4 h-4" />}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
