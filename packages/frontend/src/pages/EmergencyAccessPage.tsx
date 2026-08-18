import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock3, ShieldAlert, UserRound } from 'lucide-react';
import { Badge, Button, Card, CardBody, EmptyState, Input, PageLoader, PatientSearchField } from '../components/ui';
import { apiClient } from '../lib/api';
import { useAuth } from '../stores/authStore';
import { Can } from '../components/auth/Authorization';
import { confirmDialog } from '../components/ui';

interface EmergencyRecord {
  id: string;
  patient_id?: string;
  patientId?: string;
  user_id?: string;
  status: string;
  reason: string;
  expires_at?: string;
  expiresAt?: string;
  created_at?: string;
  createdAt?: string;
  revoked_at?: string | null;
}

interface EmergencyLogResponse {
  items: EmergencyRecord[];
  total: number;
  page: number;
  limit: number;
}

function recordPatientId(record: EmergencyRecord): string {
  return record.patientId || record.patient_id || '';
}

function recordExpiry(record: EmergencyRecord): string {
  return record.expiresAt || record.expires_at || '';
}

function recordCreated(record: EmergencyRecord): string {
  return record.createdAt || record.created_at || '';
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function EmergencyAccessPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [active, setActive] = useState<EmergencyRecord[]>([]);
  const [log, setLog] = useState<EmergencyLogResponse | null>(null);
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [activeResponse, logResponse] = await Promise.all([
        apiClient.get('/emergency-access/active'),
        apiClient.get('/emergency-access/log', { params: { page: 1, limit: 50 } }),
      ]);
      setActive((activeResponse.data?.data || []) as EmergencyRecord[]);
      setLog((logResponse.data?.data || null) as EmergencyLogResponse | null);
    } catch {
      toast.error(t('emergencyAccess.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async () => {
    if (!patientId || reason.trim().length < 10) {
      toast.error(t('emergencyAccess.validation'));
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/emergency-access/activate', {
        patientId,
        reason: reason.trim(),
      });
      toast.success(t('emergencyAccess.activated'));
      setPatientId('');
      setReason('');
      await load();
    } catch {
      toast.error(t('emergencyAccess.activateError'));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (record: EmergencyRecord) => {
    const confirmed = await confirmDialog({
      title: t('emergencyAccess.revokeTitle'),
      message: t('emergencyAccess.revokeMessage'),
      confirmLabel: t('emergencyAccess.revoke'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;

    setRevokingId(record.id);
    try {
      await apiClient.post(`/emergency-access/${record.id}/revoke`, { reason: t('emergencyAccess.manualRevoke') });
      toast.success(t('emergencyAccess.revoked'));
      await load();
    } catch {
      toast.error(t('emergencyAccess.revokeError'));
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) return <PageLoader message={t('common.loading')} />;

  const canSearchPatients = can('patients.view');

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-xl bg-red-100 text-red-700"><ShieldAlert className="w-6 h-6" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('emergencyAccess.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('emergencyAccess.subtitle')}</p>
        </div>
      </div>

      <Card className="border-red-200">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3 text-sm text-red-800 bg-red-50 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{t('emergencyAccess.warning')}</p>
          </div>
          {canSearchPatients ? (
            <PatientSearchField
              value={patientId}
              onChange={setPatientId}
              placeholder={t('emergencyAccess.searchPatient')}
              required
            />
          ) : (
            <p className="text-sm text-gray-600">{t('emergencyAccess.patientPermissionRequired')}</p>
          )}
          <Input
            label={t('emergencyAccess.reason')}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('emergencyAccess.reasonPlaceholder')}
            required
          />
          <div>
            <Can permission="emergency_access.manage">
              <Button
                onClick={() => void activate()}
                loading={saving}
                disabled={saving || !canSearchPatients || !patientId || reason.trim().length < 10}
              >
                <ShieldAlert className="w-4 h-4" /> {t('emergencyAccess.activate')}
              </Button>
            </Can>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <Clock3 className="w-5 h-5 text-amber-600" />
            <h2 className="text-lg font-semibold">{t('emergencyAccess.activeTitle')}</h2>
          </div>
          {active.length === 0 ? (
            <EmptyState icon={<Clock3 className="w-8 h-8 text-gray-400" />} title={t('emergencyAccess.noActive')} />
          ) : (
            <div className="space-y-3">
              {active.map((record) => (
                <div key={record.id} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border border-amber-200 bg-amber-50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <UserRound className="w-5 h-5 text-amber-700 mt-0.5" />
                    <div>
                      <p className="font-medium text-gray-900">{recordPatientId(record) || t('emergencyAccess.unknownPatient')}</p>
                      <p className="text-sm text-gray-600">{record.reason}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('emergencyAccess.expires')}: {formatDate(recordExpiry(record))}</p>
                    </div>
                  </div>
                  <Can permission="emergency_access.manage">
                    <Button variant="secondary" size="sm" onClick={() => void revoke(record)} loading={revokingId === record.id} disabled={revokingId === record.id}>
                      {t('emergencyAccess.revoke')}
                    </Button>
                  </Can>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{t('emergencyAccess.logTitle')}</h2>
              <p className="text-sm text-gray-500">{t('emergencyAccess.logSubtitle')}</p>
            </div>
            <Badge variant="gray">{log?.total || 0}</Badge>
          </div>
          {!log?.items?.length ? (
            <EmptyState icon={<ShieldAlert className="w-8 h-8 text-gray-400" />} title={t('emergencyAccess.noLog')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                    <th className="px-3 py-3">{t('emergencyAccess.patient')}</th>
                    <th className="px-3 py-3">{t('emergencyAccess.reason')}</th>
                    <th className="px-3 py-3">{t('emergencyAccess.created')}</th>
                    <th className="px-3 py-3">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {log.items.map((record) => (
                    <tr key={record.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-3 font-medium">{recordPatientId(record) || t('emergencyAccess.unknownPatient')}</td>
                      <td className="px-3 py-3 text-gray-600">{record.reason}</td>
                      <td className="px-3 py-3 text-gray-600">{formatDate(recordCreated(record))}</td>
                      <td className="px-3 py-3"><Badge variant={record.status === 'active' ? 'warning' : 'gray'}>{record.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
