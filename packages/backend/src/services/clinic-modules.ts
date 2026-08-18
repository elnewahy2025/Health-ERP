import { ForbiddenError, ValidationError } from '@healthcare/shared/errors';
import {
  CLINIC_CORE_MODULES,
  CLINIC_CONFIGURATION_REGISTRY,
  CLINIC_MODULE_CATALOG,
  isClinicModuleKey,
} from '@healthcare/shared';
import type { ClinicModuleKey } from '@healthcare/shared';
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

export async function listTenantModules(tenantId: string): Promise<TenantModuleStatus[]> {
  const [entitlements, activations, configuration] = await Promise.all([
    db('tenant_module_entitlements').where({ tenant_id: tenantId }).select(
      'module_key', 'status', 'source', 'starts_at', 'expires_at',
    ),
    db('tenant_module_activations').where({ tenant_id: tenantId }).select(
      'module_key', 'status', 'config_version', 'last_validation_status', 'last_validation_errors', 'activated_at',
    ),
    listEffectiveClinicConfiguration(tenantId),
  ]);
  const entitlementByKey = new Map((entitlements as EntitlementRow[]).map((row) => [row.module_key, row]));
  const activationByKey = new Map((activations as ActivationRow[]).map((row) => [row.module_key, row]));
  const core = new Set<string>(CLINIC_CORE_MODULES);

  return CLINIC_MODULE_CATALOG.map((moduleKey) => {
    const entitlement = entitlementByKey.get(moduleKey);
    const activation = activationByKey.get(moduleKey);
    const validation = validateModuleConfiguration(moduleKey, configuration);
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
      entitled: isActiveEntitlement(entitlement),
      entitlementStatus: entitlement?.status || null,
      entitlementSource: entitlement?.source || null,
      activationStatus,
      configVersion: activation?.config_version ?? null,
      validationStatus: validation.status,
      validationErrors: validation.errors,
      activatedAt: activation?.activated_at || null,
    };
  });
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
  if (input.enabled && !isActiveEntitlement(entitlement)) {
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
