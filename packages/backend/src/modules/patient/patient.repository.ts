import { db } from '../../core/database.js';
import type { PatientRow } from './types.js';
import { encryptField } from '@healthcare/shared/utils';

const MAX_PAGE_LIMIT = 100;

function enforceLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);
}

export async function findPatients(tenantId: string, options: {
  search?: string;
  status?: string;
  sort?: string;
  order?: string;
  limit: number;
  offset: number;
  branchIds?: string[];
  patientIds?: string[];
}): Promise<{ patients: PatientRow[]; total: number }> {
  const safeLimit = enforceLimit(options.limit);
  let query = db('patients')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at');

  if (options.search) {
    const s = options.search;
    query = query.andWhere(function () {
      this.where('first_name', 'ilike', `%${s}%`)
        .orWhere('last_name', 'ilike', `%${s}%`)
        .orWhere('phone', 'ilike', `%${s}%`)
        .orWhere('medical_record_number', 'ilike', `%${s}%`)
        .orWhere('email', 'ilike', `%${s}%`);
    });
  }

  if (options.status) {
    query = query.andWhere('status', options.status);
  }

  if (options.branchIds) {
    if (options.branchIds.length === 0) {
      query = query.where(false);
    } else {
      query = query.whereIn('branch_id', options.branchIds);
    }
  }
  if (options.patientIds) {
    if (options.patientIds.length === 0) {
      query = query.where(false);
    } else {
      query = query.whereIn('id', options.patientIds);
    }
  }

  const total = await query.clone().count('id as count').first();
  const patients = await query
    .orderBy(options.sort || 'created_at', options.order || 'desc')
    .limit(safeLimit)
    .offset(options.offset);

  return { patients, total: Number(total?.count || 0) };
}

export async function findPatientById(patientId: string, tenantId: string): Promise<PatientRow | undefined> {
  return db('patients')
    .where({ id: patientId, tenant_id: tenantId })
    .whereNull('deleted_at')
    .first();
}

export async function findPatientWithRelatedData(patientId: string, tenantId: string) {
  const patient = await findPatientById(patientId, tenantId);
  if (!patient) return null;

  const [appointments, emrRecords, invoices] = await Promise.all([
    db('appointments').where({ patient_id: patientId, tenant_id: tenantId }).orderBy('appointment_date', 'desc').limit(5),
    db('emr_records').where({ patient_id: patientId, tenant_id: tenantId }).orderBy('encounter_date', 'desc').limit(5),
    db('invoices').where({ patient_id: patientId, tenant_id: tenantId }).orderBy('created_at', 'desc').limit(5),
  ]);

  return { patient, appointments, emrRecords, invoices };
}

export async function findByNationalId(nationalId: string, tenantId: string): Promise<PatientRow | undefined> {
  const encrypted = encryptField(nationalId);
  const encryptedPatient = await db('patients')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at')
    .where('national_id', encrypted)
    .first();
  if (encryptedPatient) return encryptedPatient;
  // Also check for plaintext values (migration from pre-encryption)
  const plaintextMatch = await db('patients')
    .where({ tenant_id: tenantId, national_id: nationalId })
    .whereNull('deleted_at')
    .first();
  return plaintextMatch;
}

/** Normalize a date value (JS Date from a date column, ISO string, or
 * 'YYYY-MM-DD' string) to the 'YYYY-MM-DD' form Postgres date columns accept. */
