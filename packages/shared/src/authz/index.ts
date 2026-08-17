/**
 * Authorization catalog — single source of truth for permissions, scopes,
 * and seed roles (see docs/engineering/AUTHORIZATION.md).
 *
 * Every authorization decision is a (permission, scope) pair. Permissions are
 * `module.action` keys. Roles are only a packaging mechanism for grants.
 */

export const PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'reject',
  'export',
  'print',
  'download',
  'manage',
  'assign',
  'cancel',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_SCOPES = [
  'self',
  'assigned_patients',
  'department',
  'branch',
  'branches',
  'tenant',
  'system',
] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export const PERMISSION_EFFECTS = ['ALLOW', 'DENY'] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

export interface Grant {
  permission: string; // module.action | module.* | '*'
  scope: PermissionScope;
  effect?: PermissionEffect;
  source?: 'role' | 'user';
}

export interface RoleTemplate {
  level: 'system' | 'tenant' | 'branch' | 'custom';
  scopeDefault: PermissionScope;
  description?: string;
  /** permission key -> scopes. Supports '*' (all modules) and 'module.*' wildcards. */
  grants: Record<string, readonly PermissionScope[]>;
}

const ALL_ACTIONS: readonly PermissionAction[] = [...PERMISSION_ACTIONS];

/**
 * Module -> actions available for that module.
 * Kept in sync with the authorization matrix in docs/engineering/AUTHORIZATION.md.
 */
export const PERMISSION_CATALOG: Record<string, readonly PermissionAction[]> = {
  patients: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'manage'],
  departments: ['view', 'create', 'edit', 'delete', 'manage'],
  appointments: ['view', 'create', 'edit', 'delete', 'cancel', 'approve', 'export', 'manage'],
  emr: ['view', 'create', 'edit', 'approve', 'export', 'print', 'manage'],
  queue: ['view', 'edit', 'manage'],
  referrals: ['view', 'create', 'edit', 'manage'],
  nursing: ['view', 'create', 'edit', 'manage'],
  home_visits: ['view', 'create', 'edit', 'manage'],
  telemedicine: ['view', 'create', 'edit', 'manage'],
  laboratory: ['view', 'create', 'edit', 'approve', 'reject', 'print', 'export', 'manage'],
  radiology: ['view', 'create', 'edit', 'approve', 'reject', 'print', 'export', 'manage'],
  pharmacy: ['view', 'create', 'edit', 'approve', 'reject', 'print', 'export', 'manage'],
  billing: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'cancel', 'export', 'print', 'manage'],
  insurance: ['view', 'create', 'edit', 'delete', 'approve', 'reject', 'cancel', 'export', 'manage'],
  insurance_claims: ['view', 'create', 'edit', 'approve', 'reject', 'export', 'manage'],
  eta_invoicing: ['view', 'create', 'edit', 'export', 'manage'],
  expenses: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  inventory: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  hr: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  crm: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  dms: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  workflow: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  forms: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  compliance: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  automation: ['view', 'create', 'edit', 'delete', 'export', 'manage'],
  integrations: ['view', 'create', 'edit', 'export', 'manage'],
  bi: ['view', 'export', 'print', 'manage'],
  reports: ['view', 'export', 'print', 'manage'],
  financial_reports: ['view', 'export', 'print', 'manage'],
  compliance_reports: ['view', 'export', 'print', 'manage'],
  advanced_reporting: ['view', 'export', 'print', 'manage'],
  analytics_dashboard: ['view', 'export', 'manage'],
  ai_hub: ['view', 'create', 'manage'],
  clinical_ai: ['view', 'create', 'manage'],
  predictive_analytics: ['view', 'manage'],
  smart_scheduling: ['view', 'create', 'manage'],
  notifications: ['view', 'create', 'manage'],
  communications: ['view', 'create', 'edit', 'delete', 'manage'],
  whatsapp: ['view', 'create', 'edit', 'delete', 'manage'],
  voice_calls: ['view', 'create', 'manage'],
  patient_messages: ['view', 'create', 'edit', 'delete', 'manage'],
  chat: ['view', 'create', 'edit', 'delete', 'manage'],
  patient_portal: ['view', 'manage'],
  online_booking: ['view', 'manage'],
  patient_self_service: ['view', 'manage'],
  users: ['view', 'create', 'edit', 'delete', 'assign', 'manage'],
  roles: ['view', 'create', 'edit', 'delete', 'assign', 'manage'],
  audit: ['view', 'export', 'manage'],
  sessions: ['view', 'delete', 'manage'],
  system_monitor: ['view', 'export', 'manage'],
  settings: ['view', 'edit', 'manage'],
  branches: ['view', 'create', 'edit', 'delete', 'manage'],
  regions: ['view', 'create', 'edit', 'delete', 'manage'],
  saas_billing: ['view', 'export', 'manage'],
  white_label: ['view', 'edit', 'manage'],
  dr_backup: ['view', 'create', 'manage'],
  barcodes: ['view', 'create', 'export', 'manage'],
  data_warehouse: ['view', 'export', 'manage'],
  api_keys: ['view', 'create', 'edit', 'delete', 'manage'],
  developer_portal: ['view', 'export', 'manage'],
  data_export: ['view', 'create', 'export', 'manage'],
  bulk_import: ['view', 'create', 'manage'],
  documents: ['view', 'create', 'edit', 'delete', 'download', 'print', 'manage'],
  emergency_access: ['manage'],
};

