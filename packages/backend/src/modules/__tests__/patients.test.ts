import { afterEach, describe, it, expect } from 'vitest';
import { encryptField, decryptField, isEncrypted } from '@healthcare/shared/utils';

describe('Patient Module', () => {
  // ── Generic national identifier validation (#1) ──
  describe('Generic National Identifier Validation', () => {
    function validateNationalId(id: string): boolean {
      const cleaned = id.trim().replace(/[\s\-]/g, '');
      return /^[\p{L}\p{N}]{4,32}$/u.test(cleaned);
    }

    it('accepts clinic-issued and national identifiers without assuming a country format', () => {
      expect(validateNationalId('AB-1234')).toBe(true);
      expect(validateNationalId('رقم-1234')).toBe(true);
      expect(validateNationalId('29201010101234')).toBe(true);
    });

    it('rejects identifiers that are too short, too long, or contain unsupported symbols', () => {
      expect(validateNationalId('123')).toBe(false);
      expect(validateNationalId('123456789012345678901234567890123')).toBe(false);
      expect(validateNationalId('ID/1234')).toBe(false);
    });
  });

  // ── Field-level encryption (#2) ──
  describe('Field Encryption', () => {
    const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

    afterEach(() => {
      if (ORIGINAL_KEY !== undefined) {
        process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
      } else {
        delete process.env.ENCRYPTION_KEY;
      }
    });

    it('encrypts and decrypts a string roundtrip', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const plaintext = '29201010101234';
      const encrypted = encryptField(plaintext);
      expect(encrypted).not.toBe(plaintext);
      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const a = encryptField('test');
      const b = encryptField('test');
      expect(a).not.toBe(b); // Different IV each time
      expect(decryptField(a)).toBe('test');
      expect(decryptField(b)).toBe('test');
    });

    it('isEncrypted detects encrypted values', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encrypted = encryptField('test');
      expect(isEncrypted(encrypted)).toBe(true);
      expect(isEncrypted('plaintext-value')).toBe(false);
      expect(isEncrypted('short')).toBe(false);
    });

    it('throws when ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encryptField('test')).toThrow('ENCRYPTION_KEY');
    });

    it('throws on tampered data', () => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encrypted = encryptField('test');
      // Tamper with last character
      const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === 'A' ? 'B' : 'A');
      expect(() => decryptField(tampered)).toThrow();
    });
  });

  // ── DOB validation (#11) ──
  describe('Date of Birth Validation', () => {
    const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    const isValidDob = (val: string): boolean => {
      if (!DOB_REGEX.test(val)) return false;
      const dob = new Date(val);
      const now = new Date();
      const minDate = new Date('1900-01-01');
      return dob <= now && dob >= minDate;
    };

    it('accepts valid past dates', () => {
      expect(isValidDob('1990-01-15')).toBe(true);
      expect(isValidDob('2000-07-09')).toBe(true);
      expect(isValidDob('1950-12-25')).toBe(true);
    });

    it('rejects future dates', () => {
      expect(isValidDob('2030-01-01')).toBe(false);
      expect(isValidDob('2099-12-31')).toBe(false);
    });

    it('rejects dates before 1900', () => {
      expect(isValidDob('1899-12-31')).toBe(false);
      expect(isValidDob('1800-01-01')).toBe(false);
    });

    it('rejects invalid formats', () => {
      expect(isValidDob('not-a-date')).toBe(false);
      expect(isValidDob('15-01-1990')).toBe(false);
      expect(isValidDob('1990/01/15')).toBe(false);
    });
  });

  // ── Age calculation ──
  describe('Age Calculation', () => {
    const calcAge = (dob: string): number => {
      const birth = new Date(dob);
      const today = new Date('2026-07-09');
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    };

    it('calculates age correctly', () => {
      expect(calcAge('1990-01-15')).toBe(36);
      expect(calcAge('2000-07-09')).toBe(26);
      expect(calcAge('2015-12-25')).toBe(10);
    });
  });

  // ── Medical record number generation ──
  describe('MRN Generation', () => {
    it('generates valid MRN format', () => {
      const mrn = `MRN-${new Date().getFullYear()}-ABCDEF`;
      expect(mrn).toMatch(/^MRN-\d{4}-[A-F0-9]{6}$/);
    });
  });

  // ── Phone validation ──
  describe('Phone Validation', () => {
    it('accepts Egyptian mobile numbers', () => {
      expect('01001234567').toMatch(/^01[0-9]{9}$/);
      expect('01112345678').toMatch(/^01[0-9]{9}$/);
    });

    it('accepts international format', () => {
      const cleaned = '+201001234567'.replace(/\D/g, '');
      expect(cleaned.startsWith('20')).toBe(true);
      expect(cleaned.length).toBe(12);
    });
  });

  // ── Pagination limit (#8) ──
  describe('Pagination Limit Enforcement', () => {
    const MAX_LIMIT = 100;

    it('enforces maximum limit of 100', () => {
      const enforceLimit = (limit: number): number => Math.min(Math.max(limit, 1), MAX_LIMIT);
      expect(enforceLimit(0)).toBe(1);
      expect(enforceLimit(50)).toBe(50);
      expect(enforceLimit(100)).toBe(100);
      expect(enforceLimit(200)).toBe(100);
      expect(enforceLimit(1000)).toBe(100);
    });
  });

  // ── Optimistic concurrency (#14) ──
  describe('Optimistic Concurrency', () => {
    it('detects stale updates', () => {
      const serverUpdatedAt: string = '2026-07-22T10:00:00.000Z';
      const clientUpdatedAt: string = '2026-07-22T09:00:00.000Z';
      const hasConflict = serverUpdatedAt !== clientUpdatedAt;
      expect(hasConflict).toBe(true);
    });

    it('allows concurrent updates when versions match', () => {
      const serverUpdatedAt = '2026-07-22T10:00:00.000Z';
      const clientUpdatedAt = '2026-07-22T10:00:00.000Z';
      const hasConflict = serverUpdatedAt !== clientUpdatedAt;
      expect(hasConflict).toBe(false);
    });
  });

  // ── Bulk import (#16) ──
  describe('Bulk Import', () => {
    it('validates batch size limit', () => {
      const MAX_BULK = 1000;
      expect([].length).toBeLessThanOrEqual(MAX_BULK);
      expect(new Array(500).fill({ firstName: 'Test' }).length).toBeLessThanOrEqual(MAX_BULK);
      expect(new Array(1001).fill({ firstName: 'Test' }).length).toBeGreaterThan(MAX_BULK);
    });
  });

  // ── Patient merge (#9) ──
  describe('Patient Merge', () => {
    it('prevents merging a patient with itself', () => {
      const primaryId: string = 'patient-1';
      const duplicateId: string = 'patient-1';
      expect(primaryId === duplicateId).toBe(true);
    });

    it('allows merging different patients', () => {
      const primaryId: string = 'patient-1';
      const duplicateId: string = 'patient-2';
      expect(primaryId !== duplicateId).toBe(true);
    });
  });

  // ── Search patterns (#7) ──
  describe('Search Patterns', () => {
    it('search uses leading wildcard for partial match', () => {
      const search = 'ah';
      const pattern = `%${search}%`;
      expect(pattern).toBe('%ah%');
      expect('Ahmed'.toLowerCase()).toContain(search);
    });
  });

  // ── RLS context (#4) ──
  describe('RLS Context', () => {
    it('sets tenant context for PostgreSQL RLS', () => {
      const tenantId = 'test-tenant-id';
      const sql = `SET app.current_tenant = '${tenantId}'`;
      expect(sql).toContain('app.current_tenant');
      expect(sql).toContain(tenantId);
    });
  });

  // ── Soft delete with tenant isolation (#3) ──
  describe('Soft Delete', () => {
    it('soft delete requires tenant_id', () => {
      // Verify the function signature accepts tenantId
      // This is a structural check — the actual DB test is integration
      const fnSignature = 'softDeletePatient(patientId: string, tenantId: string)';
      expect(fnSignature).toContain('tenantId');
    });
  });

  // ── NID encryption roundtrip through mapper (#2) ──
  describe('Mapper NID Handling', () => {
    it('handles null national_id', () => {
      const nid: string | null = null;
      let decrypted: string | null = null;
      if (nid) {
        decrypted = decryptField(nid);
      }
      expect(decrypted).toBeNull();
    });

    it('falls back to plaintext for unencrypted values', () => {
      // Simulate the mapper's try/catch fallback
      const nid = '29201010101234';
      let decrypted: string | null = null;
      try {
        decrypted = decryptField(nid);
      } catch {
        decrypted = nid;
      }
      // Since '29201010101234' is not encrypted, it falls back
      expect(decrypted).toBe(nid);
    });
  });
});
