import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { db, withTenant } from '../../core/database.js';
import { buildApp } from '../../index.js';

vi.mock('../clinic-modules.js', () => ({
  enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined),
}));

const enabled = process.env.RUN_FASTIFY_LIFECYCLE_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'b1000000-0000-0000-0000-000000000001',
  user: 'b2000000-0000-0000-0000-000000000001',
  membership: 'b3000000-0000-0000-0000-000000000001',
  patient: 'b4000000-0000-0000-0000-000000000001',
  committedPatient: 'b4000000-0000-0000-0000-000000000002',
  rolledBackPatient: 'b4000000-0000-0000-0000-000000000003',
};

function patient(id: string, medicalRecordNumber: string) {
  return {
    id,
    tenant_id: IDS.tenant,
    medical_record_number: medicalRecordNumber,
    first_name: 'Lifecycle',
    last_name: medicalRecordNumber,
    date_of_birth: '1990-01-01',
    gender: 'unknown',
    phone: '0000000000',
  };
}

describeDatabase('authenticated Fastify FORCE RLS lifecycle suite', () => {
  let app: FastifyInstance;
  let token: string;
  const csrfToken = 'integration-csrf-token';
  const csrfSecret = process.env.CSRF_SECRET || '';
  const csrfCookie = createHash('sha256').update(csrfToken + csrfSecret).digest('hex');
  const csrfHeaders = {
    'x-csrf-token': csrfToken,
    cookie: `csrf_token=${csrfCookie}`,
  };

  beforeAll(async () => {
    await db('user_permissions').where({ user_id: IDS.user }).delete();
    await db('memberships').where({ id: IDS.membership }).delete();
    await db('users').where({ id: IDS.user }).delete();
    await withTenant(IDS.tenant, async (trx) => {
      await trx('patients').whereIn('id', [IDS.patient, IDS.committedPatient, IDS.rolledBackPatient]).delete();
    });
    await db('tenants').where({ id: IDS.tenant }).delete();

    await db('tenants').insert({ id: IDS.tenant, name: 'Lifecycle Tenant', slug: 'lifecycle-tenant', status: 'active' });
    await db('users').insert({
      id: IDS.user,
      tenant_id: IDS.tenant,
      email: 'lifecycle@example.test',
      password_hash: 'integration-fixture',
      first_name: 'Lifecycle',
      last_name: 'User',
      status: 'active',
      roles: [],
      permissions: [],
    });
    await db('memberships').insert({
      id: IDS.membership,
      user_id: IDS.user,
      tenant_id: IDS.tenant,
      status: 'ACTIVE',
      is_default: true,
    });
    await db('user_permissions').insert({
      user_id: IDS.user,
      tenant_id: IDS.tenant,
      membership_id: IDS.membership,
      permission: 'patients.view',
      scope: 'tenant',
    });
    await withTenant(IDS.tenant, async (trx) => {
      await trx('patients').insert(patient(IDS.patient, 'LIFECYCLE-SEED'));
    });

    app = await buildApp();
    const authenticate = (app as any).authenticate;
    app.post('/__test/rls/commit', { preHandler: [authenticate] }, async () => {
      await db('patients').insert(patient(IDS.committedPatient, 'LIFECYCLE-COMMIT'));
      return { committed: true };
    });
    app.post('/__test/rls/rollback', { preHandler: [authenticate] }, async () => {
      await db('patients').insert(patient(IDS.rolledBackPatient, 'LIFECYCLE-ROLLBACK'));
      throw new Error('intentional lifecycle rollback');
    });
    token = app.jwt.sign({ user_id: IDS.user, active_membership_id: IDS.membership } as any);
  });

  afterAll(async () => {
    if (app) await app.close();
    await withTenant(IDS.tenant, async (trx) => {
      await trx('patients').whereIn('id', [IDS.patient, IDS.committedPatient, IDS.rolledBackPatient]).delete();
    });
    await db('user_permissions').where({ user_id: IDS.user }).delete();
    await db('memberships').where({ id: IDS.membership }).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('tenants').where({ id: IDS.tenant }).delete();
    await db.destroy();
  });

  it('authenticates through membership and serves a tenant-scoped patient route under FORCE RLS', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/patients',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].medicalRecordNumber).toBe('LIFECYCLE-SEED');
  });

  it('commits successful authenticated writes and rolls back failed writes', async () => {
    const committed = await app.inject({
      method: 'POST',
      url: '/__test/rls/commit',
      headers: { ...csrfHeaders, authorization: `Bearer ${token}` },
    });
    expect(committed.statusCode).toBe(200);
    await expect(withTenant(IDS.tenant, async (trx) => trx('patients').where({ id: IDS.committedPatient }).first())).resolves.toMatchObject({ id: IDS.committedPatient });

    const rolledBack = await app.inject({
      method: 'POST',
      url: '/__test/rls/rollback',
      headers: { ...csrfHeaders, authorization: `Bearer ${token}` },
    });
    expect(rolledBack.statusCode).toBe(500);
    await expect(withTenant(IDS.tenant, async (trx) => trx('patients').where({ id: IDS.rolledBackPatient }).first())).resolves.toBeUndefined();
  });

  it('does not leave tenant context on the pooled connection after requests finish', async () => {
    const rows = await db('patients').whereIn('id', [IDS.patient, IDS.committedPatient, IDS.rolledBackPatient]);
    expect(rows).toEqual([]);
  });
});
