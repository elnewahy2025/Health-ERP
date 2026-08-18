export const CLINIC_SUPPORTED_LOCALES = ['en', 'ar'] as const;

export type ClinicLocale = (typeof CLINIC_SUPPORTED_LOCALES)[number];

export function isSupportedClinicLocale(value: string): value is ClinicLocale {
  return CLINIC_SUPPORTED_LOCALES.includes(value.trim() as ClinicLocale);
}

export function isValidClinicTimezone(value: string): boolean {
  const timezone = value.trim();
  if (!timezone) return true;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}
