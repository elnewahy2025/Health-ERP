import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';

const { dbMock, moduleGuardMock } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  moduleGuardMock: vi.fn(),
}));

vi.mock('../../core/database.js', () => ({ db: dbMock }));
vi.mock('../../services/clinic-modules.js', () => ({
  enforceClinicModuleForPermission: moduleGuardMock,
}));

const { registerBillingModule } = await import('../billing/index.js');

type InvoiceFixture = {
  id: string;
  tenant_id: string;
  patient_id: string;
  patient_branch_id?: string | null;
};

type QueryResult = unknown[];

function queryBuilder(rows: QueryResult, firstRow: unknown = rows[0]): Record<string, unknown> {
  const query: Record<string, any> = {};
  const chain = () => query;
  for (const method of ['where', 'andWhere', 'whereNull', 'whereNotNull', 'join', 'select', 'orderBy', 'distinct']) {
    query[method] = vi.fn(chain);
  }
  query.first = vi.fn().mockResolvedValue(firstRow);
  query.then = (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected);
  return query;
}

function makePrincipal(
  grants: Principal['grants'],
  overrides: Partial<Principal> = {},
): Principal {
  return {
    kind: 'user',
    id: 'user-a',
    tenantId: 'tenant-a',
    roles: [],
    grants,
    denials: [],
    branches: ['branch-a'],
    departmentId: 'department-a',
    locale: 'en',
    permVersion: 0,
    status: 'active',
    ...overrides,
  };
}

function configureDatabase(options: {
  invoice?: InvoiceFixture;
  transactions?: QueryResult;
  departmentAppointment?: unknown;
  assignedPatients?: QueryResult;
} = {}): void {
  const invoiceRows = options.invoice ? [options.invoice] : [];
  dbMock.mockImplementation((table: string) => {
    if (table === 'invoices') return queryBuilder(invoiceRows, options.invoice);
    if (table === 'payment_transactions') return queryBuilder(options.transactions || []);
    if (table === 'appointments as appointments') return queryBuilder([], options.departmentAppointment);
    if (table === 'appointments') return queryBuilder(options.assignedPatients || []);
    throw new Error(`Unexpected database table in route test: ${table}`);
  });
}

describe('GET /api/v1/invoices/:invoiceId/provider-payments', () => {
  let app: FastifyInstance;
  let currentPrincipal: Principal;

  beforeAll(async () => {
    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentPrincipal.tenantId;
      req.ctx = {
        tenantId: currentPrincipal.tenantId,
        userId: currentPrincipal.id,
        roles: currentPrincipal.roles,
        permissions: currentPrincipal.grants.map((grant) => grant.permission),
        branches: currentPrincipal.branches,
        locale: currentPrincipal.locale,
        requestId: request.id,
        principal: currentPrincipal,
      };
    });
    await registerBillingModule(app);
  });

  beforeEach(() => {
    currentPrincipal = makePrincipal([{ permission: 'billing.view', scope: 'tenant' }]);
    dbMock.mockReset();
    moduleGuardMock.mockReset();
    moduleGuardMock.mockResolvedValue(undefined);
    configureDatabase({
      invoice: { id: 'invoice-a', tenant_id: 'tenant-a', patient_id: 'patient-a', patient_branch_id: 'branch-a' },
      transactions: [],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns only provider-keyed nonsecret payment fields for the authenticated tenant', async () => {
    configureDatabase({
      invoice: { id: 'invoice-a', tenant_id: 'tenant-a', patient_id: 'patient-a', patient_branch_id: 'branch-a' },
      transactions: [{
        id: 'payment-a',
        provider_key: 'fawry',
        status: 'pending',
        amount: '125.50',
        reference: 'FW-123',
        notes: 'Fawry payment for Patient (01000000000)',
        encrypted_value: 'must-not-return',
        created_at: '2026-08-19T00:00:00.000Z',
        updated_at: '2026-08-19T00:00:00.000Z',
      }],
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-a/provider-payments' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{
      id: 'payment-a',
      providerKey: 'fawry',
      status: 'pending',
      amount: 125.5,
      reference: 'FW-123',
      createdAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    }]);
    expect(JSON.stringify(response.json())).not.toContain('01000000000');
    expect(JSON.stringify(response.json())).not.toContain('must-not-return');
  });

  it('rejects callers without billing.view before reading invoice data', async () => {
    currentPrincipal = makePrincipal([]);
    const response = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-a/provider-payments' });

    expect(response.statusCode).toBe(403);
    expect(dbMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an invoice from another tenant', async () => {
    configureDatabase();
    const response = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-b/provider-payments' });

    expect(response.statusCode).toBe(404);
    expect(dbMock).toHaveBeenCalledTimes(1);
  });

  it('allows an assigned branch and denies a different branch', async () => {
    currentPrincipal = makePrincipal([{ permission: 'billing.view', scope: 'branch' }]);
    configureDatabase({
      invoice: { id: 'invoice-a', tenant_id: 'tenant-a', patient_id: 'patient-a', patient_branch_id: 'branch-a' },
    });
    await expect(app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-a/provider-payments' })).resolves.toMatchObject({ statusCode: 200 });

    configureDatabase({
      invoice: { id: 'invoice-b', tenant_id: 'tenant-a', patient_id: 'patient-b', patient_branch_id: 'branch-b' },
    });
    const denied = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-b/provider-payments' });
    expect(denied.statusCode).toBe(403);
  });

  it('uses the patient doctor department for department-scoped billing access', async () => {
    currentPrincipal = makePrincipal([{ permission: 'billing.view', scope: 'department' }]);
    configureDatabase({
      invoice: { id: 'invoice-a', tenant_id: 'tenant-a', patient_id: 'patient-a', patient_branch_id: null },
      departmentAppointment: { id: 'appointment-a' },
    });
    const allowed = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-a/provider-payments' });
    expect(allowed.statusCode).toBe(200);

    configureDatabase({
      invoice: { id: 'invoice-b', tenant_id: 'tenant-a', patient_id: 'patient-b', patient_branch_id: null },
      departmentAppointment: undefined,
    });
    const denied = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-b/provider-payments' });
    expect(denied.statusCode).toBe(403);
  });

  it('uses appointment assignment only for assigned-patient scope', async () => {
    currentPrincipal = makePrincipal([{ permission: 'billing.view', scope: 'assigned_patients' }]);
    configureDatabase({
      invoice: { id: 'invoice-a', tenant_id: 'tenant-a', patient_id: 'patient-a', patient_branch_id: null },
      assignedPatients: [{ patient_id: 'patient-a' }],
    });
    const allowed = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-a/provider-payments' });
    expect(allowed.statusCode).toBe(200);

    configureDatabase({
      invoice: { id: 'invoice-b', tenant_id: 'tenant-a', patient_id: 'patient-b', patient_branch_id: null },
      assignedPatients: [{ patient_id: 'patient-a' }],
    });
    const denied = await app.inject({ method: 'GET', url: '/api/v1/invoices/invoice-b/provider-payments' });
    expect(denied.statusCode).toBe(403);
  });
});
