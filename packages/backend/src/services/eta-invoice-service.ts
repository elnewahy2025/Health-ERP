import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConflictError, ForbiddenError, ValidationError } from '@healthcare/shared/errors';
import { hashString } from '@healthcare/shared/utils';
import { db } from '../core/database.js';
import { getTenantProviderRuntime, type TenantProviderRuntime } from './clinic-provider-runtime.js';
import { validateClinicProviderAdapter } from './clinic-provider-adapters.js';
import { loadClinicDocumentContext } from './pdf.js';
import { logAudit } from './audit.js';

const execFileAsync = promisify(execFile);
const ETA_REQUEST_TIMEOUT_MS = 30_000;
const ETA_STATUS_POLL_INTERVAL_MS = 60_000;
const ETA_MAX_SUBMISSION_ATTEMPTS = 5;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export type EtaLocalStatus = 'draft' | 'pending' | 'processing' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'failed' | 'retry_wait';

interface EtaInvoiceRow {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
  eta_uuid: string | null;
  eta_invoice_number: string | null;
  document_type: string;
  transaction_type: string;
  status: EtaLocalStatus;
  eta_json: string | null;
  eta_response: string | null;
  qr_code_data: string | null;
  error_message: string | null;
  rejection_reason: string | null;
  submitted_at: Date | null;
  approved_at: Date | null;
  request_hash: string | null;
  document_hash: string | null;
  document_type_version: string | null;
  internal_id: string | null;
  submission_uuid: string | null;
  long_id: string | null;
  status_payload: unknown;
  submission_attempts: number;
  next_retry_at: Date | null;
  last_status_check_at: Date | null;
  last_http_status: number | null;
  last_error_code: string | null;
  provider_environment: string | null;
  updated_at: Date | null;
}

interface RuntimeConfig {
  taxRegistrationNumber: string;
  invoiceSeries: string;
  activityCode: string;
  identityEndpointUrl: string;
  systemApiEndpointUrl: string;
  documentTypeId: string;
  documentTypeVersionId: string;
  issuerBranchCode: string;
  currencyCode: string;
  taxTypeCode: string;
  taxRate: number;
  taxCalculationMode: 'exclusive' | 'inclusive' | 'exempt';
}

interface InvoiceLineInput {
  description?: unknown;
  itemCode?: unknown;
  code?: unknown;
  itemType?: unknown;
  unitType?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  unit_price?: unknown;
  price?: unknown;
  discount?: unknown;
  discountAmount?: unknown;
  taxRate?: unknown;
  taxAmount?: unknown;
}

