import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

const DEFAULT_WIDGETS: Record<string, string[]> = {
  admin: ['revenue', 'patients_total', 'appointments_today', 'staff_attendance', 'queue_status', 'recent_activity', 'ai_stats', 'system_health'],
  doctor: ['appointments_today', 'patient_queue', 'recent_encounters', 'prescriptions_pending', 'lab_results_pending'],
  receptionist: ['appointments_today', 'patient_queue', 'check_ins_today', 'revenue_today', 'upcoming_appointments'],
  billing: ['invoices_pending', 'revenue_today', 'insurance_claims', 'overdue_payments', 'payment_methods'],
};

export async function registerDashboardWidgetsModule(app: FastifyInstance) {

  app.get('/api/v1/dashboard/widgets', { preHandler: [authenticate, authorize('analytics_dashboard.view')] }, async (request, reply) => {
    const { tenantId, userId, roles } = getCtx(request);
    const primaryRole = roles?.[0] || 'admin';
    const saved = await db('dashboard_widgets').where({ tenant_id: tenantId, user_id: userId }).first();
    if (saved) {
      return sendSuccess(reply, { layout: JSON.parse(saved.layout || '[]'), preferences: JSON.parse(saved.preferences || '{}'), role: primaryRole });
    }
    const defaultLayout = (DEFAULT_WIDGETS[primaryRole] || DEFAULT_WIDGETS.admin).map((id, i) => ({ id, order: i, visible: true, size: 'medium' }));
    return sendSuccess(reply, { layout: defaultLayout, preferences: {}, role: primaryRole });
  });

  app.post('/api/v1/dashboard/widgets', { preHandler: [authenticate, authorize('analytics_dashboard.manage')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      layout: z.array(z.object({ id: z.string(), order: z.number(), visible: z.boolean(), size: z.enum(['small', 'medium', 'large']).optional() })),
      preferences: z.record(z.unknown()).optional(),
    }).parse(request.body);
    const existing = await db('dashboard_widgets').where({ tenant_id: tenantId, user_id: userId }).first();
    if (existing) {
      await db('dashboard_widgets').where({ id: existing.id }).update({ layout: JSON.stringify(body.layout), preferences: JSON.stringify(body.preferences || {}) });
    } else {
      await db('dashboard_widgets').insert({ tenant_id: tenantId, user_id: userId, layout: JSON.stringify(body.layout), preferences: JSON.stringify(body.preferences || {}) });
    }
    return sendSuccess(reply, { saved: true }, 'Dashboard layout saved');
  });

  app.get('/api/v1/dashboard/widgets/:widgetId/data', { preHandler: [authenticate, authorize('analytics_dashboard.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { widgetId } = z.object({ widgetId: z.string() }).parse(request.params);
    let data: Record<string, unknown> | null = null;
    switch (widgetId) {
      case 'revenue': { const r = await db('invoices').where({ tenant_id: tenantId }).where('status', '!=', 'cancelled').sum('total as t').sum('paid as p').first(); data = { total: Number(r?.t || 0), paid: Number(r?.p || 0) }; break; }
      case 'patients_total': { const t = await db('patients').where({ tenant_id: tenantId }).count('id as c').first(); const n = await db('patients').where({ tenant_id: tenantId }).whereRaw("created_at >= CURRENT_DATE").count('id as c').first(); data = { total: Number(t?.c || 0), todayNew: Number(n?.c || 0) }; break; }
      case 'appointments_today': { const t = await db('appointments').where({ tenant_id: tenantId }).whereRaw("DATE(scheduled_date) = CURRENT_DATE").count('id as c').first(); const d = await db('appointments').where({ tenant_id: tenantId }).whereRaw("DATE(scheduled_date) = CURRENT_DATE").where('status', 'completed').count('id as c').first(); data = { total: Number(t?.c || 0), completed: Number(d?.c || 0) }; break; }
      case 'staff_attendance': { const p = await db('attendance').where({ tenant_id: tenantId }).whereRaw("DATE(check_in_time) = CURRENT_DATE").count('id as c').first(); const s = await db('users').where({ tenant_id: tenantId, is_active: true }).count('id as c').first(); data = { present: Number(p?.c || 0), total: Number(s?.c || 0) }; break; }
      case 'queue_status': { const w = await db('queue_entries').where({ tenant_id: tenantId }).where('status', 'waiting').count('id as c').first(); data = { waiting: Number(w?.c || 0) }; break; }
      case 'recent_activity': { const l = await db('audit_logs').where({ tenant_id: tenantId }).orderBy('created_at', 'desc').limit(10).select('action', 'entity_type', 'created_at'); data = { items: l }; break; }
      case 'ai_stats': { const n = await db('ai_clinical_notes').where({ tenant_id: tenantId }).count('id as c').first(); data = { notesGenerated: Number(n?.c || 0) }; break; }
      case 'prescriptions_pending': { const r = await db('pharmacy_prescriptions').where({ tenant_id: tenantId }).where('status', 'pending').count('id as c').first(); data = { pending: Number(r?.c || 0) }; break; }
      case 'lab_results_pending': { const l = await db('lab_orders').where({ tenant_id: tenantId }).where('status', 'ordered').count('id as c').first(); data = { pending: Number(l?.c || 0) }; break; }
      case 'invoices_pending': { const i = await db('invoices').where({ tenant_id: tenantId }).whereIn('status', ['pending', 'partial', 'overdue']).count('id as c').first(); data = { count: Number(i?.c || 0) }; break; }
      case 'insurance_claims': { const c = await db('insurance_claims').where({ tenant_id: tenantId }).where('status', 'submitted').count('id as c').first(); data = { submitted: Number(c?.c || 0) }; break; }
      case 'overdue_payments': { const o = await db('invoices').where({ tenant_id: tenantId }).where('status', 'overdue').count('id as c').first(); data = { overdue: Number(o?.c || 0) }; break; }
      case 'check_ins_today': { const c = await db('kiosk_checkins').where({ tenant_id: tenantId }).whereRaw("DATE(created_at) = CURRENT_DATE").count('id as c').first(); data = { today: Number(c?.c || 0) }; break; }
      case 'revenue_today': { const r = await db('payment_transactions').where({ tenant_id: tenantId }).whereRaw("DATE(created_at) = CURRENT_DATE").where('status', 'completed').sum('amount as t').first(); data = { total: Number(r?.t || 0) }; break; }
      case 'system_health': { data = { status: 'healthy', uptime: Math.floor(process.uptime()), version: '1.0.0' }; break; }
      case 'payment_methods': { data = { methods: ['cash', 'card', 'fawry', 'instapay', 'insurance'] }; break; }
      case 'upcoming_appointments': { const u = await db('appointments').join('patients', 'appointments.patient_id', 'patients.id').where('appointments.tenant_id', tenantId).whereRaw("appointments.scheduled_date >= NOW()").where('appointments.status', 'scheduled').select('appointments.*', 'patients.first_name', 'patients.last_name').orderBy('appointments.scheduled_date', 'asc').limit(5); data = { appointments: u }; break; }
      default: return sendError(reply, 'Unknown widget', 404);
    }
    return sendSuccess(reply, { widgetId, data });
  });

}
