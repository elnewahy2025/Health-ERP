import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import {
  listEffectiveClinicConfiguration,
  upsertClinicConfiguration,
  deleteClinicConfiguration,
} from '../../services/clinic-configuration.js';
import {
  listTenantModules,
  setTenantModuleActivation,
  setTenantModuleEntitlement,
} from '../../services/clinic-modules.js';
import { clinicConfigurationDefinition } from '@healthcare/shared';
import {
  getRegionalProfile,
  updateRegionalProfile,
  listProviderConfigurations,
  updateProviderConfiguration,
  updateProviderSecrets,
  updateProviderSecret,
  revokeProviderSecret,
  validateProviderConfiguration,
} from '../../services/clinic-provider-configuration.js';

const DEFAULT_CLINIC_CURRENCY = String(
  clinicConfigurationDefinition('clinic.finance.currency')?.defaultValue || '',
);

const LEGACY_FIELD_MAP = {
  clinicName: 'clinic.profile.display_name',
  legalName: 'clinic.profile.legal_name',
  branch: 'clinic.profile.branch_label',
  landPhone: 'clinic.contact.land_phone',
  whatsappPhone: 'clinic.contact.whatsapp_phone',
  logoUrl: 'clinic.profile.logo_url',
  address: 'clinic.address.street',
  city: 'clinic.address.city',
  country: 'clinic.address.country',
  googleMapsLocation: 'clinic.address.maps_url',
  email: 'clinic.contact.email',
  website: 'clinic.contact.website',
  workingHours: 'clinic.operations.working_hours',
  licenseNumber: 'clinic.legal.license_number',
  taxNumber: 'clinic.legal.tax_number',
  currency: 'clinic.finance.currency',
  timezone: 'clinic.timezone.default',
  locale: 'clinic.locale.default',
} as const;

type LegacyClinicField = keyof typeof LEGACY_FIELD_MAP;
type LegacyClinicSettings = Partial<Record<LegacyClinicField, unknown>>;

const LEGACY_SETTINGS_SCHEMA = z.object({
  clinicName: z.string().max(200).optional(),
  legalName: z.string().max(200).optional(),
  branch: z.string().max(200).optional(),
  landPhone: z.string().max(50).optional(),
  whatsappPhone: z.string().max(50).optional(),
  logoUrl: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  googleMapsLocation: z.string().max(2000).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  website: z.string().max(2000).optional(),
  workingHours: z.string().max(2000).optional(),
  licenseNumber: z.string().max(200).optional(),
  taxNumber: z.string().max(200).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  timezone: z.string().max(100).optional(),
  locale: z.string().max(20).optional(),
}).strict();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function legacyValue(entries: Awaited<ReturnType<typeof listEffectiveClinicConfiguration>>, key: string, fallback: unknown): unknown {
  return entries.find((entry) => entry.key === key)?.value ?? fallback;
}

