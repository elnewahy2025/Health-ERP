import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { WorkflowDefinitionRow, WorkflowInstanceRow } from "../types.js";

export async function registerWorkflowModule(app: FastifyInstance) {
  // Workflow Definitions
  app.get('/api/v1/workflow/definitions', { preHandler: [authenticate, authorize('workflow.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { isActive } = request.query as { isActive?: string };
    let q = db('workflow_definitions').where('workflow_definitions.tenant_id', tenantId);
    if (isActive !== undefined) q = q.andWhere('is_active', isActive === 'true');
    const defs = await q.orderBy('name');
    return sendSuccess(reply, defs.map((d: WorkflowDefinitionRow) => ({
      id: d.id, name: d.name, slug: d.slug, category: d.category,
      steps: d.steps, isActive: d.is_active, description: d.description,
      createdAt: d.created_at, updatedAt: d.updated_at
    })));
  });

  app.post('/api/v1/workflow/definitions', { preHandler: [authenticate, authorize('workflow.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const slug = body.slug || (body.name as string).toLowerCase().replace(/\s+/g, '_');
    const [def] = await db('workflow_definitions').insert({
      tenant_id: tenantId, name: body.name, slug, category: body.category || 'general',
      steps: JSON.stringify(body.steps || []), description: body.description || null,
      is_active: body.isActive !== false, created_by: ctx.userId
    }).returning('*');
    return sendSuccess(reply, { id: def.id, name: def.name, slug: def.slug }, 'Workflow definition created', 201);
  });

  app.put('/api/v1/workflow/definitions/:id', { preHandler: [authenticate, authorize('workflow.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name;
    if (body.category) update.category = body.category;
    if (body.steps) update.steps = JSON.stringify(body.steps);
    if (body.description !== undefined) update.description = body.description;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    await db('workflow_definitions').where({ id }).update(update);
    return sendSuccess(reply, null, 'Workflow definition updated');
  });

  // Workflow Instances
  app.get('/api/v1/workflow/instances', { preHandler: [authenticate, authorize('workflow.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status, definitionId } = request.query as { definitionId?: string; status?: string };
    let q = db('workflow_instances').where('workflow_instances.tenant_id', tenantId);
    if (status) q = q.andWhere('workflow_instances.status', status);
    if (definitionId) q = q.andWhere('workflow_instances.definition_id', definitionId);
    const instances = await q.leftJoin('workflow_definitions', 'workflow_instances.definition_id', 'workflow_definitions.id')
      .select('workflow_instances.*', 'workflow_definitions.name as def_name')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, instances.map((i: Record<string, unknown>) => ({
      id: i.id, definitionId: i.definition_id, definitionName: i.def_name,
      referenceType: i.reference_type, referenceId: i.reference_id,
      status: i.status, currentStep: i.current_step,
      context: i.context, data: i.data, assignedTo: i.assigned_to,
      startedAt: i.started_at, completedAt: i.completed_at,
      createdAt: i.created_at, updatedAt: i.updated_at
    })));
  });

  app.post('/api/v1/workflow/instances', { preHandler: [authenticate, authorize('workflow.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [inst] = await db('workflow_instances').insert({
      tenant_id: tenantId, definition_id: body.definitionId,
      reference_type: body.referenceType || null, reference_id: body.referenceId || null,
      status: 'active', current_step: body.currentStep || 0,
      context: JSON.stringify(body.context || {}), data: JSON.stringify(body.data || {}),
      assigned_to: body.assignedTo || null, started_at: new Date(), created_by: ctx.userId
    }).returning('*');
    return sendSuccess(reply, { id: inst.id, status: inst.status }, 'Workflow instance started', 201);
  });

  app.put('/api/v1/workflow/instances/:id/step', { preHandler: [authenticate, authorize('workflow.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.currentStep !== undefined) update.current_step = body.currentStep;
    if (body.status) update.status = body.status;
    if (body.data) update.data = JSON.stringify(body.data);
    if (body.assignedTo !== undefined) update.assigned_to = body.assignedTo;
    if (body.status === 'completed' || body.status === 'cancelled') update.completed_at = new Date();
    await db('workflow_instances').where({ id }).update(update);
    return sendSuccess(reply, null, 'Workflow step updated');
  });
}
