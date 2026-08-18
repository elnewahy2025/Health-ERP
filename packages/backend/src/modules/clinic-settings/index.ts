import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import {
  listEffectiveClinicConfiguration,
  upsertClinicConfiguration,
} from '../../services/clinic-configuration.js';
import {
  listTenantModules,
  setTenantModuleActivation,
} from '../../services/clinic-modules.js';

export async function registerClinicSettingsModule(app: FastifyInstance) {

  app.get('/api/v1/clinic-configuration', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const query = z.object({
      scopeType: z.enum(['tenant', 'branch', 'department']).default('tenant'),
      scopeId: z.string().uuid().optional(),
    }).parse(request.query);
    const scopeId = query.scopeId || (query.scopeType === 'tenant' ? ctx.tenantId : undefined);
    if (!scopeId) {
      return reply.code(400).send({ success: false, error: 'scopeId is required for branch and department configuration' });
    }
    const entries = await listEffectiveClinicConfiguration(ctx.tenantId, {
      scopeType: query.scopeType,
      scopeId,
    });
    return sendSuccess(reply, { scopeType: query.scopeType, scopeId, entries });
  });

  app.put('/api/v1/clinic-configuration', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const body = z.object({
      scopeType: z.enum(['tenant', 'branch', 'department']),
      scopeId: z.string().uuid(),
      key: z.string().min(1).max(160),
      value: z.unknown(),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body);
    const entry = await upsertClinicConfiguration({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      key: body.key,
      value: body.value,
      expectedVersion: body.expectedVersion,
      branchId: ctx.branchId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    });
    return sendSuccess(reply, entry, 'Clinic configuration updated');
  });

  app.get('/api/v1/clinic-modules', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    return sendSuccess(reply, await listTenantModules(ctx.tenantId));
  });

  app.put('/api/v1/clinic-modules/:moduleKey', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ moduleKey: z.string().min(1).max(80) }).parse(request.params);
    const body = z.object({ enabled: z.boolean() }).parse(request.body);
    const status = await setTenantModuleActivation({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      moduleKey: params.moduleKey,
      enabled: body.enabled,
      branchId: ctx.branchId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    });
    return sendSuccess(reply, status, 'Clinic module activation updated');
  });

  // Legacy compatibility response. Provider secrets are intentionally excluded.
  app.get('/api/v1/clinic-settings', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const tenant = await db('tenants').where({ id: tenantId }).select('name', 'settings').first();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    return sendSuccess(reply, {
      // Clinic info
      clinicName: settings.clinicName || tenant?.name || '',
      branch: settings.branch || '',
      landPhone: settings.landPhone || '',
      whatsappPhone: settings.whatsappPhone || '',
      logoUrl: settings.logoUrl || '',
      address: settings.address || '',
      city: settings.city || '',
      country: settings.country || '',
      googleMapsLocation: settings.googleMapsLocation || '',
      email: settings.email || '',
      website: settings.website || '',
      workingHours: settings.workingHours || 'Sun-Thu: 9AM-5PM',
      licenseNumber: settings.licenseNumber || '',
      taxNumber: settings.taxNumber || '',
      // Provider credentials are never returned through the normal settings API.
      twilioConfigured: Boolean(
        settings.twilioAccountSid || settings.twilioAuthToken || settings.twilioMessagingServiceSid,
      ),
    });
  });

  // Update clinic settings
  app.put('/api/v1/clinic-settings', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = request.body as Record<string, unknown>;
    const tenant = await db('tenants').where({ id: tenantId }).select('settings').first();
    const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
    const updatedSettings = { ...currentSettings, ...body };
    await db('tenants').where({ id: tenantId }).update({ settings: JSON.stringify(updatedSettings), updated_at: new Date() });
    return sendSuccess(reply, null, 'Clinic settings updated');
  });
}
