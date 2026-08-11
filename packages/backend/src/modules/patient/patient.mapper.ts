import type { PatientRow, PatientResponse } from './types.js';
import { decryptField } from '@healthcare/shared/utils';

function formatDate(value: string | Date): string {
  if (typeof value === 'string') return value.substring(0, 10);
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  // DATE columns are parsed by node-postgres as local midnight; use local
  // components so the wall date survives any container timezone.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function mapPatient(p: PatientRow): PatientResponse {
  let decryptedNationalId: string | null = null;
  if (p.national_id) {
    try {
      decryptedNationalId = decryptField(p.national_id);
    } catch {
      // Value may be plaintext from before encryption was added
      decryptedNationalId = p.national_id;
    }
  }

  return {
    id: p.id,
    tenantId: p.tenant_id,
    medicalRecordNumber: p.medical_record_number,
    firstName: p.first_name,
    lastName: p.last_name,
    dateOfBirth: formatDate(p.date_of_birth),
    gender: p.gender,
    nationalId: decryptedNationalId,
    nationality: p.nationality,
    bloodType: p.blood_type,
    email: p.email,
    phone: p.phone,
    phone2: p.phone2,
    address: p.address ? (typeof p.address === 'string' ? JSON.parse(p.address) : p.address) : undefined,
    emergencyContact: p.emergency_contact ? (typeof p.emergency_contact === 'string' ? JSON.parse(p.emergency_contact) : p.emergency_contact) : undefined,
    preferredLanguage: p.preferred_language,
    status: p.status,
    tags: p.tags || [],
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