function toDateOnly(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export async function insertPatient(data: {
  tenantId: string;
  medicalRecordNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string | null;
  nationalId: string | null;
  nationality: string | null;
  bloodType: string | null;
  address: string | null;
  emergencyContact: string | null;
  locale: string;
  userId: string;
}): Promise<PatientRow> {
  const encryptedNationalId = data.nationalId ? encryptField(data.nationalId) : null;
  const dateOfBirth = toDateOnly(data.dateOfBirth);

  const [patient] = await db('patients').insert({
    tenant_id: data.tenantId,
    medical_record_number: data.medicalRecordNumber,
    first_name: data.firstName,
    last_name: data.lastName,
    date_of_birth: dateOfBirth,
    gender: data.gender,
    phone: data.phone,
    email: data.email,
    national_id: encryptedNationalId,
    nationality: data.nationality,
    blood_type: data.bloodType,
    address: data.address,
    emergency_contact: data.emergencyContact,
    status: 'active',
    preferred_language: data.locale,
    created_by: data.userId,
  }).returning('*');

  return patient;
}

/**
 * #14: Optimistic concurrency — checks updated_at before writing.
 * Throws if the row was modified since the client last read it.
 */
export async function updatePatientById(
  patientId: string,
  tenantId: string,
  updateData: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<PatientRow | undefined> {
  const [updated] = await db('patients')
    .where({ id: patientId, tenant_id: tenantId })
    // updated_at is stored with microsecond precision; truncate to ms so the
    // client's ISO timestamp (ms precision) matches exactly
    .whereRaw("date_trunc('milliseconds', updated_at) = ?::timestamptz", [expectedUpdatedAt])
    .update(updateData)
    .returning('*');
  return updated;
}

export async function softDeletePatient(patientId: string, tenantId: string): Promise<void> {
  await db('patients').where({ id: patientId, tenant_id: tenantId }).update({
    status: 'inactive',
    deleted_at: new Date(),
  });
}

export async function quickSearchPatients(tenantId: string, q: string, options?: { branchIds?: string[]; patientIds?: string[] }): Promise<PatientRow[]> {
  let query = db('patients')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at')
    .where(function () {
      this.where('first_name', 'ilike', `%${q}%`)
        .orWhere('last_name', 'ilike', `%${q}%`)
        .orWhere('phone', 'ilike', `%${q}%`)
        .orWhere('medical_record_number', 'ilike', `%${q}%`);
    });
  if (options?.branchIds) {
    if (options.branchIds.length === 0) {
      query = query.where(false);
    } else {
      query = query.whereIn('branch_id', options.branchIds);
    }
  }
  if (options?.patientIds) {
    if (options.patientIds.length === 0) {
      query = query.where(false);
    } else {
      query = query.whereIn('id', options.patientIds);
    }
  }
  return query
    .select('id', 'first_name', 'last_name', 'medical_record_number', 'phone', 'date_of_birth', 'gender', 'branch_id')
    .limit(10);
}


// ── #7: Trigram-based search using pg_trgm GIN index ──
// This uses similarity() which works with the GIN trigram index.
// Returns patients where combined name similarity exceeds threshold.
export async function trigramSearchPatients(
  tenantId: string,
  q: string,
  limit: number = 10,
): Promise<PatientRow[]> {
  return db('patients')
    .where({ tenant_id: tenantId })
    .whereNull('deleted_at')
    .whereRaw(
      "(first_name || ' ' || last_name) % ?",
      [q]
    )
    .orderByRaw(
      "similarity(first_name || ' ' || last_name, ?) DESC",
      [q]
    )
    .select('*')
    .limit(enforceLimit(limit));
}

// ── #9: Patient merge ──

export async function mergePatients(
  primaryId: string,
  duplicateId: string,
  tenantId: string,
): Promise<{ merged: boolean; movedRecords: number }> {
  // Verify both patients exist and belong to the same tenant
  const primary = await findPatientById(primaryId, tenantId);
  const duplicate = await findPatientById(duplicateId, tenantId);
  if (!primary || !duplicate) return { merged: false, movedRecords: 0 };

  let movedRecords = 0;

  await db.transaction(async (trx) => {
    // Move appointments from duplicate to primary
    const apptResult = await trx('appointments')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += apptResult;

    // Move EMR records
    const emrResult = await trx('emr_records')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += emrResult;

    // Move invoices
    const invResult = await trx('invoices')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += invResult;

    // Move lab orders
    const labResult = await trx('lab_orders')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += labResult;

    // Move prescriptions
    const rxResult = await trx('pharmacy_prescriptions')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += rxResult;

    // Move insurance claims
    const claimResult = await trx('insurance_claims')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += claimResult;

    // Move home visits
    const hvResult = await trx('home_visits')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += hvResult;

    // Move telemedicine sessions
    const tsResult = await trx('telemedicine_sessions')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += tsResult;

    // Move kiosk check-ins
    const kiResult = await trx('kiosk_checkins')
      .where({ patient_id: duplicateId })
      .update({ patient_id: primaryId });
    movedRecords += kiResult;

    // Soft-delete the duplicate
    await trx('patients').where({ id: duplicateId, tenant_id: tenantId }).update({
      status: 'merged',
      deleted_at: new Date(),
    });
  });

  return { merged: true, movedRecords };
}

// ── #16: Bulk import ──

export async function bulkInsertPatients(
  tenantId: string,
  patients: Array<{
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    phone: string;
    email?: string;
    nationalId?: string;
    nationality?: string;
    bloodType?: string;
  }>,
  userId: string,
): Promise<{ inserted: number; errors: Array<{ index: number; error: string }> }> {
  const errors: Array<{ index: number; error: string }> = [];
  let inserted = 0;

  // Process in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < patients.length; i += BATCH_SIZE) {
    const batch = patients.slice(i, i + BATCH_SIZE);
    const rows = batch.map((p, batchIdx) => {
      const idx = i + batchIdx;
      try {
        return {
          tenant_id: tenantId,
          medical_record_number: `MRN-${tenantId.substring(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${String(idx).padStart(4, '0')}`,
          first_name: p.firstName,
          last_name: p.lastName,
          date_of_birth: p.dateOfBirth,
          gender: p.gender,
          phone: p.phone,
          email: p.email || null,
          national_id: p.nationalId ? encryptField(p.nationalId) : null,
          nationality: p.nationality || null,
          blood_type: p.bloodType || null,
          status: 'active',
          created_by: userId,
        };
      } catch (err) {
        errors.push({ index: idx, error: (err as Error).message });
        return null;
      }
    }).filter(Boolean);

    if (rows.length > 0) {
      try {
        await db('patients').insert(rows as Record<string, unknown>[]);
        inserted += rows.length;
      } catch (err) {
        // If batch fails, record error for each row in batch
        batch.forEach((_, batchIdx) => {
          errors.push({ index: i + batchIdx, error: (err as Error).message });
        });
      }
    }
  }

  return { inserted, errors };
}
