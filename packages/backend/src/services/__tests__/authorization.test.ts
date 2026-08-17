import { describe, it, expect } from 'vitest';
import type { Principal } from '../authorization.js';
import {
  scopeCovers,
  hasPermission,
  anyPermission,
  uniquePermissionKeys,
  patientAccessByScope,
} from '../authorization.js';
import {
  allPermissionKeys,
  expandGrantKey,
  normalizeLegacyPermission,
  PERMISSION_CATALOG,
} from '@healthcare/shared/authz';

function principal(grants: Principal['grants'], roles: string[] = []): Principal {
  return {
    kind: 'user',
    id: 'u1',
    tenantId: 't1',
    roles,
    grants,
    branches: ['b1'],
    departmentId: 'd1',
    locale: 'en',
    permVersion: 0,
    status: 'active',
  };
}

describe('scopeCovers', () => {
  it('a broader scope covers a narrower one', () => {
    expect(scopeCovers('tenant', 'branch')).toBe(true);
    expect(scopeCovers('branches', 'branch')).toBe(true);
    expect(scopeCovers('system', 'tenant')).toBe(true);
    expect(scopeCovers('department', 'department')).toBe(true);
  });

  it('a narrower scope never covers a broader one', () => {
    expect(scopeCovers('branch', 'tenant')).toBe(false);
    expect(scopeCovers('department', 'branch')).toBe(false);
    expect(scopeCovers('self', 'assigned_patients')).toBe(false);
  });
});

describe('hasPermission', () => {
  it('allows an exact permission without scope', () => {
    const p = principal([{ permission: 'patients.view', scope: 'branch' }]);
    expect(hasPermission(p, 'patients.view')).toBe(true);
    expect(hasPermission(p, 'patients.edit')).toBe(false);
  });

  it('super_admin wildcard passes everything', () => {
    const p = principal([{ permission: '*', scope: 'system' }], ['super_admin']);
    expect(hasPermission(p, 'users.manage')).toBe(true);
    expect(hasPermission(p, 'emergency_access.manage', 'system')).toBe(true);
  });

  it('matches module wildcards without expanding storage', () => {
    const p = principal([{ permission: 'patients.*', scope: 'branch' }]);
    expect(hasPermission(p, 'patients.view', 'branch')).toBe(true);
    expect(hasPermission(p, 'patients.delete', 'branch')).toBe(true);
    expect(hasPermission(p, 'billing.view', 'branch')).toBe(false);
  });

  it('explicit denial overrides a matching allow', () => {
    const p = principal([{ permission: 'patients.*', scope: 'tenant' }]);
    p.denials = [{ permission: 'patients.delete', scope: 'tenant', effect: 'DENY', source: 'user' }];
    expect(hasPermission(p, 'patients.view', 'branch')).toBe(true);
    expect(hasPermission(p, 'patients.delete', 'branch')).toBe(false);
  });

  it('scope must cover the requested scope', () => {
    const p = principal([
      { permission: 'patients.view', scope: 'branch' },
      { permission: 'emr.view', scope: 'tenant' },
    ]);
    expect(hasPermission(p, 'patients.view', 'branch')).toBe(true);
    expect(hasPermission(p, 'patients.view', 'tenant')).toBe(false);
    expect(hasPermission(p, 'emr.view', 'branch')).toBe(true);
  });

  it('denies unknown permissions and empty grants', () => {
    expect(hasPermission(principal([]), 'patients.view')).toBe(false);
    expect(hasPermission(principal([]), 'patients.view', 'tenant')).toBe(false);
  });
});

describe('anyPermission', () => {
  it('returns true when any permission matches', () => {
    const p = principal([{ permission: 'billing.view', scope: 'branch' }]);
    expect(anyPermission(p, ['patients.view', 'billing.view'])).toBe(true);
    expect(anyPermission(p, ['patients.view', 'hr.view'])).toBe(false);
  });
});

describe('uniquePermissionKeys', () => {
  it('dedupes and sorts keys', () => {
    const grants = [
      { permission: 'billing.view', scope: 'branch' as const },
      { permission: 'patients.view', scope: 'tenant' as const },
      { permission: 'billing.view', scope: 'tenant' as const },
    ];
    expect(uniquePermissionKeys(grants)).toEqual(['billing.view', 'patients.view']);
  });
});

describe('patientAccessByScope', () => {
  const patient = { id: 'p1', tenant_id: 't1', branch_id: 'b1' };

  it('denies cross-tenant access even with tenant scope', () => {
    const p = principal([{ permission: 'patients.view', scope: 'tenant' }]);
    expect(patientAccessByScope(p, { ...patient, tenant_id: 't2' })).toBe(false);
  });

  it('allows tenant and system scopes', () => {
    expect(patientAccessByScope(principal([{ permission: 'patients.view', scope: 'tenant' }]), patient)).toBe(true);
    expect(patientAccessByScope(principal([{ permission: 'patients.view', scope: 'system' }]), patient)).toBe(true);
  });

  it('allows branch scope only when the patient belongs to an assigned branch', () => {
    const branchScoped = principal([{ permission: 'patients.view', scope: 'branch' }], []);
    expect(patientAccessByScope(branchScoped, patient)).toBe(true);
    expect(patientAccessByScope(branchScoped, { ...patient, branch_id: 'b-other' })).toBe(false);
    expect(patientAccessByScope(branchScoped, { ...patient, branch_id: null })).toBe(false);
  });

  it('denies when no grant scope covers the patient', () => {
    const assigned = principal([{ permission: 'patients.view', scope: 'assigned_patients' }]);
    expect(patientAccessByScope(assigned, patient)).toBe(true); // assignment resolved separately
    expect(patientAccessByScope(principal([{ permission: 'patients.view', scope: 'department' }]), patient)).toBe(false);
    expect(patientAccessByScope(principal([]), patient)).toBe(false);
  });
});

describe('shared permission catalog', () => {
  it('expands module wildcards and bare modules', () => {
    expect(expandGrantKey('patients.*')).toContain('patients.view');
    expect(expandGrantKey('patients.*')).toContain('patients.manage');
    expect(expandGrantKey('patients.view')).toEqual(['patients.view']);
    expect(expandGrantKey('patients')).toContain('patients.view');
  });

  it('normalizes legacy keys to the current catalog', () => {
    expect(normalizeLegacyPermission('patients:read')).toBe('patients.view');
    expect(normalizeLegacyPermission('billing:update')).toBe('billing.edit');
    expect(normalizeLegacyPermission('emr:import')).toBe('emr.create');
    expect(normalizeLegacyPermission('laboratory.read')).toBe('laboratory.view');
  });

  it('catalog contains emergency access and user/role management modules', () => {
    expect(PERMISSION_CATALOG.emergency_access).toContain('manage');
    expect(PERMISSION_CATALOG.users).toEqual(expect.arrayContaining(['view', 'create', 'edit', 'delete', 'assign', 'manage']));
    expect(PERMISSION_CATALOG.roles).toEqual(expect.arrayContaining(['view', 'create', 'edit', 'delete', 'assign', 'manage']));
    expect(allPermissionKeys().length).toBeGreaterThan(200);
  });
});
