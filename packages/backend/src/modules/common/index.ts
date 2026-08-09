import { getCtx, getTenantId } from "../../utils/route-helper.js";
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

import type { RoleRow, AuditLogRow } from "../types.js";
export async function registerCommonModule(app: FastifyInstance) {
  // Dashboard stats
  app.get('/api/v1/dashboard/stats', {
    preHandler: [authenticate, authorize('analytics_dashboard.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const today = new Date().toISOString().split('T')[0];

    const [
      patientCount,
      appointmentCount,
      todayAppointments,
      pendingInvoices,
      revenueToday,
      doctorCount,
    ] = await Promise.all([
      db('patients')
        .where({ tenant_id: tenantId, status: 'active' })
        .whereNull('deleted_at')
        .count('id as count')
        .first(),
      db('appointments')
        .where({ tenant_id: tenantId })
        .whereNull('deleted_at')
        .count('id as count')
        .first(),
      db('appointments')
        .where({ tenant_id: tenantId, appointment_date: today })
        .whereNull('deleted_at')
        .count('id as count')
        .first(),
      db('invoices')
        .where({ tenant_id: tenantId })
        .whereIn('status', ['pending', 'partial', 'overdue'])
        .whereNull('deleted_at')
        .count('id as count')
        .first(),
      db('invoices')
        .where({ tenant_id: tenantId })
        .whereNull('deleted_at')
        .where(db.raw("issued_at::date = ?", [today]))
        .sum('paid as total')
        .first(),
      db('users')
        .where({ tenant_id: tenantId, status: 'active' })
        .whereIn('role_id', function () {
          this.select('id').from('roles').where('slug', 'doctor');
        })
        .count('id as count')
        .first(),
    ]);

    return sendSuccess(reply, {
      totalPatients: Number(patientCount?.count || 0),
      totalAppointments: Number(appointmentCount?.count || 0),
      todayAppointments: Number(todayAppointments?.count || 0),
      pendingBills: Number(pendingInvoices?.count || 0),
      revenueToday: Number(revenueToday?.total || 0),
      activeDoctors: Number(doctorCount?.count || 0),
    });
  });

  // List doctors
  app.get('/api/v1/doctors', {
    preHandler: [authenticate, authorize('patients.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);

    const doctors = await db('users')
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.tenant_id', tenantId)
      .where('users.status', 'active')
      .where('roles.slug', 'doctor')
      .orWhere(function () {
        this.where('users.tenant_id', tenantId)
          .where('users.status', 'active')
          .whereRaw("users.roles::text LIKE '%doctor%'");
      })
      .select(
        'users.id',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.phone',
      )
      .orderBy('users.first_name');

    return sendSuccess(reply, doctors.map((d: Record<string, unknown>) => ({
      id: d.id,
      name: `${d.first_name} ${d.last_name}`,
      email: d.email,
      phone: d.phone,
    })));
  });

  // Activity log (recent)
  app.get('/api/v1/activity', {
    preHandler: [authenticate, authorize('audit.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);

    const activities = await db('audit_logs')
      .where({ tenant_id: tenantId })
      .orderBy('timestamp', 'desc')
      .limit(20);

    return sendSuccess(reply, activities.map((a: Record<string, unknown>) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      entityId: a.entity_id,
      userId: a.user_id,
      timestamp: a.timestamp,
    })));
  });
}
