// Generic clinic phone validation. Provider- or country-specific validation belongs in tenant policy configuration.
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(?:\+|00)?\d{7,15}$/.test(cleaned);
}

// Generic national identifier validation. Country-specific checksum rules must not be assumed by the clinic core.
export function isValidNationalId(id: string): boolean {
  const cleaned = id.trim().replace(/[\s\-]/g, '');
  return /^[\p{L}\p{N}]{4,32}$/u.test(cleaned);
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
