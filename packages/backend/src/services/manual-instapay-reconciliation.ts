import crypto from 'crypto';
import { ConflictError, NotFoundError, ValidationError } from '@healthcare/shared/errors';
import { db } from '../core/database.js';
import { listEffectiveClinicConfiguration } from './clinic-configuration.js';
import { getTenantProviderRuntime } from './clinic-provider-runtime.js';
import { logAudit } from './audit.js';

export type ManualInstapayReconciliationStatus = 'awaiting_transfer' | 'reconciled' | 'rejected';

interface ManualInstapaySettings {
  walletIdentifier: string;
  accountName: string;
  referencePrefix: string;
  instructions: string;
  currency: string;
}

interface ReconciliationRow {
  id: string;
  tenant_id: string;
  invoice_id: string;
  payment_transaction_id: string;
  created_by: string;
  verified_by: string | null;
  local_reference: string;
  status: ManualInstapayReconciliationStatus;
  requested_amount: string | number;
  received_amount: string | number | null;
  currency: string;
  wallet_identifier: string;
  account_name: string;
  instructions: string;
  external_reference: string | null;
  transfer_date: string | Date | null;
  decision_notes: string | null;
  verified_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function requiredText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toCents(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const cents = Math.round(numeric * 100);
  return Math.abs(numeric * 100 - cents) > 0.000001 ? null : cents;
}

function mapReconciliation(row: ReconciliationRow) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    paymentTransactionId: row.payment_transaction_id,
    localReference: row.local_reference,
    status: row.status,
    requestedAmount: Number(row.requested_amount),
    receivedAmount: row.received_amount === null ? null : Number(row.received_amount),
    currency: row.currency,
    walletIdentifier: row.wallet_identifier,
    accountName: row.account_name,
    instructions: row.instructions,
    externalReference: row.external_reference,
    transferDate: row.transfer_date,
    decisionNotes: row.decision_notes,
    createdBy: row.created_by,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadManualInstapaySettings(tenantId: string): Promise<ManualInstapaySettings> {
  const runtime = await getTenantProviderRuntime(tenantId, 'instapay_manual');
  if (!runtime || runtime.status === 'disabled') {
    throw new ConflictError('The manual InstaPay provider is not enabled for this clinic. Configure it in Settings > Integrations.');
  }

  const walletIdentifier = requiredText(runtime.config.walletIdentifier);
  const accountName = requiredText(runtime.config.accountName);
  const referencePrefix = requiredText(runtime.config.referencePrefix);
  const instructions = requiredText(runtime.config.instructions);
  const entries = await listEffectiveClinicConfiguration(tenantId);
  const currency = requiredText(entries.find((entry) => entry.key === 'clinic.finance.currency')?.value).toUpperCase();
  const missing = [
    !walletIdentifier && 'walletIdentifier',
    !accountName && 'accountName',
    !referencePrefix && 'referencePrefix',
    !instructions && 'instructions',
    !currency && 'clinic.finance.currency',
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) {
    throw new ConflictError(`The manual InstaPay provider setup is incomplete. Configure: ${missing.join(', ')}.`);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ConflictError('The clinic currency must be a three-letter ISO 4217 code before the manual InstaPay provider can be used.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/.test(referencePrefix)) {
    throw new ConflictError('The manual InstaPay provider referencePrefix must contain 1-20 letters, numbers, hyphens, or underscores.');
  }
  return { walletIdentifier, accountName, referencePrefix, instructions, currency };
}

function generateLocalReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

async function loadRow(trx: typeof db, tenantId: string, id: string, forUpdate = false): Promise<ReconciliationRow | undefined> {
  let query = trx('manual_instapay_reconciliations').where({ tenant_id: tenantId, id });
  if (forUpdate) query = query.forUpdate();
  return await query.first() as ReconciliationRow | undefined;
}

export async function createManualInstapayRequest(input: {
  tenantId: string;
  userId: string;
  invoiceId: string;
  amount: number;
}) {
  const settings = await loadManualInstapaySettings(input.tenantId);
  const requestedCents = toCents(input.amount);
  if (requestedCents === null || requestedCents <= 0) throw new ValidationError('Manual InstaPay amount must be a positive amount with at most two decimal places.');

  let created = true;
  const row = await db.transaction(async (trx) => {
    const invoice = await trx('invoices')
      .where({ id: input.invoiceId, tenant_id: input.tenantId })
      .whereNull('deleted_at')
      .forUpdate()
      .first() as { id: string; total: string | number; paid: string | number } | undefined;
    if (!invoice) throw new NotFoundError('Invoice', input.invoiceId);
    const dueCents = (toCents(invoice.total) || 0) - (toCents(invoice.paid) || 0);
    if (dueCents <= 0) throw new ConflictError('The invoice has no amount due.');
    if (requestedCents > dueCents) throw new ConflictError('Manual InstaPay amount exceeds the current invoice amount due.');

    const existing = await trx('manual_instapay_reconciliations')
      .where({ tenant_id: input.tenantId, invoice_id: input.invoiceId, status: 'awaiting_transfer' })
      .first() as ReconciliationRow | undefined;
    if (existing) {
      if (toCents(existing.requested_amount) !== requestedCents) {
        throw new ConflictError('This invoice already has a pending manual InstaPay request for a different amount.');
      }
      created = false;
      return existing;
    }

    const localReference = generateLocalReference(settings.referencePrefix);
    const [payment] = await trx('payment_transactions').insert({
      tenant_id: input.tenantId,
      invoice_id: input.invoiceId,
      amount: input.amount,
      method: 'wallet',
      provider_key: 'instapay_manual',
      reference: localReference,
      status: 'pending',
      notes: 'Manual InstaPay transfer awaiting staff reconciliation',
      updated_at: trx.fn.now(),
    }).returning('id');
    const paymentId = typeof payment === 'string' ? payment : payment.id;

    const [inserted] = await trx('manual_instapay_reconciliations').insert({
      tenant_id: input.tenantId,
      invoice_id: input.invoiceId,
      payment_transaction_id: paymentId,
      created_by: input.userId,
      local_reference: localReference,
      status: 'awaiting_transfer',
      requested_amount: input.amount,
      currency: settings.currency,
      wallet_identifier: settings.walletIdentifier,
      account_name: settings.accountName,
      instructions: settings.instructions,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    }).returning('*');
    return inserted as ReconciliationRow;
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.userId,
    action: created ? 'payment.instapay_manual_requested' : 'payment.instapay_manual_request_retrieved',
    entityType: 'manual_instapay_reconciliation',
    entityId: row.id,
    metadata: { invoiceId: input.invoiceId, amount: Number(row.requested_amount), localReference: row.local_reference },
  });
  return { ...mapReconciliation(row), created };
}

export async function listManualInstapayReconciliations(tenantId: string, invoiceId: string) {
  const rows = await db('manual_instapay_reconciliations')
    .where({ tenant_id: tenantId, invoice_id: invoiceId })
    .orderBy('created_at', 'desc') as ReconciliationRow[];
  return rows.map(mapReconciliation);
}

export async function reconcileManualInstapay(input: {
  tenantId: string;
  userId: string;
  reconciliationId: string;
  externalReference: string;
  receivedAmount: number;
  transferDate: string;
  decisionNotes: string;
}) {
  const externalReference = requiredText(input.externalReference);
  const decisionNotes = requiredText(input.decisionNotes);
  const transferDate = requiredText(input.transferDate);
  if (!externalReference || externalReference.length > 255) throw new ValidationError('A valid bank or wallet statement reference is required.');
  if (!decisionNotes || decisionNotes.length < 3) throw new ValidationError('Verification notes are required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) throw new ValidationError('Transfer date must use YYYY-MM-DD.');
  const receivedCents = toCents(input.receivedAmount);
  if (receivedCents === null || receivedCents <= 0) throw new ValidationError('Verified received amount must be positive with at most two decimal places.');

  let idempotent = false;
  const row = await db.transaction(async (trx) => {
    const reconciliation = await loadRow(trx, input.tenantId, input.reconciliationId, true);
    if (!reconciliation) throw new NotFoundError('Manual InstaPay reconciliation', input.reconciliationId);
    if (reconciliation.status === 'reconciled') {
      idempotent = true;
      return reconciliation;
    }
    if (reconciliation.status === 'rejected') throw new ConflictError('A rejected manual InstaPay request cannot be reconciled.');
    const requestedCents = toCents(reconciliation.requested_amount);
    if (requestedCents === null || receivedCents !== requestedCents) {
      throw new ConflictError('Verified received amount must exactly match the requested transfer amount.');
    }

    const duplicate = await trx('manual_instapay_reconciliations')
      .where({ tenant_id: input.tenantId, external_reference: externalReference })
      .whereNot('id', input.reconciliationId)
      .first();
    if (duplicate) throw new ConflictError('This bank or wallet statement reference has already been reconciled.');

    const payment = await trx('payment_transactions')
      .where({ id: reconciliation.payment_transaction_id, tenant_id: input.tenantId })
      .forUpdate()
      .first() as { id: string; amount: string | number; status: string } | undefined;
    if (!payment) throw new NotFoundError('Payment transaction', reconciliation.payment_transaction_id);

    const invoice = await trx('invoices')
      .where({ id: reconciliation.invoice_id, tenant_id: input.tenantId })
      .whereNull('deleted_at')
      .forUpdate()
      .first() as { id: string; total: string | number; paid: string | number; status: string } | undefined;
    if (!invoice) throw new NotFoundError('Invoice', reconciliation.invoice_id);
    const totalCents = toCents(invoice.total);
    const currentPaidCents = toCents(invoice.paid);
    if (totalCents === null || currentPaidCents === null || currentPaidCents + receivedCents > totalCents) {
      throw new ConflictError('Verified manual InstaPay amount exceeds the current invoice amount due.');
    }
    const newPaidCents = currentPaidCents + receivedCents;
    const newDueCents = totalCents - newPaidCents;
    const nextStatus = newDueCents === 0 ? 'paid' : 'partial';
    const now = trx.fn.now();

    await trx('invoices').where({ id: invoice.id, tenant_id: input.tenantId }).update({
      paid: newPaidCents / 100,
      due: newDueCents / 100,
      status: nextStatus,
      payment_method: 'wallet',
      paid_at: nextStatus === 'paid' ? now : null,
      updated_at: now,
    });
    await trx('payment_transactions').where({ id: payment.id, tenant_id: input.tenantId }).update({
      status: 'completed',
      provider_reference: externalReference,
      updated_at: now,
    });
    const [updated] = await trx('manual_instapay_reconciliations')
      .where({ id: reconciliation.id, tenant_id: input.tenantId })
      .update({
        status: 'reconciled',
        received_amount: input.receivedAmount,
        external_reference: externalReference,
        transfer_date: transferDate,
        decision_notes: decisionNotes,
        verified_by: input.userId,
        verified_at: now,
        updated_at: now,
      })
      .returning('*');
    return updated as ReconciliationRow;
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.userId,
    action: idempotent ? 'payment.instapay_manual_reconcile_idempotent' : 'payment.instapay_manual_reconciled',
    entityType: 'manual_instapay_reconciliation',
    entityId: row.id,
    metadata: { invoiceId: row.invoice_id, amount: Number(row.received_amount || row.requested_amount), externalReference: row.external_reference },
  });
  return { ...mapReconciliation(row), idempotent };
}

export async function rejectManualInstapay(input: {
  tenantId: string;
  userId: string;
  reconciliationId: string;
  decisionNotes: string;
}) {
  const decisionNotes = requiredText(input.decisionNotes);
  if (decisionNotes.length < 3) throw new ValidationError('A rejection reason is required.');

  let idempotent = false;
  const row = await db.transaction(async (trx) => {
    const reconciliation = await loadRow(trx, input.tenantId, input.reconciliationId, true);
    if (!reconciliation) throw new NotFoundError('Manual InstaPay reconciliation', input.reconciliationId);
    if (reconciliation.status === 'rejected') {
      idempotent = true;
      return reconciliation;
    }
    if (reconciliation.status === 'reconciled') throw new ConflictError('A reconciled manual InstaPay payment cannot be rejected.');

    await trx('payment_transactions')
      .where({ id: reconciliation.payment_transaction_id, tenant_id: input.tenantId })
      .update({ status: 'failed', updated_at: trx.fn.now() });
    const [updated] = await trx('manual_instapay_reconciliations')
      .where({ id: reconciliation.id, tenant_id: input.tenantId })
      .update({
        status: 'rejected',
        decision_notes: decisionNotes,
        verified_by: input.userId,
        verified_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning('*');
    return updated as ReconciliationRow;
  });

  await logAudit({
    tenantId: input.tenantId,
    userId: input.userId,
    action: idempotent ? 'payment.instapay_manual_reject_idempotent' : 'payment.instapay_manual_rejected',
    entityType: 'manual_instapay_reconciliation',
    entityId: row.id,
    metadata: { invoiceId: row.invoice_id },
  });
  return { ...mapReconciliation(row), idempotent };
}
