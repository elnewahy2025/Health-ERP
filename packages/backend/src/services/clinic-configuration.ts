import { ConflictError, ForbiddenError, ValidationError } from '@healthcare/shared/errors';
import {
  clinicConfigurationDefinition,
  CLINIC_CONFIGURATION_REGISTRY,
  validateClinicWorkingHours,
} from '@healthcare/shared';
import type {
  ClinicConfigurationDefinition,
  ClinicConfigurationScope,
} from '@healthcare/shared';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';

export interface ClinicConfigurationScopeRef {
  scopeType: ClinicConfigurationScope;
  scopeId: string;
}

export interface ClinicConfigurationScopeContext {
  branchId?: string;
  departmentId?: string;
}

export interface EffectiveClinicConfigurationEntry {
  key: string;
  value: unknown;
  scopeType: ClinicConfigurationScope | 'default';
  scopeId: string | null;
  version: number | null;
  definition: ClinicConfigurationDefinition;
}

interface ClinicConfigurationRow {
  key: string;
  value_json: unknown;
  scope_type: ClinicConfigurationScope;
  scope_id: string;
  version: number | string;
}

export interface UpsertClinicConfigurationInput extends ClinicConfigurationScopeRef {
  tenantId: string;
  actorId: string;
  key: string;
  value: unknown;
  expectedVersion?: number;
  branchId?: string;
  ipAddress?: string;
  userAgent?: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateValue(definition: ClinicConfigurationDefinition, value: unknown): void {
  if (definition.valueType === 'string' && typeof value !== 'string') {
    throw new ValidationError(`${definition.key} must be a string`);
  }
  if (definition.valueType === 'boolean' && typeof value !== 'boolean') {
    throw new ValidationError(`${definition.key} must be a boolean`);
  }
  if (definition.valueType === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new ValidationError(`${definition.key} must be a finite number`);
  }
  if (definition.valueType === 'json' && value === undefined) {
    throw new ValidationError(`${definition.key} must contain a JSON value`);
  }
  if (definition.key === 'clinic.operations.working_hours') {
    const errors = validateClinicWorkingHours(value);
    if (errors.length > 0) {
      throw new ValidationError(`${definition.key} is invalid: ${errors[0].message}`);
    }
  }
}

function assertAllowedScope(definition: ClinicConfigurationDefinition, scopeType: ClinicConfigurationScope): void {
  if (!definition.allowedScopes.includes(scopeType)) {
    throw new ForbiddenError(`Configuration key ${definition.key} cannot be set at ${scopeType} scope`);
  }
}

async function assertScopeBelongsToTenant(tenantId: string, scope: ClinicConfigurationScopeRef): Promise<void> {
  if (scope.scopeType === 'tenant') {
    if (scope.scopeId !== tenantId) {
      throw new ForbiddenError('Tenant configuration scope does not match the authenticated tenant');
    }
    return;
  }

  const table = scope.scopeType === 'branch' ? 'branches' : 'departments';
  const row = await db(table).where({ id: scope.scopeId, tenant_id: tenantId }).select('id').first();
  if (!row) {
    throw new ForbiddenError(`Configuration ${scope.scopeType} does not belong to the authenticated tenant`);
  }
}

export function clinicConfigurationScopeChain(
  tenantId: string,
  scope: ClinicConfigurationScopeRef,
  context: ClinicConfigurationScopeContext = {},
): ClinicConfigurationScopeRef[] {
  const chain: ClinicConfigurationScopeRef[] = [{ scopeType: 'tenant', scopeId: tenantId }];
  const branchId = context.branchId || (scope.scopeType === 'branch' ? scope.scopeId : undefined);
  const departmentId = context.departmentId || (scope.scopeType === 'department' ? scope.scopeId : undefined);
  if (branchId) chain.push({ scopeType: 'branch', scopeId: branchId });
  if (departmentId) chain.push({ scopeType: 'department', scopeId: departmentId });
  return chain;
}

function normalizeStoredValue(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export async function listEffectiveClinicConfiguration(
  tenantId: string,
  scope: ClinicConfigurationScopeRef = { scopeType: 'tenant', scopeId: tenantId },
  context: ClinicConfigurationScopeContext = {},
): Promise<EffectiveClinicConfigurationEntry[]> {
  await assertScopeBelongsToTenant(tenantId, scope);
  if (context.branchId && !(scope.scopeType === 'branch' && scope.scopeId === context.branchId)) {
    await assertScopeBelongsToTenant(tenantId, { scopeType: 'branch', scopeId: context.branchId });
  }
  if (context.departmentId && !(scope.scopeType === 'department' && scope.scopeId === context.departmentId)) {
    await assertScopeBelongsToTenant(tenantId, { scopeType: 'department', scopeId: context.departmentId });
  }
  const chain = clinicConfigurationScopeChain(tenantId, scope, context);
  const rows = await db('clinic_config_entries')
    .where({ tenant_id: tenantId })
    .whereIn('scope_type', chain.map((entry) => entry.scopeType))
    .whereIn('scope_id', chain.map((entry) => entry.scopeId))
    .select('key', 'value_json', 'scope_type', 'scope_id', 'version');

  const byKey = new Map<string, EffectiveClinicConfigurationEntry>();
  for (const definition of CLINIC_CONFIGURATION_REGISTRY) {
    if (definition.defaultValue !== undefined) {
      byKey.set(definition.key, {
        key: definition.key,
        value: definition.defaultValue,
        scopeType: 'default',
        scopeId: null,
        version: null,
        definition,
      });
    }
  }

  for (const currentScope of chain) {
    for (const row of (rows as ClinicConfigurationRow[]).filter((candidate) => candidate.scope_type === currentScope.scopeType && candidate.scope_id === currentScope.scopeId)) {
      const definition = clinicConfigurationDefinition(row.key);
      if (!definition) continue;
      byKey.set(row.key, {
        key: row.key,
        value: normalizeStoredValue(row.value_json),
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        version: Number(row.version),
        definition,
      });
    }
  }

  return Array.from(byKey.values()).sort((left, right) => left.key.localeCompare(right.key));
}

export async function upsertClinicConfiguration(input: UpsertClinicConfigurationInput): Promise<EffectiveClinicConfigurationEntry> {
  const definition = clinicConfigurationDefinition(input.key);
  if (!definition) throw new ValidationError(`Unknown clinic configuration key: ${input.key}`);
  assertAllowedScope(definition, input.scopeType);
  validateValue(definition, input.value);
  await assertScopeBelongsToTenant(input.tenantId, input);

  const result = await db.transaction(async (trx) => {
    const existing = await trx('clinic_config_entries')
      .where({
        tenant_id: input.tenantId,
        scope_type: input.scopeType,
        scope_id: input.scopeId,
        key: input.key,
      })
      .first();

    if (existing && input.expectedVersion !== undefined && Number(existing.version) !== input.expectedVersion) {
      throw new ConflictError(`Configuration ${input.key} has changed; reload before saving`);
    }

    if (existing) {
      const nextVersion = Number(existing.version) + 1;
      await trx('clinic_config_entries')
        .where({ id: existing.id })
        .update({
          value_json: JSON.stringify(input.value),
          version: nextVersion,
          updated_by: input.actorId,
          updated_at: trx.fn.now(),
        });
      return { id: existing.id, version: nextVersion };
    }

    const [created] = await trx('clinic_config_entries')
      .insert({
        tenant_id: input.tenantId,
        scope_type: input.scopeType,
        scope_id: input.scopeId,
        key: input.key,
        value_json: JSON.stringify(input.value),
        version: 1,
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .returning(['id', 'version']);
    return { id: created.id, version: Number(created.version) };
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.actorId,
    action: 'clinic_configuration.updated',
    entityType: 'clinic_config_entry',
    entityId: result.id,
    branchId: input.branchId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    result: 'success',
    metadata: {
      key: input.key,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      version: result.version,
      sensitive: Boolean(definition.sensitive || definition.secret),
    },
  });

  const entries = await listEffectiveClinicConfiguration(input.tenantId, {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  });
  const saved = entries.find((entry) => entry.key === input.key);
  if (!saved) throw new ValidationError(`Configuration ${input.key} could not be reloaded after saving`);
  return saved;
}

export interface DeleteClinicConfigurationInput extends ClinicConfigurationScopeRef {
  tenantId: string;
  actorId: string;
  key: string;
  expectedVersion?: number;
  branchId?: string;
  ipAddress?: string;
  userAgent?: string | null;
}

export async function deleteClinicConfiguration(input: DeleteClinicConfigurationInput): Promise<EffectiveClinicConfigurationEntry | null> {
  const definition = clinicConfigurationDefinition(input.key);
  if (!definition) throw new ValidationError(`Unknown clinic configuration key: ${input.key}`);
  assertAllowedScope(definition, input.scopeType);
  await assertScopeBelongsToTenant(input.tenantId, input);

  const deleted = await db.transaction(async (trx) => {
    const existing = await trx('clinic_config_entries').where({
      tenant_id: input.tenantId,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      key: input.key,
    }).first();
    if (!existing) return false;
    if (input.expectedVersion !== undefined && Number(existing.version) !== input.expectedVersion) {
      throw new ConflictError(`Configuration ${input.key} has changed; reload before resetting`);
    }
    await trx('clinic_config_entries').where({ id: existing.id }).delete();
    return true;
  });

  if (deleted) {
    await logAudit({
      tenantId: input.tenantId,
      userId: input.actorId,
      action: 'clinic_configuration.reset',
      entityType: 'clinic_config_entry',
      branchId: input.branchId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      result: 'success',
      metadata: { key: input.key, scopeType: input.scopeType, scopeId: input.scopeId },
    });
  }

  const entries = await listEffectiveClinicConfiguration(input.tenantId, {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  });
  return entries.find((entry) => entry.key === input.key) || null;
}

export function validateConfigurationShape(value: unknown): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) throw new ValidationError('Configuration payload must be an object');
}
