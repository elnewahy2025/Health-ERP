import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { UserCheck, Clock, CheckCircle } from 'lucide-react';
import { Button, Card, CardBody, Input } from '../components/ui';
import { apiClient as api } from '../lib/api';
import { sanitizeString } from '../lib/sanitize';
import { isValidNationalId } from '../lib/validators';

interface CheckinResult {
  checkinId: string;
  patientName: string;
  queueNumber: number;
  estimatedWaitMinutes: number;
}

interface QueueStatus {
  queue_number: number;
  status: string;
  patientsAhead: number;
}

type Step = 'enter' | 'success' | 'status';

const statusLabel = (status: string, t: (key: string) => string): string => {
  if (status === 'in_progress') return t('kiosk.statusInProgress');
  if (status === 'checked_in') return t('kiosk.statusCheckedIn');
  if (status === 'waiting') return t('kiosk.statusWaiting');
  if (status === 'completed') return t('kiosk.statusCompleted');
  return status;
};

const statusColor = (status: string): string => {
  if (status === 'in_progress') return 'text-green-600';
  if (status === 'checked_in') return 'text-blue-600';
  return 'text-gray-600';
};

export default function KioskCheckinPage() {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('enter');
  const [nationalId, setNationalId] = useState('');
  const [nationalIdError, setNationalIdError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [checkinId, setCheckinId] = useState('');

  const validateNationalId = useCallback(
    (value: string): boolean => {
      const sanitized = sanitizeString(value.trim());
      if (!sanitized) {
        setNationalIdError(t('kiosk.enterNationalId'));
        return false;
      }
      if (!isValidNationalId(sanitized)) {
        setNationalIdError(t('validate.nationalIdInvalid'));
        return false;
      }
      setNationalIdError('');
      return true;
    },
    [t],
  );

  const handleCheckin = useCallback(async () => {
    if (!validateNationalId(nationalId)) return;
    setLoading(true);
    try {
      const slug = localStorage.getItem('tenantSlug')?.trim();
      if (!slug) {
        toast.error(t('kiosk.organizationRequired'));
        return;
      }
      const sanitized = sanitizeString(nationalId.trim());
      const res = await api.post('/kiosk/checkin', {
        tenantSlug: slug,
        nationalId: sanitized,
      });
      setResult(res.data.data);
      setCheckinId(res.data.data.checkinId);
      setStep('success');
    } catch {
      toast.error(t('kiosk.checkInFailed'));
    } finally {
      setLoading(false);
    }
  }, [nationalId, t, validateNationalId]);

  const checkStatus = useCallback(async () => {
    if (!checkinId) return;
    setLoading(true);
    try {
      const res = await api.get(`/kiosk/status/${checkinId}`);
      setStatus(res.data.data);
      setStep('status');
    } catch {
      toast.error(t('kiosk.couldNotCheckStatus'));
    } finally {
      setLoading(false);
    }
  }, [checkinId, t]);

  const resetToEnter = useCallback(() => {
    setStep('enter');
    setNationalId('');
    setResult(null);
    setStatus(null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('kiosk.title')}</h1>
          <p className="text-gray-500 mt-2">{t('kiosk.subtitle')}</p>
        </div>

        {step === 'enter' && (
          <Card>
            <CardBody className="p-8">
              <div className="space-y-6">
                <Input
                  label={t('kiosk.nationalId')}
                  placeholder={t('kiosk.nationalIdPlaceholder')}
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value);
                    if (nationalIdError) setNationalIdError('');
                  }}
                  error={nationalIdError}
                  maxLength={14}
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <Button
                  onClick={handleCheckin}
                  loading={loading}
                  disabled={!nationalId.trim()}
                  className="w-full min-h-[56px] text-lg font-semibold"
                  icon={<UserCheck className="w-5 h-5" />}
                >
                  {loading ? t('kiosk.checkingIn') : t('kiosk.checkIn')}
                </Button>
                <p className="text-center text-sm text-gray-400">
                  {t('kiosk.helpHint')}
                </p>
              </div>
            </CardBody>
          </Card>
        )}

        {step === 'success' && result && (
          <Card>
            <CardBody className="p-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('kiosk.checkedIn')}</h2>
              <p className="text-gray-600 mb-6">
                {t('kiosk.welcome', { name: sanitizeString(result.patientName) })}
              </p>
              <div className="bg-blue-50 rounded-xl p-6 mb-6">
                <p className="text-sm text-gray-500 mb-1">{t('kiosk.yourQueueNumber')}</p>
                <p className="text-5xl font-bold text-blue-600">#{result.queueNumber}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {t('kiosk.estimatedWait', { minutes: result.estimatedWaitMinutes })}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={resetToEnter}
                >
                  {t('kiosk.newCheckIn')}
                </Button>
                <Button className="flex-1" onClick={checkStatus} loading={loading}>
                  {t('kiosk.trackStatus')}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {step === 'status' && status && (
          <Card>
            <CardBody className="p-8">
              <div className="text-center mb-6">
                <Clock className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                <h2 className="text-xl font-bold">{t('kiosk.queueStatus')}</h2>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">{t('kiosk.yourNumber')}</span>
                  <span className="font-bold text-lg">#{status.queue_number}</span>
                </div>
                <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">{t('kiosk.status')}</span>
                  <span className={`font-bold capitalize ${statusColor(status.status)}`}>
                    {statusLabel(status.status, t)}
                  </span>
                </div>
                {status.patientsAhead > 0 && (
                  <div className="flex justify-between p-3 bg-yellow-50 rounded-lg">
                    <span className="text-yellow-700">{t('kiosk.patientsAhead')}</span>
                    <span className="font-bold text-yellow-700">{status.patientsAhead}</span>
                  </div>
                )}
                {status.status === 'in_progress' && (
                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <p className="font-bold text-green-700 text-lg">{t('kiosk.pleaseProceed')}</p>
                  </div>
                )}
              </div>
              <Button
                className="w-full mt-6"
                onClick={resetToEnter}
              >
                {t('kiosk.checkStatusAgain')}
              </Button>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
