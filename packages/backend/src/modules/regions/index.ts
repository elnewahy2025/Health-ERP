import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerRegionsModule(app: FastifyInstance) {
  // ── Regions (system catalog) ──
  app.get('/api/v1/regions', async (request, reply) => {
    const regions = await db('regions').where({ is_active: true }).orderBy('name');
    return sendSuccess(reply, regions.map((r: Record<string, unknown>) => ({
      id: r.id, code: r.code, name: r.name, provider: r.provider,
      location: r.location, config: r.config, complianceFlags: r.compliance_flags
    })));
  });

  // ── Tenant Data Residency ──
  app.get('/api/v1/regions/residency', { preHandler: [authenticate, authorize('regions.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const residency = await db('tenant_data_residency').where({ tenant_id: tenantId })
      .leftJoin('regions as pr', 'tenant_data_residency.primary_region_id', 'pr.id')
      .leftJoin('regions as br', 'tenant_data_residency.backup_region_id', 'br.id')
      .select('tenant_data_residency.*', 'pr.name as primary_region_name', 'pr.code as primary_region_code',
        'br.name as backup_region_name', 'br.code as backup_region_code').first();
    if (!residency) return sendSuccess(reply, null);
    return sendSuccess(reply, {
      id: residency.id, primaryRegionId: residency.primary_region_id,
      primaryRegionName: residency.primary_region_name,
      primaryRegionCode: residency.primary_region_code,
      backupRegionId: residency.backup_region_id,
      backupRegionName: residency.backup_region_name,
      backupRegionCode: residency.backup_region_code,
      dataClassifications: residency.data_classifications,
      complianceFramework: residency.compliance_framework
    });
  });

  app.put('/api/v1/regions/residency', { preHandler: [authenticate, authorize('regions.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const existing = await db('tenant_data_residency').where({ tenant_id: tenantId }).first();
    const data: Record<string, unknown> = { updated_at: new Date() };
    if (body.primaryRegionId) data.primary_region_id = body.primaryRegionId;
    if (body.backupRegionId !== undefined) data.backup_region_id = body.backupRegionId;
    if (body.complianceFramework) data.compliance_framework = body.complianceFramework;
    if (body.dataClassifications) data.data_classifications = JSON.stringify(body.dataClassifications);
    if (existing) {
      await db('tenant_data_residency').where({ tenant_id: tenantId }).update(data);
    } else {
      await db('tenant_data_residency').insert({ tenant_id: tenantId, ...data });
    }
    return sendSuccess(reply, null, 'Data residency config updated');
  });

  // ── Seed default regions on first call ──
  app.post('/api/v1/regions/seed', async (request, reply) => {
    const existing = await db('regions').count('id as c').first();
    if (Number((existing as Record<string, unknown>)?.c || 0) > 0) return sendSuccess(reply, null, 'Regions already seeded');
    const defaultRegions = [
      { code: 'me-south-1', name: 'Middle East (Bahrain)', provider: 'aws', location: 'Bahrain', compliance_flags: '["hipaa","gdpr"]' },
      { code: 'eu-central-1', name: 'Europe (Frankfurt)', provider: 'aws', location: 'Germany', compliance_flags: '["gdpr"]' },
      { code: 'us-east-1', name: 'US East (N. Virginia)', provider: 'aws', location: 'United States', compliance_flags: '["hipaa"]' },
      { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', provider: 'aws', location: 'Singapore', compliance_flags: '["gdpr"]' },
      { code: 'local', name: 'Self-Hosted (On-Premise)', provider: 'self', location: 'Local', compliance_flags: '[]' },
    ];
    for (const r of defaultRegions) {
      await db('regions').insert({ code: r.code, name: r.name, provider: r.provider, location: r.location, compliance_flags: r.compliance_flags });
    }
    return sendSuccess(reply, { count: defaultRegions.length }, 'Default regions seeded', 201);
  });
}
