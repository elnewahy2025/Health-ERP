# Module Doc: crm

**Location:** `packages/backend/src/modules/crm/`

---

## Purpose
Patient engagement and marketing: campaigns, feedback, surveys, and referral relationships.

## Responsibilities
- CRM campaigns (target segments, channels)
- Patient feedback collection
- Surveys + responses
- Referral tracking (doctor/clinic network)

## Functional Requirements
- Create/run campaigns with audience filters
- Collect feedback (post-visit surveys)
- Manage surveys + responses
- Track referrals (referral module) and business associates

## Non-Functional Requirements
- Campaign dispatch via notification service (email/SMS/WhatsApp)
- Consent-aware: campaigns respect `data_consent_logs`
- Reports on campaign performance

## Business Rules
- Campaigns require consent for contact channels
- Feedback linked to patient + visit
- Referral attribution recorded at referral creation

## Database Entities
`crm_campaigns`, `crm_patient_feedback`, `surveys`, `survey_responses`, `referrals`, `business_associate_agreements`.

## API Endpoints
`/api/v1/crm` (campaigns, feedback), `/api/v1/surveys`, `/api/v1/referrals`.

## User Permissions
`crm:manage`, `crm:view`; patient portal scoped to own feedback.

## Dependencies
patient, notification, reports, patient-experience.

## Internal Architecture
Service + repository; campaign dispatch delegates to notification service.

## Data Flow
Create campaign → filter audience → enqueue notifications → track opens/consent → report. Feedback → survey submit → store response → notify clinic.

## Validation Rules
Zod: campaign channels, audience filters, survey schema, feedback ratings.

## Error Handling
`ValidationError`, `NotFoundError`, `ConflictError` (duplicate survey response).

## Security Considerations
- Consent enforcement; RLS; audit `crm:*`
- No PII in campaign logs beyond consented contacts

## Logging & Monitoring
Audit campaign/feedback writes; campaign delivery metrics; NPS-style trend from feedback.

## Test Strategy
Module test file covers campaign CRUD, consent gating, feedback submission.

## Future Improvements
- Segmentation engine; A/B campaigns; referral incentives tracking; loyalty programs.

---

*Related: [Patient](patient.md) · [Notifications](notification.md) · [Analytics](../product/ANALYTICS.md)*
