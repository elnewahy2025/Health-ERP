# Module Doc: emr

**Location:** `packages/backend/src/modules/emr/` (+ `clinical`, `laboratory`, `radiology`, `nursing`, `pharmacy`, `telemedicine`)

---

## Purpose
Electronic Medical Records: encounters, vitals, diagnoses (ICD-10), procedures, medications, and cross-department orders (lab/radiology/nursing/pharmacy).

## Responsibilities
- Manage EMR records per encounter type
- Vitals, diagnoses, procedures, prescriptions
- Order lifecycle for lab/radiology/nursing/pharmacy
- ICD-10 catalog search and validation
- AI-assisted note drafting and diagnosis suggestions

## Functional Requirements
- Create/read/update encounters (structured + free text)
- Attach vitals, diagnoses, procedures, medications
- Create orders → lab/radiology results status
- Prescribe medications → pharmacy dispensing
- Timeline integration with patient module

## Non-Functional Requirements
- Fast note load (< 300 ms); sensitive content encrypted where flagged
- Audit every clinical write (medical-legal)
- Read model optimized for clinician workflows

## Business Rules
- Encounters belong to a patient + clinician; immutable once finalized (amendment workflow)
- ICD-10 codes validated against catalog
- Prescriptions require clinician signature (approval) before dispensing
- AI drafts flagged as AI-generated until clinician confirms

## Database Entities
`emr_records`, `patient_allergies`, `patient_medications`, `medication_database`, `lab_catalog`, `lab_tests`, `lab_orders`, `radiology_orders`, `nursing_notes`, `nursing_tasks`, `pharmacy_prescriptions`, `pharmacy_prescription_items`, `ai_clinical_notes`, `ai_diagnosis_suggestions`, `telemedicine_sessions`, `telemedicine_chat_messages`.

## API Endpoints
`/api/v1/emr` (encounters, vitals, orders), `/api/v1/laboratory`, `/api/v1/radiology`, `/api/v1/nursing`, `/api/v1/pharmacy`, `/api/v1/telemedicine`.

## User Permissions
`emr:view/create/update`; role-scoped (physician writes, nurse vitals, pharmacist dispensing); clinician confirmation required for AI content.

## Dependencies
patient, auth (clinician identity), shared types/validators, AI modules, notification.

## Internal Architecture
Monolith-style per sub-module with services; shared clinical types in `@healthcare/shared/types/domain`.

## Data Flow
Encounter open → load patient summary → clinician inputs → validate → persist (tx) → audit → update timeline. Orders: create → department queue → result → EMR link.

## Validation Rules
Zod schemas per entity; ICD-10 code format; vitals ranges (flagged, not blocked); medication dosages.

## Error Handling
`ValidationError`, `NotFoundError`, `ConflictError` (finalized record), `ForbiddenError`.

## Security Considerations
- RLS tenant scoping; encryption for sensitive notes flagged sensitive
- Audit all clinical writes; provenance for AI suggestions
- Strict RBAC: patient data on need-to-know

## Logging & Monitoring
Audit `emr:*`; order fulfillment metrics; alerts on AI fallback spikes; audit of AI acceptance rates.

## Test Strategy
`ai.test.ts`, `icd10.test.ts`, `medications.test.ts`, `laboratory.test.ts`, `pharmacy.test.ts` — order flows, ICD validation, AI fallback.

## Future Improvements
- FHIR/HL7 export; structured clinical templates; clinical decision-support rules; longitudinal care plans.

---

*Related: [Patient](patient.md) · [AI instructions](../ai/AI-INSTRUCTIONS.md)*
