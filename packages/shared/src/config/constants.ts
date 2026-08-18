export const APP_NAME = 'Clinic Management System';
export const APP_VERSION = '1.0.0';

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

export const PASSWORD = {
  MIN_LENGTH: 8,
  SALT_ROUNDS: 12,
};

export const JWT = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  MFA_TOKEN_EXPIRY: '5m',
};

export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DD',
  DISPLAY: 'DD/MM/YYYY',
  DISPLAY_AR: 'DD/MM/YYYY',
  TIME: 'HH:mm',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
};

export const CURRENCIES = {
  SAR: { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro' },
  EGP: { code: 'EGP', symbol: '£', name: 'Egyptian Pound' },
};

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const GENDERS = [
  { value: 'male', labelEn: 'Male', labelAr: 'ذكر' },
  { value: 'female', labelEn: 'Female', labelAr: 'أنثى' },
] as const;

export const APPOINTMENT_TYPES = [
  { value: 'consultation', labelEn: 'Consultation', labelAr: 'استشارة' },
  { value: 'followup', labelEn: 'Follow-up', labelAr: 'متابعة' },
  { value: 'emergency', labelEn: 'Emergency', labelAr: 'طوارئ' },
  { value: 'checkup', labelEn: 'Check-up', labelAr: 'فحص دوري' },
  { value: 'procedure', labelEn: 'Procedure', labelAr: 'إجراء' },
  { value: 'telemedicine', labelEn: 'Telemedicine', labelAr: 'استشارة عن بعد' },
  { value: 'vaccination', labelEn: 'Vaccination', labelAr: 'تطعيم' },
] as const;