export async function registerClinicSettingsModule(app: FastifyInstance) {
  app.get('/api/v1/clinic-regional-profile', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    return sendSuccess(reply, await getRegionalProfile(ctx.tenantId));
  });

  app.put('/api/v1/clinic-regional-profile', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const body = z.object({
      countryCode: z.string().length(2).nullable().optional(),
      profileKey: z.string().min(1).max(80).optional(),
      status: z.enum(['incomplete', 'configured', 'invalid']).optional(),
      nationalIdentifierPolicy: z.string().min(1).max(80).optional(),
      phonePolicy: z.string().min(1).max(80).optional(),
      taxProfileKey: z.string().max(80).nullable().optional(),
      metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      expectedVersion: z.number().int().nonnegative().optional(),
    }).parse(request.body);
    return sendSuccess(reply, await updateRegionalProfile({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      ...body,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Regional profile updated');
  });

  app.get('/api/v1/clinic-provider-configurations', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    return sendSuccess(reply, await listProviderConfigurations(ctx.tenantId));
  });

  app.put('/api/v1/clinic-provider-configurations/:providerKey', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80) }).parse(request.params);
    const body = z.object({
      displayName: z.string().max(160).nullable().optional(),
      environment: z.enum(['sandbox', 'production']).optional(),
      config: z.record(z.string(), z.unknown()).default({}),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body);
    return sendSuccess(reply, await updateProviderConfiguration({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      ...body,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider configuration updated');
  });

  app.put('/api/v1/clinic-provider-configurations/:providerKey/secrets', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80) }).parse(request.params);
    const body = z.object({
      secrets: z.record(z.string(), z.string()).default({}),
      clearKeys: z.array(z.string().min(1).max(120)).default([]),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body);
    return sendSuccess(reply, await updateProviderSecrets({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      ...body,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider secrets updated');
  });

  app.post('/api/v1/clinic-provider-configurations/:providerKey/validate', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80) }).parse(request.params);
    return sendSuccess(reply, await validateProviderConfiguration({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider configuration validated');
  });

  // Stable provider API contract. Responses never include encrypted or plaintext secret values.
  app.get('/api/v1/clinic-providers', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    return sendSuccess(reply, await listProviderConfigurations(ctx.tenantId));
  });

  app.put('/api/v1/clinic-providers/:providerKey', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80) }).parse(request.params);
    const body = z.object({
      displayName: z.string().max(160).nullable().optional(),
      environment: z.enum(['sandbox', 'production']).optional(),
      config: z.record(z.string(), z.unknown()).default({}),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body);
    return sendSuccess(reply, await updateProviderConfiguration({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      ...body,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider configuration updated');
  });

  app.post('/api/v1/clinic-providers/:providerKey/test', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80) }).parse(request.params);
    return sendSuccess(reply, await validateProviderConfiguration({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider configuration tested');
  });

  app.put('/api/v1/clinic-providers/:providerKey/secrets/:secretKey', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80), secretKey: z.string().min(1).max(120) }).parse(request.params);
    const body = z.object({ value: z.string().min(1), expectedVersion: z.number().int().positive().optional() }).parse(request.body);
    return sendSuccess(reply, await updateProviderSecret({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      secretKey: params.secretKey,
      value: body.value,
      expectedVersion: body.expectedVersion,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider secret updated');
  });

  app.delete('/api/v1/clinic-providers/:providerKey/secrets/:secretKey', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const params = z.object({ providerKey: z.string().min(1).max(80), secretKey: z.string().min(1).max(120) }).parse(request.params);
    const body = z.object({ expectedVersion: z.number().int().positive().optional() }).default({}).parse(request.body || {});
    return sendSuccess(reply, await revokeProviderSecret({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      providerKey: params.providerKey,
      secretKey: params.secretKey,
      expectedVersion: body.expectedVersion,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    }), 'Provider secret revoked');
  });

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

  app.get('/api/v1/clinic-configuration/identity', { preHandler: [authenticate] }, async (request, reply) => {
    const ctx = getCtx(request);
    const entries = await listEffectiveClinicConfiguration(ctx.tenantId);
    const value = (key: string, fallback: unknown) => entries.find((entry) => entry.key === key)?.value ?? fallback;
    return sendSuccess(reply, {
      displayName: value('clinic.profile.display_name', ''),
      logoUrl: value('clinic.profile.logo_url', ''),
      email: value('clinic.contact.email', ''),
      timezone: value('clinic.timezone.default', 'UTC'),
      locale: value('clinic.locale.default', 'en'),
      currency: value('clinic.finance.currency', DEFAULT_CLINIC_CURRENCY),
    });
  });

  app.get('/api/v1/clinic-configuration/scopes', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const [branches, departments] = await Promise.all([
      db('branches').where({ tenant_id: ctx.tenantId }).select('id', 'name', 'code').orderBy('name'),
      db('departments').where({ tenant_id: ctx.tenantId }).select('id', 'name', 'code').orderBy('name'),
    ]);
    return sendSuccess(reply, { branches, departments });
  });

  app.get('/api/v1/clinic-configuration/readiness', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const modules = await listTenantModules(ctx.tenantId);
    return sendSuccess(reply, {
      tenantId: ctx.tenantId,
      modules: modules.map((module) => ({
        moduleKey: module.moduleKey,
        core: module.core,
        entitled: module.entitled,
        activationStatus: module.activationStatus,
        validationStatus: module.validationStatus,
        missingRequiredKeys: Array.isArray(module.validationErrors)
          ? module.validationErrors.filter((key): key is string => typeof key === 'string')
          : [],
      })),
    });
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

  app.delete('/api/v1/clinic-configuration', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const body = z.object({
      scopeType: z.enum(['branch', 'department']),
      scopeId: z.string().uuid(),
      key: z.string().min(1).max(160),
      expectedVersion: z.number().int().positive().optional(),
    }).parse(request.body);
    const effective = await deleteClinicConfiguration({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      key: body.key,
      expectedVersion: body.expectedVersion,
      branchId: ctx.branchId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    });
    return sendSuccess(reply, { reset: true, effective });
  });

  app.get('/api/v1/clinic-modules', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const ctx = getCtx(request);
    return sendSuccess(reply, await listTenantModules(ctx.tenantId));
  });

  app.get('/api/v1/clinic-modules/visibility', { preHandler: [authenticate] }, async (request, reply) => {
    const ctx = getCtx(request);
    const modules = await listTenantModules(ctx.tenantId);
    return sendSuccess(reply, modules.map((module) => ({
      moduleKey: module.moduleKey,
      core: module.core,
      active: module.core || module.activationStatus === 'enabled',
    })));
  });

  app.get('/api/v1/system/clinic-module-entitlements', { preHandler: [authenticate, authorize({ permission: 'saas_billing.manage', scope: 'system' })] }, async (request, reply) => {
    const query = z.object({ tenantId: z.string().uuid() }).parse(request.query);
    return sendSuccess(reply, await listTenantModules(query.tenantId));
  });

  app.put('/api/v1/system/clinic-module-entitlements/:tenantId/:moduleKey', { preHandler: [authenticate, authorize({ permission: 'saas_billing.manage', scope: 'system' })] }, async (request, reply) => {
    const params = z.object({ tenantId: z.string().uuid(), moduleKey: z.string().min(1).max(80) }).parse(request.params);
    const body = z.object({
      status: z.enum(['available', 'suspended', 'expired', 'revoked']),
      source: z.string().max(120).nullable().optional(),
      startsAt: z.coerce.date().nullable().optional(),
      expiresAt: z.coerce.date().nullable().optional(),
    }).parse(request.body);
    const ctx = getCtx(request);
    const status = await setTenantModuleEntitlement({
      tenantId: params.tenantId,
      actorId: ctx.userId,
      moduleKey: params.moduleKey,
      status: body.status,
      source: body.source,
      startsAt: body.startsAt,
      expiresAt: body.expiresAt,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string | undefined,
    });
    return sendSuccess(reply, status, 'Clinic module entitlement updated');
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

  // Compatibility read endpoint. Provider secrets are intentionally excluded.
  app.get('/api/v1/clinic-settings', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const tenant = await db('tenants').where({ id: tenantId }).select('name', 'settings').first();
    const legacy = asRecord(tenant?.settings);
    const entries = await listEffectiveClinicConfiguration(tenantId, ctxTenantScope(tenantId));
    return sendSuccess(reply, {
      clinicName: legacyValue(entries, LEGACY_FIELD_MAP.clinicName, legacy.clinicName || tenant?.name || ''),
      branch: legacyValue(entries, LEGACY_FIELD_MAP.branch, legacy.branch || ''),
      landPhone: legacyValue(entries, LEGACY_FIELD_MAP.landPhone, legacy.landPhone || ''),
      whatsappPhone: legacyValue(entries, LEGACY_FIELD_MAP.whatsappPhone, legacy.whatsappPhone || ''),
      logoUrl: legacyValue(entries, LEGACY_FIELD_MAP.logoUrl, legacy.logoUrl || ''),
      address: legacyValue(entries, LEGACY_FIELD_MAP.address, legacy.address || ''),
      city: legacyValue(entries, LEGACY_FIELD_MAP.city, legacy.city || ''),
      country: legacyValue(entries, LEGACY_FIELD_MAP.country, legacy.country || ''),
      googleMapsLocation: legacyValue(entries, LEGACY_FIELD_MAP.googleMapsLocation, legacy.googleMapsLocation || ''),
      email: legacyValue(entries, LEGACY_FIELD_MAP.email, legacy.email || ''),
      website: legacyValue(entries, LEGACY_FIELD_MAP.website, legacy.website || ''),
      workingHours: legacyValue(entries, LEGACY_FIELD_MAP.workingHours, legacy.workingHours || ''),
      licenseNumber: legacyValue(entries, LEGACY_FIELD_MAP.licenseNumber, legacy.licenseNumber || ''),
      taxNumber: legacyValue(entries, LEGACY_FIELD_MAP.taxNumber, legacy.taxNumber || ''),
      currency: legacyValue(entries, LEGACY_FIELD_MAP.currency, legacy.currency || DEFAULT_CLINIC_CURRENCY),
      twilioConfigured: Boolean(legacy.twilioAccountSid || legacy.twilioAuthToken || legacy.twilioMessagingServiceSid),
    });
  });

  // Compatibility write endpoint. Only known clinic fields are accepted.
  app.put('/api/v1/clinic-settings', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const ctx = getCtx(request);
    const body = LEGACY_SETTINGS_SCHEMA.parse(request.body) as LegacyClinicSettings;
    const tenant = await db('tenants').where({ id: ctx.tenantId }).select('settings').first();
    const legacy = asRecord(tenant?.settings);

    for (const [field, key] of Object.entries(LEGACY_FIELD_MAP) as [LegacyClinicField, string][]) {
      const value = body[field];
      if (value === undefined) continue;
      await upsertClinicConfiguration({
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        scopeType: 'tenant',
        scopeId: ctx.tenantId,
        key,
        value,
        branchId: ctx.branchId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
      });
      legacy[field] = value;
    }

    await db('tenants').where({ id: ctx.tenantId }).update({
      settings: JSON.stringify(legacy),
      updated_at: new Date(),
    });
    return sendSuccess(reply, null, 'Clinic settings updated');
  });
}

function ctxTenantScope(tenantId: string) {
  return { tenantId, scopeType: 'tenant' as const, scopeId: tenantId };
}