export const PERMISSION_MODULES: readonly string[] = Object.keys(PERMISSION_CATALOG);

export function permissionKey(module: string, action: string): string {
  return `${module}.${action}`;
}

export function allPermissionKeys(): string[] {
  const keys: string[] = [];
  for (const [module, actions] of Object.entries(PERMISSION_CATALOG)) {
    for (const action of actions) keys.push(permissionKey(module, action));
  }
  return keys;
}

/** Expand a grant key ('*', 'module.*', or 'module.action') into concrete keys. */
export function expandGrantKey(key: string): string[] {
  if (key === '*') return allPermissionKeys();
  const dot = key.indexOf('.');
  const module = dot === -1 ? key : key.slice(0, dot);
  const action = dot === -1 ? '' : key.slice(dot + 1);
  const actions = PERMISSION_CATALOG[module];
  if (!actions) return [];
  if (!action || action === '*') return actions.map((a) => permissionKey(module, a));
  return [permissionKey(module, action)];
}

export function expandRoleGrants(template: RoleTemplate): Grant[] {
  const grants: Grant[] = [];
  for (const [key, scopes] of Object.entries(template.grants)) {
    for (const scope of scopes) grants.push({ permission: key, scope, effect: 'ALLOW', source: 'role' });
  }
  return grants;
}

/** Return true when a stored key covers a concrete permission request. */
export function permissionKeyMatches(storedKey: string, requestedKey: string): boolean {
  return storedKey === '*' || storedKey === requestedKey ||
    (storedKey.endsWith('.*') && requestedKey.startsWith(`${storedKey.slice(0, -2)}.`));
}

/**
 * Normalize legacy permission keys to the current catalog.
 * Handles both 'module.action' and legacy 'module:action' formats and maps
 * read/update/import onto the current action set.
 */
const LEGACY_ACTION_MAP: Record<string, string> = {
  read: 'view',
  write: 'create',
  update: 'edit',
  remove: 'delete',
  import: 'create',
};

export function normalizeLegacyPermission(key: string): string {
  const k = key.trim();
  if (!k || k === '*') return k;
  const sep = k.includes(':') ? ':' : '.';
  const dot = k.indexOf(sep);
  if (dot === -1) return k;
  const module = k.slice(0, dot);
  const action = k.slice(dot + 1);
  if (!module || !action) return k;
  if (action === '*') return `${module}.*`;
  return `${module}.${LEGACY_ACTION_MAP[action] || action}`;
}

