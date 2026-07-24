import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';

const branchSchema = z.object({
  name: z.string().min(1),
  name_ar: z.string().optional(),
  code: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  governorate: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  manager_name: z.string().optional(),
  is_active: z.boolean().default(true),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  working_hours: z.unknown().optional(),
  capacity: z.number().int().optional(),
  type: z.enum(['main', 'branch', 'satellite', 'virtual']).default('branch'),
});

export async function registerMultiBranchModule(app: FastifyInstance) {
  // List all branches
  app.get('/api/v1/branches', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { page: rawPage = '1', limit: rawLimit = '20', is_active, type, search } = request.query as { is_active?: string; limit?: string; page?: string; search?: string; type?: string };
    const page = Number(rawPage); const limit = Number(rawLimit);
    let q = db('branches').where('tenant_id', ctx.tenantId);
    if (is_active !== undefined) q = q.where('is_active', is_active === 'true');
    if (type) q = q.where('type', type);
    if (search) q = q.where(function() { this.where('name', 'ilike', `%${search}%`).orWhere('code', 'ilike', `%${search}%`); });
    const total = (await q.clone().count('* as count').first()) as Record<string, unknown>;
    const rows = await q.orderBy('name').limit(limit).offset((page - 1) * limit);
    return sendPaginated(reply, rows, Number(total?.count || 0), page, limit);
  });

  // Get single branch
  app.get('/api/v1/branches/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const row = await db('branches').where({ id, tenant_id: ctx.tenantId }).first();
    if (!row) return sendError(reply, 'Branch not found', 404);
    // Get branch stats
    const patientCount = await db('patients').where({ branch_id: id, tenant_id: ctx.tenantId }).count('* as count').first() as Record<string, unknown>;
    const staffCount = await db('users').where({ branch_id: id, tenant_id: ctx.tenantId }).count('* as count').first() as Record<string, unknown>;
    const appointmentCount = await db('appointments').where({ branch_id: id, tenant_id: ctx.tenantId }).count('* as count').first() as Record<string, unknown>;
    return sendSuccess(reply, { ...row, stats: { patients: Number(patientCount?.count || 0), staff: Number(staffCount?.count || 0), appointments: Number(appointmentCount?.count || 0) } });
  });

  // Create branch
  app.post('/api/v1/branches', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const parsed = branchSchema.safeParse(request.body);
    if (!parsed.success) return sendError(reply, parsed.error.message, 400);
    // Check unique code per tenant
    const existing = await db('branches').where({ code: parsed.data.code, tenant_id: ctx.tenantId }).first();
    if (existing) return sendError(reply, 'Branch code already exists', 409);
    const [row] = await db('branches').insert({ ...parsed.data, tenant_id: ctx.tenantId, created_by: ctx.userId }).returning('*');
    return sendSuccess(reply, row, 'Branch created', 201);
  });

  // Update branch
  app.put('/api/v1/branches/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const parsed = branchSchema.partial().safeParse(request.body);
    if (!parsed.success) return sendError(reply, parsed.error.message, 400);
    if (parsed.data.code) {
      const dup = await db('branches').where({ code: parsed.data.code, tenant_id: ctx.tenantId }).whereNot('id', id).first();
      if (dup) return sendError(reply, 'Branch code already exists', 409);
    }
    const [row] = await db('branches').where({ id, tenant_id: ctx.tenantId }).update({ ...parsed.data, updated_at: new Date() }).returning('*');
    if (!row) return sendError(reply, 'Branch not found', 404);
    return sendSuccess(reply, row);
  });

  // Delete branch (soft delete)
  app.delete('/api/v1/branches/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const [row] = await db('branches').where({ id, tenant_id: ctx.tenantId }).update({ is_active: false, updated_at: new Date() }).returning('*');
    if (!row) return sendError(reply, 'Branch not found', 404);
    return sendSuccess(reply, { message: 'Branch deactivated' });
  });

  // Branch dashboard summary
  app.get('/api/v1/branches/summary/overview', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const branches = await db('branches').where({ tenant_id: ctx.tenantId, is_active: true });
    const summary = await Promise.all(branches.map(async (b: Record<string, unknown>) => {
      const patients = await db('patients').where({ branch_id: b.id, tenant_id: ctx.tenantId }).count('* as count').first() as Record<string, unknown>;
      const todayAppts = await db('appointments').where({ branch_id: b.id, tenant_id: ctx.tenantId }).whereRaw("DATE(created_at) = CURRENT_DATE").count('* as count').first() as Record<string, unknown>;
      const revenue = await db('invoices').where({ branch_id: b.id, tenant_id: ctx.tenantId, status: 'paid' }).sum('total_amount as total').first() as Record<string, unknown>;
      return { ...b, patient_count: Number(patients?.count || 0), today_appointments: Number(todayAppts?.count || 0), total_revenue: Number(revenue?.total || 0) };
    }));
    return sendSuccess(reply, summary);
  });

  // Assign staff to branch
  app.post('/api/v1/branches/:id/assign-staff', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const { user_ids } = request.body as Record<string, unknown>;
    if (!Array.isArray(user_ids)) return sendError(reply, 'user_ids must be an array', 400);
    const branch = await db('branches').where({ id, tenant_id: ctx.tenantId }).first();
    if (!branch) return sendError(reply, 'Branch not found', 404);
    await db('users').whereIn('id', user_ids).where('tenant_id', ctx.tenantId).update({ branch_id: id, updated_at: new Date() });
    return sendSuccess(reply, { message: `${user_ids.length} staff assigned to ${branch.name}` });
  });

  // Get staff per branch
  app.get('/api/v1/branches/:id/staff', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const staff = await db('users').where({ branch_id: id, tenant_id: ctx.tenantId }).select('id', 'name', 'email', 'role', 'specialization', 'is_active');
    return sendSuccess(reply, staff);
  });

  // Get patients per branch
  app.get('/api/v1/branches/:id/patients', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const { page: rawPage = '1', limit: rawLimit = '20' } = request.query as { limit?: string; page?: string };
    const page = Number(rawPage); const limit = Number(rawLimit);
    const q = db('patients').where({ branch_id: id, tenant_id: ctx.tenantId });
    const total = (await q.clone().count('* as count').first()) as Record<string, unknown>;
    const rows = await q.orderBy('created_at', 'desc').limit(limit).offset((page - 1) * limit);
    return sendPaginated(reply, rows, Number(total?.count || 0), page, limit);
  });

}