interface EtaSubmissionResponse {
  submissionUUID?: string;
  acceptedDocuments?: Array<{ uuid?: string; longId?: string; internalId?: string }>;
  rejectedDocuments?: Array<{ internalId?: string; error?: unknown }>;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function requiredString(config: Record<string, unknown>, key: keyof RuntimeConfig): string {
  const value = String(config[key] ?? '').trim();
  if (!value) throw new ValidationError(`ETA configuration ${String(key)} is required`);
  return value;
}

function parseRuntimeConfig(runtime: TenantProviderRuntime): RuntimeConfig {
  const config = runtime.config;
  const mode = String(config.taxCalculationMode || 'exclusive') as RuntimeConfig['taxCalculationMode'];
  if (!['exclusive', 'inclusive', 'exempt'].includes(mode)) throw new ValidationError('ETA taxCalculationMode must be exclusive, inclusive, or exempt');
  const currencyCode = requiredString(config, 'currencyCode').toUpperCase();
  if (currencyCode !== 'EGP') throw new ValidationError('ETA Invoice v1.0 requires EGP document amounts; configure currencyCode as EGP');
  const taxRate = Number(config.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new ValidationError('ETA taxRate must be between 0 and 100');
  return {
    taxRegistrationNumber: requiredString(config, 'taxRegistrationNumber'),
    invoiceSeries: requiredString(config, 'invoiceSeries'),
    activityCode: requiredString(config, 'activityCode'),
    identityEndpointUrl: requiredString(config, 'identityEndpointUrl'),
    systemApiEndpointUrl: requiredString(config, 'systemApiEndpointUrl'),
    documentTypeId: requiredString(config, 'documentTypeId'),
    documentTypeVersionId: requiredString(config, 'documentTypeVersionId'),
    issuerBranchCode: requiredString(config, 'issuerBranchCode'),
    currencyCode,
    taxTypeCode: requiredString(config, 'taxTypeCode'),
    taxRate,
    taxCalculationMode: mode,
  };
}

function endpoint(base: string, path: string): string {
  const normalized = base.replace(/\/+$/, '');
  return `${normalized}/${path.replace(/^\/+/, '')}`;
}

function stableNumber(value: number): number {
  return Number(value.toFixed(5));
}

function money(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new ValidationError(`ETA invoice ${field} must be a non-negative number`);
  return stableNumber(result);
}

function positive(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new ValidationError(`ETA invoice ${field} must be greater than zero`);
  return stableNumber(result);
}

function differenceWithinCents(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

function addressRecord(value: unknown): Record<string, string> {
  const address = asRecord(value);
  return Object.fromEntries(Object.entries(address).filter(([, item]) => typeof item === 'string' && item.trim()).map(([key, item]) => [key, String(item).trim()]));
}

function etaAddress(address: Record<string, string>, country = 'EG', branchId?: string): Record<string, string> {
  return {
    ...(branchId ? { branchId } : {}),
    country,
    ...(address.governate || address.governorate ? { governate: address.governate || address.governorate } : {}),
    ...(address.city || address.regionCity ? { regionCity: address.city || address.regionCity } : {}),
    ...(address.street ? { street: address.street } : {}),
    ...(address.buildingNumber ? { buildingNumber: address.buildingNumber } : {}),
    ...(address.postalCode ? { postalCode: address.postalCode } : {}),
  };
}

function canonicalEtaValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return `"${String(value)}"`;
  if (Array.isArray(value)) return value.map((item) => canonicalEtaValue(item)).join('');
  let output = '';
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === null || nested === undefined) continue;
    const name = key.toUpperCase();
    if (Array.isArray(nested)) {
      output += `"${name}"`;
      for (const item of nested) output += `"${name}"${canonicalEtaValue(item)}`;
    } else {
      output += `"${name}"${canonicalEtaValue(nested)}`;
    }
  }
  return output;
}

export function serializeEtaDocument(document: Record<string, unknown>): string {
  return canonicalEtaValue(document);
}

export function hashEtaDocument(document: Record<string, unknown>): string {
  return createHash('sha256').update(Buffer.from(serializeEtaDocument(document), 'utf8')).digest('hex');
}

async function createCadesBesSignature(documentHash: string, certificate: string, privateKey: string, passphrase?: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'health-erp-eta-sign-'));
  const hashPath = join(directory, 'document-hash.bin');
  const certificatePath = join(directory, 'signer.pem');
  const privateKeyPath = join(directory, 'signer-key.pem');
  const signaturePath = join(directory, 'signature.der');
  try {
    await writeFile(hashPath, Buffer.from(documentHash, 'hex'), { mode: 0o600 });
    await writeFile(certificatePath, certificate, { mode: 0o600 });
    await writeFile(privateKeyPath, privateKey, { mode: 0o600 });
    const args = ['cms', '-sign', '-binary', '-in', hashPath, '-signer', certificatePath, '-inkey', privateKeyPath, '-outform', 'DER', '-out', signaturePath, '-md', 'sha256', '-nosmimecap'];
    if (passphrase) args.push('-passin', 'pass:' + passphrase);
    await execFileAsync('openssl', args, { timeout: 15_000, maxBuffer: 1024 * 1024 });
    return (await readFile(signaturePath)).toString('base64');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CAdES-BES signing failed';
    throw new ValidationError(`ETA CAdES-BES signature could not be created: ${message}`);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

function parseEtaError(body: unknown, fallback: string): { code: string; message: string } {
  const value = asRecord(body);
  const error = asRecord(value.error || value.Error);
  return { code: String(error.code || value.code || 'eta_provider_error'), message: String(error.message || value.message || fallback) };
}

async function requestEtaJson(runtime: TenantProviderRuntime, url: string, init: RequestInit): Promise<{ status: number; headers: Headers; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ETA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    throw new ConflictError(error instanceof Error && error.name === 'AbortError' ? 'ETA request timed out' : `ETA request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function getEtaAccessToken(tenantId: string, runtime: TenantProviderRuntime, config: RuntimeConfig): Promise<string> {
  const cacheKey = `${tenantId}:${runtime.environment}:${config.identityEndpointUrl}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const clientId = runtime.secrets.clientId;
  const clientSecret = runtime.secrets.clientSecret;
  if (!clientId || !clientSecret) throw new ValidationError('ETA client credentials are not configured');
  const response = await requestEtaJson(runtime, endpoint(config.identityEndpointUrl, 'connect/token'), {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'InvoicingAPI' }).toString(),
  });
  if (response.status !== 200) {
    const parsed = parseEtaError(response.body, `ETA token request returned HTTP ${response.status}`);
    throw new ConflictError(`${parsed.code}: ${parsed.message}`);
  }
  const body = asRecord(response.body);
  const token = String(body.access_token || '');
  const expiresIn = Number(body.expires_in || 3600);
  if (!token) throw new ConflictError('ETA token response did not contain access_token');
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000 });
  return token;
}

