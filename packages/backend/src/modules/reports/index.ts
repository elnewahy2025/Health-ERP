import type { FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError, ValidationError } from '@healthcare/shared/errors';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import type { PermissionScope } from '@healthcare/shared/authz';
import { permissionKeyMatches } from '@healthcare/shared/authz';
import { logAudit } from '../../services/audit.js';
import {
  getReportSources,
  readReportArtifact,
  assertReportExecutionPermission,
  validateReportDefinitionForExecution,
  type ReportDefinitionRecord,
  type ReportExecutionRecord,
} from '../../services/report-service.js';

function parseList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
  }
  return {};
}

function resolveReportScope(principal: { grants: Array<{ permission: string; scope: PermissionScope }> }, permission = 'reports.view'): PermissionScope {
  return principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';
}

function scopeContext(ctx: ReturnType<typeof getCtx>, permission: string): Record<string, unknown> {
  return { scope: resolveReportScope(ctx.principal, permission), branches: ctx.principal.branches, departmentId: ctx.principal.departmentId, userId: ctx.userId };
}

function reportResponse(report: Record<string, unknown>) {
  return {
    id: report.id, name: report.name, slug: report.slug, category: report.category,
    description: report.description, queryConfig: parseObject(report.query_config), columns: parseList(report.columns), filters: parseList(report.filters), sorting: parseList(report.sorting),
    exportFormats: parseList(report.export_formats), isScheduled: report.is_scheduled, branchId: report.branch_id, departmentId: report.department_id,
    createdAt: report.created_at, updatedAt: report.updated_at,
  };
}

function executionResponse(execution: Record<string, any>) {
  return {
    id: execution.id, reportId: execution.report_id, status: execution.status, format: execution.format, error: execution.error,
    rowCount: Number(execution.row_count || 0), fileSize: execution.file_size ? Number(execution.file_size) : null, fileName: execution.file_name,
    trigger: execution.trigger, downloadAvailable: execution.status === 'completed' && Boolean(execution.output_path) && !execution.artifact_deleted_at,
    artifactExpiresAt: execution.artifact_expires_at, artifactDeletedAt: execution.artifact_deleted_at,
    startedAt: execution.started_at, completedAt: execution.completed_at, createdAt: execution.created_at,
  };
}

function retentionDays(value: unknown): number {
  const days = Number(value || 7);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ValidationError('retentionDays must be between 1 and 3650');
  return days;
}

