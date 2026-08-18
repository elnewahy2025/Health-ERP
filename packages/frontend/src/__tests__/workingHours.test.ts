import { describe, expect, it } from 'vitest';
import {
  clinicWorkingDayForDate,
  clinicWorkingHoursWindow,
  formatClinicWorkingHours,
  parseClinicWorkingHours,
  validateClinicWorkingHours,
} from '@healthcare/shared/config/clinic-working-hours';

describe('clinic working-hours helpers', () => {
  it('parses the canonical interval array and JSON string forms', () => {
    const value = [{ day: 'mon', from: '09:00', to: '17:00' }];
    expect(parseClinicWorkingHours(value)).toEqual(value);
    expect(parseClinicWorkingHours(JSON.stringify(value))).toEqual(value);
  });

  it('validates interval ordering and same-day overlaps', () => {
    expect(validateClinicWorkingHours([{ day: 'mon', from: '17:00', to: '09:00' }])[0]?.code).toBe('reversed_interval');
    expect(validateClinicWorkingHours([
      { day: 'mon', from: '09:00', to: '12:00' },
      { day: 'mon', from: '11:00', to: '14:00' },
    ])[0]?.code).toBe('overlapping_intervals');
    expect(validateClinicWorkingHours([{ day: 'mon', from: '09:00', to: '17:00' }])).toEqual([]);
  });

  it('resolves date weekdays and checks appointment duration inside a configured interval', () => {
    const hours = [{ day: 'mon', from: '09:00', to: '17:00' }];
    expect(clinicWorkingDayForDate('2026-08-17')).toBe('mon');
    expect(clinicWorkingHoursWindow(hours, '2026-08-17', '16:00', 60).allowed).toBe(true);
    expect(clinicWorkingHoursWindow(hours, '2026-08-17', '16:30', 60).allowed).toBe(false);
    expect(clinicWorkingHoursWindow(hours, '2026-08-18', '10:00', 15).allowed).toBe(false);
  });

  it('allows appointments while the schedule is intentionally empty and formats configured hours', () => {
    expect(clinicWorkingHoursWindow([], '2026-08-17', '23:00', 60).allowed).toBe(true);
    expect(formatClinicWorkingHours([{ day: 'mon', from: '09:00', to: '17:00' }], 'en')).toBe('Mon 09:00-17:00');
    expect(formatClinicWorkingHours([{ day: 'mon', from: '09:00', to: '17:00' }], 'ar')).toContain('الاثنين');
  });
});
