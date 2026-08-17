import type { Knex } from 'knex';
import type { PermissionScope } from '@healthcare/shared/authz';
import { scopeQuery, type Principal } from './authorization.js';

type ScopePolicy = (qb: Knex.QueryBuilder, principal: Principal, scope: PermissionScope) => Knex.QueryBuilder;

const tenantOnly = (qb: Knex.QueryBuilder, principal: Principal, scope: PermissionScope) =>
  scopeQuery(qb, principal, { scope, tenantColumn: 'tenant_id' });

const patientsPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, { scope, tenantColumn: 'tenant_id', branchColumn: 'branch_id', departmentColumn: 'department_id' });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = patients.id')
        .andWhere('appointments.tenant_id', principal.tenantId)
        .andWhere('appointments.doctor_id', principal.id);
    });
  }
  return constrained;
};

const appointmentsPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, { scope, tenantColumn: 'tenant_id', branchColumn: 'branch_id' });
  if (scope === 'assigned_patients') return constrained.andWhere('doctor_id', principal.id);
  return constrained;
};

const departmentPolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, { scope, tenantColumn: 'tenant_id', departmentColumn: 'department_id' });

const branchPolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, { scope, tenantColumn: 'tenant_id', branchColumn: 'branch_id' });

export const SCOPE_POLICIES: Record<string, ScopePolicy> = {
  patients: patientsPolicy,
  appointments: appointmentsPolicy,
  hr: departmentPolicy,
  inventory: branchPolicy,
  billing: branchPolicy,
  finance: tenantOnly,
  reports: tenantOnly,
  audit: tenantOnly,
  documents: patientsPolicy,
  laboratory: departmentPolicy,
  radiology: departmentPolicy,
  pharmacy: branchPolicy,
};

/** Apply the policy for a module; unknown modules fail closed to tenant scope. */
export function applyScopePolicy(
  module: string,
  qb: Knex.QueryBuilder,
  principal: Principal,
  scope: PermissionScope,
): Knex.QueryBuilder {
  const policy = SCOPE_POLICIES[module] || tenantOnly;
  return policy(qb, principal, scope);
}
