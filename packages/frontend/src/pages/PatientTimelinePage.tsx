import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { clinicalApi } from '../lib/api';
import { useClinicMoney } from '../stores/clinicConfigurationStore';
import { Calendar, Clock, FileText, Activity, AlertTriangle, DollarSign, Loader2, ArrowLeft, Stethoscope, Pill, AlertCircle } from 'lucide-react';

const iconMap: Record<string, typeof Stethoscope> = { emr: Stethoscope, appointment: Calendar, invoice: DollarSign, document: FileText, allergy: AlertTriangle };

const typeColor: Record<string, string> = { emr: 'bg-blue-100 text-blue-600', appointment: 'bg-green-100 text-green-600', invoice: 'bg-purple-100 text-purple-600', document: 'bg-gray-100 text-gray-600', allergy: 'bg-red-100 text-red-600' };

export default function PatientTimelinePage() {
  const { patientId } = useParams();
  const formatMoney = useClinicMoney();
  interface TimelineEvent { id: string; type: string; date: string; description: string; title?: string; total?: number; status?: string; severity?: string; diagnosis?: string; }
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    clinicalApi.patientTimeline(patientId).then(setTimeline).catch(() => {}).finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/patients/${patientId}`} className="btn-ghost btn-sm"><ArrowLeft className="w-4 h-4" /> Back</Link>
        <h1 className="page-title flex items-center gap-2"><Activity className="w-6 h-6" /> Patient Timeline</h1>
      </div>

      {timeline.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No activity recorded yet</div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-4">
            {timeline.map((event: TimelineEvent, i: number) => {
              const Icon = iconMap[event.type] || Calendar;
              const color = typeColor[event.type] || 'bg-gray-100 text-gray-600';
              return (
                <div key={`${event.type}-${event.id}-${i}`} className="relative flex gap-4 pl-0">
                  <div className={`relative z-10 w-12 h-12 rounded-full ${color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 bg-white rounded-xl border border-gray-200 dark:bg-gray-900 dark:border-gray-800 p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{event.title || event.type}</p>
                        <p className="text-xs text-gray-500 mt-1">{new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
                      </div>
                      <span className="badge badge-gray text-xs capitalize">{event.type}</span>
                    </div>
                    {event.type === 'invoice' && <p className="text-sm mt-2"><strong>{formatMoney(event.total || 0)}</strong> — <span className={event.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}>{event.status}</span></p>}
                    {event.type === 'allergy' && <p className="text-sm mt-2"><span className={`font-medium ${event.severity === 'severe' || event.severity === 'anaphylaxis' ? 'text-red-600' : 'text-yellow-600'}`}>{event.severity}</span> — {event.title}</p>}
                    {event.diagnosis && <p className="text-xs text-gray-500 mt-1 truncate">Dx: {typeof event.diagnosis === 'string' ? event.diagnosis : JSON.stringify(event.diagnosis)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
