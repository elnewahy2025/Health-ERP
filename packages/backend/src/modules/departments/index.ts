import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { ConflictError } from '@healthcare/shared/errors';

export async function registerDepartmentsModule(app: FastifyInstance) {
  // ── List departments ──
  app.get('/api/v1/departments', { preHandler: [authenticate, authorize('departments.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const departments = await db('departments').where({ tenant_id: tenantId }).orderBy('name');
    return sendSuccess(reply, departments.map((d: Record<string, unknown>) => ({
      id: d.id, name: d.name, code: d.code, isActive: d.is_active,
    })));
  });

  // ── Create department ──
  app.post('/api/v1/departments', { preHandler: [authenticate, authorize('departments.create')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({ name: z.string().min(1).max(100), code: z.string().min(1).max(20) }).parse(request.body);

    const existing = await db('departments').where({ tenant_id: tenantId, code: body.code }).first();
    if (existing) throw new ConflictError('A department with this code already exists');

    const [department] = await db('departments').insert({
      tenant_id: tenantId, name: body.name, code: body.code, is_active: true,
    }).returning('*');

    await logAudit({ tenantId, userId, action: 'department.created', entityType: 'department', entityId: department.id,
      metadata: { name: body.name, code: body.code } });
    return sendSuccess(reply, { id: department.id, name: department.name, code: department.code, isActive: department.is_active }, 'Department created', 201);
  });

  // ── Update department ──
  app.put('/api/v1/departments/:departmentId', { preHandler: [authenticate, authorize('departments.edit')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { departmentId } = z.object({ departmentId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).max(100).optional(),
      code: z.string().min(1).max(20).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const existing = await db('departments').where({ id: departmentId, tenant_id: tenantId }).first();
    if (!existing) return sendError(reply, 'Department not found', 404);

    const updateData: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) updateData.name = body.name;
    if (body.code) updateData.code = body.code;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;
    await db('departments').where({ id: departmentId, tenant_id: tenantId }).update(updateData);

    await logAudit({ tenantId, userId, action: 'department.updated', entityType: 'department', entityId: departmentId,
      metadata: { changed: Object.keys(body) } });
    return sendSuccess(reply, { departmentId }, 'Department updated');
  });

  // ── Delete department (soft) ──
  app.delete('/api/v1/departments/:departmentId', { preHandler: [authenticate, authorize('departments.delete')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { departmentId } = z.object({ departmentId: z.string().uuid() }).parse(request.params);

    const existing = await db('departments').where({ id: departmentId, tenant_id: tenantId }).first();
    if (!existing) return sendError(reply, 'Department not found', 404);

    await db('departments').where({ id: departmentId, tenant_id: tenantId }).update({ is_active: false, updated_at: new Date() });
    await db('users').where({ department_id: departmentId, tenant_id: tenantId }).update({ department_id: null });

    await logAudit({ tenantId, userId, action: 'department.deleted', entityType: 'department', entityId: departmentId });
    return sendSuccess(reply, { departmentId }, 'Department deleted');
  });
}
