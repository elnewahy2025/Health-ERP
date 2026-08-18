import { ForbiddenError, ValidationError } from '@healthcare/shared/errors';
import {
  CLINIC_CORE_MODULES,
  CLINIC_CONFIGURATION_REGISTRY,
  CLINIC_MODULE_CATALOG,
  isClinicModuleKey,
} from '@healthcare/shared';
import type { ClinicModuleKey } from '@healthcare/shared';
import { normalizeLegacyPermission } from '@healthcare/shared/authz';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';
import {
  listEffectiveClinicConfiguration,
} from './clinic-configuration.js';
import type { EffectiveClinicConfigurationEntry } from './clinic-configuration.js';

interface EntitlementRow {
  module_key: string;
  status: string;
  source: string | null;
  starts_at: Date | string | null;
  expires_at: Date | string | null;
}

interface SubscriptionPlanRow {
  plan_slug: string | null;
  plan_modules: unknown;
  subscription_status: string | null;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
}

interface ActivationRow {
  module_key: string;
  status: string;
  config_version: number | null;
  last_validation_status: string;
  last_validation_errors: unknown;
  activated_at: Date | string | null;
}

export interface ModuleConfigurationValidation {
  status: 'valid' | 'incomplete';
  errors: string[];
}

export interface TenantModuleStatus {
  moduleKey: ClinicModuleKey;
  core: boolean;
  entitled: boolean;
  entitlementStatus: string | null;
  entitlementSource: string | null;
  activationStatus: string;
  configVersion: number | null;
  validationStatus: string;
  validationErrors: unknown;
  activatedAt: Date | string | null;
}

function isActiveEntitlement(row: EntitlementRow | undefined, now = new Date()): boolean {
  if (!row || row.status !== 'available') return false;
  if (row.starts_at && new Date(row.starts_at) > now) return false;
  if (row.expires_at && new Date(row.expires_at) <= now) return false;
  return true;
}

function isActiveSubscription(row: SubscriptionPlanRow | undefined, now = new Date()): boolean {
  if (!row || !['active', 'trial'].includes(row.subscription_status || '')) return false;
  if (row.current_period_start && new Date(row.current_period_start) > now) return false;
  if (row.current_period_end && new Date(row.current_period_end) <= now) return false;
  return true;
}

