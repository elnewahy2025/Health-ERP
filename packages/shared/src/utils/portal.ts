/**
 * Patient portal input helpers — pure functions shared by the backend (OTP /
 * enrollment flows) and the frontend (portal page + patient app login) so phone
 * normalization and validation never drift between layers.
 */

/** Strip non-digits, then normalize a country code + phone to E.164 digits.
 * Accepts local (010…), international (+201…), and 00-prefixed (00201…)
 * formats for the same number. */
export function normalizePortalPhone(countryCode: string, phone: string): string {
  const cc = (countryCode || '').replace(/\D/g, '');
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (cc && digits.startsWith(cc)) digits = digits.slice(cc.length);
  if (cc && digits.startsWith('0')) digits = digits.slice(1);
  return `+${cc}${digits}`;
}

/** Validate a country-code + phone combination using the same normalization
 * rules as {@link normalizePortalPhone}. */
export function isValidPortalPhone(countryCode: string, phone: string): boolean {
  const cc = (countryCode || '').replace(/\D/g, '');
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (cc && digits.startsWith(cc)) digits = digits.slice(cc.length);
  if (cc && digits.startsWith('0')) digits = digits.slice(1);
  return cc.length >= 1 && cc.length <= 4 && digits.length >= 6 && digits.length <= 15;
}

/** Saudi-style national ID: exactly 14 digits. */
export function isValidNationalId(value: string): boolean {
  return /^\d{14}$/.test((value || '').trim());
}

/** wa.me click-to-chat link with a pre-filled message. */
export function waMeLink(phone: string, message: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
