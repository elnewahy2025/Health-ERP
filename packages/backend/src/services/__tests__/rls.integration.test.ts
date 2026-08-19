import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, beginRequestTenantTransaction, enterRequestTenantTransaction, finishRequestTenantTransaction, withTenant } from '../../core/database.js';

const enabled = process.env.RUN_RLS_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenantA: 'a1000000-0000-0000-0000-000000000001',
  tenantB: 'a1000000-0000-0000-0000-000000000002',
  patientA: 'a2000000-0000-0000-0000-000000000001',
  patientB: 'a2000000-0000-0000-0000-000000000002',
};

const patient = (id: string, tenantId: string, mrn: string) => ({
  id,
  tenant_id: tenantId,
  medical_record_number: mrn,
  first_name: 'RLS',
  last_name: mrn,
  date_of_birth: '1990-01-01',
  gender: 'unknown',
  phone: '0000000000',
});

describeDatabase('PostgreSQL FORCE RLS tenant-context suite', () => {
  beforeAll(async () => {
    await db('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();
    await db('tenants').insert([
      { id: IDS.tenantA, name: 'RLS Tenant A', slug: 'rls-tenant-a', status: 'active' },
      { id: IDS.tenantB, name: 'RLS Tenant B', slug: 'rls-tenant-b', status: 'active' },
    ]);
    await withTenant(IDS.tenantA, async (trx) => {
      await trx('patients').where('id', IDS.patientA).delete();
      await trx('patients').insert(patient(IDS.patientA, IDS.tenantA, 'RLS-A'));
    });
    await withTenant(IDS.tenantB, async (trx) => {
      await trx('patients').where('id', IDS.patientB).delete();
      await trx('patients').insert(patient(IDS.patientB, IDS.tenantB, 'RLS-B'));
    });
  });

  afterAll(async () => {
    await withTenant(IDS.tenantA, async (trx) => trx('patients').where('id', IDS.patientA).delete());
    await withTenant(IDS.tenantB, async (trx) => trx('patients').where('id', IDS.patientB).delete());
    await db('tenants').whereIn('id', [IDS.tenantA, IDS.tenantB]).delete();
    await db.destroy();
  });

  it('returns only rows for the active tenant context', async () => {
    const tenantARows = await withTenant(IDS.tenantA, async (trx) => trx('patients').select('id', 'tenant_id').orderBy('id'));
    const tenantBRows = await withTenant(IDS.tenantB, async (trx) => trx('patients').select('id', 'tenant_id').orderBy('id'));
    expect(tenantARows).toEqual([{ id: IDS.patientA, tenant_id: IDS.tenantA }]);
    expect(tenantBRows).toEqual([{ id: IDS.patientB, tenant_id: IDS.tenantB }]);
  });

  it('returns no patient rows without a tenant context', async () => {
    const rows = await db('patients').select('id', 'tenant_id').whereIn('id', [IDS.patientA, IDS.patientB]);
    expect(rows).toEqual([]);
  });

  it('routes request-facade queries through the tenant-local transaction', async () => {
    const trx = await beginRequestTenantTransaction(IDS.tenantA);
    enterRequestTenantTransaction(trx);
    try {
      const rows = await db('patients').select('id', 'tenant_id').orderBy('id');
      expect(rows).toEqual([{ id: IDS.patientA, tenant_id: IDS.tenantA }]);
    } finally {
      await finishRequestTenantTransaction(true);
    }
  });

  it('rejects cross-tenant writes even when the SQL includes the foreign tenant id', async () => {
    await expect(withTenant(IDS.tenantA, async (trx) => trx('patients').insert(patient('a2000000-0000-0000-0000-000000000003', IDS.tenantB, 'RLS-C'))))
      .rejects.toMatchObject({ code: '42501' });
  });
});
