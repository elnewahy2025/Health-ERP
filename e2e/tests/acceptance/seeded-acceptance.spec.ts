import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type UserFixture = {
  id: string;
  role: string;
  email: string;
  password: string;
  branchIds: string[];
  departmentId: string;
};

type TenantFixture = {
  name: string;
  slug: string;
  tenantId: string;
  admin: { email: string; password: string };
  branches: Array<{ id: string; name: string; code: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  users: UserFixture[];
  patients: Array<{ id: string; firstName: string; lastName: string; branchId: string }>;
  appointmentId: string;
  invoiceId: string;
  inventoryId: string;
  prescriptionId: string;
};

type AcceptanceManifest = {
  version: 1;
  purpose: 'acceptance';
  namespace: string;
  databaseName: string;
  apiBaseUrl: string;
  tenants: TenantFixture[];
};

type Auth = {
  tenantSlug: string;
  accessToken: string;
  csrfToken: string;
};

const manifestPath = process.env.ACCEPTANCE_MANIFEST_PATH
  || path.resolve(process.cwd(), 'e2e/.auth/acceptance-fixtures.json');
let testLoginSequence = 0;
const testLoginPrefix = `acceptance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function loadManifest(): Promise<AcceptanceManifest> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AcceptanceManifest;
  expect(manifest.version).toBe(1);
  expect(manifest.purpose).toBe('acceptance');
  expect(manifest.databaseName).toMatch(/test|e2e|staging/i);
  expect(manifest.tenants.length).toBeGreaterThanOrEqual(2);
  return manifest;
}

async function login(client: APIRequestContext, tenant: TenantFixture, email: string, password: string): Promise<Auth> {
  const response = await client.post('/api/v1/auth/login', {
    headers: { 'x-forwarded-for': `${testLoginPrefix}-${testLoginSequence++}` },
    data: { email, password, tenantSlug: tenant.slug },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { data: { accessToken: string; csrfToken: string } };
  return {
    tenantSlug: tenant.slug,
    accessToken: body.data.accessToken,
    csrfToken: body.data.csrfToken,
  };
}

function headers(auth: Auth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'x-csrf-token': auth.csrfToken,
    'X-API-Version': 'v1',
    'X-Tenant-Slug': auth.tenantSlug,
  };
}

function userFor(tenant: TenantFixture, role: string): UserFixture {
  const user = tenant.users.find((candidate) => candidate.role === role);
  if (!user) throw new Error(`Manifest has no ${role} fixture for ${tenant.slug}`);
  return user;
}

async function jsonData<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { data: T };
  return body.data;
}

test.describe('test-only seeded acceptance', () => {
  test('role-based navigation surfaces expose distinct operational grants', async () => {
    const manifest = await loadManifest();
    const client = await request.newContext({ baseURL: manifest.apiBaseUrl.replace(/\/api\/v1$/, '') });
    try {
      const tenant = manifest.tenants[0];
      const admin = await login(client, tenant, tenant.admin.email, tenant.admin.password);
      const expected: Record<string, string[]> = {
        tenant_administrator: ['settings.manage', 'users.manage'],
        physician: ['pharmacy.prescribe', 'emr.create'],
        receptionist: ['appointments.create', 'patients.create'],
        billing_officer: ['billing.create', 'billing.approve'],
        pharmacist: ['pharmacy.approve', 'pharmacy.dispense'],
        registered_nurse: ['nursing.create', 'nursing.edit'],
        pharmacy_technician: ['pharmacy.create', 'pharmacy.edit'],
      };
      const permissionSets = new Map<string, string[]>();
      for (const [role, requiredPermissions] of Object.entries(expected)) {
        const user = userFor(tenant, role);
        const response = await client.get(`/api/v1/rbac/users/${user.id}/permissions`, { headers: headers(admin) });
        const data = await jsonData<{ roles: string[]; permissions: string[] }>(response);
        expect(data.roles).toContain(role);
        for (const permission of requiredPermissions) expect(data.permissions).toContain(permission);
        permissionSets.set(role, data.permissions);
      }
      expect(permissionSets.get('pharmacist')).not.toEqual(permissionSets.get('pharmacy_technician'));
      expect(permissionSets.get('billing_officer')).not.toEqual(permissionSets.get('receptionist'));
    } finally {
      await client.dispose();
    }
  });

  test('tenant Settings and records remain isolated across seeded tenants', async () => {
    const manifest = await loadManifest();
    const client = await request.newContext({ baseURL: manifest.apiBaseUrl.replace(/\/api\/v1$/, '') });
    try {
      const tenantA = manifest.tenants[0];
      const tenantB = manifest.tenants[1];
      const authA = await login(client, tenantA, tenantA.admin.email, tenantA.admin.password);
      const authB = await login(client, tenantB, tenantB.admin.email, tenantB.admin.password);

      const identityA = await jsonData<{ displayName: string; currency: string }>(await client.get('/api/v1/clinic-configuration/identity', { headers: headers(authA) }));
      const identityB = await jsonData<{ displayName: string; currency: string }>(await client.get('/api/v1/clinic-configuration/identity', { headers: headers(authB) }));
      expect(identityA.displayName).toContain(manifest.namespace);
      expect(identityB.displayName).toContain(manifest.namespace);
      expect(identityA.displayName).not.toBe(identityB.displayName);

      const crossTenantPatient = await client.get(`/api/v1/patients/${tenantA.patients[0].id}`, { headers: headers(authB) });
      expect([403, 404]).toContain(crossTenantPatient.status());
      const crossTenantInvoice = await client.get(`/api/v1/invoices/${tenantA.invoiceId}`, { headers: headers(authB) });
      expect([403, 404]).toContain(crossTenantInvoice.status());

      const branchesB = await jsonData<Array<{ id: string }>>(await client.get('/api/v1/branches', { headers: headers(authB) }));
      expect(branchesB.map((branch) => branch.id)).not.toContain(tenantA.branches[0].id);
    } finally {
      await client.dispose();
    }
  });

  test('critical appointment, billing, and pharmacy fixtures are readable by their scoped roles', async () => {
    const manifest = await loadManifest();
    const client = await request.newContext({ baseURL: manifest.apiBaseUrl.replace(/\/api\/v1$/, '') });
    try {
      const tenant = manifest.tenants[0];
      const receptionist = userFor(tenant, 'receptionist');
      const billingOfficer = userFor(tenant, 'billing_officer');
      const pharmacist = userFor(tenant, 'pharmacist');
      const adminAuth = await login(client, tenant, tenant.admin.email, tenant.admin.password);
      const receptionistAuth = await login(client, tenant, receptionist.email, receptionist.password);
      const pharmacistAuth = await login(client, tenant, pharmacist.email, pharmacist.password);

      const ownedPatient = await jsonData<{ id: string; branchId: string | null }>(await client.get(`/api/v1/patients/${tenant.patients[0].id}`, { headers: headers(pharmacistAuth) }));
      expect(ownedPatient.branchId).toBe(tenant.patients[0].branchId);
      const outOfBranchPatient = await client.get(`/api/v1/patients/${tenant.patients[1].id}`, { headers: headers(pharmacistAuth) });
      expect([403, 404]).toContain(outOfBranchPatient.status());

      const appointment = await jsonData<{ id: string }>(await client.get(`/api/v1/appointments/${tenant.appointmentId}`, { headers: headers(receptionistAuth) }));
      expect(appointment.id).toBe(tenant.appointmentId);
      const invoice = await jsonData<{ id: string }>(await client.get(`/api/v1/invoices/${tenant.invoiceId}`, { headers: headers(adminAuth) }));
      expect(invoice.id).toBe(tenant.invoiceId);
      const inventory = await jsonData<Array<{ id: string }>>(await client.get('/api/v1/pharmacy/inventory', { headers: headers(pharmacistAuth) }));
      expect(inventory.map((item) => item.id)).toContain(tenant.inventoryId);
      const prescriptions = await jsonData<Array<{ id: string }>>(await client.get('/api/v1/pharmacy/prescriptions', { headers: headers(adminAuth) }));
      expect(prescriptions.map((prescription) => prescription.id)).toContain(tenant.prescriptionId);
    } finally {
      await client.dispose();
    }
  });
});
