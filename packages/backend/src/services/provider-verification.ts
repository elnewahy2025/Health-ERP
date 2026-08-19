import crypto from 'node:crypto';
import Stripe from 'stripe';
import twilio from 'twilio';
import { getTenantProviderRuntime, type TenantProviderRuntime } from './clinic-provider-runtime.js';
import { validateClinicProviderAdapter, type ProviderAdapterResult } from './clinic-provider-adapters.js';
import { getClinicProviderContract } from './clinic-provider-contracts.js';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';
import { ConflictError, NotFoundError, ValidationError } from '@healthcare/shared/errors';
import { verifyEtaOAuthAuthentication } from './eta-invoice-service.js';

export type ProviderVerificationType =
  | 'sandbox_authentication'
  | 'account_authentication'
  | 'oauth_authentication'
  | 'sandbox_readiness';
export type ProviderVerificationStatus = 'queued' | 'running' | 'passed' | 'failed' | 'not_supported';

export interface ProviderVerificationView {
  id: string;
  tenantId: string;
  providerKey: string;
  environment: string;
  verificationType: ProviderVerificationType;
  idempotencyKey: string;
  status: ProviderVerificationStatus;
  resultCode: string | null;
  message: string | null;
  evidence: Record<string, unknown>;
  actorId: string | null;
  requestId: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface ProviderVerificationRow {
  id: string;
  tenant_id: string;
  provider_connection_id: string | null;
  provider_key: string;
  environment: string;
  verification_type: ProviderVerificationType;
  idempotency_key: string;
  status: ProviderVerificationStatus;
  result_code: string | null;
  message: string | null;
  evidence_json: unknown;
  actor_id: string | null;
  request_id: string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface VerificationOutcome {
  status: Exclude<ProviderVerificationStatus, 'queued' | 'running'>;
  resultCode: string;
  message: string;
  evidence: Record<string, unknown>;
  expiresAt?: Date;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapRow(row: ProviderVerificationRow): ProviderVerificationView {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    providerKey: row.provider_key,
    environment: row.environment,
    verificationType: row.verification_type,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    resultCode: row.result_code,
    message: row.message,
    evidence: asRecord(row.evidence_json),
    actorId: row.actor_id,
    requestId: row.request_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizedAdapterEvidence(result: ProviderAdapterResult): Record<string, unknown> {
  return {
    structuralStatus: result.status,
    structuralCode: result.code,
    testMode: result.testMode,
    missing: result.missing,
  };
}

function safeAccountSid(value: unknown): string {
  const sid = String(value || '');
  return sid.length > 8 ? `${sid.slice(0, 4)}…${sid.slice(-4)}` : sid ? 'configured' : 'unavailable';
}

async function verifyStripeAuthentication(runtime: TenantProviderRuntime, verificationType: ProviderVerificationType): Promise<VerificationOutcome> {
  if (!['sandbox_authentication', 'account_authentication'].includes(verificationType)) {
    return { status: 'not_supported', resultCode: 'stripe_verification_type_not_supported', message: 'Stripe verification type is not supported', evidence: {} };
  }
  if (verificationType === 'sandbox_authentication' && runtime.environment !== 'sandbox') {
    return { status: 'failed', resultCode: 'stripe_sandbox_environment_required', message: 'Stripe sandbox authentication requires the provider environment to be sandbox', evidence: { configuredEnvironment: runtime.environment } };
  }
  const secretKey = runtime.secrets.secretKey;
  if (!secretKey) return { status: 'failed', resultCode: 'stripe_secret_missing', message: 'Stripe secret key is not configured', evidence: {} };
  try {
    const stripe = new Stripe(secretKey);
    const balance = await stripe.balance.retrieve();
    const liveMode = Boolean(balance?.livemode);
    const expectedLiveMode = runtime.environment === 'production';
    if (liveMode !== expectedLiveMode) {
      return {
        status: 'failed',
        resultCode: 'stripe_environment_mismatch',
        message: 'Stripe credential mode does not match the configured provider environment',
        evidence: { configuredEnvironment: runtime.environment, providerLiveMode: liveMode },
      };
    }
    return {
      status: 'passed',
      resultCode: 'stripe_account_authenticated',
      message: 'Stripe account authentication succeeded for the configured environment',
      evidence: { configuredEnvironment: runtime.environment, providerLiveMode: liveMode, availableBalanceCurrencies: Array.isArray(balance?.available) ? balance.available.map((item) => String((item as { currency?: unknown }).currency || '')).filter(Boolean).sort() : [] },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  } catch {
    return { status: 'failed', resultCode: 'stripe_account_authentication_failed', message: 'Stripe account authentication failed', evidence: { configuredEnvironment: runtime.environment } };
  }
}

async function verifyTwilioAuthentication(runtime: TenantProviderRuntime): Promise<VerificationOutcome> {
  const accountSid = runtime.secrets.account_sid;
  const authToken = runtime.secrets.auth_token;
  if (!accountSid || !authToken) return { status: 'failed', resultCode: 'twilio_credentials_missing', message: 'Twilio Account SID and auth token are required', evidence: {} };
  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.v2010.accounts(accountSid).fetch();
    return {
      status: 'passed',
      resultCode: 'twilio_account_authenticated',
      message: 'Twilio account authentication succeeded; no message or call was sent',
      evidence: { accountSid: safeAccountSid(account?.sid || accountSid), accountStatus: String(account?.status || 'unknown'), providerEnvironment: runtime.environment, deliveryTestPerformed: false },
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  } catch {
    return { status: 'failed', resultCode: 'twilio_account_authentication_failed', message: 'Twilio account authentication failed; no message or call was sent', evidence: { providerEnvironment: runtime.environment, deliveryTestPerformed: false } };
  }
}

async function verifyFawryReadiness(tenantId: string, runtime: TenantProviderRuntime): Promise<VerificationOutcome> {
  if (runtime.environment !== 'sandbox') {
    return { status: 'failed', resultCode: 'fawry_sandbox_environment_required', message: 'Fawry sandbox readiness requires the provider environment to be sandbox', evidence: { configuredEnvironment: runtime.environment } };
  }
  const structural = await validateClinicProviderAdapter(tenantId, 'fawry');
  if (structural.status !== 'ready') {
    return { status: 'failed', resultCode: structural.code, message: structural.message, evidence: sanitizedAdapterEvidence(structural) };
  }
  return {
    status: 'passed',
    resultCode: 'fawry_sandbox_request_boundary_ready',
    message: 'Fawry sandbox request boundary is structurally ready; no payment reference was created',
    evidence: { ...sanitizedAdapterEvidence(structural), configuredEnvironment: runtime.environment, paymentReferenceCreated: false, callbackVerified: false },
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  };
}

async function verifyProvider(tenantId: string, providerKey: string, verificationType: ProviderVerificationType, runtime: TenantProviderRuntime): Promise<VerificationOutcome> {
  if (providerKey === 'instapay_manual') return { status: 'not_supported', resultCode: 'manual_provider_verification_not_supported', message: 'InstaPay manual transfer instructions have no external provider authentication or online operation', evidence: { manualOnly: true } };
  if (providerKey === 'stripe') return verifyStripeAuthentication(runtime, verificationType);
  if (providerKey === 'twilio') {
    if (verificationType !== 'account_authentication') return { status: 'not_supported', resultCode: 'twilio_verification_type_not_supported', message: 'Twilio verification type is not supported', evidence: {} };
    return verifyTwilioAuthentication(runtime);
  }
  if (providerKey === 'eta') {
    if (verificationType !== 'oauth_authentication') return { status: 'not_supported', resultCode: 'eta_verification_type_not_supported', message: 'ETA verification type is not supported', evidence: {} };
    try {
      return await verifyEtaOAuthAuthentication(tenantId);
    } catch {
      return { status: 'failed', resultCode: 'eta_oauth_authentication_failed', message: 'ETA OAuth authentication failed', evidence: { providerEnvironment: runtime.environment } };
    }
  }
  if (providerKey === 'fawry') {
    if (verificationType !== 'sandbox_readiness') return { status: 'not_supported', resultCode: 'fawry_verification_type_not_supported', message: 'Fawry verification type is not supported', evidence: {} };
    return verifyFawryReadiness(tenantId, runtime);
  }
  return { status: 'not_supported', resultCode: 'provider_verification_not_supported', message: 'No provider-specific verification is registered', evidence: {} };
}

export async function runProviderVerification(input: {
  tenantId: string;
  actorId: string;
  providerKey: string;
  verificationType: ProviderVerificationType;
  idempotencyKey: string;
  requestId?: string;
}): Promise<ProviderVerificationView> {
  const contract = getClinicProviderContract(input.providerKey);
  if (!contract) throw new ValidationError(`No provider contract is registered for ${input.providerKey}`);
  const runtime = await getTenantProviderRuntime(input.tenantId, input.providerKey);
  if (!runtime) throw new ConflictError('Provider connection is not configured for this clinic');
  if (runtime.status === 'disabled') throw new ConflictError('Provider connection is disabled for this clinic');

  const existing = await db('provider_verification_runs')
    .where({ tenant_id: input.tenantId, provider_key: input.providerKey, environment: runtime.environment, verification_type: input.verificationType, idempotency_key: input.idempotencyKey })
    .first() as ProviderVerificationRow | undefined;
  if (existing && ['queued', 'running'].includes(existing.status)) return mapRow(existing);
  if (existing && existing.status === 'passed' && (!existing.expires_at || new Date(existing.expires_at) > new Date())) return mapRow(existing);

  const connection = await db('tenant_provider_connections').where({ tenant_id: input.tenantId, provider_key: input.providerKey }).select('id').first() as { id: string } | undefined;
  const [created] = await db('provider_verification_runs')
    .insert({ tenant_id: input.tenantId, provider_connection_id: connection?.id || null, provider_key: input.providerKey, environment: runtime.environment, verification_type: input.verificationType, idempotency_key: input.idempotencyKey, status: 'queued', actor_id: input.actorId, request_id: input.requestId || null })
    .onConflict(['tenant_id', 'provider_key', 'environment', 'verification_type', 'idempotency_key'])
    .ignore()
    .returning('*');
  const run = (created || await db('provider_verification_runs')
    .where({ tenant_id: input.tenantId, provider_key: input.providerKey, environment: runtime.environment, verification_type: input.verificationType, idempotency_key: input.idempotencyKey })
    .first()) as ProviderVerificationRow | undefined;
  if (!run) throw new ConflictError('Provider verification could not be created');
  if (run.status !== 'queued') return mapRow(run);

  await db('provider_verification_runs').where({ id: run.id, tenant_id: input.tenantId }).update({ status: 'running', started_at: new Date(), updated_at: new Date() });
  let outcome: VerificationOutcome;
  try {
    outcome = await verifyProvider(input.tenantId, input.providerKey, input.verificationType, runtime);
  } catch {
    outcome = { status: 'failed', resultCode: 'provider_verification_failed', message: 'Provider verification failed', evidence: {} };
  }
  const completedAt = new Date();
  const [updated] = await db('provider_verification_runs').where({ id: run.id, tenant_id: input.tenantId }).update({ status: outcome.status, result_code: outcome.resultCode, message: outcome.message, evidence_json: JSON.stringify(outcome.evidence), completed_at: completedAt, expires_at: outcome.expiresAt || null, updated_at: completedAt }).returning('*');
  try {
    await logAudit({ tenantId: input.tenantId, userId: input.actorId, action: 'provider.verification', entityType: 'provider_verification_run', entityId: run.id, metadata: { providerKey: input.providerKey, verificationType: input.verificationType, status: outcome.status, resultCode: outcome.resultCode } });
  } catch { /* verification result remains durable even if audit logging is unavailable */ }
  return mapRow((updated || await db('provider_verification_runs').where({ id: run.id, tenant_id: input.tenantId }).first()) as ProviderVerificationRow);
}

export async function listProviderVerificationRuns(tenantId: string, providerKey: string, limit = 10): Promise<ProviderVerificationView[]> {
  const rows = await db('provider_verification_runs').where({ tenant_id: tenantId, provider_key: providerKey }).orderBy('created_at', 'desc').limit(Math.min(Math.max(limit, 1), 50)) as ProviderVerificationRow[];
  return rows.map(mapRow);
}

export async function getLatestProviderVerification(tenantId: string, providerKey: string): Promise<ProviderVerificationView | null> {
  const row = await db('provider_verification_runs').where({ tenant_id: tenantId, provider_key: providerKey }).orderBy('created_at', 'desc').first() as ProviderVerificationRow | undefined;
  return row ? mapRow(row) : null;
}

export function generateProviderVerificationIdempotencyKey(providerKey: string, verificationType: string): string {
  return `${providerKey}:${verificationType}:${crypto.randomUUID()}`;
}
