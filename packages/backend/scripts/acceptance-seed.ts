import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

type JsonObject = Record<string, unknown>;

type Auth = {
  tenantId: string;
  tenantSlug: string;
  accessToken: string;
  csrfToken: string;
  cookies: string[];
};

type UserFixture = {
  id: string;
  role: string;
  employeeType: string;
  email: string;
  password: string;
  branchIds: string[];
  departmentId: string;
};

type TenantFixture = {
  name: string;
  slug: string;
  tenantId: string;
  admin: { id?: string; email: string; password: string };
  branches: Array<{ id: string; name: string; code: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  users: UserFixture[];
  patients: Array<{ id: string; firstName: string; lastName: string }>;
  appointmentId: string;
  invoiceId: string;
  inventoryId: string;
  prescriptionId: string;
};

type AcceptanceManifest = {
  version: 1;
  purpose: 'acceptance';
  namespace: string;
  createdAt: string;
  apiBaseUrl: string;
  databaseName: string;
  tenants: TenantFixture[];
};

type ApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

const configuredDatabaseName = process.env.ACCEPTANCE_DATABASE_NAME || '';
const configuredApiUrl = (process.env.ACCEPTANCE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const apiBaseUrl = configuredApiUrl.endsWith('/api/v1') ? configuredApiUrl.slice(0, -7) : configuredApiUrl;
const manifestPath = path.resolve(
  process.env.ACCEPTANCE_MANIFEST_PATH || path.resolve(process.cwd(), '../../e2e/.auth/acceptance-fixtures.json'),
);
const namespace = process.env.ACCEPTANCE_NAMESPACE || `acceptance-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
const tenantCount = Math.max(2, Number.parseInt(process.env.ACCEPTANCE_TENANT_COUNT || '2', 10) || 2);
const locale = process.env.ACCEPTANCE_LOCALE === 'ar' ? 'ar' : 'en';
const currency = process.env.ACCEPTANCE_CURRENCY || 'USD';
let loginSequence = 0;

function requireGuard(): void {
  if (process.env.ACCEPTANCE_ENABLE !== 'true') {
    throw new Error('Acceptance seed is disabled. Set ACCEPTANCE_ENABLE=true explicitly for a test run.');
  }
  if (!configuredDatabaseName || !/(test|e2e|staging)/i.test(configuredDatabaseName)) {
    throw new Error('Acceptance seed requires ACCEPTANCE_DATABASE_NAME containing test, e2e, or staging. Refusing to seed a non-disposable database.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Acceptance seed refuses NODE_ENV=production, even when the database name appears disposable.');
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Acceptance API response did not include ${label}.`);
  return value;
}

function dataOf<T>(body: ApiEnvelope<T>, label: string): T {
  if (body.data === undefined) throw new Error(`Acceptance API response did not contain ${label}: ${body.error || body.message || 'unknown error'}`);
  return body.data;
}

function idOf(value: unknown, label: string): string {
  if (value && typeof value === 'object' && 'id' in value) return requireString((value as JsonObject).id, label);
  throw new Error(`Acceptance API response did not include ${label}.`);
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 48).replace(/-$/, '');
}

function randomPassword(): string {
  return `A-${randomBytes(18).toString('base64url')}!9x`;
}

function authHeaders(auth: Auth): Record<string, string> {
  return {
    Authorization: `Bearer ${auth.accessToken}`,
    'x-csrf-token': auth.csrfToken,
    'X-API-Version': 'v1',
    'X-Tenant-Slug': auth.tenantSlug,
    ...(auth.cookies.length > 0 ? { Cookie: auth.cookies.join('; ') } : {}),
  };
}

function setCookiesFromResponse(auth: Auth, response: Response): void {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);
  for (const value of values) {
    const pair = value.split(';', 1)[0];
    const name = pair.split('=', 1)[0];
    auth.cookies = [...auth.cookies.filter((cookie) => !cookie.startsWith(`${name}=`)), pair];
  }
}

