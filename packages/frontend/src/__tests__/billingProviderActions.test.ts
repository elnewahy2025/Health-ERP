import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(testDirectory, '..');

function source(relativePath: string): string {
  return readFileSync(resolve(frontendRoot, relativePath), 'utf8');
}

describe('billing provider action contracts', () => {
  it('keeps external payment actions separate from internal payment recording', () => {
    const page = source('pages/BillingPage.tsx');
    expect(page).toContain('paymentApi.createStripeSession');
    expect(page).toContain('egyptPaymentApi.fawry');
    expect(page).toContain('billingApi.pay(selectedInvoice.id');
    expect(page).toContain('billingApi.providerPayments(invoiceId)');
    expect(page).toContain('billing.providerPaymentHistory');
    expect(page).toContain('egyptPaymentApi.instapay(selectedInvoice.id, selectedInvoice.due)');
    expect(page).toContain('egyptPaymentApi.reconcileInstapay');
    expect(page).toContain('egyptPaymentApi.rejectInstapay');
    expect(page).toContain('billing.instapayManualTitle');
    expect(page).toContain('<Can permission="billing.verify">');
    expect(page).toContain('<Can permission="billing.create">');
    expect(page).toContain('<Can permission="billing.approve">');
  });

  it('uses tenant-resolved currency and does not insert a frontend currency default', () => {
    const page = source('pages/BillingPage.tsx');
    const api = source('lib/api/payment.ts');
    expect(page).toContain('identity?.currency');
    expect(api).toContain('...(currency ? { currency } : {})');
    expect(api).toContain("apiClient.post('/payments/instapay', { invoiceId, amount })");
    expect(api).toContain("/invoices/${invoiceId}/instapay-reconciliations");
    expect(api).not.toContain("currency: 'EGP'");
    expect(api).not.toContain("currency: 'USD'");
  });

  it('treats the Fawry result as a pending reference, not as a fabricated redirect', () => {
    const page = source('pages/BillingPage.tsx');
    expect(page).toContain('result?.referenceNumber');
    expect(page).toContain('billing.fawryPaymentInitiated');
    expect(page).not.toContain('atfawry.com');
  });
});
