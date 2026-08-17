import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import type { AuditLogRow } from "../types.js";
import { authenticate } from '../auth-guard.js';
import { authorize, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import type { PermissionScope } from '@healthcare/shared/authz';

export async function registerAuditModule(app: FastifyInstance) {
  const resolveAuditScope = (principal: Principal): PermissionScope =>
    principal.grants.find((grant) => grant.permission === 'audit.view' || grant.permission === '*')?.scope || 'tenant';

  // List audit logs (paginated, filterable)
  app.get('/api/v1/audit-logs', { preHandler: [authenticate, authorize('audit.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
      action: z.string().optional(),
      entityType: z.string().optional(),
      userId: z.string().uuid().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(request.query);

    const principal = getCtx(request).principal;
    const qb = applyScopePolicy('audit', db('audit_logs').where({ tenant_id: tenantId }), principal, resolveAuditScope(principal));

    if (query.action) qb.andWhere('action', 'like', `${query.action}%`);
    if (query.entityType) qb.andWhere({ entity_type: query.entityType });
    if (query.userId) qb.andWhere({ user_id: query.userId });
    if (query.from) qb.andWhere('created_at', '>=', new Date(query.from));
    if (query.to) qb.andWhere('created_at', '<=', new Date(query.to));

    const total = await qb.clone().count('id as count').first();
    const logs = await qb.orderBy('created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit);

    return sendPaginated(reply, logs, Number((total as Record<string, unknown>)?.count || 0), query.page, query.limit);
  });

  // Get audit log detail
  app.get('/api/v1/audit-logs/:id', { preHandler: [authenticate, authorize('audit.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const principal = getCtx(request).principal;
    const log = await applyScopePolicy('audit', db('audit_logs').where({ id, tenant_id: tenantId }), principal, resolveAuditScope(principal)).first();
    if (!log) return reply.code(404).send({ error: 'Not found' });
    return sendSuccess(reply, log);
  });

  // Get all distinct action types (for filtering)
  app.get('/api/v1/audit-logs/actions/types', { preHandler: [authenticate, authorize('audit.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const principal = getCtx(request).principal;
    const actions = await applyScopePolicy('audit', db('audit_logs').where({ tenant_id: tenantId }), principal, resolveAuditScope(principal)).distinct('action').orderBy('action');
    return sendSuccess(reply, actions.map((a: AuditLogRow) => a.action));
  });

  // Export audit logs (CSV/JSON)
  app.get('/api/v1/audit/logs/export', { preHandler: [authenticate, authorize('audit.export')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({ format: z.enum(['csv', 'json']).optional().default('json'), action: z.string().optional(), entityType: z.string().optional(), fromDate: z.string().optional(), toDate: z.string().optional() }).parse(request.query);

    const principal = getCtx(request).principal;
    let dbQuery = applyScopePolicy('audit', db('audit_logs').where({ tenant_id: tenantId }), principal, resolveAuditScope(principal));
    if (query.action) dbQuery = dbQuery.andWhere({ action: query.action });
    if (query.entityType) dbQuery = dbQuery.andWhere({ entity_type: query.entityType });
    if (query.fromDate) dbQuery = dbQuery.andWhere('created_at', '>=', query.fromDate);
    if (query.toDate) dbQuery = dbQuery.andWhere('created_at', '<=', query.toDate + 'T23:59:59');

    const logs = await dbQuery.orderBy('created_at', 'desc').limit(10000);

    if (query.format === 'csv') {
      const headers = ['id', 'action', 'entity_type', 'entity_id', 'user_id', 'ip_address', 'created_at'];
      const csv = [headers.join(','), ...logs.map((l: Record<string, unknown>) => headers.map(h => String(l[h] || '').replace(/,/g, ';')).join(','))].join('\n');
      return reply.type('text/csv').header('Content-Disposition', 'attachment; filename=udit-logs.csv').send(csv);
    }

    return sendSuccess(reply, logs);
  });

}
