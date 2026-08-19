import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(testDirectory, '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(backendRoot, relativePath), 'utf8');
}

describe('provider payment status safety', () => {
  it('adds provider_key with forward-safe guards and preserves history on rollback', () => {
    const migration = read('migrations/055_payment_provider_status.ts');
    expect(migration).toContain("hasTable('payment_transactions')");
    expect(migration).toContain("hasColumn('payment_transactions', 'provider_key')");
    expect(migration).toContain("table.string('provider_key', 50).nullable()");
    expect(migration).toContain('Forward-safe: provider status history is retained');
    expect(migration).not.toContain('dropColumn');
  });

  it('marks Stripe and Fawry rows explicitly while leaving internal payments provider-neutral', () => {
    const paymentService = read('src/services/payment.ts');
    const financialModule = read('src/modules/financial-deepening/index.ts');
    const billingModule = read('src/modules/billing/index.ts');
    expect(paymentService).toContain("provider_key: 'stripe'");
    expect(financialModule).toContain("provider_key: 'fawry'");
    expect(billingModule).toContain(".whereNotNull('provider_key')");
    expect(billingModule).toContain("authorize('billing.view')");
  });

  it('isolates callbacks by provider and does not return encrypted secret fields', () => {
    const paymentService = read('src/services/payment.ts');
    const financialModule = read('src/modules/financial-deepening/index.ts');
    const billingModule = read('src/modules/billing/index.ts');
    expect(paymentService).toContain("where({ provider_key: 'stripe', reference: sessionId })");
    expect(financialModule).toContain("where({ provider_key: 'fawry', reference: String(fawryRef) })");
    expect(billingModule).toContain("select('id', 'provider_key', 'status', 'amount', 'reference', 'created_at', 'updated_at')");
    expect(billingModule).not.toContain('encrypted_value');
  });
});