/** Seed roles (system/tenant/branch) with their grant matrix. */
export const SEED_ROLES: Record<string, RoleTemplate> = {
  super_admin: {
    level: 'system',
    scopeDefault: 'system',
    description: 'Full system-wide access',
    grants: { '*': ['system'] },
  },
  admin: {
    level: 'system',
    scopeDefault: 'tenant',
    description: 'Tenant administrator — full access within the tenant (never across tenants)',
    grants: {
      // Tenant-wide access to every catalog module; scope stays tenant (never system),
      // so admins can manage their organization but cannot cross tenant boundaries.
      '*': ['tenant'],
    },
  },
  doctor: {
    level: 'tenant',
    scopeDefault: 'assigned_patients',
    description: 'Physician with access to assigned patients',
    grants: {
      'patients.view': ['assigned_patients'],
      'patients.edit': ['assigned_patients'],
      'appointments.view': ['assigned_patients'],
      'appointments.edit': ['assigned_patients'],
      'emr.*': ['assigned_patients'],
      'laboratory.view': ['assigned_patients'],
      'laboratory.print': ['assigned_patients'],
      'radiology.view': ['assigned_patients'],
      'pharmacy.view': ['assigned_patients'],
      'billing.view': ['assigned_patients'],
      'insurance.view': ['assigned_patients'],
      'chat.view': ['assigned_patients'],
      'chat.create': ['assigned_patients'],
      'documents.view': ['assigned_patients'],
      'documents.download': ['assigned_patients'],
    },
  },
  nurse: {
    level: 'tenant',
    scopeDefault: 'department',
    description: 'Nurse with access to department records',
    grants: {
      'patients.view': ['department'],
      'patients.edit': ['department'],
      'appointments.view': ['department'],
      'emr.view': ['department'],
      'emr.create': ['department'],
      'nursing.*': ['department'],
      'queue.view': ['branch'],
      'queue.edit': ['branch'],
      'laboratory.view': ['department'],
      'pharmacy.view': ['department'],
    },
  },
  receptionist: {
    level: 'tenant',
    scopeDefault: 'branch',
    description: 'Front-desk receptionist',
    grants: {
      'patients.*': ['branch'],
      'appointments.*': ['branch'],
      'billing.view': ['branch'],
      'billing.create': ['branch'],
      'queue.*': ['branch'],
      'insurance.view': ['branch'],
      'communications.view': ['branch'],
      'communications.create': ['branch'],
      'emr.view': ['branch'],
    },
  },
  pharmacist: {
    level: 'tenant',
    scopeDefault: 'branch',
    description: 'Pharmacist',
    grants: {
      'pharmacy.*': ['branch'],
      'patients.view': ['branch'],
      'emr.view': ['branch'],
    },
  },
  lab_tech: {
    level: 'tenant',
    scopeDefault: 'department',
    description: 'Laboratory technician',
    grants: {
      'laboratory.*': ['department'],
      'patients.view': ['department'],
      'emr.view': ['department'],
    },
  },
  radiologist: {
    level: 'tenant',
    scopeDefault: 'department',
    description: 'Radiologist',
    grants: {
      'radiology.*': ['department'],
      'patients.view': ['department'],
      'emr.view': ['department'],
    },
  },
  billing_staff: {
    level: 'tenant',
    scopeDefault: 'branch',
    description: 'Billing staff',
    grants: {
      'billing.*': ['branch'],
      'insurance.view': ['branch'],
      'patients.view': ['branch'],
    },
  },
  accountant: {
    level: 'tenant',
    scopeDefault: 'tenant',
    description: 'Accountant',
    grants: {
      'billing.view': ['tenant'],
      'billing.export': ['tenant'],
      'reports.view': ['tenant'],
      'reports.export': ['tenant'],
      'financial_reports.view': ['tenant'],
      'financial_reports.export': ['tenant'],
    },
  },
  manager: {
    level: 'tenant',
    scopeDefault: 'tenant',
    description: 'Hospital manager',
    grants: {
      'reports.*': ['tenant'],
      'hr.view': ['tenant'],
      'analytics_dashboard.view': ['tenant'],
      'patients.view': ['tenant'],
      'appointments.view': ['tenant'],
      'emr.view': ['tenant'],
    },
  },
  patient: {
    level: 'tenant',
    scopeDefault: 'self',
    description: 'Patient portal user',
    grants: {
      'patients.view': ['self'],
      'appointments.view': ['self'],
      'emr.view': ['self'],
      'laboratory.view': ['self'],
      'radiology.view': ['self'],
      'pharmacy.view': ['self'],
      'billing.view': ['self'],
      'documents.view': ['self'],
      'documents.download': ['self'],
      'notifications.view': ['self'],
      'chat.view': ['self'],
      'chat.create': ['self'],
      'patient_portal.view': ['self'],
    },
  },
};


/**
 * Enterprise hospital role catalog. Existing SEED_ROLES remain the backward-
 * compatible seed slugs; these templates provide stable system-template names
 * for the expanded role-management API without inventing new permission keys.
 */
