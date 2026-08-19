import { devices, request, type APIResponse, type FullConfig } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const authDir = path.resolve(process.cwd(), 'e2e/.auth');
const configuredApiUrl = (process.env.E2E_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const apiBaseUrl = configuredApiUrl.endsWith('/api/v1') ? configuredApiUrl.slice(0, -7) : configuredApiUrl;
const testDatabaseName = process.env.E2E_DATABASE_NAME || '';

interface TenantFixture {
  name: string;
  slug: string;
  email: string;
  password: string;
  tenantId: string;
  branchId?: string;
  patientId?: string;
  invoiceId?: string;
  accessToken: string;
  csrfToken: string;
  storageStatePath: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

function dataOf<T>(body: ApiResponse<T>): T {
  if (body.data === undefined) throw new Error(`E2E API response did not contain data: ${body.error || body.message || 'unknown error'}`);
  return body.data;
}

async function expectOk(response: APIResponse): Promise<void> {
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`E2E setup request failed (${response.status()} ${response.url()}): ${text.slice(0, 500)}`);
  }
}

async function createTenant(
  client: Awaited<ReturnType<typeof request.newContext>>,
  suffix: string,
  browserUserAgent: string,
): Promise<TenantFixture> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = `e2e-${suffix}-${nonce}`.slice(0, 30);
  const email = `e2e-${suffix}-${nonce}@example.test`;
  const password = process.env.E2E_ADMIN_PASSWORD || 'E2e-Clinic-Admin!2026';
  const name = `E2E ${suffix.toUpperCase()} Clinic ${nonce}`;

  const registration = await client.post('/api/v1/tenants', {
    data: {
      name,
      slug,
      locale: 'en',
      adminEmail: email,
      adminPassword: password,
      adminName: `E2E ${suffix.toUpperCase()} Administrator`,
    },
  });
  await expectOk(registration);
  const registrationBody = await registration.json() as ApiResponse<{ tenant: { id: string; slug: string } }>;
  const tenant = dataOf(registrationBody).tenant;

  const login = await client.post('/api/v1/auth/login', {
    data: { email, password, tenantSlug: slug },
  });
  await expectOk(login);
  const loginBody = await login.json() as ApiResponse<{ accessToken: string; csrfToken: string; tenant: { id: string } }>;
  const loginData = dataOf(loginBody);
  const authHeaders = {
    Authorization: `Bearer ${loginData.accessToken}`,
    'x-csrf-token': loginData.csrfToken,
    'X-API-Version': 'v1',
    'X-Tenant-Slug': slug,
  };

  for (const [key, value] of [
    ['clinic.profile.legal_name', name],
    ['clinic.finance.currency', 'EGP'],
    ['clinic.legal.license_number', `E2E-LICENSE-${nonce}`],
    ['clinic.legal.tax_number', `E2E-TAX-${nonce}`],
  ] as const) {
    const configurationResponse = await client.put('/api/v1/clinic-configuration', {
      headers: authHeaders,
      data: { scopeType: 'tenant', scopeId: tenant.id, key, value },
    });
    await expectOk(configurationResponse);
  }

  const entitlementResponse = await client.put(`/api/v1/system/clinic-module-entitlements/${tenant.id}/billing`, {
    headers: authHeaders,
    data: { status: 'available', source: 'e2e-fixture' },
  });
  await expectOk(entitlementResponse);

  const activationResponse = await client.put('/api/v1/clinic-modules/billing', {
    headers: authHeaders,
    data: { enabled: true },
  });
  await expectOk(activationResponse);

  const branchResponse = await client.post('/api/v1/branches', {
    headers: authHeaders,
    data: {
      name: `${name} Main Branch`,
      code: `E2E-${suffix.toUpperCase()}-${nonce}`.slice(0, 20),
      type: 'main',
      is_active: true,
    },
  });
  await expectOk(branchResponse);
  const branch = dataOf(await branchResponse.json() as ApiResponse<{ id: string }>);

  const patientResponse = await client.post('/api/v1/patients', {
    headers: authHeaders,
    data: {
      firstName: 'E2E',
      lastName: `${suffix.toUpperCase()} Patient`,
      dateOfBirth: '1990-01-01',
      gender: 'female',
      nationalId: `E2E-${suffix.toUpperCase()}-${nonce}`,
      phone: '+10000000000',
      email: `patient-${suffix}-${nonce}@example.test`,
      nationality: 'Testland',
      address: { street: '1 Test Street', city: 'E2E Test City', country: 'Testland' },
    },
  });
  await expectOk(patientResponse);
  const patient = dataOf(await patientResponse.json() as ApiResponse<{ id: string }>);

  const invoiceResponse = await client.post('/api/v1/invoices', {
    headers: authHeaders,
    data: {
      patientId: patient.id,
      items: [{ description: 'E2E consultation', code: 'E2E-CONSULT', quantity: 1, unitPrice: 100, type: 'consultation' }],
      discount: 0,
      tax: 0,
      dueDate: '2099-12-31',
      notes: 'Disposable E2E fixture invoice; not a production transaction.',
    },
  });
  await expectOk(invoiceResponse);
  const invoice = dataOf(await invoiceResponse.json() as ApiResponse<{ id: string }>);

  const storageStatePath = path.join(authDir, `tenant-${suffix}.json`);
  const stateClient = await request.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    userAgent: browserUserAgent,
  });
  const stateLogin = await stateClient.post('/api/v1/auth/login', {
    data: { email, password, tenantSlug: slug },
  });
  await expectOk(stateLogin);
  const state = await stateClient.storageState();
  state.origins = [{
    origin: process.env.E2E_BASE_URL || 'http://localhost:5173',
    localStorage: [
      { name: 'tenantSlug', value: slug },
      { name: 'locale', value: 'en' },
    ],
  }];
  await writeFile(storageStatePath, JSON.stringify(state, null, 2), 'utf8');
  await stateClient.dispose();

  return {
    name,
    slug,
    email,
    password,
    tenantId: tenant.id,
    branchId: branch.id,
    patientId: patient.id,
    invoiceId: invoice.id,
    accessToken: loginData.accessToken,
    csrfToken: loginData.csrfToken,
    storageStatePath,
  };
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (process.env.E2E_ENABLE_AUTHENTICATED !== 'true') return;
  if (!/(test|e2e|staging)/i.test(testDatabaseName)) {
    throw new Error('Authenticated E2E setup requires E2E_DATABASE_NAME containing test, e2e, or staging. Refusing to create fixtures without a disposable-database guard.');
  }

  await mkdir(authDir, { recursive: true });
  const browserUserAgent = devices['Desktop Chrome'].userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const client = await request.newContext({ baseURL: apiBaseUrl });
  try {
    const tenantA = await createTenant(client, 'a', browserUserAgent);
    const tenantB = await createTenant(client, 'b', browserUserAgent);
    await writeFile(path.join(authDir, 'fixtures.json'), JSON.stringify({ apiBaseUrl: `${apiBaseUrl}/api/v1`, tenantA, tenantB }, null, 2), 'utf8');
  } finally {
    await client.dispose();
  }
}
