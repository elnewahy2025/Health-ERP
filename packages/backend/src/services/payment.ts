import Stripe from 'stripe';
import { getEnv } from '@healthcare/shared/config';
import { listEffectiveClinicConfiguration } from './clinic-configuration.js';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';
import { providerRuntimeOrFallback } from './clinic-provider-runtime.js';
import { assertClinicProviderOperation } from './clinic-provider-capabilities.js';
import { moneyToCents } from './payment-callbacks.js';

interface PaymentResult {
  success: boolean;
  paymentId?: string;
  redirectUrl?: string;
  reference?: string;
  status?: string;
  environment?: string;
  error?: string;
}

// Stripe payment
export async function createStripePayment(invoiceId: string, amount: number, currency: string, tenantId: string, idempotencyKey?: string): Promise<PaymentResult> {
  const env = getEnv();
  try {
    assertClinicProviderOperation('stripe', 'stripe.checkout.create');
    const runtime = await providerRuntimeOrFallback(tenantId, 'stripe', {
      secrets: { secretKey: env.STRIPE_SECRET_KEY || '' },
    });
    if (runtime?.status === 'disabled') return { success: false, error: 'Stripe is disabled for this clinic.' };
    const stripeSecretKey = runtime?.secrets.secretKey;
    if (!stripeSecretKey) return { success: false, error: 'Stripe is not configured for this clinic.' };
    const normalizedCurrency = currency.toUpperCase();
    const normalizedIdempotencyKey = idempotencyKey?.trim() || null;
    const stripe = new Stripe(stripeSecretKey);
    const invoice = await db('invoices').where({ id: invoiceId, tenant_id: tenantId }).whereNull('deleted_at').first();
    if (!invoice) return { success: false, error: 'Invoice not found' };
    const amountCents = moneyToCents(amount);
    const totalCents = moneyToCents(invoice.total);
    const paidCents = moneyToCents(invoice.paid);
    if (amountCents === null || totalCents === null || paidCents === null || paidCents + amountCents > totalCents) {
      return { success: false, error: 'Payment amount exceeds the invoice amount due.' };
    }
    if (normalizedIdempotencyKey) {
      const existing = await db('payment_transactions')
        .where({ tenant_id: tenantId, provider_key: 'stripe', idempotency_key: normalizedIdempotencyKey })
        .select('reference', 'provider_url', 'status', 'provider_environment', 'provider_currency', 'amount')
        .first() as { reference: string | null; provider_url: string | null; status: string; provider_environment: string | null; provider_currency: string | null; amount: number | string } | undefined;
      if (existing) {
        if (moneyToCents(existing.amount) !== amountCents || existing.provider_currency !== normalizedCurrency || existing.provider_environment !== runtime?.environment) {
          return { success: false, error: 'Stripe idempotency key was already used for a different payment request.' };
        }
        return { success: true, paymentId: existing.reference || undefined, redirectUrl: existing.provider_url || undefined, status: existing.status, environment: existing.provider_environment || undefined };
      }
      await db('payment_transactions').insert({ tenant_id: tenantId, invoice_id: invoiceId, amount, method: 'online', provider_key: 'stripe', reference: null, notes: 'Stripe checkout', status: 'creating', idempotency_key: normalizedIdempotencyKey, provider_environment: runtime?.environment || null, provider_currency: normalizedCurrency, updated_at: new Date() });
    }
    const patient = await db('patients').where({ id: invoice.patient_id, tenant_id: tenantId }).first();
    const tenant = await db('tenants').where({ id: tenantId }).first();
    const clinicName = (await listEffectiveClinicConfiguration(tenantId))
      .find((entry) => entry.key === 'clinic.profile.display_name')?.value;
    const displayName = typeof clinicName === 'string' && clinicName.trim()
      ? clinicName.trim()
      : tenant?.name || 'Clinic';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: patient?.email || undefined,
      line_items: [{
        price_data: {
          currency: normalizedCurrency.toLowerCase(),
          product_data: { name: `Invoice ${invoice.invoice_number} — ${displayName}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: { invoiceId, tenantId, ...(normalizedIdempotencyKey ? { idempotencyKey: normalizedIdempotencyKey } : {}) },
      success_url: `${env.APP_URL}/billing?payment=success&invoice=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL}/billing?payment=cancelled&invoice=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
    }, normalizedIdempotencyKey ? { idempotencyKey: normalizedIdempotencyKey } : undefined);
    if (normalizedIdempotencyKey) {
      await db('payment_transactions').where({ tenant_id: tenantId, provider_key: 'stripe', idempotency_key: normalizedIdempotencyKey, status: 'creating' }).update({ reference: session.id, provider_url: session.url || null, status: 'pending', updated_at: new Date() });
    } else {
      await db('payment_transactions').insert({ tenant_id: tenantId, invoice_id: invoiceId, amount, method: 'online', provider_key: 'stripe', reference: session.id, notes: 'Stripe checkout', status: 'pending', provider_environment: runtime?.environment || null, provider_currency: normalizedCurrency, provider_url: session.url || null, updated_at: new Date() });
    }
    await logAudit({ tenantId, action: 'payment.stripe.create', entityType: 'invoice', entityId: invoiceId, metadata: { amount, currency: normalizedCurrency, providerEnvironment: runtime?.environment, idempotent: Boolean(normalizedIdempotencyKey) } });
    return { success: true, paymentId: session.id, redirectUrl: session.url || undefined, status: 'pending', environment: runtime?.environment };
  } catch (err: any) {
    if (idempotencyKey?.trim()) {
      await db('payment_transactions').where({ tenant_id: tenantId, provider_key: 'stripe', idempotency_key: idempotencyKey.trim(), status: 'creating' }).update({ status: 'failed', notes: 'Stripe checkout creation failed', updated_at: new Date() }).catch(() => undefined);
    }
    return { success: false, error: err.message };
  }
}

// Confirm Stripe payment (webhook). This function is intentionally idempotent:
// one provider transaction can finalize one invoice payment at most once.
export async function confirmStripePayment(sessionId: string): Promise<boolean> {
  const env = getEnv();
  try {
    const payment = await db('payment_transactions')
      .where({ provider_key: 'stripe', reference: sessionId })
      .select('id', 'tenant_id', 'invoice_id', 'amount', 'status', 'provider_environment', 'provider_currency')
      .first() as {
        id: string;
        tenant_id: string;
        invoice_id: string | null;
        amount: number | string;
        status: string;
        provider_environment: string | null;
        provider_currency: string | null;
      } | undefined;
    if (!payment?.tenant_id || !payment.invoice_id) return false;

    assertClinicProviderOperation('stripe', 'stripe.payment.confirm');
    const runtime = await providerRuntimeOrFallback(payment.tenant_id, 'stripe', {
      secrets: { secretKey: env.STRIPE_SECRET_KEY || '' },
    });
    if (runtime?.status === 'disabled') return false;
    if (payment.provider_environment && runtime?.environment !== payment.provider_environment) return false;
    const stripeSecretKey = runtime?.secrets.secretKey;
    if (!stripeSecretKey) return false;

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (Boolean(session.livemode) !== (runtime?.environment === 'production')) return false;
    if (session.payment_status !== 'paid') return false;
    const metadata = session.metadata && typeof session.metadata === 'object' ? session.metadata as Record<string, string> : {};
    if (metadata.tenantId !== payment.tenant_id || metadata.invoiceId !== payment.invoice_id) return false;

    const transactionAmountCents = moneyToCents(payment.amount);
    const providerAmountCents = moneyToCents(session.amount_total === null ? null : Number(session.amount_total) / 100);
    const providerCurrency = String(session.currency || '').toUpperCase();
    if (transactionAmountCents === null || providerAmountCents === null || transactionAmountCents !== providerAmountCents) return false;
    if (payment.provider_currency && providerCurrency !== payment.provider_currency.toUpperCase()) return false;

    await db.transaction(async (trx) => {
      const lockedPayment = await trx('payment_transactions')
        .where({ id: payment.id, tenant_id: payment.tenant_id, provider_key: 'stripe', reference: sessionId })
        .forUpdate()
        .first() as { status: string; invoice_id: string | null; amount: number | string } | undefined;
      if (!lockedPayment || lockedPayment.invoice_id !== payment.invoice_id) throw new Error('Stripe payment transaction changed');
      if (lockedPayment.status === 'completed') return;
      if (lockedPayment.status !== 'pending') throw new Error('Stripe payment transaction is not pending');

      const invoice = await trx('invoices')
        .where({ id: lockedPayment.invoice_id, tenant_id: payment.tenant_id })
        .whereNull('deleted_at')
        .forUpdate()
        .first() as { id: string; total: number | string; paid: number | string } | undefined;
      if (!invoice) throw new Error('Invoice not found');

      const totalCents = moneyToCents(invoice.total);
      const currentPaidCents = moneyToCents(invoice.paid);
      const paidCents = moneyToCents(lockedPayment.amount);
      if (totalCents === null || currentPaidCents === null || paidCents === null || currentPaidCents + paidCents > totalCents) {
        throw new Error('Stripe payment amount exceeds invoice due amount');
      }

      const newPaidCents = currentPaidCents + paidCents;
      const newDueCents = totalCents - newPaidCents;
      await trx('invoices').where({ id: invoice.id, tenant_id: payment.tenant_id }).update({
        paid: newPaidCents / 100,
        due: newDueCents / 100,
        status: newDueCents === 0 ? 'paid' : 'partial',
        payment_method: 'online',
        paid_at: new Date(),
      });
      await trx('payment_transactions').where({ id: payment.id, tenant_id: payment.tenant_id, status: 'pending' }).update({ status: 'completed' });
    });

    await logAudit({ tenantId: payment.tenant_id, action: 'payment.stripe.confirm', entityType: 'invoice', entityId: payment.invoice_id });
    return true;
  } catch {
    return false;
  }
}

export interface StripePaymentReturnState {
  sessionId: string;
  status: 'completed' | 'pending' | 'expired' | 'not_found' | 'reconciliation_failed';
  paymentStatus: string | null;
  invoiceId: string | null;
  paymentTransactionId: string | null;
  amount: number | string | null;
  currency: string | null;
  providerEnvironment: string | null;
}

export async function refreshStripePaymentFromReturn(sessionId: string, tenantId: string): Promise<StripePaymentReturnState> {
  const payment = await db('payment_transactions')
    .where({ tenant_id: tenantId, provider_key: 'stripe', reference: sessionId })
    .select('id', 'tenant_id', 'invoice_id', 'amount', 'status', 'provider_environment', 'provider_currency')
    .first() as { id: string; tenant_id: string; invoice_id: string | null; amount: number | string; status: string; provider_environment: string | null; provider_currency: string | null } | undefined;
  if (!payment) return { sessionId, status: 'not_found', paymentStatus: null, invoiceId: null, paymentTransactionId: null, amount: null, currency: null, providerEnvironment: null };
  if (payment.status === 'completed') return { sessionId, status: 'completed', paymentStatus: 'paid', invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: payment.provider_currency, providerEnvironment: payment.provider_environment };

  if (await confirmStripePayment(sessionId)) {
    return { sessionId, status: 'completed', paymentStatus: 'paid', invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: payment.provider_currency, providerEnvironment: payment.provider_environment };
  }

  const runtime = await providerRuntimeOrFallback(tenantId, 'stripe', { secrets: { secretKey: getEnv().STRIPE_SECRET_KEY || '' } });
  if (!runtime?.secrets.secretKey || runtime.status === 'disabled' || (payment.provider_environment && payment.provider_environment !== runtime.environment)) {
    return { sessionId, status: 'reconciliation_failed', paymentStatus: null, invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: payment.provider_currency, providerEnvironment: payment.provider_environment };
  }
  try {
    const stripe = require('stripe')(runtime.secrets.secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata && typeof session.metadata === 'object' ? session.metadata as Record<string, string> : {};
    if (metadata.tenantId !== tenantId || metadata.invoiceId !== payment.invoice_id || Boolean(session.livemode) !== (runtime.environment === 'production')) {
      return { sessionId, status: 'reconciliation_failed', paymentStatus: String(session.payment_status || ''), invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: payment.provider_currency, providerEnvironment: payment.provider_environment };
    }
    const providerCurrency = String(session.currency || '').toUpperCase() || null;
    if (payment.provider_currency && providerCurrency !== payment.provider_currency.toUpperCase()) {
      return { sessionId, status: 'reconciliation_failed', paymentStatus: String(session.payment_status || ''), invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: providerCurrency, providerEnvironment: payment.provider_environment };
    }
    return { sessionId, status: session.status === 'expired' ? 'expired' : 'pending', paymentStatus: String(session.payment_status || ''), invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: providerCurrency, providerEnvironment: payment.provider_environment };
  } catch {
    return { sessionId, status: 'reconciliation_failed', paymentStatus: null, invoiceId: payment.invoice_id, paymentTransactionId: payment.id, amount: payment.amount, currency: payment.provider_currency, providerEnvironment: payment.provider_environment };
  }
}

export function generatePaymentLink(invoiceId: string, tenantSlug: string): string {
  const env = getEnv();
  return `${env.APP_URL}/pay/${tenantSlug}/${invoiceId}`;
}
