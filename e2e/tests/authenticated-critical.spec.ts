import { test, expect, request, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';

interface TenantFixture {
  name: string;
  slug: string;
  email: string;
  password: string;
  tenantId: string;
  branchId: string;
  patientId: string;
  invoiceId: string;
  storageStatePath: string;
}

interface FixturesFile {
  apiBaseUrl: string;
  tenantA: TenantFixture;
  tenantB: TenantFixture;
}

interface SuccessEnvelope<T> {
  data: T;
  error?: string;
  message?: string;
}

interface LoginData {
  accessToken: string;
  csrfToken: string;
  tenant: { id: string; slug: string };
}

async function loadFixtures(): Promise<FixturesFile> {
  const raw = await readFile('e2e/.auth/fixtures.json', 'utf8');
  return JSON.parse(raw) as FixturesFile;
}

async function createSession(fixture: TenantFixture, apiBaseUrl: string): Promise<{ client: APIRequestContext; headers: Record<string, string> }> {
  const client = await request.newContext({ baseURL: apiBaseUrl });
  return {
    client,
    headers: {
      Authorization: `Bearer ${fixture.accessToken}`,
      'x-csrf-token': fixture.csrfToken,
      'X-API-Version': 'v1',
      'X-Tenant-Slug': fixture.slug,
    },
  };
}

const enabled = process.env.E2E_ENABLE_AUTHENTICATED === 'true';

test.describe('Authenticated clinic journeys', () => {
  test.skip(!enabled, 'Set E2E_ENABLE_AUTHENTICATED=true with a disposable E2E_DATABASE_NAME to run authenticated fixtures.');
  test.describe.configure({ mode: 'serial' });

  test('admin storage state restores a protected browser session after reload', async ({ page }) => {
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/patients/);
    await expect(page.locator('#root')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/patients/);
    await expect(page.locator('#root')).toBeVisible();
  });

  test('tenant administrator can read its own branch, patient, invoice, and principal', async () => {
    const fixtures = await loadFixtures();
    const session = await createSession(fixtures.tenantA, fixtures.apiBaseUrl);
    try {
      const me = await session.client.get('/api/v1/auth/me', { headers: session.headers });
      expect(me.ok()).toBeTruthy();
      const meBody = await me.json() as SuccessEnvelope<{ tenant: { id: string; slug: string } }>;
      expect(meBody.data.tenant).toMatchObject({ id: fixtures.tenantA.tenantId, slug: fixtures.tenantA.slug });

      const branches = await session.client.get('/api/v1/branches', { headers: session.headers });
      expect(branches.ok()).toBeTruthy();
      const branchesBody = await branches.json() as SuccessEnvelope<Array<{ id: string }>>;
      const branchItems = branchesBody.data || [];
      expect(branchItems.some((branch) => branch.id === fixtures.tenantA.branchId)).toBeTruthy();

      const patient = await session.client.get(`/api/v1/patients/${fixtures.tenantA.patientId}`, { headers: session.headers });
      expect(patient.ok()).toBeTruthy();
      const patientBody = await patient.json() as SuccessEnvelope<{ id: string; firstName: string }>;
      expect(patientBody.data).toMatchObject({ id: fixtures.tenantA.patientId, firstName: 'E2E' });

      const invoice = await session.client.get(`/api/v1/invoices/${fixtures.tenantA.invoiceId}`, { headers: session.headers });
      expect(invoice.ok()).toBeTruthy();
      const invoiceBody = await invoice.json() as SuccessEnvelope<{ id: string; patientId: string }>;
      expect(invoiceBody.data).toMatchObject({ id: fixtures.tenantA.invoiceId, patientId: fixtures.tenantA.patientId });
    } finally {
      await session.client.dispose();
    }
  });

  test('tenant B cannot read tenant A patient or invoice records', async () => {
    const fixtures = await loadFixtures();
    const session = await createSession(fixtures.tenantB, fixtures.apiBaseUrl);
    try {
      const patient = await session.client.get(`/api/v1/patients/${fixtures.tenantA.patientId}`, { headers: session.headers });
      expect(patient.status()).toBe(404);

      const invoice = await session.client.get(`/api/v1/invoices/${fixtures.tenantA.invoiceId}`, { headers: session.headers });
      expect(invoice.status()).toBe(404);

      const branches = await session.client.get('/api/v1/branches', { headers: session.headers });
      expect(branches.ok()).toBeTruthy();
      const branchesBody = await branches.json() as SuccessEnvelope<Array<{ id: string }>>;
      expect((branchesBody.data || []).some((branch) => branch.id === fixtures.tenantA.branchId)).toBeFalsy();
    } finally {
      await session.client.dispose();
    }
  });

  test('unauthenticated browser access remains protected outside the storage-state session', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
