import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../core/database.js';
import {
  hasPermission,
  loadUserPrincipalByMembership,
  patientAccessByScope,
  scopeQuery,
} from '../authorization.js';
import type { Principal } from '../authorization.js';

/**
 * Run with RUN_AUTHZ_DB_TESTS=true and a dedicated PostgreSQL database, for
 * example DB_NAME=healthcare_test. The suite runs migrations before seeding
 * and only deletes rows carrying its unique fixture identifiers.
 */
const enabled = process.env.RUN_AUTHZ_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenantA: '10000000-0000-0000-0000-000000000001',
  tenantB: '10000000-0000-0000-0000-000000000002',
  branchA: '20000000-0000-0000-0000-000000000001',
  branchB: '20000000-0000-0000-0000-000000000002',
  user: '30000000-0000-0000-0000-000000000001',
  foreignUser: '30000000-0000-0000-0000-000000000002',
  role: '40000000-0000-0000-0000-000000000001',
  membershipA: '50000000-0000-0000-0000-000000000001',
  membershipB: '50000000-0000-0000-0000-000000000002',
  foreignMembership: '50000000-0000-0000-0000-000000000003',
  patientA: '60000000-0000-0000-0000-000000000001',
  patientB: '60000000-0000-0000-0000-000000000002',
};

function branchPrincipal(tenantId: string, branches: string[], grants: Principal['grants']): Principal {
  return {
    kind: 'user',
    id: IDS.user,
    tenantId,
    roles: [],
    grants,
    denials: [],
    branches,
    departmentId: null,
    locale: 'en',
    permVersion: 0,
    status: 'active',
  };
}

