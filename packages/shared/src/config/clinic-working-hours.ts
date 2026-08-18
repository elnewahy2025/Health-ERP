export const CLINIC_WORKING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type ClinicWorkingDay = (typeof CLINIC_WORKING_DAYS)[number];

export interface ClinicWorkingHoursInterval {
  day: ClinicWorkingDay;
  from: string;
  to: string;
}

export interface ClinicWorkingHoursValidationError {
  code: 'invalid_json' | 'invalid_shape' | 'invalid_day' | 'invalid_time' | 'reversed_interval' | 'overlapping_intervals';
  index?: number;
  message: string;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY_SET = new Set<string>(CLINIC_WORKING_DAYS);
const ENGLISH_DAY_LABELS: Record<ClinicWorkingDay, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};
const ARABIC_DAY_LABELS: Record<ClinicWorkingDay, string> = {
  mon: 'الاثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة', sat: 'السبت', sun: 'الأحد',
};

function parseRawWorkingHours(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function minutes(value: string): number {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function isInterval(value: unknown): value is ClinicWorkingHoursInterval {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.day === 'string'
    && DAY_SET.has(candidate.day)
    && typeof candidate.from === 'string'
    && TIME_PATTERN.test(candidate.from)
    && typeof candidate.to === 'string'
    && TIME_PATTERN.test(candidate.to)
    && minutes(candidate.from) < minutes(candidate.to);
}

export function parseClinicWorkingHours(value: unknown): ClinicWorkingHoursInterval[] {
  const raw = parseRawWorkingHours(value);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isInterval).map((interval) => ({
    day: interval.day,
    from: interval.from,
    to: interval.to,
  }));
}

export function validateClinicWorkingHours(value: unknown): ClinicWorkingHoursValidationError[] {
  const raw = parseRawWorkingHours(value);
  if (raw === undefined && typeof value === 'string' && value.trim()) {
    return [{ code: 'invalid_json', message: 'Working hours must contain valid JSON.' }];
  }
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) {
    return [{ code: 'invalid_shape', message: 'Working hours must be an array of intervals.' }];
  }

  const errors: ClinicWorkingHoursValidationError[] = [];
  const byDay = new Map<ClinicWorkingDay, Array<{ from: number; to: number; index: number }>>();
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ code: 'invalid_shape', index, message: 'Each working-hours item must be an object.' });
      return;
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.day !== 'string' || !DAY_SET.has(candidate.day)) {
      errors.push({ code: 'invalid_day', index, message: 'Each interval must use a valid weekday.' });
      return;
    }
    if (typeof candidate.from !== 'string' || typeof candidate.to !== 'string'
      || !TIME_PATTERN.test(candidate.from) || !TIME_PATTERN.test(candidate.to)) {
      errors.push({ code: 'invalid_time', index, message: 'Each interval must use HH:MM times.' });
      return;
    }
    const from = minutes(candidate.from);
    const to = minutes(candidate.to);
    if (from >= to) {
      errors.push({ code: 'reversed_interval', index, message: 'An interval must end after it starts.' });
      return;
    }
    const day = candidate.day as ClinicWorkingDay;
    const intervals = byDay.get(day) || [];
    if (intervals.some((interval) => from < interval.to && to > interval.from)) {
      errors.push({ code: 'overlapping_intervals', index, message: 'Intervals on the same day cannot overlap.' });
      return;
    }
    intervals.push({ from, to, index });
    byDay.set(day, intervals);
  });
  return errors;
}

export function isValidClinicWorkingHours(value: unknown): value is ClinicWorkingHoursInterval[] {
  return validateClinicWorkingHours(value).length === 0;
}

export function clinicWorkingDayForDate(date: string): ClinicWorkingDay | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const dayIndex = parsed.getUTCDay();
  return CLINIC_WORKING_DAYS[(dayIndex + 6) % 7] || null;
}

export function clinicWorkingHoursWindow(
  value: unknown,
  appointmentDate: string,
  startTime: string,
  durationMinutes = 0,
): { allowed: boolean; opening?: string; closing?: string } {
  const intervals = parseClinicWorkingHours(value);
  if (intervals.length === 0) return { allowed: true };
  const day = clinicWorkingDayForDate(appointmentDate);
  if (!day || !TIME_PATTERN.test(startTime)) return { allowed: false };
  const start = minutes(startTime);
  const end = start + Math.max(0, durationMinutes);
  const matching = intervals.filter((interval) => interval.day === day);
  const allowedInterval = matching.find((interval) => start >= minutes(interval.from) && end <= minutes(interval.to));
  if (allowedInterval) return { allowed: true, opening: allowedInterval.from, closing: allowedInterval.to };
  const first = matching[0];
  return { allowed: false, opening: first?.from, closing: first?.to };
}

export function formatClinicWorkingHours(value: unknown, locale = 'en'): string {
  const intervals = parseClinicWorkingHours(value);
  const labels = locale.toLowerCase().startsWith('ar') ? ARABIC_DAY_LABELS : ENGLISH_DAY_LABELS;
  return intervals
    .slice()
    .sort((a, b) => CLINIC_WORKING_DAYS.indexOf(a.day) - CLINIC_WORKING_DAYS.indexOf(b.day) || a.from.localeCompare(b.from))
    .map((interval) => `${labels[interval.day]} ${interval.from}-${interval.to}`)
    .join('; ');
}
