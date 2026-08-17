import { describe, expect, it } from 'vitest';
import { applyScopePolicy } from '../scope-policy.js';
import { buildAccessTokenPayload } from '../../modules/auth/auth.service.js';
import type { Principal } from '../authorization.js';

class FakeQuery {
  calls: Array<{ method: string; args: unknown[] }> = [];

  select(...args: unknown[]) { this.calls.push({ method: 'select', args }); return this; }
  from(...args: unknown[]) { this.calls.push({ method: 'from', args }); return this; }
  whereRaw(...args: unknown[]) { this.calls.push({ method: 'whereRaw', args }); return this; }
  andWhere(...args: unknown[]) { this.calls.push({ method: 'andWhere', args }); return this; }
  where(...args: unknown[]) { this.calls.push({ method: 'where', args }); return this; }
  whereIn(...args: unknown[]) { this.calls.push({ method: 'whereIn', args }); return this; }
  whereExists(callback: (this: FakeQuery) => void) {
    const nested = new FakeQuery();
    callback.call(nested);
    this.calls.push({ method: 'whereExists', args: [nested.calls] });
    return this;
  }
}

function principal(grants: Principal['grants']): Principal {
  return {
    kind: 'user',
    id: 'user-1',
    tenantId: 'tenant-1',
    membershipId: 'membership-1',
    roles: [],
    grants,
    denials: [],
    branches: ['branch-1'],
    departmentId: 'department-1',
    locale: 'en',
    status: 'active',
    permVersion: 1,
    membership: {
      id: 'membership-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      departmentId: 'department-1',
      status: 'ACTIVE',
    },
  };
}

describe('scope-policy registry', () => {
  it('applies billing tenant and branch constraints to joined invoice queries', () => {
    const query = new FakeQuery();
    applyScopePolicy('billing', query as any, principal([{ permission: 'billing.view', scope: 'branch' }]), 'branch');
    expect(query.calls).toEqual([
      { method: 'andWhere', args: ['invoices.tenant_id', 'tenant-1'] },
      { method: 'whereIn', args: ['patients.branch_id', ['branch-1']] },
    ]);
  });

  it('applies an assigned-patient exists constraint to EMR queries', () => {
    const query = new FakeQuery();
    applyScopePolicy('emr', query as any, principal([{ permission: 'emr.view', scope: 'assigned_patients' }]), 'assigned_patients');
    expect(query.calls.some((call) => call.method === 'whereExists')).toBe(true);
  });
});

describe('membership-bound access-token claims', () => {
  it('includes both compatibility and membership/session claims', () => {
    expect(buildAccessTokenPayload('tenant-1', 'user-1', 'membership-1', 'session-1')).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
      user_id: 'user-1',
      active_membership_id: 'membership-1',
      session_id: 'session-1',
    });
  });
});

describe('remaining high-risk module policies', () => {
  it('scopes pharmacy inventory to the principal tenant and branches', () => {
    const query = new FakeQuery();
    applyScopePolicy('pharmacy_inventory', query as any, principal([{ permission: 'pharmacy.view', scope: 'branch' }]), 'branch');
    expect(query.calls).toEqual([
      { method: 'andWhere', args: ['pharmacy_inventory.tenant_id', 'tenant-1'] },
      { method: 'whereIn', args: ['pharmacy_inventory.branch_id', ['branch-1']] },
    ]);
  });

  it('scopes HR employees to the principal department', () => {
    const query = new FakeQuery();
    applyScopePolicy('hr', query as any, principal([{ permission: 'hr.view', scope: 'department' }]), 'department');
    expect(query.calls).toEqual([
      { method: 'andWhere', args: ['employees.tenant_id', 'tenant-1'] },
      { method: 'andWhere', args: ['employees.department_id', 'department-1'] },
    ]);
  });

  it('adds an assigned-patient relationship constraint to consent logs', () => {
    const query = new FakeQuery();
    applyScopePolicy('compliance_consent', query as any, principal([{ permission: 'compliance.view', scope: 'assigned_patients' }]), 'assigned_patients');
    expect(query.calls.some((call) => call.method === 'whereExists')).toBe(true);
  });
});


describe('export, report, and bulk-style query isolation', () => {
  it('always constrains reports and audit exports to the active tenant', () => {
    for (const module of ['reports', 'audit']) {
      const query = new FakeQuery();
      applyScopePolicy(module, query as any, principal([{ permission: `${module}.export`, scope: 'tenant' }]), 'tenant');
      expect(query.calls).toContainEqual({ method: 'andWhere', args: ['tenant_id', 'tenant-1'] });
    }
  });

  it('constrains inventory bulk-style reads to assigned branches', () => {
    const query = new FakeQuery();
    applyScopePolicy('inventory', query as any, principal([{ permission: 'inventory.view', scope: 'branches' }]), 'branches');
    expect(query.calls).toEqual([
      { method: 'andWhere', args: ['inventory_items.tenant_id', 'tenant-1'] },
      { method: 'whereIn', args: ['warehouses.branch_id', ['branch-1']] },
    ]);
  });
});