function normalizePlanModules(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((module): module is string => typeof module === 'string');
  if (typeof value === 'string') {
    try {
      return normalizePlanModules(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

const PLAN_MODULE_ALIASES: Record<string, string> = {
  patient: 'patients',
  appointment: 'appointments',
  report: 'reports',
};

function planIncludesModule(plan: SubscriptionPlanRow | undefined, moduleKey: string): boolean {
  if (!plan || !isActiveSubscription(plan)) return false;
  const modules = normalizePlanModules(plan.plan_modules);
  return modules.includes('*') || modules.some((module) => (PLAN_MODULE_ALIASES[module] || module) === moduleKey);
}

function isMissingConfigurationValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

export function validateModuleConfiguration(
  moduleKey: string,
  entries: EffectiveClinicConfigurationEntry[],
): ModuleConfigurationValidation {
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const requiredDefinitions = CLINIC_CONFIGURATION_REGISTRY.filter((definition) =>
    definition.requiredFor.includes(moduleKey) ||
    ((CLINIC_CORE_MODULES as readonly string[]).includes(moduleKey) && definition.requiredFor.includes('core')),
  );
  const errors = requiredDefinitions
    .filter((definition) => isMissingConfigurationValue(entryByKey.get(definition.key)?.value))
    .map((definition) => definition.key);
  return { status: errors.length === 0 ? 'valid' : 'incomplete', errors };
}

const PERMISSION_MODULE_PREFIXES: ReadonlyArray<readonly [string, ClinicModuleKey]> = [
  ['patients.', 'patients'],
  ['appointments.', 'appointments'],
  ['emr.', 'emr'],
  ['documents.', 'documents'],
  ['reports.', 'reports'],
  ['notifications.', 'notifications'],
  ['communications.', 'communications'],
  ['settings.', 'settings'],
  ['billing.', 'billing'],
  ['pharmacy.', 'pharmacy'],
  ['laboratory.', 'laboratory'],
  ['radiology.', 'radiology'],
  ['nursing.', 'nursing'],
  ['inventory.', 'inventory'],
  ['insurance.', 'insurance'],
  ['insurance_claims.', 'insurance_claims'],
  ['hr.', 'hr'],
  ['crm.', 'crm'],
  ['patient_portal.', 'patient_portal'],
  ['online_booking.', 'online_booking'],
  ['integrations.', 'integrations'],
  ['advanced_reporting.', 'advanced_reporting'],
  ['bi.', 'bi'],
  ['automation.', 'automation'],
];

export function clinicModuleForPermission(permission: string): ClinicModuleKey | undefined {
  const canonicalPermission = normalizeLegacyPermission(permission);
  return PERMISSION_MODULE_PREFIXES.find(([prefix]) => canonicalPermission.startsWith(prefix))?.[1];
}

export async function enforceClinicModuleForPermission(tenantId: string, permission: string): Promise<void> {
  const moduleKey = clinicModuleForPermission(permission);
  if (!moduleKey || (CLINIC_CORE_MODULES as readonly string[]).includes(moduleKey)) return;

  const status = (await listTenantModules(tenantId)).find((module) => module.moduleKey === moduleKey);
  if (!status || !status.entitled) {
    throw new ForbiddenError(`Clinic module ${moduleKey} is not available for this tenant`);
  }
  if (status.activationStatus !== 'enabled') {
    throw new ForbiddenError(`Clinic module ${moduleKey} is not active for this tenant`);
  }
}

export async function listTenantModules(tenantId: string): Promise<TenantModuleStatus[]> {
  const [entitlements, activations, configuration, subscription] = await Promise.all([
    db('tenant_module_entitlements').where({ tenant_id: tenantId }).select(
      'module_key', 'status', 'source', 'starts_at', 'expires_at',
    ),
    db('tenant_module_activations').where({ tenant_id: tenantId }).select(
      'module_key', 'status', 'config_version', 'last_validation_status', 'last_validation_errors', 'activated_at',
    ),
    listEffectiveClinicConfiguration(tenantId),
    db('tenant_subscriptions')
      .where({ 'tenant_subscriptions.tenant_id': tenantId })
      .leftJoin('subscription_plans', 'tenant_subscriptions.plan_id', 'subscription_plans.id')
      .select(
        'subscription_plans.slug as plan_slug',
        'subscription_plans.modules as plan_modules',
        'tenant_subscriptions.status as subscription_status',
        'tenant_subscriptions.current_period_start',
        'tenant_subscriptions.current_period_end',
      )
      .first() as Promise<SubscriptionPlanRow | undefined>,
  ]);
  const entitlementByKey = new Map((entitlements as EntitlementRow[]).map((row) => [row.module_key, row]));
  const activationByKey = new Map((activations as ActivationRow[]).map((row) => [row.module_key, row]));
  const core = new Set<string>(CLINIC_CORE_MODULES);

  return CLINIC_MODULE_CATALOG.map((moduleKey) => {
    const entitlement = entitlementByKey.get(moduleKey);
    const activation = activationByKey.get(moduleKey);
    const validation = validateModuleConfiguration(moduleKey, configuration);
    const explicitEntitled = isActiveEntitlement(entitlement);
    const planEntitled = !entitlement && planIncludesModule(subscription, moduleKey);
    const entitled = explicitEntitled || planEntitled;
    const activationStatus = activation?.status === 'disabled'
      ? 'disabled'
      : activation && validation.status === 'valid'
        ? 'enabled'
        : activation
          ? 'setup_required'
          : 'disabled';
    return {
      moduleKey,
      core: core.has(moduleKey),
      entitled,
      entitlementStatus: entitlement?.status || (planEntitled ? 'available' : null),
      entitlementSource: entitlement?.source || (planEntitled ? `subscription:${subscription?.plan_slug || 'active'}` : null),
      activationStatus,
      configVersion: activation?.config_version ?? null,
      validationStatus: validation.status,
      validationErrors: validation.errors,
      activatedAt: activation?.activated_at || null,
    };
  });
}

export interface TenantModuleEntitlementInput {
  tenantId: string;
  actorId: string;
  moduleKey: string;
  status: 'available' | 'suspended' | 'expired' | 'revoked';
  source?: string | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  ipAddress?: string;
  userAgent?: string | null;
}

export async function setTenantModuleEntitlement(input: TenantModuleEntitlementInput): Promise<TenantModuleStatus> {
  if (!isClinicModuleKey(input.moduleKey)) {
    throw new ValidationError(`Unknown clinic module: ${input.moduleKey}`);
  }
  if ((CLINIC_CORE_MODULES as readonly string[]).includes(input.moduleKey) && input.status !== 'available') {
    throw new ForbiddenError(`Core clinic module ${input.moduleKey} must remain available`);
  }
  if (input.startsAt && input.expiresAt && input.expiresAt <= input.startsAt) {
    throw new ValidationError('Entitlement expiry must be after its start');
  }

  await db('tenant_module_entitlements')
    .insert({
      tenant_id: input.tenantId,
      module_key: input.moduleKey,
      status: input.status,
      source: input.source || null,
      starts_at: input.startsAt || null,
      expires_at: input.expiresAt || null,
      updated_by: input.actorId,
      updated_at: db.fn.now(),
    })
    .onConflict(['tenant_id', 'module_key'])
    .merge({
      status: input.status,
      source: input.source || null,
      starts_at: input.startsAt || null,
      expires_at: input.expiresAt || null,
      updated_by: input.actorId,
      updated_at: db.fn.now(),
    });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'clinic_module.entitlement_updated',
    entityType: 'tenant_module_entitlement',
    branchId: undefined,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
    metadata: {
      moduleKey: input.moduleKey,
      status: input.status,
      source: input.source || null,
      startsAt: input.startsAt?.toISOString() || null,
      expiresAt: input.expiresAt?.toISOString() || null,
    },
  });

  const status = (await listTenantModules(input.tenantId)).find((module) => module.moduleKey === input.moduleKey);
  if (!status) throw new ValidationError(`Clinic module ${input.moduleKey} could not be reloaded`);
  return status;
}

export async function setTenantModuleActivation(input: {
  tenantId: string;
  actorId: string;
  moduleKey: string;
  enabled: boolean;
  branchId?: string;
  ipAddress?: string;
  userAgent?: string | null;
}): Promise<TenantModuleStatus> {
  if (!isClinicModuleKey(input.moduleKey)) {
    throw new ValidationError(`Unknown clinic module: ${input.moduleKey}`);
  }

  if (!input.enabled && (CLINIC_CORE_MODULES as readonly string[]).includes(input.moduleKey)) {
    throw new ForbiddenError(`Core clinic module ${input.moduleKey} cannot be disabled`);
  }

  const configuration = await listEffectiveClinicConfiguration(input.tenantId);
  const validation = validateModuleConfiguration(input.moduleKey, configuration);
  const entitlement = await db('tenant_module_entitlements')
    .where({ tenant_id: input.tenantId, module_key: input.moduleKey })
    .first() as EntitlementRow | undefined;
  const subscription = await db('tenant_subscriptions')
    .where({ 'tenant_subscriptions.tenant_id': input.tenantId })
    .leftJoin('subscription_plans', 'tenant_subscriptions.plan_id', 'subscription_plans.id')
    .select(
      'subscription_plans.slug as plan_slug',
      'subscription_plans.modules as plan_modules',
      'tenant_subscriptions.status as subscription_status',
      'tenant_subscriptions.current_period_start',
      'tenant_subscriptions.current_period_end',
    )
    .first() as SubscriptionPlanRow | undefined;
  if (input.enabled && !isActiveEntitlement(entitlement) && !(entitlement === undefined && planIncludesModule(subscription, input.moduleKey))) {
    throw new ForbiddenError(`Clinic module ${input.moduleKey} is not available for this tenant`);
  }

  await db.transaction(async (trx) => {
    const existing = await trx('tenant_module_activations')
      .where({ tenant_id: input.tenantId, module_key: input.moduleKey })
      .first();
    const now = trx.fn.now();
    const status = input.enabled
      ? (validation.status === 'valid' ? 'enabled' : 'setup_required')
      : 'disabled';
    const update = {
      status,
      ...(input.enabled
        ? { activated_by: input.actorId, activated_at: now, disabled_by: null, disabled_at: null }
        : { disabled_by: input.actorId, disabled_at: now }),
      config_version: validation.status === 'valid' ? 1 : null,
      last_validation_status: validation.status,
      last_validation_errors: JSON.stringify(validation.errors),
      updated_at: now,
    };

    if (existing) {
      await trx('tenant_module_activations').where({ id: existing.id }).update(update);
    } else {
      await trx('tenant_module_activations').insert({
        tenant_id: input.tenantId,
        module_key: input.moduleKey,
        ...update,
        last_validation_status: validation.status,
        last_validation_errors: JSON.stringify(validation.errors),
      });
    }
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: input.enabled ? 'clinic_module.enabled' : 'clinic_module.disabled',
    entityType: 'tenant_module_activation',
    branchId: input.branchId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
    metadata: { moduleKey: input.moduleKey },
  });

  const modules = await listTenantModules(input.tenantId);
  const status = modules.find((module) => module.moduleKey === input.moduleKey);
  if (!status) throw new ValidationError(`Clinic module ${input.moduleKey} could not be reloaded`);
  return status;
}