describeDatabase('authorization PostgreSQL integration security suite', () => {
  beforeAll(async () => {
    await db.migrate.latest();
    await db.transaction(async (trx) => {
      await trx('user_permissions').whereIn('user_id', [IDS.user, IDS.foreignUser]).delete();
      await trx('user_roles').whereIn('user_id', [IDS.user, IDS.foreignUser]).delete();
      await trx('memberships').whereIn('id', [IDS.membershipA, IDS.membershipB, IDS.foreignMembership]).delete();
      await trx('role_permissions').where('role_id', IDS.role).delete();
      await trx('roles').where('id', IDS.role).delete();
      await trx('patients').whereIn('id', [IDS.patientA, IDS.patientB]).delete();
      await trx('branches').whereIn('id', [IDS.branchA, IDS.branchB]).delete();
      await trx('users').whereIn('id', [IDS.user, IDS.foreignUser]).delete();
      await trx('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();

      await trx('tenants').insert([
        { id: IDS.tenantA, name: 'Authz Tenant A', slug: 'authz-tenant-a', status: 'active' },
        { id: IDS.tenantB, name: 'Authz Tenant B', slug: 'authz-tenant-b', status: 'active' },
      ]);
      await trx('branches').insert([
        { id: IDS.branchA, tenant_id: IDS.tenantA, name: 'Branch A', code: 'AUTH-A', phone: '0000000001' },
        { id: IDS.branchB, tenant_id: IDS.tenantA, name: 'Branch B', code: 'AUTH-B', phone: '0000000002' },
      ]);
      await trx('users').insert([
        {
          id: IDS.user,
          tenant_id: IDS.tenantA,
          email: 'authz-a@example.test',
          password_hash: 'integration-fixture',
          first_name: 'Authz',
          last_name: 'User',
          status: 'active',
          roles: [],
          permissions: [],
          branch_id: IDS.branchA,
        },
        {
          id: IDS.foreignUser,
          tenant_id: IDS.tenantB,
          email: 'authz-b@example.test',
          password_hash: 'integration-fixture',
          first_name: 'Foreign',
          last_name: 'User',
          status: 'active',
        },
      ]);
      await trx('roles').insert({
        id: IDS.role,
        tenant_id: IDS.tenantA,
        name: 'Authz Branch Role',
        slug: 'authz_branch_role',
        permissions: [],
        is_system: false,
        level: 'custom',
        scope_default: 'branch',
      });
      await trx('memberships').insert([
        { id: IDS.membershipA, user_id: IDS.user, tenant_id: IDS.tenantA, branch_id: IDS.branchA, status: 'ACTIVE', is_default: true },
        { id: IDS.membershipB, user_id: IDS.user, tenant_id: IDS.tenantA, branch_id: IDS.branchB, status: 'ACTIVE', is_default: false },
        { id: IDS.foreignMembership, user_id: IDS.foreignUser, tenant_id: IDS.tenantB, status: 'ACTIVE', is_default: true },
      ]);
      await trx('role_permissions').insert({
        role_id: IDS.role,
        tenant_id: IDS.tenantA,
        permission: 'patients.view',
        scope: 'branch',
        effect: 'ALLOW',
      });
      await trx('user_roles').insert({
        user_id: IDS.user,
        role_id: IDS.role,
        tenant_id: IDS.tenantA,
        membership_id: IDS.membershipA,
      });
      await trx('user_branches').insert({
        user_id: IDS.user,
        tenant_id: IDS.tenantA,
        branch_id: IDS.branchA,
        membership_id: IDS.membershipA,
      });
      await trx('patients').insert([
        {
          id: IDS.patientA,
          tenant_id: IDS.tenantA,
          medical_record_number: 'AUTHZ-A',
          first_name: 'Patient',
          last_name: 'A',
          date_of_birth: '1990-01-01',
          gender: 'unknown',
          phone: '0000000011',
          branch_id: IDS.branchA,
        },
        {
          id: IDS.patientB,
          tenant_id: IDS.tenantA,
          medical_record_number: 'AUTHZ-B',
          first_name: 'Patient',
          last_name: 'B',
          date_of_birth: '1990-01-01',
          gender: 'unknown',
          phone: '0000000012',
          branch_id: IDS.branchB,
        },
      ]);
    });
  });

  afterAll(async () => {
    await db('user_permissions').whereIn('user_id', [IDS.user, IDS.foreignUser]).delete();
    await db('user_roles').whereIn('user_id', [IDS.user, IDS.foreignUser]).delete();
    await db('memberships').whereIn('id', [IDS.membershipA, IDS.membershipB, IDS.foreignMembership]).delete();
    await db('role_permissions').where('role_id', IDS.role).delete();
    await db('roles').where('id', IDS.role).delete();
    await db('patients').whereIn('id', [IDS.patientA, IDS.patientB]).delete();
    await db('branches').whereIn('id', [IDS.branchA, IDS.branchB]).delete();
    await db('users').whereIn('id', [IDS.user, IDS.foreignUser]).delete();
    await db('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();
    await db.destroy();
  });

  it('loads only the active membership grants and isolates branch data', async () => {
    const principal = await loadUserPrincipalByMembership(IDS.user, IDS.membershipA);
    expect(principal).not.toBeNull();
    expect(principal?.membershipId).toBe(IDS.membershipA);
    expect(principal?.tenantId).toBe(IDS.tenantA);
    expect(hasPermission(principal!, 'patients.view', 'branch')).toBe(true);

    const rows = await scopeQuery(
      db('patients').select('id', 'branch_id'),
      principal!,
      { scope: 'branch', branchColumn: 'branch_id' },
    );
    await expect(rows).resolves.toEqual([{ id: IDS.patientA, branch_id: IDS.branchA }]);
    expect(patientAccessByScope(principal!, { id: IDS.patientB, tenant_id: IDS.tenantA, branch_id: IDS.branchB })).toBe(false);
  });

  it('rejects forged foreign membership and revoked membership claims', async () => {
    await expect(loadUserPrincipalByMembership(IDS.user, IDS.foreignMembership)).resolves.toBeNull();
    await db('memberships').where({ id: IDS.membershipA }).update({ status: 'SUSPENDED' });
    await expect(loadUserPrincipalByMembership(IDS.user, IDS.membershipA)).resolves.toBeNull();
    await db('memberships').where({ id: IDS.membershipA }).update({ status: 'ACTIVE' });
  });

  it('prevents wildcard escalation and honors direct denials', async () => {
    const principal = branchPrincipal(IDS.tenantA, [IDS.branchA], [
      { permission: '*', scope: 'branch', source: 'role', effect: 'ALLOW' },
      { permission: 'billing.export', scope: 'tenant', source: 'user', effect: 'ALLOW' },
    ]);
    principal.denials = [{ permission: 'billing.export', scope: 'tenant', source: 'user', effect: 'DENY' }];
    expect(hasPermission(principal, 'patients.delete', 'branch')).toBe(true);
    expect(hasPermission(principal, 'billing.export', 'branch')).toBe(false);
    expect(hasPermission(principal, 'billing.export', 'tenant')).toBe(false);
    expect(patientAccessByScope(principal, { id: IDS.patientB, tenant_id: IDS.tenantB, branch_id: IDS.branchB })).toBe(false);
  });
});
