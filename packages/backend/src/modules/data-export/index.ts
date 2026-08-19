import type { FastifyInstance } from 'fastify';
import { ForbiddenError, NotFoundError, ValidationError } from '@healthcare/shared/errors';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import {
  FHIR_RESOURCE_TYPES,
  buildFhirBundle,
} from '../../services/fhir-export.js';
import {
  getExportDefinitionInput,
  getExportModules,
  readExportArtifact,
} from '../../services/export-service.js';

function hasManagePermission(ctx: { permissions: string[] }): boolean {
  return ctx.permissions.includes('data_export.manage') || ctx.permissions.includes('data_export.*') || ctx.permissions.includes('*');
}

function jobResponse(job: Record<string, any>) {
  return {
    id: job.id,
    module: job.module,
    format: job.format,
    status: job.status,
    recordCount: Number(job.record_count || 0),
    fileSize: Number(job.file_size || 0),
    fhirVersion: job.fhir_version,
    fhirResourceType: job.fhir_resource_type,
    error: job.error,
    trigger: job.trigger,
    fileName: job.file_name,
    checksum: job.checksum,
    downloadAvailable: job.status === 'completed' && Boolean(job.file_path) && !job.artifact_deleted_at,
    artifactExpiresAt: job.artifact_expires_at,
    artifactDeletedAt: job.artifact_deleted_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    createdAt: job.created_at,
  };
}

