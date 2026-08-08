// Egyptian phone number validation
// Supports: 010/011/012/015 + 8 digits (10-11 digits total)
// Also supports: +2010..., 002010...
export function isValidEgyptianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  // Local format: 01X XXX XXXX (10-11 digits)
  if (/^01[0125]\d{8,9}$/.test(cleaned)) return true;
  // International format: +201X...
  if (/^\+201[0125]\d{8,9}$/.test(cleaned)) return true;
  // International with 00: 00201X...
  if (/^00201[0125]\d{8,9}$/.test(cleaned)) return true;
  return false;
}

// Egyptian National ID validation
// 14 digits: century(1) + year(2) + month(2) + day(2) + governorate(2) + sequence(2) + gender(1) + check(1)
export function isValidEgyptianNationalId(id: string): boolean {
  const cleaned = id.replace(/\s/g, '');
  if (!/^\d{14}$/.test(cleaned)) return false;

  const century = parseInt(cleaned.substring(0, 1), 10);
  if (century < 2 || century > 3) return false;

  const month = parseInt(cleaned.substring(3, 5), 10);
  if (month < 1 || month > 12) return false;

  const day = parseInt(cleaned.substring(5, 7), 10);
  if (day < 1 || day > 31) return false;

  const governorate = parseInt(cleaned.substring(7, 9), 10);
  if (governorate < 1 || governorate > 27) return false;

  // Official Egyptian National ID checksum (matches backend): weighted sum of the
  // first 13 digits, alternating weights 2,1,2,1,..., then check digit = (10 - sum % 10) % 10.
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleaned[i], 10) * (i % 2 === 0 ? 2 : 1);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(cleaned[13], 10);
}

// Email validation
export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Password strength check
export interface PasswordStrength {
  score: number; // 0-4
  label: 'weak' | 'fair' | 'good' | 'strong';
  feedback: string[];
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else feedback.push('At least 8 characters');

  if (password.length >= 12) score++;

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else feedback.push('Mix of uppercase and lowercase');

  if (/\d/.test(password)) score++;
  else feedback.push('Include at least one number');

  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;

  // Cap at 4
  score = Math.min(score, 4);

  const labels: PasswordStrength['label'][] = ['weak', 'weak', 'fair', 'good', 'strong'];

  return {
    score,
    label: labels[score],
    feedback,
  };
}

// Date validation
export function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

export function isFutureDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

export function isPastDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

// Time validation (HH:MM format)
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

// Name validation (allow Arabic and English letters, spaces, hyphens)
export function isValidName(name: string): boolean {
  return /^[a-zA-Z\u0600-\u06FF\s\-']{1,100}$/.test(name);
}

// Validate a value and return error message (or null if valid)
export type ValidatorFn = (value: string) => string | null;

export interface FieldValidation {
  required?: boolean;
  validators?: ValidatorFn[];
}

export function validateField(
  value: string,
  config: FieldValidation
): string | null {
  if (config.required && (!value || (typeof value === 'string' && !value.trim()))) {
    return 'This field is required';
  }
  if (config.validators && value) {
    for (const validator of config.validators) {
      const error = validator(value);
      if (error) return error;
    }
  }
  return null;
}

// Validate entire form
export type FormConfig = Record<string, FieldValidation>;

export function validateForm(
  values: Record<string, string>,
  config: FormConfig
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [field, rules] of Object.entries(config)) {
    const error = validateField(values[field], rules);
    if (error) errors[field] = error;
  }
  return errors;
}
