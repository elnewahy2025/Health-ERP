import { describe, it, expect } from 'vitest';
import type { Principal } from '../authorization.js';
import {
  scopeCovers,
  hasPermission,
  anyPermission,
  uniquePermissionKeys,
  patientAccessByScope,
  authorize,
} from '../authorization.js';
import { resolvePharmacyInventoryBranchId } from '../../modules/pharmacy/index.js';
import {
  allPermissionKeys,
  expandGrantKey,
  normalizeLegacyPermission,
  PERMISSION_CATALOG,
  HOSPITAL_ROLE_CATALOG,
  hospitalRoleTemplate,
  validateHospitalRoleCatalog,
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

describe('pharmacy inventory branch resolution', () => {
  it('uses the active authenticated branch instead of a client-supplied branch', () => {
    const p = principal([{ permission: 'pharmacy.create', scope: 'branch' }]);
    p.membership = {
      id: 'm1', userId: 'u1', tenantId: 't1', branchId: 'b1', departmentId: null, status: 'ACTIVE',
    };
    expect(resolvePharmacyInventoryBranchId(p)).toBe('b1');
  });

  it('fails closed when a branch-scoped principal has multiple branches but no active branch', () => {
    const p = principal([{ permission: 'pharmacy.create', scope: 'branch' }]);
    p.branches = ['b1', 'b2'];
    expect(() => resolvePharmacyInventoryBranchId(p)).toThrow('active assigned branch');
  });
});

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

describe('authorize middleware', () => {
  it('supports object form and resolves auto scope', async () => {
    const request = { ctx: { principal: principal([{ permission: 'patients.view', scope: 'branch' }]) } } as any;
    await authorize({ permission: 'patients.view', scope: 'auto' })(request, {} as any);
    expect(request.ctx.authorizationScope).toBe('branch');
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

  it('defines 39 valid and distinct hospital role grant maps', () => {
    const validation = validateHospitalRoleCatalog();
    expect(validation).toEqual({ valid: true, errors: [] });
    expect(HOSPITAL_ROLE_CATALOG).toHaveLength(39);
    const signatures = HOSPITAL_ROLE_CATALOG.map(([slug]) => {
      const template = hospitalRoleTemplate(slug)!;
      return Object.entries(template.grants)
        .flatMap(([permission, scopes]) => scopes.map((scope) => `${permission}:${scope}`))
        .sort()
        .join('|');
    });
    expect(new Set(signatures).size).toBe(39);
  });

  it('keeps named operational roles on their intended modules and scopes', () => {
    expect(hospitalRoleTemplate('pharmacist')?.grants['pharmacy.*']).toEqual(['branch']);
    expect(hospitalRoleTemplate('pharmacy_technician')?.grants['pharmacy.approve']).toBeUndefined();
    expect(hospitalRoleTemplate('pharmacy_technician')?.grants['pharmacy.create']).toEqual(['branch']);
    expect(hospitalRoleTemplate('inventory_manager')?.grants['inventory.*']).toEqual(['branch']);
    expect(hospitalRoleTemplate('compliance_officer')?.grants['compliance.*']).toEqual(['tenant']);
    expect(hospitalRoleTemplate('insurance_claims_officer')?.grants['insurance_claims.approve']).toEqual(['branch']);
    expect(hospitalRoleTemplate('reporting_bi_analyst')?.grants['bi.*']).toEqual(['tenant']);
    for (const slug of ['laboratory_manager', 'radiology_manager']) {
      const grants = hospitalRoleTemplate(slug)?.grants;
      expect(grants?.['departments.view']).toEqual(['department']);
      expect(grants?.['departments.create']).toEqual(['department']);
      expect(grants?.['departments.edit']).toEqual(['department']);
      expect(grants?.['departments.delete']).toEqual(['department']);
    }
  });
});


describe('deterministic denial precedence', () => {
  it('explicit user deny overrides explicit user allow and role grants', () => {
    const p = principal([
      { permission: 'patients.view', scope: 'tenant', source: 'user', effect: 'ALLOW' },
      { permission: 'patients.*', scope: 'tenant', source: 'role', effect: 'ALLOW' },
    ]);
    p.denials = [{ permission: 'patients.view', scope: 'tenant', source: 'user', effect: 'DENY' }];
    expect(hasPermission(p, 'patients.view', 'branch')).toBe(false);
  });

  it('explicit user allow overrides a role denial', () => {
    const p = principal([
      { permission: 'patients.view', scope: 'tenant', source: 'user', effect: 'ALLOW' },
    ]);
    p.denials = [{ permission: 'patients.*', scope: 'tenant', source: 'role', effect: 'DENY' }];
    expect(hasPermission(p, 'patients.view', 'branch')).toBe(true);
  });

  it('role denial overrides role wildcard allow', () => {
    const p = principal([{ permission: 'patients.*', scope: 'tenant', source: 'role', effect: 'ALLOW' }]);
    p.denials = [{ permission: 'patients.delete', scope: 'tenant', source: 'role', effect: 'DENY' }];
    expect(hasPermission(p, 'patients.view', 'branch')).toBe(true);
    expect(hasPermission(p, 'patients.delete', 'branch')).toBe(false);
  });
});


describe('permission alias compatibility', () => {
  it('normalizes roles.update to the existing roles.edit catalog permission', () => {
    const p = principal([{ permission: 'roles.edit', scope: 'tenant', source: 'role', effect: 'ALLOW' }]);
    expect(hasPermission(p, 'roles.update', 'tenant')).toBe(true);
  });
});