export async function registerDataExportModule(app: FastifyInstance) {
  app.get('/api/v1/export/definitions', { preHandler: [authenticate, authorize('data_export.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const defs = await db('export_definitions').where({ tenant_id: tenantId }).orderBy('name');
    return sendSuccess(reply, defs.map((d: Record<string, unknown>) => ({
      id: d.id, name: d.name, module: d.module, format: d.format,
      columns: d.columns, filters: d.filters, dateRange: d.date_range,
      includeDeleted: d.include_deleted, isScheduled: d.is_scheduled,
      scheduleCron: d.schedule_cron, createdAt: d.created_at,
    })));
  });

  app.post('/api/v1/export/definitions', { preHandler: [authenticate, authorize('data_export.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const input = getExportDefinitionInput(body, ctx);
    const [definition] = await db('export_definitions').insert({
      tenant_id: tenantId, name: String(body.name || `${input.module} export`), module: input.module, format: input.format,
      columns: JSON.stringify(input.requestedColumns), filters: JSON.stringify(input.filters), date_range: String(body.dateRange || 'all'),
      include_deleted: input.includeDeleted, is_scheduled: false, schedule_cron: null, created_by: ctx.userId,
    }).returning('*');
    await logAudit({ tenantId, userId: ctx.userId, action: 'export.definition_created', entityType: 'export_definition', entityId: definition.id, metadata: { name: definition.name, module: input.module, format: input.format }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, { id: definition.id, name: definition.name, module: definition.module, format: definition.format }, 'Export definition created', 201);
  });

  app.delete('/api/v1/export/definitions/:id', { preHandler: [authenticate, authorize('data_export.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const deleted = await db('export_definitions').where({ id, tenant_id: tenantId }).del();
    if (!deleted) throw new NotFoundError('Export definition', id);
    await logAudit({ tenantId, userId: ctx.userId, action: 'export.definition_deleted', entityType: 'export_definition', entityId: id, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, null, 'Export definition deleted');
  });

  app.get('/api/v1/export/modules', { preHandler: [authenticate, authorize('data_export.view')] }, async (_request, reply) => sendSuccess(reply, getExportModules()));

  app.post('/api/v1/export/run', { preHandler: [authenticate, authorize('data_export.export')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = (request.body || {}) as Record<string, unknown>;
    const definition = body.exportId
      ? await db('export_definitions').where({ id: String(body.exportId), tenant_id: tenantId }).first()
      : null;
    if (body.exportId && !definition) throw new NotFoundError('Export definition', String(body.exportId));
    const input = getExportDefinitionInput({
      ...body,
      module: body.module || definition?.module || 'patients',
      format: body.format || definition?.format || 'csv',
      columns: body.columns ?? definition?.columns,
      filters: body.filters ?? definition?.filters,
      includeDeleted: body.includeDeleted ?? definition?.include_deleted,
    }, ctx);
    const storageLocation = hasManagePermission(ctx) && body.storageLocation ? String(body.storageLocation) : (process.env.EXPORT_STORAGE_LOCATION || 'local://exports');
    const [job] = await db('export_jobs').insert({
      tenant_id: tenantId, export_id: definition?.id || null, module: input.module, format: input.format, status: 'pending', trigger: 'manual',
      fhir_version: input.format === 'fhir_json' ? 'r4' : null, fhir_resource_type: input.fhirResourceType,
      requested_columns: JSON.stringify(input.requestedColumns), filters: JSON.stringify(input.filters), include_deleted: input.includeDeleted,
      storage_location: storageLocation, retention_days: input.retentionDays, created_by: ctx.userId,
    }).returning('*');
    await logAudit({ tenantId, userId: ctx.userId, action: 'export.queued', entityType: 'export_job', entityId: job.id, metadata: { module: input.module, format: input.format, filters: input.filters, includeDeleted: input.includeDeleted }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, jobResponse(job), 'Export queued for durable processing', 202);
  });

  app.get('/api/v1/export/jobs', { preHandler: [authenticate, authorize('data_export.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status, module } = request.query as { module?: string; status?: string };
    let query = db('export_jobs').where('tenant_id', tenantId);
    if (status) query = query.andWhere('status', status);
    if (module) query = query.andWhere('module', module);
    const jobs = await query.orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, jobs.map((job: Record<string, any>) => jobResponse(job)));
  });

  app.get('/api/v1/export/fhir/:resourceType', { preHandler: [authenticate, authorize('data_export.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { resourceType } = request.params as { resourceType: string };
    const query = (request.query || {}) as Record<string, unknown>;
    const includeDeleted = String(query.includeDeleted || '').toLowerCase() === 'true';
    if (includeDeleted && !hasManagePermission(ctx)) throw new ForbiddenError('Deleted-record exports require data_export.manage');
    const filters = {
      dateFrom: query.dateFrom ? String(query.dateFrom) : undefined,
      dateTo: query.dateTo ? String(query.dateTo) : undefined,
      patientId: query.patientId ? String(query.patientId) : undefined,
      branchId: query.branchId ? String(query.branchId) : undefined,
    };
    if (resourceType && !FHIR_RESOURCE_TYPES.includes(resourceType.charAt(0).toUpperCase() + resourceType.slice(1))) throw new ValidationError(`Unsupported FHIR resource type: ${resourceType}`);
    const bundle = await buildFhirBundle(tenantId, resourceType, filters, includeDeleted);
    await logAudit({ tenantId, userId: ctx.userId, action: 'export.fhir_downloaded', entityType: 'fhir_bundle', metadata: { resourceType, filters, includeDeleted }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return reply.type('application/fhir+json; charset=utf-8').send(bundle);
  });

  app.get('/api/v1/export/download/:jobId', { preHandler: [authenticate, authorize('data_export.download')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { jobId } = request.params as { jobId: string };
    const job = await db('export_jobs').where({ id: jobId, tenant_id: tenantId }).first();
    if (!job) throw new NotFoundError('Export job', jobId);
    const artifact = await readExportArtifact(job);
    await logAudit({ tenantId, userId: ctx.userId, action: 'export.downloaded', entityType: 'export_job', entityId: job.id, metadata: { module: job.module, format: job.format, fileSize: artifact.buffer.length }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return reply.header('Content-Type', artifact.mimeType).header('Content-Disposition', `attachment; filename="${artifact.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`).header('Content-Length', artifact.buffer.length).send(artifact.buffer);
  });
}
