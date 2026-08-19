import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('legacy financial utility boundary', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(testDirectory, '../payment.ts'), 'utf8');
  const environmentSource = readFileSync(resolve(testDirectory, '../../../../shared/src/config/environment.ts'), 'utf8');

  it('does not expose static exchange-rate or fabricated provider-payment helpers', () => {
    expect(source).not.toContain('getCurrencyInfo');
    expect(source).not.toContain('convertCurrency');
    expect(source).not.toContain('generateInstaPayPayment');
    expect(source).not.toContain('generateEtaQrCode');
    expect(source).not.toContain('INSTAPAY_WALLET');
    expect(source).not.toContain('instapay://send');
    expect(source).not.toContain('rate: 3.75');
    expect(source).not.toContain('rate: 4.05');
    expect(environmentSource).not.toContain('INSTAPAY_WALLET');
  });

  it('keeps live Stripe operations tenant/provider configured', () => {
    expect(source).toContain("providerRuntimeOrFallback(tenantId, 'stripe'");
    expect(source).toContain("assertClinicProviderOperation('stripe', 'stripe.checkout.create')");
    expect(source).toContain("assertClinicProviderOperation('stripe', 'stripe.payment.confirm')");
    expect(source).toContain('listEffectiveClinicConfiguration(tenantId)');
  });
});
