import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';


export async function registerNursingModule(app: FastifyInstance) {
  const resolveNursingScope = (principal: { grants: Array<{ permission: string; scope: PermissionScope }> }, permission = 'nursing.view'): PermissionScope =>
    principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';

  async function resolveTaskAssignee(principal: Principal, tenantId: string, requestedAssignee: unknown): Promise<string> {
    if (requestedAssignee === undefined || requestedAssignee === null || requestedAssignee === '' || requestedAssignee === principal.id) {
      return principal.id;
    }
    if (typeof requestedAssignee !== 'string') throw new ForbiddenError('Invalid nursing task assignee');

    const assignee = await db('users').where({ id: requestedAssignee, tenant_id: tenantId }).first();
    if (!assignee) throw new ForbiddenError('Nursing task assignee is outside this tenant');

    const manageGrants = principal.grants.filter((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, 'nursing.manage'));
    for (const grant of manageGrants) {
      if (grant.scope === 'system' || grant.scope === 'tenant') return requestedAssignee;
      if (grant.scope === 'department' && principal.departmentId && String(assignee.department_id || '') === principal.departmentId) {
        return requestedAssignee;
      }
      if ((grant.scope === 'branch' || grant.scope === 'branches') && principal.branches.length > 0) {
        const branchLink = await db('user_branches')
          .where({ user_id: requestedAssignee, tenant_id: tenantId })
          .whereIn('branch_id', principal.branches)
          .first();
        if (branchLink) return requestedAssignee;
      }
    }
    throw new ForbiddenError('You may only assign nursing tasks within your nursing management scope');
  }

  app.get('/api/v1/nursing/tasks', { preHandler: [authenticate, authorize('nursing.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status, assignedTo } = request.query as { assignedTo?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveNursingScope(principal, 'nursing.view');
    let q = db('nursing_tasks').join('patients', 'nursing_tasks.patient_id', 'patients.id').where('nursing_tasks.tenant_id', tenantId).whereNull('nursing_tasks.deleted_at');
    q = applyScopePolicy('nursing', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('nursing_tasks.status', status);
    if (assignedTo) q = q.andWhere('nursing_tasks.assigned_to', assignedTo);
    const tasks = await q
      .select('nursing_tasks.*', 'patients.first_name as p_first', 'patients.last_name as p_last')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, tasks.map((t: Record<string, unknown>) => ({
      id: t.id, title: t.title, description: t.description, category: t.category,
      priority: t.priority, status: t.status, patientId: t.patient_id,
      patientName: String(t.p_first) + ' ' + String(t.p_last), assignedTo: t.assigned_to,
      dueAt: t.due_at, completedAt: t.completed_at, completionNotes: t.completion_notes,
      createdAt: t.created_at,
    })));
  });

  app.post('/api/v1/nursing/tasks', { preHandler: [authenticate, authorize('nursing.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const principal = ctx.principal;
    const patient = await applyScopePolicy('patients', db('patients').where({ 'patients.id': body.patientId, 'patients.tenant_id': tenantId }), principal, resolveNursingScope(principal, 'nursing.create')).first();
    if (!patient) throw new ForbiddenError('Nursing task patient is outside your assigned scope');
    const assignedTo = await resolveTaskAssignee(principal, tenantId, body.assignedTo);
    const [task] = await db('nursing_tasks').insert({
      tenant_id: tenantId, patient_id: body.patientId, title: body.title,
      description: body.description, category: body.category || 'general',
      priority: body.priority || 'normal', assigned_to: assignedTo,
      assigned_by: ctx.userId, due_at: body.dueAt || null,
    }).returning('*');
    return sendSuccess(reply, { id: task.id }, 'Task created', 201);
  });

  app.put('/api/v1/nursing/tasks/:id', { preHandler: [authenticate, authorize('nursing.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const task = await applyScopePolicy('nursing', db('nursing_tasks').join('patients', 'nursing_tasks.patient_id', 'patients.id').where({ 'nursing_tasks.id': id }), principal, resolveNursingScope(principal, 'nursing.edit')).first();
    if (!task) throw new ForbiddenError('Nursing task is outside your assigned scope');
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.completionNotes) update.completion_notes = body.completionNotes;
    if (body.status === 'completed') update.completed_at = new Date();
    await db('nursing_tasks').where({ id }).update(update);
    return sendSuccess(reply, null, 'Task updated');
  });

  app.post('/api/v1/nursing/notes', { preHandler: [authenticate, authorize('nursing.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const patient = await applyScopePolicy('patients', db('patients').where({ 'patients.id': body.patientId, 'patients.tenant_id': tenantId }), ctx.principal, resolveNursingScope(ctx.principal, 'nursing.create')).first();
    if (!patient) throw new ForbiddenError('Nursing note patient is outside your assigned scope');
    const [note] = await db('nursing_notes').insert({
      tenant_id: tenantId, patient_id: body.patientId, nurse_id: ctx.userId,
      appointment_id: body.appointmentId || null, observation: body.observation,
      intervention: body.intervention, response: body.response, plan: body.plan,
      vitals: body.vitals ? JSON.stringify(body.vitals) : null, shift: body.shift || null,
    }).returning('*');
    return sendSuccess(reply, { id: note.id }, 'Note saved', 201);
  });
}
