# Module Doc: appointment

**Location:** `packages/backend/src/modules/appointment/` (+ `patient-scheduling`, `online-booking`, `queue`) · **Pattern:** Clean Architecture (core)

---

## Purpose
End-to-end appointment lifecycle: booking, rescheduling, cancellation, reminders, queue, kiosk check-in, and online self-booking.

## Responsibilities
- CRUD appointments with conflict prevention
- Schedule reminders (BullMQ → notification service)
- Manage booking slots + online booking requests
- Queue entries and display settings; kiosk check-in
- Smart scheduling (AI) suggestions

## Functional Requirements
- Book/reschedule/cancel/confirm appointments
- Enforce no-overlap constraints (same doctor/room)
- Generate reminders (email/SMS/WhatsApp)
- Queue: check-in, call, complete; display updates via WebSocket
- Online booking: slot availability + booking requests
- Kiosk check-in: patient self check-in

## Non-Functional Requirements
- Reminder jobs reliable (Redis-backed queue, retries)
- Queue updates real-time (WebSocket)
- Slot queries indexed by `(tenant_id, date, doctor)`

## Business Rules
- No overlapping appointments for the same doctor/room (migration 024)
- Status flow: requested → confirmed → checked_in → completed | cancelled | no_show
- Reminder scheduling on book + reschedule; no-shows tracked
- Slot capacity per doctor/room/time

## Database Entities
`appointments`, `appointment_reminders`, `booking_slots`, `booking_requests`, `queue_entries`, `queue_display_settings`, `kiosk_checkins`, `ai_smart_schedules`.

## API Endpoints
`/api/v1/appointments` (CRUD, reschedule, cancel, availability), `/api/v1/online-booking`, `/api/v1/queue` (+ display), kiosk endpoints.

## User Permissions
`appointments:view/create/update/delete`; queue staff role; patient self-service scoped to own records.

## Dependencies
patient, notification, hr (doctor calendar), queue module, BullMQ.

## Internal Architecture
Clean Architecture core files; queue display uses WebSocket channel `/ws/queue`.

## Data Flow
Book → validate slot/conflicts → insert appointment (tx) → enqueue reminder → return 201. Check-in → queue entry status → broadcast display update.

## Validation Rules
Zod: datetime ranges, slot availability, status transitions, patient/doctor/branch refs.

## Error Handling
`ConflictError` (overlap), `NotFoundError`, `ValidationError` (past dates), `ForbiddenError` (cross-tenant).

## Security Considerations
RBAC; tenant-scoped queries; patient consent for reminders; WebSocket auth.

## Logging & Monitoring
Audit `appointment:*`; reminder delivery logs; queue metrics; alerts on reminder failure spikes.

## Test Strategy
`appointment.test.ts` — conflict prevention, status transitions, reminder enqueue; e2e auth/patients smoke covers booking happy path.

## Future Improvements
- Calendar sync (Google/Outlook); waitlist; multi-doctor scheduling optimization; SMS confirmations with 2-way.

---

*Related: [Patient](patient.md) · [Notifications](notification.md) · [API spec](../engineering/API-SPECIFICATION.md)*
