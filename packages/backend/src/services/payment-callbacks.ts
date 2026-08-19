import crypto from 'node:crypto';

export type FawryCallbackStatus = 'pending' | 'completed' | 'failed';

export interface NormalizedFawryCallback {
  fawryReference: string;
  merchantReference: string;
  orderAmount: number;
  paymentAmount: number | null;
  status: string;
  paymentMethod: string;
  paymentReference: string;
  messageSignature: string;
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function moneyToCents(value: unknown): number | null {
  const amount = asOptionalNumber(value);
  if (amount === null || amount < 0) return null;
  return Math.round((amount + Number.EPSILON) * 100);
}

export function normalizeFawryCallback(body: Record<string, unknown>): NormalizedFawryCallback | null {
  const fawryReference = asString(body.fawryRefNumber ?? body.fawryRef ?? body.referenceNumber ?? body.FawryRefNo);
  const merchantReference = asString(body.merchantRefNumber ?? body.merchantRefNum ?? body.MerchnatRefNo);
  const orderAmount = asOptionalNumber(body.orderAmount);
  const paymentAmount = asOptionalNumber(body.paymentAmount);
  const status = asString(body.orderStatus ?? body.status ?? body.paymentStatus ?? body.OrderStatus).toUpperCase();
  const paymentMethod = asString(body.paymentMethod ?? body.PaymentMethod);
  const paymentReference = asString(body.paymentRefrenceNumber ?? body.paymentReferenceNumber ?? body.paymentReference);
  const messageSignature = asString(body.messageSignature ?? body.signature ?? body['Message Signature']);

  if (!fawryReference || !merchantReference || orderAmount === null || paymentAmount === null || !status || !messageSignature) return null;
  return {
    fawryReference,
    merchantReference,
    orderAmount,
    paymentAmount,
    status,
    paymentMethod,
    paymentReference,
    messageSignature,
  };
}

function safeEqualHex(left: string, right: string): boolean {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (!/^[0-9a-f]+$/i.test(normalizedLeft) || normalizedLeft.length % 2 !== 0) return false;
  if (!/^[0-9a-f]+$/i.test(normalizedRight) || normalizedRight.length % 2 !== 0) return false;
  const leftBuffer = Buffer.from(normalizedLeft, 'hex');
  const rightBuffer = Buffer.from(normalizedRight, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyFawryV2Signature(callback: NormalizedFawryCallback, secureKey: string): boolean {
  if (!secureKey || callback.paymentAmount === null) return false;
  const canonical = [
    callback.fawryReference,
    callback.merchantReference,
    callback.paymentAmount.toFixed(2),
    callback.orderAmount.toFixed(2),
    callback.status,
    callback.paymentMethod,
    callback.paymentReference,
    secureKey,
  ].join('');
  const expected = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return safeEqualHex(expected, callback.messageSignature);
}

export function mapFawryStatus(status: string): FawryCallbackStatus | null {
  switch (status.trim().toUpperCase()) {
    case 'NEW':
    case 'PENDING':
      return 'pending';
    case 'PAID':
      return 'completed';
    case 'CANCELED':
    case 'CANCELLED':
    case 'REFUNDED':
    case 'EXPIRED':
    case 'PARTIAL_REFUNDED':
    case 'FAILED':
      return 'failed';
    default:
      return null;
  }
}

export function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!rawBody || !signatureHeader || !webhookSecret) return false;
  const values = new Map<string, string[]>();
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    const list = values.get(key) || [];
    list.push(value);
    values.set(key, list);
  }
  const timestamp = Number(values.get('t')?.[0]);
  const signatures = values.get('v1') || [];
  if (!Number.isInteger(timestamp) || signatures.length === 0 || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return signatures.some((signature) => safeEqualHex(expected, signature));
}
