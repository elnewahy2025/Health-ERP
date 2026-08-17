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

const emrPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'emr_records.tenant_id',
    branchColumn: 'patients.branch_id',
    departmentColumn: 'patients.department_id',
  });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedEmrPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = emr_records.patient_id')
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

const complianceConsentPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'data_consent_logs.tenant_id',
    branchColumn: 'patients.branch_id',
    departmentColumn: 'patients.department_id',
  });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedConsentPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = data_consent_logs.patient_id')
        .andWhere('appointments.tenant_id', principal.tenantId)
        .andWhere('appointments.doctor_id', principal.id);
    });
  }
  return constrained;
};

const hrEmployeePolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'employees.tenant_id',
    branchColumn: 'employees.branch_id',
    departmentColumn: 'employees.department_id',
  });

const hrAttendancePolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'attendance.tenant_id',
    branchColumn: 'employees.branch_id',
    departmentColumn: 'employees.department_id',
  });

const hrLeavePolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'leave_requests.tenant_id',
    branchColumn: 'employees.branch_id',
    departmentColumn: 'employees.department_id',
  });

const pharmacyInventoryPolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'pharmacy_inventory.tenant_id',
    branchColumn: 'pharmacy_inventory.branch_id',
  });

const pharmacyPrescriptionPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'pharmacy_prescriptions.tenant_id',
    branchColumn: 'patients.branch_id',
    departmentColumn: 'patients.department_id',
  });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedPharmacyPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = pharmacy_prescriptions.patient_id')
        .andWhere('appointments.tenant_id', principal.tenantId)
        .andWhere('appointments.doctor_id', principal.id);
    });
  }
  return constrained;
};

const laboratoryPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'lab_orders.tenant_id',
    branchColumn: 'patients.branch_id',
    departmentColumn: 'patients.department_id',
  });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedLabPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = lab_orders.patient_id')
        .andWhere('appointments.tenant_id', principal.tenantId)
        .andWhere('appointments.doctor_id', principal.id);
    });
  }
  return constrained;
};

const radiologyPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'radiology_orders.tenant_id',
    branchColumn: 'patients.branch_id',
    departmentColumn: 'patients.department_id',
  });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedRadiologyPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = radiology_orders.patient_id')
        .andWhere('appointments.tenant_id', principal.tenantId)
        .andWhere('appointments.doctor_id', principal.id);
    });
  }
  return constrained;
};

const inventoryPurchaseOrderPolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'purchase_orders.tenant_id',
    branchColumn: 'warehouses.branch_id',
  });

const inventoryPolicy: ScopePolicy = (qb, principal, scope) =>
  scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'inventory_items.tenant_id',
    branchColumn: 'warehouses.branch_id',
  });

const billingPolicy: ScopePolicy = (qb, principal, scope) => {
  const constrained = scopeQuery(qb, principal, {
    scope,
    tenantColumn: 'invoices.tenant_id',
    branchColumn: 'patients.branch_id',
    departmentColumn: 'patients.department_id',
  });
  if (scope === 'assigned_patients') {
    return constrained.whereExists(function assignedBillingPatients() {
      this.select(1)
        .from('appointments')
        .whereRaw('appointments.patient_id = invoices.patient_id')
        .andWhere('appointments.tenant_id', principal.tenantId)
        .andWhere('appointments.doctor_id', principal.id);
    });
  }
  return constrained;
};

export const SCOPE_POLICIES: Record<string, ScopePolicy> = {
  patients: patientsPolicy,
  appointments: appointmentsPolicy,
  emr: emrPolicy,
  hr: hrEmployeePolicy,
  hr_attendance: hrAttendancePolicy,
  hr_leave: hrLeavePolicy,
  inventory: inventoryPolicy,
  inventory_purchase_orders: inventoryPurchaseOrderPolicy,
  billing: billingPolicy,
  compliance: tenantOnly,
  compliance_consent: complianceConsentPolicy,
  reports: tenantOnly,
  audit: tenantOnly,
  documents: patientsPolicy,
  laboratory: laboratoryPolicy,
  radiology: radiologyPolicy,
  pharmacy: pharmacyPrescriptionPolicy,
  pharmacy_inventory: pharmacyInventoryPolicy,
  pharmacy_prescriptions: pharmacyPrescriptionPolicy,
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