async function api<T = unknown>(method: string, route: string, auth?: Auth, body?: unknown): Promise<T> {
  const headers = auth ? authHeaders(auth) : { 'X-API-Version': 'v1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiBaseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (auth) setCookiesFromResponse(auth, response);
  const text = await response.text();
  let parsed: ApiEnvelope<T>;
  try {
    parsed = text ? JSON.parse(text) as ApiEnvelope<T> : {};
  } catch {
    throw new Error(`Acceptance API returned non-JSON (${response.status} ${method} ${route}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`Acceptance API failed (${response.status} ${method} ${route}): ${parsed.error || parsed.message || text.slice(0, 500)}`);
  }
  return dataOf(parsed, `${method} ${route}`);
}

async function login(email: string, password: string, tenantSlug: string): Promise<Auth> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Version': 'v1',
      'x-forwarded-for': `198.51.100.${(loginSequence++ % 240) + 1}`,
    },
    body: JSON.stringify({ email, password, tenantSlug }),
  });
  const text = await response.text();
  const parsed = (text ? JSON.parse(text) : {}) as ApiEnvelope<JsonObject>;
  if (!response.ok) throw new Error(`Acceptance API failed (${response.status} POST /api/v1/auth/login): ${parsed.error || parsed.message || text.slice(0, 500)}`);
  const data = dataOf(parsed, 'login data');
  const auth: Auth = {
    tenantId: requireString((data.tenant as JsonObject | undefined)?.id, 'tenant id'),
    tenantSlug,
    accessToken: requireString(data.accessToken, 'access token'),
    csrfToken: requireString(data.csrfToken, 'CSRF token'),
    cookies: [],
  };
  setCookiesFromResponse(auth, response);
  return auth;
}

function dateAfterDays(days: number): string {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return value.toISOString().slice(0, 10);
}

const workingHours = [
  { day: 'mon', from: '08:00', to: '18:00' },
  { day: 'tue', from: '08:00', to: '18:00' },
  { day: 'wed', from: '08:00', to: '18:00' },
  { day: 'thu', from: '08:00', to: '18:00' },
  { day: 'fri', from: '08:00', to: '18:00' },
  { day: 'sat', from: '08:00', to: '14:00' },
  { day: 'sun', from: '08:00', to: '14:00' },
];

async function ensureRole(auth: Auth, role: string, displayNamespace: string): Promise<void> {
  try {
    await api('POST', '/api/v1/rbac/roles/clone', auth, {
      templateSlug: role,
      name: `${displayNamespace} ${role} role`,
      slug: role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('already exists in this organization')) throw error;
  }
}

async function createTenant(index: number): Promise<TenantFixture> {
  const suffix = `${namespace}-${index}`;
  const tenantSlug = `${safeSlug(namespace).slice(0, 20)}-${index}`;
  const tenantName = `${namespace} tenant ${index}`;
  const adminEmail = `${safeSlug(namespace)}-admin-${index}@example.test`;
  const adminPassword = randomPassword();

  const registration = await api<JsonObject>('POST', '/api/v1/tenants', undefined, {
    name: tenantName,
    slug: tenantSlug,
    locale,
    adminEmail,
    adminPassword,
    adminName: `${namespace} tenant administrator ${index}`,
  });
  const tenant = registration.tenant as JsonObject | undefined;
  const tenantId = requireString(tenant?.id, 'registered tenant id');
  const auth = await login(adminEmail, adminPassword, tenantSlug);

  const branches: TenantFixture['branches'] = [];
  for (const branchKey of ['main', 'satellite']) {
    const code = `A${randomBytes(7).toString('hex')}${index}${branchKey === 'main' ? 'M' : 'S'}`.slice(0, 20).toUpperCase();
    const branch = await api<JsonObject>('POST', '/api/v1/branches', auth, {
      name: `${namespace} ${branchKey} branch ${index}`,
      code,
      type: branchKey === 'main' ? 'main' : 'satellite',
      is_active: true,
    });
    branches.push({ id: idOf(branch, `${branchKey} branch id`), name: `${namespace} ${branchKey} branch ${index}`, code });
  }

  const departments: TenantFixture['departments'] = [];
  for (const departmentKey of ['clinical', 'pharmacy', 'front-office']) {
    const code = `D${randomBytes(7).toString('hex')}${index}${departmentKey.slice(0, 1).toUpperCase()}`.slice(0, 20).toUpperCase();
    const department = await api<JsonObject>('POST', '/api/v1/departments', auth, {
      name: `${namespace} ${departmentKey} department ${index}`,
      code,
    });
    departments.push({ id: idOf(department, `${departmentKey} department id`), name: `${namespace} ${departmentKey} department ${index}`, code });
  }

  const tenantSettings: Array<[string, unknown]> = [
    ['clinic.profile.display_name', tenantName],
    ['clinic.profile.legal_name', `${tenantName} legal entity`],
    ['clinic.finance.currency', currency],
    ['clinic.legal.license_number', `L-${randomBytes(7).toString('hex')}`],
    ['clinic.legal.tax_number', `T-${randomBytes(7).toString('hex')}`],
    ['clinic.locale.default', locale],
    ['clinic.timezone.default', process.env.ACCEPTANCE_TIMEZONE || 'UTC'],
  ];
  for (const [key, value] of tenantSettings) {
    await api('PUT', '/api/v1/clinic-configuration', auth, { scopeType: 'tenant', scopeId: tenantId, key, value });
  }
  for (const branch of branches) {
    await api('PUT', '/api/v1/clinic-configuration', auth, {
      scopeType: 'branch', scopeId: branch.id, key: 'clinic.operations.working_hours', value: workingHours,
    });
  }
  await api('PUT', `/api/v1/system/clinic-module-entitlements/${tenantId}/billing`, auth, { status: 'available', source: 'acceptance-seed' });
  await api('PUT', `/api/v1/system/clinic-module-entitlements/${tenantId}/pharmacy`, auth, { status: 'available', source: 'acceptance-seed' });
  await api('PUT', '/api/v1/clinic-modules/billing', auth, { enabled: true });
  await api('PUT', '/api/v1/clinic-modules/pharmacy', auth, { enabled: true });

  const roleSlugs = ['tenant_administrator', 'physician', 'receptionist', 'billing_officer', 'pharmacist', 'registered_nurse', 'pharmacy_technician'];
  for (const role of roleSlugs) await ensureRole(auth, role, namespace);

  const userSpecs = [
    { role: 'tenant_administrator', employeeType: 'administrator', departmentId: departments[2].id, branchIds: [branches[0].id, branches[1].id] },
    { role: 'physician', employeeType: 'doctor', departmentId: departments[0].id, branchIds: [branches[0].id] },
    { role: 'receptionist', employeeType: 'receptionist', departmentId: departments[2].id, branchIds: [branches[0].id] },
    { role: 'billing_officer', employeeType: 'accountant', departmentId: departments[2].id, branchIds: [branches[0].id] },
    { role: 'pharmacist', employeeType: 'pharmacist', departmentId: departments[1].id, branchIds: [branches[0].id] },
    { role: 'registered_nurse', employeeType: 'nurse', departmentId: departments[0].id, branchIds: [branches[0].id] },
    { role: 'pharmacy_technician', employeeType: 'technician', departmentId: departments[1].id, branchIds: [branches[0].id] },
  ] as const;

  const users: UserFixture[] = [];
  for (const spec of userSpecs) {
    const email = `${safeSlug(namespace)}-${index}-${spec.role}@example.test`;
    const password = randomPassword();
    const created = await api<JsonObject>('POST', '/api/v1/users', auth, {
      firstName: `${namespace} ${spec.role}`,
      lastName: `fixture ${index}`,
      email,
      employeeType: spec.employeeType,
      departmentId: spec.departmentId,
      position: `Acceptance ${spec.role}`,
      professionalInfo: { acceptanceNamespace: namespace, roleFixture: spec.role },
      roles: [spec.role],
      branchIds: spec.branchIds,
      locale,
      temporaryPassword: password,
    });
    const userId = idOf(created, `${spec.role} user id`);
    users.push({ id: userId, role: spec.role, employeeType: spec.employeeType, email, password, branchIds: [...spec.branchIds], departmentId: spec.departmentId });
  }

  const physician = users.find((user) => user.role === 'physician');
  const pharmacist = users.find((user) => user.role === 'pharmacist');
  const billingOfficer = users.find((user) => user.role === 'billing_officer');
  const receptionist = users.find((user) => user.role === 'receptionist');
  if (!physician || !pharmacist || !billingOfficer || !receptionist) throw new Error('Acceptance role fixtures were not created.');

  const patients: TenantFixture['patients'] = [];
  for (const patientKey of ['alpha', 'beta']) {
    const firstName = `${namespace} ${patientKey}`;
    const lastName = `patient ${index}`;
    const patient = await api<JsonObject>('POST', '/api/v1/patients', auth, {
      firstName,
      lastName,
      dateOfBirth: '1990-01-01',
      gender: patientKey === 'alpha' ? 'female' : 'male',
      nationalId: `P${randomBytes(8).toString('hex')}${index}${patientKey === 'alpha' ? 'A' : 'B'}`,
      phone: `+1000${String(index).padStart(2, '0')}${patientKey === 'alpha' ? '01' : '02'}0000`,
      email: `${safeSlug(namespace)}-${index}-${patientKey}@example.test`,
      nationality: 'Acceptance Test',
      address: { street: `${namespace} synthetic street`, city: 'Acceptance City', country: 'Acceptance Test' },
    });
    patients.push({ id: idOf(patient, `${patientKey} patient id`), firstName, lastName });
  }

  const receptionistAuth = await login(receptionist.email, receptionist.password, tenantSlug);
  const appointment = await api<JsonObject>('POST', '/api/v1/appointments', receptionistAuth, {
    patientId: patients[0].id,
    doctorId: physician.id,
    branchId: branches[0].id,
    appointmentDate: dateAfterDays(10),
    startTime: '09:00',
    duration: 30,
    type: 'consultation',
    reason: `${namespace} acceptance appointment`,
    notes: 'Synthetic acceptance fixture; not a clinical record.',
    isWalkIn: false,
    isVirtual: false,
    timezone: process.env.ACCEPTANCE_TIMEZONE || 'UTC',
  });
  const appointmentId = idOf(appointment, 'appointment id');

  const invoice = await api<JsonObject>('POST', '/api/v1/invoices', billingOfficer ? await login(billingOfficer.email, billingOfficer.password, tenantSlug) : auth, {
    patientId: patients[0].id,
    appointmentId,
    items: [{ description: `${namespace} synthetic consultation`, code: `${safeSlug(namespace)}-consultation`, quantity: 1, unitPrice: 100, type: 'consultation' }],
    discount: 0,
    tax: 0,
    dueDate: dateAfterDays(30),
    notes: 'Synthetic acceptance fixture; not a production transaction.',
  });
  const invoiceId = idOf(invoice, 'invoice id');

  const pharmacistAuth = await login(pharmacist.email, pharmacist.password, tenantSlug);
  const inventoryName = `${namespace} synthetic medication ${index}`;
  const inventory = await api<JsonObject>('POST', '/api/v1/pharmacy/inventory', pharmacistAuth, {
    drugName: inventoryName,
    genericName: inventoryName,
    brandName: `${namespace} synthetic brand ${index}`,
    dosageForm: 'tablet',
    strength: '10 mg',
    stockQuantity: 100,
    reorderLevel: 10,
    unitPrice: 5,
    batchNumber: `${safeSlug(namespace)}-${index}-batch`,
    expiryDate: dateAfterDays(365),
    manufacturer: `${namespace} synthetic manufacturer`,
    requiresPrescription: true,
  });
  const inventoryId = idOf(inventory, 'pharmacy inventory id');

  const physicianAuth = await login(physician.email, physician.password, tenantSlug);
  const prescription = await api<JsonObject>('POST', '/api/v1/pharmacy/prescriptions', physicianAuth, {
    patientId: patients[0].id,
    notes: 'Synthetic acceptance fixture; not a clinical prescription.',
    items: [{ drugName: inventoryName, dosage: '10 mg', route: 'oral', frequency: 'once daily', duration: '7 days', quantity: 7, refills: 0, instructions: 'Synthetic test instruction.' }],
  });
  const prescriptionId = idOf(prescription, 'prescription id');

  return {
    name: tenantName,
    slug: tenantSlug,
    tenantId,
    admin: { email: adminEmail, password: adminPassword },
    branches,
    departments,
    users,
    patients,
    appointmentId,
    invoiceId,
    inventoryId,
    prescriptionId,
  };
}

async function writeManifest(manifest: AcceptanceManifest): Promise<void> {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
  await chmod(manifestPath, 0o600);
}

async function seed(): Promise<void> {
  requireGuard();
  const tenants: TenantFixture[] = [];
  for (let index = 1; index <= tenantCount; index += 1) tenants.push(await createTenant(index));
  await writeManifest({ version: 1, purpose: 'acceptance', namespace, createdAt: new Date().toISOString(), apiBaseUrl, databaseName: configuredDatabaseName, tenants });
  console.log(JSON.stringify({ mode: 'seed', purpose: 'acceptance', namespace, databaseName: configuredDatabaseName, manifestPath, tenantCount: tenants.length }, null, 2));
}

async function tryCleanup(method: string, route: string, auth: Auth, body?: unknown): Promise<void> {
  try {
    await api(method, route, auth, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('(404 ') && !message.includes("Invalid status transition from 'cancelled' to 'cancelled'")) throw error;
  }
}

async function teardown(): Promise<void> {
  requireGuard();
  let manifest: AcceptanceManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as AcceptanceManifest;
  } catch (error) {
    throw new Error(`Acceptance teardown could not read its manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.purpose !== 'acceptance' || manifest.databaseName !== configuredDatabaseName || !manifest.namespace.startsWith('acceptance-')) {
    throw new Error('Acceptance teardown manifest does not match the guarded acceptance namespace/database. Refusing cleanup.');
  }

  for (const tenant of manifest.tenants) {
    const auth = await login(tenant.admin.email, tenant.admin.password, tenant.slug);
    await tryCleanup('POST', `/api/v1/appointments/${tenant.appointmentId}/cancel`, auth, { reason: `Acceptance teardown ${manifest.namespace}` });
    for (const patient of [...tenant.patients].reverse()) await tryCleanup('DELETE', `/api/v1/patients/${patient.id}`, auth);
    for (const user of tenant.users) await tryCleanup('PUT', `/api/v1/users/${user.id}/status`, auth, { status: 'inactive' });
    for (const branch of [...tenant.branches].reverse()) await tryCleanup('DELETE', `/api/v1/branches/${branch.id}`, auth);
    for (const department of [...tenant.departments].reverse()) await tryCleanup('DELETE', `/api/v1/departments/${department.id}`, auth);
  }

  await writeFile(manifestPath, JSON.stringify({ ...manifest, tornDownAt: new Date().toISOString() }, null, 2), { encoding: 'utf8', mode: 0o600 });
  await chmod(manifestPath, 0o600);
  console.log(JSON.stringify({ mode: 'teardown', purpose: 'acceptance', namespace: manifest.namespace, databaseName: configuredDatabaseName, manifestPath, note: 'Immutable financial, audit, prescription, and inventory records remain isolated in the disposable acceptance tenant/database.' }, null, 2));
}

if (process.argv.includes('--teardown')) {
  await teardown();
} else {
  await seed();
}
