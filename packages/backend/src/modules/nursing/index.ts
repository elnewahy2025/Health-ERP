import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';


export async function registerNursingModule(app: FastifyInstance) {
  app.get('/api/v1/nursing/tasks', { preHandler: [authenticate, authorize('nursing.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status, assignedTo } = request.query as { assignedTo?: string; status?: string };
    let q = db('nursing_tasks').where('nursing_tasks.tenant_id', tenantId).whereNull('nursing_tasks.deleted_at');
    if (status) q = q.andWhere('nursing_tasks.status', status);
    if (assignedTo) q = q.andWhere('nursing_tasks.assigned_to', assignedTo);
    const tasks = await q.join('patients', 'nursing_tasks.patient_id', 'patients.id')
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

  app.post('/api/v1/nursing/tasks', { preHandler: [authenticate, authorize('nursing.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [task] = await db('nursing_tasks').insert({
      tenant_id: tenantId, patient_id: body.patientId, title: body.title,
      description: body.description, category: body.category || 'general',
      priority: body.priority || 'normal', assigned_to: body.assignedTo || ctx.userId,
      assigned_by: ctx.userId, due_at: body.dueAt || null,
    }).returning('*');
    return sendSuccess(reply, { id: task.id }, 'Task created', 201);
  });

  app.put('/api/v1/nursing/tasks/:id', { preHandler: [authenticate, authorize('nursing.view')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.completionNotes) update.completion_notes = body.completionNotes;
    if (body.status === 'completed') update.completed_at = new Date();
    await db('nursing_tasks').where({ id }).update(update);
    return sendSuccess(reply, null, 'Task updated');
  });

  app.post('/api/v1/nursing/notes', { preHandler: [authenticate, authorize('nursing.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [note] = await db('nursing_notes').insert({
      tenant_id: tenantId, patient_id: body.patientId, nurse_id: ctx.userId,
      appointment_id: body.appointmentId || null, observation: body.observation,
      intervention: body.intervention, response: body.response, plan: body.plan,
      vitals: body.vitals ? JSON.stringify(body.vitals) : null, shift: body.shift || null,
    }).returning('*');
    return sendSuccess(reply, { id: note.id }, 'Note saved', 201);
  });
}
