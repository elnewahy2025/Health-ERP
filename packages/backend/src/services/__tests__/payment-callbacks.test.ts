import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  mapFawryStatus,
  moneyToCents,
  normalizeFawryCallback,
  verifyFawryV2Signature,
  verifyStripeSignature,
} from '../payment-callbacks.js';

function fawrySignature(input: {
  fawryRefNumber: string;
  merchantRefNumber: string;
  paymentAmount: number;
  orderAmount: number;
  orderStatus: string;
  paymentMethod: string;
  paymentReferenceNumber: string;
}, secureKey: string): string {
  const canonical = [
    input.fawryRefNumber,
    input.merchantRefNumber,
    input.paymentAmount.toFixed(2),
    input.orderAmount.toFixed(2),
    input.orderStatus,
    input.paymentMethod,
    input.paymentReferenceNumber,
    secureKey,
  ].join('');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function stripeSignature(rawBody: string, secret: string, timestamp: number): string {
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('payment callback verification utilities', () => {
  it('represents decimal amounts as exact cents', () => {
    expect(moneyToCents('10.10')).toBe(1010);
    expect(moneyToCents(0.3)).toBe(30);
    expect(moneyToCents(-1)).toBeNull();
  });

  it('normalizes and verifies the documented Fawry V2 signature', () => {
    const secureKey = 'secure-key';
    const body = {
      fawryRefNumber: 'FW-001',
      merchantRefNumber: 'INV-001',
      paymentAmount: '100.00',
      orderAmount: '100.00',
      orderStatus: 'PAID',
      paymentMethod: 'CARD',
      paymentRefrenceNumber: 'PAY-001',
    };
    const callback = normalizeFawryCallback({
      ...body,
      messageSignature: fawrySignature({
        fawryRefNumber: body.fawryRefNumber,
        merchantRefNumber: body.merchantRefNumber,
        paymentAmount: 100,
        orderAmount: 100,
        orderStatus: body.orderStatus,
        paymentMethod: body.paymentMethod,
        paymentReferenceNumber: body.paymentRefrenceNumber,
      }, secureKey),
    });
    expect(callback).not.toBeNull();
    expect(verifyFawryV2Signature(callback!, secureKey)).toBe(true);
    expect(verifyFawryV2Signature(callback!, 'wrong-key')).toBe(false);
  });

  it('maps provider terminal states and rejects unknown states', () => {
    expect(mapFawryStatus('NEW')).toBe('pending');
    expect(mapFawryStatus('PAID')).toBe('completed');
    expect(mapFawryStatus('EXPIRED')).toBe('failed');
    expect(mapFawryStatus('something-else')).toBeNull();
  });

  it('verifies Stripe signatures only within the timestamp tolerance', () => {
    const rawBody = JSON.stringify({ id: 'evt_001', type: 'checkout.session.completed' });
    const secret = 'whsec_test';
    const now = 1_700_000_000;
    const signature = stripeSignature(rawBody, secret, now);
    expect(verifyStripeSignature(rawBody, signature, secret, 300, now)).toBe(true);
    expect(verifyStripeSignature(rawBody, signature, 'wrong-secret', 300, now)).toBe(false);
    expect(verifyStripeSignature(rawBody, signature, secret, 300, now + 301)).toBe(false);
  });
});
