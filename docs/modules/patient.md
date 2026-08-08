# Module Doc: patient

**Location:** `packages/backend/src/modules/patient/` · **Pattern:** Clean Architecture

---

## Purpose
Patient registry with Egyptian National ID validation, PII encryption, tenant isolation (RLS), search, allergies, medications, risk scores, and timeline.

## Responsibilities
- CRUD patients; auto-generate MRN
- Validate Egyptian NID (checksum, governorate, birth date, gender)
- Encrypt sensitive fields (AES-256-GCM)
- Manage allergies, medications, risk scores
- Provide patient timeline (appointments, EMR, billing, orders)
- Search with pg_trgm

## Functional Requirements
- Create/read/update/delete patients (soft delete)
- `GET /patients/:id/timeline`
- Search by name/MRN/phone/NID (hashed companion for encrypted NID)
- Merge duplicate records (planned)

## Non-Functional Requirements
- p95 < 300 ms for search; paginated lists
- Zero PII in logs; encrypted at rest
- RLS enforcement per tenant

## Business Rules
- MRN unique per tenant; auto-generated via `generateMedicalRecordNumber`
- NID validated; gender/birth date derived and cross-checked
- Encrypted fields: NID + contact PII; `isEncrypted` marker
- Status transitions: active → inactive/archived (no hard delete)

## Database Entities
`patients`, `patient_allergies`, `patient_medications`, `patient_risk_scores`, `patient_messages`, `patient_shared_documents`.

## API Endpoints
`/api/v1/patients` — CRUD, search, timeline, allergies, medications (auth required, RBAC).

## User Permissions
`patients:view`, `patients:create`, `patients:update`, `patients:delete` (RBAC per tenant).

## Dependencies
`@healthcare/shared` (crypto, validators, errors), services (audit, notification), modules (appointment, emr, billing for timeline).

## Internal Architecture
Clean Architecture files; repository scopes every query by `tenant_id` + RLS.

## Data Flow
Request → auth+RBAC → schema validation → service (encrypt/validate) → repository (RLS-scoped insert) → audit log → response.

## Validation Rules
Zod: NID (14 digits + checksum), phone (Egyptian prefixes), email, MRN format, dates.

## Error Handling
`ValidationError` (NID), `NotFoundError` (patient), `ConflictError` (duplicate MRN).

## Security Considerations
- AES-256-GCM encryption; RLS; parameterized queries
- Search on encrypted NID via deterministic hash companion
- Redaction; consent logs for data sharing

## Logging & Monitoring
Audit `patient:*` writes; metrics on search latency; alerts on decryption failures.

## Test Strategy
`patients.test.ts`, `allergies.test.ts`, `medications.test.ts`, `timeline.test.ts` — CRUD, RLS cross-tenant denial, NID checksum, encryption round-trip.

## Future Improvements
- Duplicate detection/merge; FHIR export; patient-submitted data with verification.

---

*Related: [Auth](auth.md) · [EMR](emr.md) · [Data model](../core/DATA-MODEL.md)*
