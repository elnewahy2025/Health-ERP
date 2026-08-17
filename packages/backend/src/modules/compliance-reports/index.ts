import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { AuditLogRow } from "../types.js";

export async function registerComplianceReportsModule(app: FastifyInstance) {
  // ── Compliance Reports ──
  app.get('/api/v1/compliance/reports', { preHandler: [authenticate, authorize('compliance_reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { type, status } = request.query as { status?: string; type?: string };
    let q = db('compliance_reports').where('compliance_reports.tenant_id', tenantId);
    if (type) q = q.andWhere('type', type);
    if (status) q = q.andWhere('status', status);
    const reports = await q.orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, reports.map((r: Record<string, unknown>) => ({
      id: r.id, title: r.title, type: r.type, periodStart: r.period_start,
      periodEnd: r.period_end, status: r.status, findings: r.findings,
      recommendations: r.recommendations, format: r.format,
      generatedBy: r.generated_by, generatedAt: r.generated_at, createdAt: r.created_at
    })));
  });

  app.post('/api/v1/compliance/reports', { preHandler: [authenticate, authorize('compliance_reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [rep] = await db('compliance_reports').insert({
      tenant_id: tenantId, title: body.title, type: body.type || 'internal',
      period_start: body.periodStart, period_end: body.periodEnd,
      data: JSON.stringify(body.data || {}), format: body.format || 'pdf',
      generated_by: ctx.userId, generated_at: new Date()
    }).returning('*');
    return sendSuccess(reply, { id: rep.id, title: rep.title, type: rep.type }, 'Compliance report generated', 201);
  });

  app.put('/api/v1/compliance/reports/:id', { preHandler: [authenticate, authorize('compliance_reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('compliance_reports', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Report not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.findings !== undefined) update.findings = body.findings;
    if (body.recommendations !== undefined) update.recommendations = body.recommendations;
    await db('compliance_reports').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Report updated');
  });

  // ── HIPAA Audit Trail ──
  app.get('/api/v1/compliance/hipaa-audit', { preHandler: [authenticate, authorize('compliance_reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { entity, days, userId } = request.query as { days?: string; entity?: string; userId?: string };
    const since = new Date(Date.now() - (Number(days) || 90) * 86400000);
    let q = db('audit_logs').where('audit_logs.tenant_id', tenantId).where('timestamp', '>=', since);
    if (entity) q = q.andWhere('entity', entity);
    if (userId) q = q.andWhere('user_id', userId);
    const logs = await q.orderBy('timestamp', 'desc').limit(200);
    return sendSuccess(reply, logs.map((l: Record<string, unknown>) => ({
      id: l.id, action: l.action, entity: l.entity, entityId: l.entity_id,
      userId: l.user_id, changes: l.changes, ip: l.ip, userAgent: l.user_agent, timestamp: l.timestamp
    })));
  });

  app.get('/api/v1/compliance/hipaa-summary', { preHandler: [authenticate, authorize('compliance_reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 90) * 86400000);
    const totalAccess = await db('audit_logs').where({ tenant_id: tenantId }).where('timestamp', '>=', since).count('id as c').first();
    const byAction = await db('audit_logs').where({ tenant_id: tenantId }).where('timestamp', '>=', since).select('action').groupBy('action').count('id as count').orderByRaw('count desc').limit(10);
    const byEntity = await db('audit_logs').where({ tenant_id: tenantId }).where('timestamp', '>=', since).select('entity').groupBy('entity').count('id as count').orderByRaw('count desc').limit(10);
    const uniqueUsers = await db('audit_logs').where({ tenant_id: tenantId }).where('timestamp', '>=', since).distinct('user_id').count('user_id as c').first();
    return sendSuccess(reply, {
      totalEvents: Number((totalAccess as Record<string, unknown>)?.c || 0),
      uniqueUsers: Number((uniqueUsers as Record<string, unknown>)?.c || 0),
      byAction, byEntity
    });
  });

  // ── Data Retention Policies ──
  app.get('/api/v1/compliance/retention-policies', { preHandler: [authenticate, authorize('compliance_reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const policies = await db('data_retention_policies').where({ tenant_id: tenantId }).orderBy('entity');
    return sendSuccess(reply, policies.map((p: Record<string, unknown>) => ({
      id: p.id, entity: p.entity, retentionDays: p.retention_days,
      action: p.action, isActive: p.is_active, lastCleanupAt: p.last_cleanup_at
    })));
  });

  app.post('/api/v1/compliance/retention-policies', { preHandler: [authenticate, authorize('compliance_reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const [p] = await db('data_retention_policies').insert({
      tenant_id: tenantId, entity: body.entity, retention_days: body.retentionDays || 365,
      action: body.action || 'archive', is_active: body.isActive !== false
    }).returning('*');
    return sendSuccess(reply, { id: p.id, entity: p.entity }, 'Retention policy created', 201);
  });

  app.put('/api/v1/compliance/retention-policies/:id', { preHandler: [authenticate, authorize('compliance_reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('data_retention_policies', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Retention policy not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.retentionDays) update.retention_days = body.retentionDays;
    if (body.action) update.action = body.action;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    await db('data_retention_policies').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Policy updated');
  });

  // ── Business Associate Agreements ──
  app.get('/api/v1/compliance/baa', { preHandler: [authenticate, authorize('compliance_reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const agreements = await db('business_associate_agreements').where({ tenant_id: tenantId }).orderBy('created_at', 'desc');
    return sendSuccess(reply, agreements.map((a: Record<string, unknown>) => ({
      id: a.id, organizationName: a.organization_name, contactName: a.contact_name,
      contactEmail: a.contact_email, scope: a.scope, executedDate: a.executed_date,
      expiryDate: a.expiry_date, status: a.status, terms: a.terms
    })));
  });

  app.post('/api/v1/compliance/baa', { preHandler: [authenticate, authorize('compliance_reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const [baa] = await db('business_associate_agreements').insert({
      tenant_id: tenantId, organization_name: body.organizationName,
      contact_name: body.contactName || null, contact_email: body.contactEmail || null,
      scope: body.scope || null, executed_date: body.executedDate || null,
      expiry_date: body.expiryDate || null, status: body.status || 'draft',
      terms: body.terms || null
    }).returning('*');
    return sendSuccess(reply, { id: baa.id, organizationName: baa.organization_name }, 'BAA created', 201);
  });

  app.put('/api/v1/compliance/baa/:id', { preHandler: [authenticate, authorize('compliance_reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('business_associate_agreements', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'BAA not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.scope) update.scope = body.scope;
    if (body.terms !== undefined) update.terms = body.terms;
    if (body.expiryDate) update.expiry_date = body.expiryDate;
    await db('business_associate_agreements').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'BAA updated');
  });
}
