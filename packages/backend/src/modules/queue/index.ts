import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';

export async function registerQueueModule(app: FastifyInstance) {
  const resolveQueueScope = (principal: { grants: Array<{ permission: string; scope: PermissionScope }> }, permission = 'queue.view'): PermissionScope =>
    principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';

  app.get('/api/v1/queue', { preHandler: [authenticate, authorize('queue.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { branchId, serviceType, status } = request.query as { branchId?: string; serviceType?: string; status?: string };
    const principal = getCtx(request).principal;
    let q = db('queue_entries').where('queue_entries.tenant_id', tenantId);
    q = applyScopePolicy('queue', q, principal, resolveQueueScope(principal, 'queue.view')) as typeof q;
    if (branchId) q = q.andWhere('queue_entries.branch_id', branchId);
    if (serviceType) q = q.andWhere('queue_entries.service_type', serviceType);
    if (status) q = q.andWhere('queue_entries.status', status);
    else q = q.whereNotIn('queue_entries.status', ['completed', 'no_show']);
    const entries = await q.join('patients', 'queue_entries.patient_id', 'patients.id')
      .select('queue_entries.*', 'patients.first_name as p_first', 'patients.last_name as p_last', 'patients.medical_record_number')
      .orderBy('position', 'asc');
    return sendSuccess(reply, entries.map(mapEntry));
  });

  app.post('/api/v1/queue', { preHandler: [authenticate, authorize('queue.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const scope = resolveQueueScope(principal, 'queue.edit');
    const branchId = body.branchId ? String(body.branchId) : null;
    if ((scope === 'branch' || scope === 'branches') && (!branchId || !principal.branches.includes(branchId))) {
      throw new ForbiddenError('Queue operations are limited to assigned branches');
    }
    const maxPos = await db('queue_entries').where({ tenant_id: tenantId, branch_id: branchId, status: 'waiting' }).max('position as m').first();
    const qNum = "Q-" + String(Date.now()).slice(-6);
    const [entry] = await db('queue_entries').insert({
      tenant_id: tenantId, branch_id: branchId, patient_id: body.patientId,
      appointment_id: body.appointmentId || null, doctor_id: body.doctorId || null,
      service_type: body.serviceType || 'consultation', queue_number: qNum,
      priority: body.priority || 0, position: (maxPos?.m || 0) + 1, status: 'waiting',
    }).returning('*');
    return sendSuccess(reply, mapEntry(entry), 'Added to queue', 201);
  });

  app.put('/api/v1/queue/:id/call', { preHandler: [authenticate, authorize('queue.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const principal = getCtx(request).principal;
    const entry = await applyScopePolicy('queue', db('queue_entries').where({ 'queue_entries.id': id }), principal, resolveQueueScope(principal, 'queue.edit')).first();
    if (!entry) throw new ForbiddenError('Queue entry is outside your assigned scope');
    await db('queue_entries').where({ id }).update({ status: 'called', called_at: new Date() });
    return sendSuccess(reply, null, 'Patient called');
  });

  app.put('/api/v1/queue/:id/status', { preHandler: [authenticate, authorize('queue.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const { status } = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const entry = await applyScopePolicy('queue', db('queue_entries').where({ 'queue_entries.id': id }), principal, resolveQueueScope(principal, 'queue.edit')).first();
    if (!entry) throw new ForbiddenError('Queue entry is outside your assigned scope');
    const update: Record<string, unknown> = { status };
    if (status === 'in_progress') update.started_at = new Date();
    if (status === 'completed') update.completed_at = new Date();
    await db('queue_entries').where({ id }).update(update);
    return sendSuccess(reply, null, 'Queue updated');
  });
}
function mapEntry(e: Record<string, unknown>) { return {
  id: e.id, queueNumber: e.queue_number, patientId: e.patient_id,
  patientName: e.p_first + ' ' + e.p_last, patientMrn: e.medical_record_number,
  serviceType: e.service_type, doctorId: e.doctor_id, branchId: e.branch_id,
  status: e.status, priority: e.priority, position: e.position,
  calledAt: e.called_at, startedAt: e.started_at, completedAt: e.completed_at,
  createdAt: e.created_at,
};}
