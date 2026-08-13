import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { ReportScheduleRow, ReportExecutionRow } from "../types.js";

export async function registerReportsModule(app: FastifyInstance) {
  // ── Report Definitions ──
  app.get('/api/v1/reports', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { category } = request.query as { category?: string };
    let q = db('report_definitions').where('report_definitions.tenant_id', tenantId);
    if (category) q = q.andWhere('category', category);
    const reports = await q.orderBy('name');
    return sendSuccess(reply, reports.map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, slug: r.slug, category: r.category,
      description: r.description, queryConfig: r.query_config,
      columns: r.columns, filters: r.filters, sorting: r.sorting,
      exportFormats: r.export_formats, isScheduled: r.is_scheduled,
      createdAt: r.created_at, updatedAt: r.updated_at
    })));
  });

  app.post('/api/v1/reports', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const slug = body.slug || (body.name as string).toLowerCase().replace(/\s+/g, '_');
    const [rep] = await db('report_definitions').insert({
      tenant_id: tenantId, name: body.name, slug, category: body.category || 'clinical',
      description: body.description || null, query_config: JSON.stringify(body.queryConfig || {}),
      columns: JSON.stringify(body.columns || []), filters: JSON.stringify(body.filters || []),
      sorting: JSON.stringify(body.sorting || []),
      export_formats: JSON.stringify(body.exportFormats || ['csv', 'pdf', 'excel']),
      created_by: ctx.userId
    }).returning('*');
    return sendSuccess(reply, { id: rep.id, name: rep.name, slug: rep.slug }, 'Report definition created', 201);
  });

  app.put('/api/v1/reports/:id', { preHandler: [authenticate, authorize('reports.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('report_definitions', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Report not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name; if (body.description !== undefined) update.description = body.description;
    if (body.queryConfig) update.query_config = JSON.stringify(body.queryConfig);
    if (body.columns) update.columns = JSON.stringify(body.columns);
    if (body.filters) update.filters = JSON.stringify(body.filters);
    if (body.sorting) update.sorting = JSON.stringify(body.sorting);
    if (body.exportFormats) update.export_formats = JSON.stringify(body.exportFormats);
    await db('report_definitions').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Report updated');
  });

  app.delete('/api/v1/reports/:id', { preHandler: [authenticate, authorize('reports.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const existing = await findTenantRow('report_definitions', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Report not found' });
    await db('report_schedules').where({ report_id: id, tenant_id: tenantId }).del();
    await db('report_executions').where({ report_id: id, tenant_id: tenantId }).del();
    await db('report_definitions').where({ id, tenant_id: tenantId }).del();
    return sendSuccess(reply, null, 'Report deleted');
  });

  // ── Report Schedules ──
  app.get('/api/v1/reports/:id/schedules', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const schedules = await db('report_schedules').where({ tenant_id: tenantId, report_id: id }).orderBy('created_at', 'desc');
    return sendSuccess(reply, schedules.map((s: Record<string, unknown>) => ({
      id: s.id, reportId: s.report_id, cron: s.cron,
      recipients: s.recipients, format: s.format, params: s.params,
      isActive: s.is_active, lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at, createdAt: s.created_at
    })));
  });

  app.post('/api/v1/reports/:id/schedules', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const [s] = await db('report_schedules').insert({
      tenant_id: tenantId, report_id: id, cron: body.cron || '0 8 * * 1',
      recipients: JSON.stringify(body.recipients || []), format: body.format || 'pdf',
      params: JSON.stringify(body.params || {}), is_active: body.isActive !== false
    }).returning('*');
    return sendSuccess(reply, { id: s.id }, 'Schedule created', 201);
  });

  app.put('/api/v1/reports/schedules/:id', { preHandler: [authenticate, authorize('reports.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('report_schedules', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Schedule not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.cron) update.cron = body.cron; if (body.recipients) update.recipients = JSON.stringify(body.recipients);
    if (body.format) update.format = body.format; if (body.isActive !== undefined) update.is_active = body.isActive;
    if (body.params) update.params = JSON.stringify(body.params);
    await db('report_schedules').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Schedule updated');
  });

  // ── Report Executions ──
  app.get('/api/v1/reports/:id/executions', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const execs = await db('report_executions').where({ tenant_id: tenantId, report_id: id }).orderBy('created_at', 'desc').limit(20);
    return sendSuccess(reply, execs.map((e: Record<string, unknown>) => ({
      id: e.id, reportId: e.report_id, status: e.status, format: e.format,
      error: e.error, rowCount: e.row_count, trigger: e.trigger,
      startedAt: e.started_at, completedAt: e.completed_at, createdAt: e.created_at
    })));
  });

  app.post('/api/v1/reports/:id/execute', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const [exec] = await db('report_executions').insert({
      tenant_id: tenantId, report_id: id, status: 'pending',
      format: body.format || 'csv', trigger: 'manual', created_by: ctx.userId
    }).returning('*');
    // In production, this would trigger an async report generation job
    await db('report_executions').where({ id: exec.id }).update({ status: 'completed', started_at: new Date(), completed_at: new Date(), row_count: 0 });
    return sendSuccess(reply, { id: exec.id, status: 'completed' }, 'Report execution started. Results will be available shortly.', 201);
  });

  // ── Export endpoint stub ──
  app.get('/api/v1/reports/export/:id/:format', { preHandler: [authenticate, authorize('reports.export')] }, async (request, reply) => {
    const { id, format } = request.params as { id: string; format: string };
    const exec = await db('report_executions').where({ id }).first();
    if (!exec) return reply.status(404).send({ success: false, error: 'Execution not found' });
    if (exec.status !== 'completed') return reply.status(400).send({ success: false, error: 'Report not ready' });
    // In production, stream the generated file
    return sendSuccess(reply, { id: exec.id, format, downloadUrl: `/api/v1/reports/download/${exec.id}` });
  });
}
