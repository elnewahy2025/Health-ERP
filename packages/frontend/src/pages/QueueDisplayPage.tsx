import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ListOrdered, Bell, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Spinner } from '../components/ui';
import { sanitizeString } from '../lib/sanitize';
import { formatClinicDate, useClinicConfiguration } from '../stores/clinicConfigurationStore';

interface QueueEntry {
  id: string;
  queue_number: number;
  first_name: string;
  last_name: string;
  status: string;
}

interface NowServing {
  queue_number: number;
  first_name: string;
  last_name: string;
}

interface DisplayData {
  queue: QueueEntry[];
  nowServing: NowServing | null;
  totalWaiting: number;
}

export default function QueueDisplayPage() {
  const { t } = useTranslation();
  const { identity } = useClinicConfiguration();
  const clinicLocale = identity?.locale?.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
  const clinicTimezone = identity?.timezone || 'UTC';

  const [data, setData] = useState<DisplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [time, setTime] = useState(new Date());
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const loadQueueData = useCallback(async () => {
    try {
      const slug = new URLSearchParams(window.location.search).get('tenant') || 'demo';
      const branchId = new URLSearchParams(window.location.search).get('branch') || '';
      const url = `/api/v1/queue/display${branchId ? '/' + branchId : ''}?tenantSlug=${slug}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && mountedRef.current) {
        setData(json.data);
        setLastUpdate(new Date());
      }
      if (mountedRef.current) setError('');
    } catch {
      if (mountedRef.current) setError(t('queue.couldNotLoad'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setInterval(() => setTime(new Date()), 1000);

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('tenant') || 'demo';
    const branchId = params.get('branch') || '';
    const token = params.get('token') || '';

    if (token) {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${window.location.host}/api/v1/queue/ws?token=${token}&tenantSlug=${slug}&branchId=${branchId}`;

      const connectWs = () => {
        try {
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            if (mountedRef.current) setConnected(true);
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'queue_state' && mountedRef.current) {
                setData(msg.data);
                setLastUpdate(new Date());
                setLoading(false);
              }
              if (msg.type === 'patient_called' && mountedRef.current) {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        nowServing: {
                          queue_number: msg.data.queue_number,
                          first_name: msg.data.first_name,
                          last_name: msg.data.last_name,
                        },
                        queue: prev.queue.filter((e) => e.id !== msg.data.id),
                        totalWaiting: prev.totalWaiting - 1,
                      }
                    : prev,
                );
                setLastUpdate(new Date());
              }
              if (msg.type === 'status_updated' && mountedRef.current) {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        queue: prev.queue.filter((e) => e.id !== msg.data.id),
                        totalWaiting: prev.queue.filter((e) => e.id !== msg.data.id).length,
                      }
                    : prev,
                );
                setLastUpdate(new Date());
              }
            } catch {
              /* ignore parse errors */
            }
          };

          ws.onclose = () => {
            if (mountedRef.current) setConnected(false);
          };
          ws.onerror = () => {
            if (mountedRef.current) setConnected(false);
          };
        } catch {
          queueMicrotask(() => {
            if (mountedRef.current) setConnected(false);
          });
        }
      };

      connectWs();
    }

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      wsRef.current?.close();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (connected) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    queueMicrotask(() => {
      if (mountedRef.current) loadQueueData();
    });
    pollingRef.current = setInterval(() => {
      if (mountedRef.current) loadQueueData();
    }, 10000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [connected, loadQueueData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <ListOrdered className="w-10 h-10 text-blue-500" />
          <div>
            <h1 className="text-4xl font-bold">{t('queue.patientQueue')}</h1>
            <p className="text-lg text-gray-300">{identity?.displayName || t('queue.clinicName')}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 mb-2 justify-end">
            {connected ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <Wifi className="w-4 h-4" /> {t('queue.live')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-yellow-400 text-sm">
                <WifiOff className="w-4 h-4" /> {t('queue.polling')}
              </span>
            )}
          </div>
          <p className="text-3xl font-bold tabular-nums">{formatClinicDate(time, clinicLocale, clinicTimezone, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          <p className="text-lg text-gray-300">
            {formatClinicDate(time, clinicLocale, clinicTimezone, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          {lastUpdate && (
            <p className="text-xs text-gray-300 mt-1">
              {t('queue.updatedAt', { time: formatClinicDate(lastUpdate, clinicLocale, clinicTimezone, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-xl mb-6 flex items-center gap-3">
          <AlertCircle className="w-6 h-6" /> {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col">
          <div className="bg-green-600 text-white rounded-2xl p-6 flex-1 flex flex-col items-center justify-center">
            <Bell className="w-12 h-12 mb-4" />
            <p className="text-xl font-medium mb-2">{t('queue.nowServing')}</p>
            {data?.nowServing ? (
              <>
                <p className="text-8xl font-black">{data.nowServing.queue_number}</p>
                <p className="text-2xl mt-4">
                  {sanitizeString(data.nowServing.first_name)}{' '}
                  {sanitizeString(data.nowServing.last_name)}
                </p>
              </>
            ) : (
              <p className="text-6xl font-black text-green-100">—</p>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="rounded-2xl p-6 flex-1 bg-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">{t('queue.waitingQueue')}</h2>
              <span className="text-lg font-medium text-gray-300">
                {t('queue.waitingCount', { count: data?.totalWaiting || 0 })}
              </span>
            </div>
            {!data?.queue?.length ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-2xl text-gray-300">{t('queue.noPatientsWaiting')}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {data.queue.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-4 p-4 rounded-xl ${
                      i === 0
                        ? 'bg-blue-100 border-2 border-blue-400'
                        : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`text-3xl font-black ${
                        i === 0 ? 'text-blue-600' : 'text-gray-400'
                      }`}
                    >
                      #{entry.queue_number}
                    </span>
                    <div className="flex-1">
                      <p className="text-lg font-semibold">
                        {sanitizeString(entry.first_name)}{' '}
                        {sanitizeString(entry.last_name)}
                      </p>
                    </div>
                    {i === 0 && (
                      <span className="text-sm font-medium text-blue-600">
                        {t('queue.nextInLine')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mt-6 text-gray-300 text-sm">
        {connected ? t('queue.realTime') : t('queue.autoRefresh')} • {identity?.displayName || t('queue.clinicName')}
      </div>
    </div>
  );
}
