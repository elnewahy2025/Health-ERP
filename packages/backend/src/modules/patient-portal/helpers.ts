/**
 * Patient portal input helpers — pure functions kept separate so the OTP /
 * enrollment flows are unit-testable without a database.
 */

/** Combine country code + local number into E.164 digits (e.g. +966512345678). */
export function normalizePortalPhone(countryCode: string, phone: string): string {
  const cc = (countryCode || '').replace(/\D/g, '');
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith(cc) && cc.length > 0) {
    digits = digits.slice(cc.length);
  }
  return `+${cc}${digits}`;
}

/** Validate a country-code + phone combination. */
export function isValidPortalPhone(countryCode: string, phone: string): boolean {
  const cc = (countryCode || '').replace(/\D/g, '');
  const digits = (phone || '').replace(/\D/g, '');
  const local = digits.startsWith(cc) && cc.length > 0 ? digits.slice(cc.length) : digits;
  return cc.length >= 1 && cc.length <= 4 && local.length >= 6 && local.length <= 15;
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
