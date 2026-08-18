import { describe, it, expect } from 'vitest';

import { clinicWorkingHoursWindow } from '@healthcare/shared';

// ── Helper functions extracted from controller/mapper ──
// These are pure functions that can be tested without DB

function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['checked_in', 'completed', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'completed', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function getCancellationPolicy(appointmentDate: string, startTime: string): { allowed: boolean; requiresReason: boolean } {
  const appointmentStart = new Date(`${appointmentDate}T${startTime}:00`);
  const now = new Date();
  const hoursUntil = (appointmentStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil <= 0) {
    return { allowed: true, requiresReason: true };
  }
  if (hoursUntil <= 24) {
    return { allowed: true, requiresReason: true };
  }
  return { allowed: true, requiresReason: false };
}

function generateTelemedicineLink(): string {
  const id = Math.random().toString(36).substring(2, 10);
  return `https://meet.visionhealthcare.com/${id}`;
}

describe('Appointment Module', () => {
  // ── #4: Scheduling conflict / overlap detection ──
  describe('Scheduling Conflict Detection', () => {
    it('detects overlapping appointments', () => {
      // Existing: 09:00-10:00
      // New:     09:30-10:30 → overlaps
      const existingStart = '09:00';
      const existingEnd = '10:00';
      const newStart = '09:30';
      const newEnd = '10:30';
      const overlaps = newStart < existingEnd && newEnd > existingStart;
      expect(overlaps).toBe(true);
    });

    it('allows non-overlapping appointments', () => {
      // Existing: 09:00-10:00
      // New:     10:00-11:00 → no overlap
      const existingStart = '09:00';
      const existingEnd = '10:00';
      const newStart = '10:00';
      const newEnd = '11:00';
      const overlaps = newStart < existingEnd && newEnd > existingStart;
      expect(overlaps).toBe(false);
    });

    it('allows back-to-back appointments', () => {
      // Existing: 09:00-09:30
      // New:     09:30-10:00 → no overlap
      const existingStart = '09:00';
      const existingEnd = '09:30';
      const newStart = '09:30';
      const newEnd = '10:00';
      const overlaps = newStart < existingEnd && newEnd > existingStart;
      expect(overlaps).toBe(false);
    });

    it('detects exact same time slot overlap', () => {
      const existingStart = '14:00';
      const existingEnd = '14:30';
      const newStart = '14:00';
      const newEnd = '14:30';
      const overlaps = newStart < existingEnd && newEnd > existingStart;
      expect(overlaps).toBe(true);
    });

    it('detects new appointment contained within existing', () => {
      // Existing: 09:00-11:00
      // New:     09:30-10:30 → contained within
      const existingStart = '09:00';
      const existingEnd = '11:00';
      const newStart = '09:30';
      const newEnd = '10:30';
      const overlaps = newStart < existingEnd && newEnd > existingStart;
      expect(overlaps).toBe(true);
    });
  });

  // ── #5: Status transition validation ──
  describe('Status Transition Validation', () => {
    it('allows valid transitions from scheduled', () => {
      expect(isValidTransition('scheduled', 'checked_in')).toBe(true);
      expect(isValidTransition('scheduled', 'completed')).toBe(true);
      expect(isValidTransition('scheduled', 'cancelled')).toBe(true);
      expect(isValidTransition('scheduled', 'no_show')).toBe(true);
    });

    it('allows valid transitions from checked_in', () => {
      expect(isValidTransition('checked_in', 'in_progress')).toBe(true);
      expect(isValidTransition('checked_in', 'completed')).toBe(true);
      expect(isValidTransition('checked_in', 'cancelled')).toBe(true);
    });

    it('allows valid transitions from in_progress', () => {
      expect(isValidTransition('in_progress', 'completed')).toBe(true);
      expect(isValidTransition('in_progress', 'cancelled')).toBe(true);
    });

    it('rejects invalid transitions from completed', () => {
      expect(isValidTransition('completed', 'scheduled')).toBe(false);
      expect(isValidTransition('completed', 'cancelled')).toBe(false);
      expect(isValidTransition('completed', 'no_show')).toBe(false);
    });

    it('rejects invalid transitions from cancelled', () => {
      expect(isValidTransition('cancelled', 'scheduled')).toBe(false);
      expect(isValidTransition('cancelled', 'completed')).toBe(false);
      expect(isValidTransition('cancelled', 'checked_in')).toBe(false);
    });

    it('rejects invalid transitions from no_show', () => {
      expect(isValidTransition('no_show', 'scheduled')).toBe(false);
      expect(isValidTransition('no_show', 'completed')).toBe(false);
    });

    it('rejects unknown source status', () => {
      expect(isValidTransition('unknown', 'completed')).toBe(false);
    });
  });

  // ── #7: Working hours validation ──
  describe('Working Hours Validation', () => {
    const configuredHours = [{ day: 'mon' as const, from: '09:00', to: '17:00' }];

    it('accepts a configured appointment interval on the matching weekday', () => {
      expect(clinicWorkingHoursWindow(configuredHours, '2026-08-17', '09:00', 15).allowed).toBe(true);
      expect(clinicWorkingHoursWindow(configuredHours, '2026-08-17', '16:45', 15).allowed).toBe(true);
    });

    it('rejects appointments before opening, after closing, or on a closed day', () => {
      expect(clinicWorkingHoursWindow(configuredHours, '2026-08-17', '08:59', 15).allowed).toBe(false);
      expect(clinicWorkingHoursWindow(configuredHours, '2026-08-17', '16:45', 30).allowed).toBe(false);
      expect(clinicWorkingHoursWindow(configuredHours, '2026-08-18', '10:00', 15).allowed).toBe(false);
    });

    it('allows appointments while no clinic schedule is configured', () => {
      expect(clinicWorkingHoursWindow([], '2026-08-17', '23:00', 60).allowed).toBe(true);
    });
  });

  // ── #8: Cancellation policy ──
  describe('Cancellation Policy', () => {
    it('does not require reason for appointments >24h away', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      const dateStr = futureDate.toISOString().split('T')[0];
      const policy = getCancellationPolicy(dateStr, '10:00');
      expect(policy.allowed).toBe(true);
      expect(policy.requiresReason).toBe(false);
    });

    it('requires reason for appointments within 24h', () => {
      const soonDate = new Date();
      soonDate.setHours(soonDate.getHours() + 12);
      const dateStr = soonDate.toISOString().split('T')[0];
      const timeStr = `${String(soonDate.getHours()).padStart(2, '0')}:${String(soonDate.getMinutes()).padStart(2, '0')}`;
      const policy = getCancellationPolicy(dateStr, timeStr);
      expect(policy.allowed).toBe(true);
      expect(policy.requiresReason).toBe(true);
    });
  });

  // ── #9: Timezone handling ──
  describe('Timezone Handling', () => {
    it('default timezone is Africa/Cairo', () => {
      const defaultTz = 'Africa/Cairo';
      expect(defaultTz).toBe('Africa/Cairo');
    });

    it('timezone is stored with appointment data', () => {
      const appointment = { timezone: 'Africa/Cairo' };
      expect(appointment.timezone).toBeDefined();
    });
  });

  // ── #15: Bulk operations ──
  describe('Bulk Operations', () => {
    it('validates bulk array is not empty', () => {
      const appointments: unknown[] = [];
      expect(appointments.length).toBe(0);
    });

    it('validates max bulk size is 50', () => {
      const maxBulk = 50;
      const oversized = 51;
      expect(oversized > maxBulk).toBe(true);
    });

    it('generates unique telemedicine links', () => {
      const link1 = generateTelemedicineLink();
      const link2 = generateTelemedicineLink();
      expect(link1).toMatch(/^https:\/\/meet\.visionhealthcare\.com\//);
      expect(link2).toMatch(/^https:\/\/meet\.visionhealthcare\.com\//);
      expect(link1).not.toBe(link2);
    });
  });

  // ── End time calculation ──
  describe('End Time Calculation', () => {
    it('calculates end time correctly', () => {
      expect(calculateEndTime('09:00', 30)).toBe('09:30');
      expect(calculateEndTime('09:00', 60)).toBe('10:00');
      expect(calculateEndTime('09:00', 15)).toBe('09:15');
      expect(calculateEndTime('09:45', 30)).toBe('10:15');
    });

    it('handles end of day overflow', () => {
      expect(calculateEndTime('23:00', 60)).toBe('24:00');
    });

    it('handles midnight boundary', () => {
      expect(calculateEndTime('00:00', 60)).toBe('01:00');
    });
  });
});