export async function registerReportsModule(app: FastifyInstance) {
  app.get('/api/v1/reports/sources', { preHandler: [authenticate, authorize('reports.view')] }, async (_request, reply) => sendSuccess(reply, getReportSources()));

  app.get('/api/v1/reports', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { category } = request.query as { category?: string }; const principal = getCtx(request).principal;
    let query = db('report_definitions').where('report_definitions.tenant_id', tenantId);
    query = applyScopePolicy('reports', query, principal, resolveReportScope(principal, 'reports.view')) as typeof query;
    if (category) query = query.andWhere('category', category);
    const reports = await query.orderBy('name');
    return sendSuccess(reply, reports.map((report: Record<string, unknown>) => reportResponse(report)));
  });

  app.post('/api/v1/reports', { preHandler: [authenticate, authorize('reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = (request.body || {}) as Record<string, unknown>;
    const name = String(body.name || '').trim();
    if (!name || name.length > 200) throw new ValidationError('Report name is required and must be at most 200 characters');
    const baseSlug = String(body.slug || name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'report');
    let slug = baseSlug; let suffix = 2;
    while (await db('report_definitions').where({ tenant_id: tenantId, slug }).first()) { slug = `${baseSlug}_${suffix}`; suffix += 1; }
    const queryConfig = parseObject(body.queryConfig);
    if (queryConfig.table && !getReportSources().some((source) => source.source === String(queryConfig.table))) throw new ValidationError('Unsupported report queryConfig.table source');
    const [report] = await db('report_definitions').insert({
      tenant_id: tenantId, name, slug, category: body.category || 'clinical', description: body.description || null,
      query_config: JSON.stringify(queryConfig), columns: JSON.stringify(body.columns || []), filters: JSON.stringify(body.filters || []), sorting: JSON.stringify(body.sorting || []),
      export_formats: JSON.stringify(body.exportFormats || ['csv', 'pdf', 'excel']), branch_id: body.branchId || null, department_id: body.departmentId || null, created_by: ctx.userId,
    }).returning('*');
    await logAudit({ tenantId, userId: ctx.userId, action: 'report.definition_created', entityType: 'report_definition', entityId: report.id, metadata: { name, slug }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, reportResponse(report), 'Report definition created', 201);
  });

  app.put('/api/v1/reports/:id', { preHandler: [authenticate, authorize('reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = (request.body || {}) as Record<string, unknown>; const ctx = getCtx(request);
    const principal = ctx.principal;
    const existing = await applyScopePolicy('reports', db('report_definitions').where({ 'report_definitions.id': id, 'report_definitions.tenant_id': tenantId }), principal, resolveReportScope(principal, 'reports.manage')).first() as Record<string, any> | undefined;
    if (!existing) throw new NotFoundError('Report', id);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.description !== undefined) update.description = body.description;
    if (body.queryConfig !== undefined) {
      const queryConfig = parseObject(body.queryConfig);
      if (queryConfig.table && !getReportSources().some((source) => source.source === String(queryConfig.table))) throw new ValidationError('Unsupported report queryConfig.table source');
      update.query_config = JSON.stringify(queryConfig);
    }
    if (body.columns !== undefined) update.columns = JSON.stringify(body.columns);
    if (body.filters !== undefined) update.filters = JSON.stringify(body.filters);
    if (body.sorting !== undefined) update.sorting = JSON.stringify(body.sorting);
    if (body.exportFormats !== undefined) update.export_formats = JSON.stringify(body.exportFormats);
    if (body.branchId !== undefined) update.branch_id = body.branchId || null;
    if (body.departmentId !== undefined) update.department_id = body.departmentId || null;
    await db('report_definitions').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Report updated');
  });

  app.delete('/api/v1/reports/:id', { preHandler: [authenticate, authorize('reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const principal = getCtx(request).principal;
    const existing = await applyScopePolicy('reports', db('report_definitions').where({ 'report_definitions.id': id, 'report_definitions.tenant_id': tenantId }), principal, resolveReportScope(principal, 'reports.manage')).first();
    if (!existing) throw new NotFoundError('Report', id);
    const active = await db('report_executions').where({ report_id: id, tenant_id: tenantId }).whereIn('status', ['pending', 'processing']).first();
    if (active) throw new ConflictError('Cannot delete a report with a pending or processing execution');
    await db('report_schedules').where({ report_id: id, tenant_id: tenantId }).del();
    await db('report_executions').where({ report_id: id, tenant_id: tenantId }).del();
    await db('report_definitions').where({ id, tenant_id: tenantId }).del();
    return sendSuccess(reply, null, 'Report deleted');
  });

  app.get('/api/v1/reports/:id/schedules', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const principal = getCtx(request).principal;
    const schedules = await applyScopePolicy('reports', db('report_schedules').join('report_definitions', 'report_schedules.report_id', 'report_definitions.id').where({ 'report_schedules.tenant_id': tenantId, 'report_schedules.report_id': id }), principal, resolveReportScope(principal, 'reports.view')).orderBy('report_schedules.created_at', 'desc');
    return sendSuccess(reply, schedules.map((schedule: Record<string, unknown>) => ({ id: schedule.id, reportId: schedule.report_id, cron: schedule.cron, recipients: schedule.recipients, format: schedule.format, params: schedule.params, isActive: schedule.is_active, lastRunAt: schedule.last_run_at, nextRunAt: schedule.next_run_at, createdAt: schedule.created_at })));
  });

  app.post('/api/v1/reports/:id/schedules', { preHandler: [authenticate, authorize('reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = (request.body || {}) as Record<string, unknown>; const principal = getCtx(request).principal;
    const report = await applyScopePolicy('reports', db('report_definitions').where({ 'report_definitions.id': id, 'report_definitions.tenant_id': tenantId }), principal, resolveReportScope(principal, 'reports.manage')).first();
    if (!report) throw new NotFoundError('Report', id);
    const [schedule] = await db('report_schedules').insert({ tenant_id: tenantId, report_id: id, cron: body.cron || '0 8 * * 1', recipients: JSON.stringify(body.recipients || []), format: body.format || 'pdf', params: JSON.stringify(body.params || {}), is_active: body.isActive !== false }).returning('*');
    return sendSuccess(reply, { id: schedule.id }, 'Schedule created', 201);
  });

  app.put('/api/v1/reports/schedules/:id', { preHandler: [authenticate, authorize('reports.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = (request.body || {}) as Record<string, unknown>; const principal = getCtx(request).principal;
    const existing = await applyScopePolicy('reports', db('report_schedules').join('report_definitions', 'report_schedules.report_id', 'report_definitions.id').where({ 'report_schedules.id': id, 'report_schedules.tenant_id': tenantId }), principal, resolveReportScope(principal, 'reports.manage')).first();
    if (!existing) throw new NotFoundError('Report schedule', id);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.cron !== undefined) update.cron = body.cron; if (body.recipients !== undefined) update.recipients = JSON.stringify(body.recipients); if (body.format !== undefined) update.format = body.format; if (body.isActive !== undefined) update.is_active = body.isActive; if (body.params !== undefined) update.params = JSON.stringify(body.params);
    await db('report_schedules').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Schedule updated');
  });

  app.get('/api/v1/reports/:id/executions', { preHandler: [authenticate, authorize('reports.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const principal = getCtx(request).principal;
    const executions = await applyScopePolicy('reports', db('report_executions').join('report_definitions', 'report_executions.report_id', 'report_definitions.id').where({ 'report_executions.tenant_id': tenantId, 'report_executions.report_id': id }), principal, resolveReportScope(principal, 'reports.view')).select('report_executions.*').orderBy('report_executions.created_at', 'desc').limit(50);
    return sendSuccess(reply, executions.map((execution: Record<string, any>) => executionResponse(execution)));
  });

  app.post('/api/v1/reports/:id/execute', { preHandler: [authenticate, authorize('reports.export')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const { id } = request.params as { id: string }; const body = (request.body || {}) as Record<string, unknown>; const principal = ctx.principal;
    const report = await applyScopePolicy('reports', db('report_definitions').where({ 'report_definitions.id': id, 'report_definitions.tenant_id': tenantId }), principal, resolveReportScope(principal, 'reports.export')).first() as ReportDefinitionRecord | undefined;
    if (!report) throw new NotFoundError('Report', id);
    const params = parseObject(body.params);
    const format = validateReportDefinitionForExecution(report, body.format || 'csv', params);
    const [execution] = await db('report_executions').insert({ tenant_id: tenantId, report_id: id, status: 'pending', format, trigger: 'manual', params: JSON.stringify(params), scope_context: JSON.stringify(scopeContext(ctx, 'reports.export')), retention_days: retentionDays(body.retentionDays), created_by: ctx.userId }).returning('*');
    await logAudit({ tenantId, userId: ctx.userId, action: 'report.queued', entityType: 'report_execution', entityId: execution.id, metadata: { reportId: id, format, scope: scopeContext(ctx, 'reports.export') }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, executionResponse(execution), 'Report execution queued for durable processing', 202);
  });

  app.get('/api/v1/reports/export/:id/:format', { preHandler: [authenticate, authorize('reports.download')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id, format } = request.params as { id: string; format: string }; const principal = getCtx(request).principal;
    const execution = await applyScopePolicy('reports', db('report_executions').join('report_definitions', 'report_executions.report_id', 'report_definitions.id').where({ 'report_executions.id': id, 'report_executions.tenant_id': tenantId }), principal, resolveReportScope(principal, 'reports.download')).select('report_executions.*').first() as ReportExecutionRecord | undefined;
    if (!execution) throw new NotFoundError('Report execution', id);
    assertReportExecutionPermission(execution, getCtx(request).principal);
    if (execution.format !== format) throw new ValidationError('Requested report format does not match the execution format');
    const artifact = await readReportArtifact(execution);
    await logAudit({ tenantId, userId: getCtx(request).userId, action: 'report.downloaded', entityType: 'report_execution', entityId: id, metadata: { format, fileSize: artifact.buffer.length }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return reply.type(artifact.mimeType).header('Content-Disposition', `attachment; filename="${artifact.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`).header('Content-Length', artifact.buffer.length).send(artifact.buffer);
  });
}