async function loadDocumentTypeVersion(runtime: TenantProviderRuntime, config: RuntimeConfig, token: string): Promise<{ typeName: string; name: string; status: string; schema: unknown }> {
  const response = await requestEtaJson(runtime, endpoint(config.systemApiEndpointUrl, `api/v1.0/documenttypes/${encodeURIComponent(config.documentTypeId)}/versions/${encodeURIComponent(config.documentTypeVersionId)}`), { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (response.status !== 200) {
    const parsed = parseEtaError(response.body, `ETA document type version returned HTTP ${response.status}`);
    throw new ConflictError(`${parsed.code}: ${parsed.message}`);
  }
  const body = asRecord(response.body);
  const typeName = String(body.typeName || '').toLowerCase();
  const name = String(body.name || '');
  const status = String(body.status || '').toLowerCase();
  if (typeName !== 'i' || status !== 'published' || !name) throw new ValidationError('Configured ETA document type version is not a published invoice version');
  return { typeName, name, status, schema: body.jsonSchema || null };
}

function itemValues(item: InvoiceLineInput): { description: string; itemCode: string; itemType: string; unitType: string; quantity: number; unitPrice: number; discount: number; taxRate?: number; taxAmount?: number } {
  const description = String(item.description || '').trim();
  const itemCode = String(item.itemCode || item.code || '').trim();
  const itemType = String(item.itemType || 'EGS').trim().toUpperCase();
  const unitType = String(item.unitType || 'EA').trim();
  if (!description || !itemCode) throw new ValidationError('Every ETA invoice line requires description and item code');
  if (!['GS1', 'EGS'].includes(itemType)) throw new ValidationError('ETA invoice line itemType must be GS1 or EGS');
  const quantity = positive(item.quantity ?? 1, 'line quantity');
  const unitPrice = positive(item.unitPrice ?? item.unit_price ?? item.price, 'line unitPrice');
  const discount = money(item.discountAmount ?? item.discount ?? 0, 'line discount');
  if (discount > quantity * unitPrice) throw new ValidationError('ETA line discount cannot exceed line value');
  const taxRate = item.taxRate === undefined ? undefined : money(item.taxRate, 'line taxRate');
  const taxAmount = item.taxAmount === undefined ? undefined : money(item.taxAmount, 'line taxAmount');
  return { description, itemCode, itemType, unitType, quantity, unitPrice, discount, taxRate, taxAmount };
}

export async function buildEtaInvoiceDocument(input: { invoice: Record<string, any>; patient: Record<string, any>; tenant: Record<string, any>; config: RuntimeConfig; documentTypeVersion: string; clinic: Awaited<ReturnType<typeof loadClinicDocumentContext>> }): Promise<{ document: Record<string, unknown>; documentHash: string }> {
  const items = parseJson<InvoiceLineInput[]>(input.invoice.items, []);
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError('Invoice must contain at least one structured line item before ETA submission');
  const patientName = `${String(input.patient.first_name || '').trim()} ${String(input.patient.last_name || '').trim()}`.trim();
  if (!patientName) throw new ValidationError('Patient name is required for ETA receiver data');
  const invoiceAddress = addressRecord(input.patient.address);
  let totalSalesAmount = 0; let totalDiscountAmount = 0; let taxTotalAmount = 0;
  const taxItems = new Map<string, number>();
  const invoiceLines = items.map((raw) => {
    const item = itemValues(raw);
    const gross = stableNumber(item.quantity * item.unitPrice);
    const netBeforeTax = stableNumber(gross - item.discount);
    const rate = item.taxRate ?? input.config.taxRate;
    const tax = input.config.taxCalculationMode === 'exempt' ? 0 : item.taxAmount ?? stableNumber(input.config.taxCalculationMode === 'inclusive' ? netBeforeTax - (netBeforeTax / (1 + rate / 100)) : netBeforeTax * rate / 100);
    const netTotal = input.config.taxCalculationMode === 'inclusive' ? stableNumber(netBeforeTax - tax) : netBeforeTax;
    const total = input.config.taxCalculationMode === 'inclusive' ? netBeforeTax : stableNumber(netTotal + tax);
    totalSalesAmount = stableNumber(totalSalesAmount + gross); totalDiscountAmount = stableNumber(totalDiscountAmount + item.discount); taxTotalAmount = stableNumber(taxTotalAmount + tax);
    if (tax > 0) taxItems.set(input.config.taxTypeCode, stableNumber((taxItems.get(input.config.taxTypeCode) || 0) + tax));
    return {
      description: item.description, itemType: item.itemType, itemCode: item.itemCode, unitType: item.unitType, quantity: item.quantity,
      unitValue: { currencySold: input.config.currencyCode, amountEGP: item.unitPrice }, salesTotal: gross, total, valueDifference: 0, totalTaxableFees: 0, netTotal, itemsDiscount: item.discount,
      ...(item.discount > 0 ? { discount: { rate: stableNumber(item.discount / gross * 100), amount: item.discount } } : {}),
      ...(tax > 0 ? { taxableItems: [{ taxType: input.config.taxTypeCode, amount: tax, subType: 'S', rate }] } : {}),
    };
  });
  const netAmount = stableNumber(totalSalesAmount - totalDiscountAmount);
  const totalAmount = stableNumber(netAmount + taxTotalAmount);
  if (!differenceWithinCents(totalAmount, Number(input.invoice.total))) throw new ValidationError(`Configured ETA tax calculation produces ${totalAmount}, but invoice total is ${Number(input.invoice.total)}`);
  const document: Record<string, unknown> = {
    issuer: { type: 'B', id: input.config.taxRegistrationNumber, name: input.clinic.legalName || input.clinic.displayName, address: etaAddress(addressRecord({ street: input.clinic.address }), 'EG', input.config.issuerBranchCode) },
    receiver: { type: 'P', ...(input.patient.national_id ? { id: String(input.patient.national_id) } : {}), name: patientName, address: etaAddress(invoiceAddress, 'EG') },
    documentType: 'i', documentTypeVersion: input.documentTypeVersion, dateTimeIssued: new Date(input.invoice.issued_at || input.invoice.created_at).toISOString(), taxpayerActivityCode: input.config.activityCode,
    internalId: `${input.config.invoiceSeries}-${input.invoice.invoice_number}`,
    payment: { terms: input.invoice.due_date ? `Due ${input.invoice.due_date}` : undefined },
    invoiceLines, totalSalesAmount, totalDiscountAmount, netAmount,
    taxTotals: [...taxItems.entries()].map(([taxType, amount]) => ({ taxType, amount })), extraDiscountAmount: 0, totalItemsDiscountAmount: totalDiscountAmount, totalAmount, signatures: [],
    ...(input.invoice.service_delivery_date ? { serviceDeliveryDate: input.invoice.service_delivery_date } : {}),
  };
  return { document, documentHash: hashEtaDocument(document) };
}

async function signDocument(document: Record<string, unknown>, runtime: TenantProviderRuntime): Promise<Record<string, unknown>> {
  const certificate = runtime.secrets.signingCertificate;
  const privateKey = runtime.secrets.signingPrivateKey;
  if (!certificate || !privateKey) throw new ValidationError('ETA signing certificate and private key are required');
  const documentHash = hashEtaDocument(document);
  const signature = await createCadesBesSignature(documentHash, certificate, privateKey, runtime.secrets.signingPrivateKeyPassphrase);
  return { ...document, signatures: [{ type: 'I', value: signature }] };
}

function localStatusFromEta(value: unknown): EtaLocalStatus {
  const status = String(value || '').toLowerCase().replaceAll(' ', '_');
  if (status === 'valid') return 'approved';
  if (status === 'invalid' || status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'submitted' || status === 'in_progress' || status === 'received') return 'submitted';
  return 'submitted';
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(headers: Headers): number {
  const value = Number(headers.get('retry-after') || 60);
  return Math.min(Math.max(Number.isFinite(value) ? value : 60, 10), 3600) * 1000;
}

async function loadEtaContext(etaInvoiceId: string): Promise<{ etaInvoice: EtaInvoiceRow; invoice: Record<string, any>; patient: Record<string, any>; tenant: Record<string, any>; runtime: TenantProviderRuntime; config: RuntimeConfig; clinic: Awaited<ReturnType<typeof loadClinicDocumentContext>> }> {
  const etaInvoice = await db('eta_invoices').where({ id: etaInvoiceId }).first() as EtaInvoiceRow | undefined;
  if (!etaInvoice?.invoice_id) throw new ValidationError('ETA invoice is not linked to an application invoice');
  const invoice = await db('invoices').where({ id: etaInvoice.invoice_id, tenant_id: etaInvoice.tenant_id }).first();
  const patient = invoice ? await db('patients').where({ id: invoice.patient_id, tenant_id: etaInvoice.tenant_id }).first() : null;
  const tenant = await db('tenants').where({ id: etaInvoice.tenant_id }).first();
  if (!invoice || !patient || !tenant) throw new ConflictError('ETA invoice source data is no longer available');
  const runtime = await getTenantProviderRuntime(etaInvoice.tenant_id, 'eta');
  if (!runtime || runtime.status === 'disabled') throw new ValidationError('ETA provider connection is not configured or is disabled');
  const adapter = await validateClinicProviderAdapter(etaInvoice.tenant_id, 'eta');
  if (adapter.status !== 'ready') throw new ValidationError(`ETA provider is not ready: ${adapter.message}`, { missing: adapter.missing, code: adapter.code });
  const config = parseRuntimeConfig(runtime);
  const clinic = await loadClinicDocumentContext(etaInvoice.tenant_id);
  return { etaInvoice, invoice, patient, tenant, runtime, config, clinic };
}

export async function generateEtaDraft(input: { tenantId: string; invoiceId: string; documentType: string; actorId: string }): Promise<Record<string, unknown>> {
  if (input.documentType !== 'I') throw new ValidationError('Function 5 currently supports ETA invoices only; credit and debit notes require their own referenced-document mapping');
  const invoice = await db('invoices').where({ id: input.invoiceId, tenant_id: input.tenantId }).first();
  if (!invoice) throw new ConflictError('Invoice not found');
  const patient = await db('patients').where({ id: invoice.patient_id, tenant_id: input.tenantId }).first();
  const runtime = await getTenantProviderRuntime(input.tenantId, 'eta');
  if (!runtime) throw new ValidationError('ETA provider connection is not configured');
  const config = parseRuntimeConfig(runtime);
  const clinic = await loadClinicDocumentContext(input.tenantId);
  const token = await getEtaAccessToken(input.tenantId, runtime, config);
  const version = await loadDocumentTypeVersion(runtime, config, token);
  const built = await buildEtaInvoiceDocument({ invoice, patient, tenant: await db('tenants').where({ id: input.tenantId }).first(), config, documentTypeVersion: version.name, clinic });
  const existing = await db('eta_invoices').where({ tenant_id: input.tenantId, invoice_id: input.invoiceId, request_hash: built.documentHash }).whereIn('status', ['draft', 'pending', 'submitted', 'approved']).first();
  if (existing) return existing;
  const internalId = `${config.invoiceSeries}-${invoice.invoice_number}`;
  const [etaInvoice] = await db('eta_invoices').insert({ tenant_id: input.tenantId, invoice_id: input.invoiceId, document_type: 'I', transaction_type: 'S', status: 'draft', eta_json: JSON.stringify(built.document), request_hash: built.documentHash, document_hash: built.documentHash, document_type_version: version.name, internal_id: internalId, provider_environment: runtime.environment, qr_code_data: null, submission_attempts: 0 }).returning('*');
  await logAudit({ tenantId: input.tenantId, userId: input.actorId, action: 'eta.invoice.generated', entityType: 'eta_invoice', entityId: etaInvoice.id, metadata: { invoiceId: input.invoiceId, documentTypeVersion: version.name, documentHash: built.documentHash } });
  return etaInvoice;
}

export async function submitEtaInvoice(etaInvoiceId: string, actorId?: string): Promise<Record<string, unknown>> {
  const context = await loadEtaContext(etaInvoiceId);
  const { etaInvoice, invoice, patient, tenant, runtime, config, clinic } = context;
  if (['approved', 'cancelled'].includes(etaInvoice.status)) return { ...etaInvoice };
  if (etaInvoice.submission_uuid && ['submitted', 'processing', 'retry_wait'].includes(etaInvoice.status)) return { ...etaInvoice };
  const version = etaInvoice.document_type_version || (await loadDocumentTypeVersion(runtime, config, await getEtaAccessToken(etaInvoice.tenant_id, runtime, config))).name;
  const built = await buildEtaInvoiceDocument({ invoice, patient, tenant, config, documentTypeVersion: version, clinic });
  const signedDocument = await signDocument(built.document, runtime);
  const payload = { documents: [signedDocument] };
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const existing = await db('eta_invoices').where({ tenant_id: etaInvoice.tenant_id, request_hash: requestHash }).whereIn('status', ['submitted', 'approved']).whereNot({ id: etaInvoice.id }).first();
  if (existing) throw new ConflictError('An identical ETA document has already been submitted for this tenant and invoice revision');
  await db('eta_invoices').where({ id: etaInvoice.id, tenant_id: etaInvoice.tenant_id }).update({ status: 'processing', eta_json: JSON.stringify(signedDocument), request_hash: requestHash, document_hash: built.documentHash, document_type_version: version, internal_id: `${config.invoiceSeries}-${invoice.invoice_number}`, provider_environment: runtime.environment, updated_at: new Date(), error_message: null, last_error_code: null, submission_attempts: db.raw('submission_attempts + 1') });
  const token = await getEtaAccessToken(etaInvoice.tenant_id, runtime, config);
  const response = await requestEtaJson(runtime, endpoint(config.systemApiEndpointUrl, 'api/v1.0/documentsubmissions/'), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
  const body = response.body as EtaSubmissionResponse;
  if (response.status === 202) {
    const accepted = body.acceptedDocuments?.find((document) => document.internalId === `${config.invoiceSeries}-${invoice.invoice_number}`) || body.acceptedDocuments?.[0];
    const rejected = body.rejectedDocuments?.[0];
    const status: EtaLocalStatus = accepted ? 'submitted' : 'rejected';
    const update: Record<string, unknown> = { status, submission_uuid: body.submissionUUID || null, eta_uuid: accepted?.uuid || null, long_id: accepted?.longId || null, eta_response: JSON.stringify(body), status_payload: JSON.stringify(body), submitted_at: new Date(), last_http_status: response.status, next_retry_at: accepted ? new Date(Date.now() + ETA_STATUS_POLL_INTERVAL_MS) : null, rejection_reason: rejected ? JSON.stringify(rejected.error || rejected) : null, error_message: rejected ? 'ETA rejected the document during submission' : null, last_error_code: rejected ? String(asRecord(rejected.error).code || 'document_rejected') : null, updated_at: new Date() };
    await db('eta_invoices').where({ id: etaInvoice.id, tenant_id: etaInvoice.tenant_id }).update(update);
    await logAudit({ tenantId: etaInvoice.tenant_id, userId: actorId, action: accepted ? 'eta.invoice.submitted' : 'eta.invoice.rejected', entityType: 'eta_invoice', entityId: etaInvoice.id, metadata: { submissionUUID: body.submissionUUID, etaUUID: accepted?.uuid, response: body }, result: accepted ? 'success' : 'failed' });
    return { ...(await db('eta_invoices').where({ id: etaInvoice.id }).first()), providerResponse: body };
  }
  const parsed = parseEtaError(body, `ETA submission returned HTTP ${response.status}`);
  const retryable = retryableStatus(response.status) || parsed.code === 'DuplicateSubmission';
  await db('eta_invoices').where({ id: etaInvoice.id, tenant_id: etaInvoice.tenant_id }).update({ status: retryable ? 'retry_wait' : 'failed', error_message: parsed.message, last_error_code: parsed.code, last_http_status: response.status, eta_response: JSON.stringify(body), status_payload: JSON.stringify(body), next_retry_at: retryable ? new Date(Date.now() + retryAfterMs(response.headers)) : null, updated_at: new Date() });
  await logAudit({ tenantId: etaInvoice.tenant_id, userId: actorId, action: 'eta.invoice.submit_failed', entityType: 'eta_invoice', entityId: etaInvoice.id, metadata: { code: parsed.code, httpStatus: response.status, retryable }, result: 'failed' });
  throw new ConflictError(`${parsed.code}: ${parsed.message}`);
}

export async function refreshEtaInvoiceStatus(etaInvoiceId: string, actorId?: string): Promise<Record<string, unknown>> {
  const context = await loadEtaContext(etaInvoiceId);
  const { etaInvoice, runtime, config, invoice } = context;
  if (!etaInvoice.submission_uuid) return { ...etaInvoice };
  const token = await getEtaAccessToken(etaInvoice.tenant_id, runtime, config);
  const response = await requestEtaJson(runtime, endpoint(config.systemApiEndpointUrl, `api/v1.0/documentsubmissions/${encodeURIComponent(etaInvoice.submission_uuid)}?pageNo=1&pageSize=20`), { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (response.status !== 200) throw new ConflictError(`ETA status request returned HTTP ${response.status}`);
  const body = asRecord(response.body);
  const summaries = Array.isArray(body.documentSummary) ? body.documentSummary as Array<Record<string, unknown>> : [];
  const internalId = `${config.invoiceSeries}-${invoice.invoice_number}`;
  const summary = summaries.find((item) => item.internalId === internalId) || summaries[0];
  const localStatus = localStatusFromEta(summary?.status || body.overallStatus);
  const update: Record<string, unknown> = { status: localStatus, status_payload: JSON.stringify(body), eta_response: JSON.stringify(body), last_status_check_at: new Date(), last_http_status: response.status, next_retry_at: localStatus === 'submitted' ? new Date(Date.now() + ETA_STATUS_POLL_INTERVAL_MS) : null, updated_at: new Date() };
  if (summary?.uuid) update.eta_uuid = summary.uuid;
  if (summary?.longId) update.long_id = summary.longId;
  if (localStatus === 'approved') update.approved_at = new Date();
  if (localStatus === 'rejected') { update.rejection_reason = JSON.stringify(body); update.error_message = 'ETA document validation failed or was rejected'; }
  await db('eta_invoices').where({ id: etaInvoice.id, tenant_id: etaInvoice.tenant_id }).update(update);
  await logAudit({ tenantId: etaInvoice.tenant_id, userId: actorId, action: 'eta.invoice.status_refreshed', entityType: 'eta_invoice', entityId: etaInvoice.id, metadata: { status: localStatus, submissionUUID: etaInvoice.submission_uuid } });
  return { ...(await db('eta_invoices').where({ id: etaInvoice.id }).first()), providerResponse: body };
}

export async function resolveEtaNotificationTenant(apiKey: string): Promise<string | null> {
  if (!apiKey) return null;
  const row = await db('clinic_integration_secrets').where({ provider: 'eta', secret_key: 'notificationApiKey', value_hash: hashString(apiKey), is_active: true }).select('tenant_id').first() as { tenant_id: string } | undefined;
  return row?.tenant_id || null;
}

export async function processEtaNotification(input: { tenantId: string; deliveryId: string; type: string; payload: Record<string, unknown> }): Promise<void> {
  const [delivery] = await db('eta_notification_deliveries').insert({ tenant_id: input.tenantId, delivery_id: input.deliveryId, notification_type: input.type, payload: JSON.stringify(input.payload), processed_at: new Date() }).onConflict(['tenant_id', 'delivery_id']).ignore().returning('id');
  if (!delivery) return;
  const messages = Array.isArray(input.payload.message) ? input.payload.message as Array<Record<string, unknown>> : [];
  for (const message of messages) {
    const status = localStatusFromEta(message.status || message.type);
    const update: Record<string, unknown> = { status, status_payload: JSON.stringify(message), last_status_check_at: new Date(), updated_at: new Date() };
    if (message.uuid) update.eta_uuid = String(message.uuid);
    if (message.submissionUUID) update.submission_uuid = String(message.submissionUUID);
    if (status === 'approved') update.approved_at = new Date();
    if (status === 'rejected') { update.rejection_reason = JSON.stringify(message); update.error_message = 'ETA document was rejected'; }
    await db('eta_invoices').where({ tenant_id: input.tenantId }).modify((query) => {
      query.where('eta_uuid', String(message.uuid || ''));
      if (message.internalId) query.orWhere(function () { this.where('internal_id', String(message.internalId)).andWhere('tenant_id', input.tenantId); });
    }).update(update);
  }
}

let etaWorkerInterval: NodeJS.Timeout | null = null;
let etaWorkerRunning = false;

export async function processEtaQueueOnce(): Promise<void> {
  if (etaWorkerRunning) return;
  etaWorkerRunning = true;
  try {
    const candidates = await db('eta_invoices').whereIn('status', ['pending', 'retry_wait', 'submitted']).where(function () { this.whereNull('next_retry_at').orWhere('next_retry_at', '<=', new Date()); }).orderBy('created_at', 'asc').limit(10);
    for (const candidate of candidates as EtaInvoiceRow[]) {
      const claimed = await db.transaction(async (trx) => {
        const row = await trx('eta_invoices').where({ id: candidate.id }).whereIn('status', ['pending', 'retry_wait', 'submitted']).forUpdate().skipLocked().first();
        if (!row) return false;
        await trx('eta_invoices').where({ id: candidate.id }).update({ status: 'processing', updated_at: new Date() });
        return true;
      });
      if (!claimed) continue;
      try {
        const current = await db('eta_invoices').where({ id: candidate.id }).first() as EtaInvoiceRow;
        if (current.submission_uuid) await refreshEtaInvoiceStatus(candidate.id);
        else await submitEtaInvoice(candidate.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ETA queue processing failed';
        await db('eta_invoices').where({ id: candidate.id }).update({ status: 'failed', error_message: message, updated_at: new Date() });
      }
    }
  } finally {
    etaWorkerRunning = false;
  }
}

export function startEtaWorker(): void {
  if (etaWorkerInterval) return;
  etaWorkerInterval = setInterval(() => processEtaQueueOnce().catch((error) => console.error('ETA worker error:', error)), ETA_STATUS_POLL_INTERVAL_MS);
  etaWorkerInterval.unref();
}

export function stopEtaWorker(): void {
  if (!etaWorkerInterval) return;
  clearInterval(etaWorkerInterval);
  etaWorkerInterval = null;
}

export function clearEtaTokenCache(): void {
  tokenCache.clear();
}
