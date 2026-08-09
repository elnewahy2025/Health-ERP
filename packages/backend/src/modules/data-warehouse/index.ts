import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerDataWarehouseModule(app: FastifyInstance) {
  // Refresh all DW stats for today
  app.post('/api/v1/dw/refresh', { preHandler: [authenticate, authorize('data_warehouse.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const today = new Date().toISOString().split('T')[0];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);

    // Appointment stats
    const apptTotal = await db('appointments').where({ tenant_id: tenantId }).where('appointment_date', today).count('id as c').first();
    const apptCompleted = await db('appointments').where({ tenant_id: tenantId }).where('appointment_date', today).where('status', 'completed').count('id as c').first();
    const apptCancelled = await db('appointments').where({ tenant_id: tenantId }).where('appointment_date', today).where('status', 'cancelled').count('id as c').first();
    const apptNoShow = await db('appointments').where({ tenant_id: tenantId }).where('appointment_date', today).where('status', 'no_show').count('id as c').first();
    await db('dw_appointment_stats').insert({
      tenant_id: tenantId, date: today,
      total_appointments: Number((apptTotal as Record<string, unknown>)?.c || 0),
      completed_appointments: Number((apptCompleted as Record<string, unknown>)?.c || 0),
      cancelled_appointments: Number((apptCancelled as Record<string, unknown>)?.c || 0),
      no_show_appointments: Number((apptNoShow as Record<string, unknown>)?.c || 0),
    }).onConflict(['tenant_id', 'date']).merge();

    // Revenue stats
    const revTotal = await db('invoices').where({ tenant_id: tenantId }).sum('total as total').first();
    const revCollected = await db('invoices').where({ tenant_id: tenantId }).where('status', 'paid').sum('total as total').first();
    const revPending = await db('invoices').where({ tenant_id: tenantId }).whereIn('status', ['pending', 'partial', 'overdue']).sum('total as total').first();
    const totalInvoices = await db('invoices').where({ tenant_id: tenantId }).count('id as c').first();
    const paidInvoices = await db('invoices').where({ tenant_id: tenantId, status: 'paid' }).count('id as c').first();
    await db('dw_revenue_stats').insert({
      tenant_id: tenantId, date: today,
      total_revenue: Number((revTotal as Record<string, unknown>)?.total || 0),
      collected_revenue: Number((revCollected as Record<string, unknown>)?.total || 0),
      pending_revenue: Number((revPending as Record<string, unknown>)?.total || 0),
      invoice_count: Number((totalInvoices as Record<string, unknown>)?.c || 0),
      paid_invoice_count: Number((paidInvoices as Record<string, unknown>)?.c || 0),
    }).onConflict(['tenant_id', 'date']).merge();

    // Patient stats
    const newPats = await db('patients').where({ tenant_id: tenantId }).where('created_at', '>=', start).where('created_at', '<=', end).count('id as c').first();
    const activePats = await db('patients').where({ tenant_id: tenantId }).whereNull('deleted_at').count('id as c').first();
    const genderDist = await db('patients').where({ tenant_id: tenantId }).whereNull('deleted_at').select('gender').groupBy('gender').count('id as count');
    const dist: Record<string, unknown> = {};
    for (const g of genderDist) dist[g.gender || 'unknown'] = Number(g.count);
    await db('dw_patient_stats').insert({
      tenant_id: tenantId, date: today,
      new_patients: Number((newPats as Record<string, unknown>)?.c || 0),
      total_active_patients: Number((activePats as Record<string, unknown>)?.c || 0),
      gender_distribution: JSON.stringify(dist),
    }).onConflict(['tenant_id', 'date']).merge();

    return sendSuccess(reply, { date: today }, 'DW refreshed');
  });

  // Get DW stats
  app.get('/api/v1/dw/appointments', { preHandler: [authenticate, authorize('data_warehouse.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000).toISOString().split('T')[0];
    const stats = await db('dw_appointment_stats').where({ tenant_id: tenantId }).where('date', '>=', since).orderBy('date');
    const totals = await db('dw_appointment_stats').where({ tenant_id: tenantId }).where('date', '>=', since)
      .sum('total_appointments as total').sum('completed_appointments as completed').sum('cancelled_appointments as cancelled').first();
    return sendSuccess(reply, { daily: stats, totals });
  });

  app.get('/api/v1/dw/revenue', { preHandler: [authenticate, authorize('data_warehouse.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000).toISOString().split('T')[0];
    const stats = await db('dw_revenue_stats').where({ tenant_id: tenantId }).where('date', '>=', since).orderBy('date');
    const totals = await db('dw_revenue_stats').where({ tenant_id: tenantId }).where('date', '>=', since)
      .sum('total_revenue as total').sum('collected_revenue as collected').sum('pending_revenue as pending').first();
    return sendSuccess(reply, { daily: stats, totals });
  });

  app.get('/api/v1/dw/patients', { preHandler: [authenticate, authorize('data_warehouse.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000).toISOString().split('T')[0];
    const stats = await db('dw_patient_stats').where({ tenant_id: tenantId }).where('date', '>=', since).orderBy('date');
    const totals = await db('dw_patient_stats').where({ tenant_id: tenantId }).where('date', '>=', since)
      .sum('new_patients as new').max('total_active_patients as active').first();
    return sendSuccess(reply, { daily: stats, totals });
  });
}