export const HOSPITAL_ROLE_CATALOG = [
  ['super_administrator', 'Super Administrator', 'system', 'system', 'super_admin'],
  ['tenant_administrator', 'Tenant Administrator', 'system', 'tenant', 'admin'],
  ['hospital_executive', 'Hospital Executive', 'tenant', 'tenant', 'manager'],
  ['hospital_operations_manager', 'Hospital Operations Manager', 'tenant', 'tenant', 'manager'],
  ['branch_manager', 'Branch Manager', 'tenant', 'branch', 'manager'],
  ['department_head', 'Department Head', 'tenant', 'department', 'manager'],
  ['medical_director', 'Medical Director', 'tenant', 'tenant', 'manager'],
  ['physician', 'Physician', 'tenant', 'assigned_patients', 'doctor'],
  ['consultant_physician', 'Consultant Physician', 'tenant', 'assigned_patients', 'doctor'],
  ['resident_physician', 'Resident Physician', 'tenant', 'assigned_patients', 'doctor'],
  ['nurse_manager', 'Nurse Manager', 'tenant', 'department', 'nurse'],
  ['registered_nurse', 'Registered Nurse', 'tenant', 'department', 'nurse'],
  ['nurse_assistant', 'Nurse Assistant', 'tenant', 'assigned_patients', 'nurse'],
  ['pharmacist', 'Pharmacist', 'tenant', 'branch', 'pharmacist'],
  ['pharmacy_technician', 'Pharmacy Technician', 'tenant', 'branch', 'pharmacist'],
  ['laboratory_manager', 'Laboratory Manager', 'tenant', 'department', 'lab_tech'],
  ['laboratory_technician', 'Laboratory Technician', 'tenant', 'department', 'lab_tech'],
  ['radiology_manager', 'Radiology Manager', 'tenant', 'department', 'radiologist'],
  ['radiologist', 'Radiologist', 'tenant', 'department', 'radiologist'],
  ['radiology_technician', 'Radiology Technician', 'tenant', 'department', 'radiologist'],
  ['medical_records_officer', 'Medical Records Officer', 'tenant', 'department', 'nurse'],
  ['medical_coder', 'Medical Coder', 'tenant', 'department', 'billing_staff'],
  ['receptionist', 'Receptionist', 'tenant', 'branch', 'receptionist'],
  ['appointment_coordinator', 'Appointment Coordinator', 'tenant', 'branch', 'receptionist'],
  ['triage_officer', 'Triage Officer', 'tenant', 'branch', 'nurse'],
  ['billing_manager', 'Billing Manager', 'tenant', 'branch', 'billing_staff'],
  ['billing_officer', 'Billing Officer', 'tenant', 'branch', 'billing_staff'],
  ['accountant', 'Accountant', 'tenant', 'tenant', 'accountant'],
  ['insurance_manager', 'Insurance Manager', 'tenant', 'tenant', 'accountant'],
  ['insurance_claims_officer', 'Insurance Claims Officer', 'tenant', 'branch', 'billing_staff'],
  ['hr_manager', 'HR Manager', 'tenant', 'tenant', 'manager'],
  ['hr_officer', 'HR Officer', 'tenant', 'department', 'manager'],
  ['inventory_manager', 'Inventory Manager', 'tenant', 'branch', 'manager'],
  ['procurement_officer', 'Procurement Officer', 'tenant', 'branch', 'manager'],
  ['compliance_officer', 'Compliance Officer', 'tenant', 'tenant', 'manager'],
  ['reporting_bi_analyst', 'Reporting and BI Analyst', 'tenant', 'tenant', 'accountant'],
  ['it_system_administrator', 'IT/System Administrator', 'tenant', 'tenant', 'admin'],
  ['patient_portal_administrator', 'Patient Portal Administrator', 'tenant', 'tenant', 'admin'],
  ['patient_portal_user', 'Patient Portal User', 'tenant', 'self', 'patient'],
] as const;

export function hospitalRoleTemplate(slug: string): RoleTemplate | null {
  const entry = HOSPITAL_ROLE_CATALOG.find(([catalogSlug]) => catalogSlug === slug);
  if (!entry) return null;
  const [, , level, scopeDefault, baseSlug] = entry;
  const base = SEED_ROLES[baseSlug];
  if (!base) return null;
  return { ...base, level: level as RoleTemplate['level'], scopeDefault: scopeDefault as PermissionScope };
}
