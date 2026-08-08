# Module Doc: hr

**Location:** `packages/backend/src/modules/hr/`

---

## Purpose
Human resources: employee records, attendance, leave, and payroll for clinic staff.

## Responsibilities
- Employee CRUD (roles, departments, contracts)
- Attendance tracking
- Leave requests + approvals
- Payroll runs + entries (salaries, deductions, bonuses)

## Functional Requirements
- Manage employees linked to user accounts
- Record attendance (check-in/out, shifts)
- Leave request workflow (request → approve/reject)
- Generate payroll runs; payroll entries per employee
- Reports (attendance, payroll) via reports module

## Non-Functional Requirements
- Payroll math exact (integer currency)
- Audit HR writes; employee PII protected
- RBAC: HR manager scoped

## Business Rules
- One active employee record per user/tenant
- Leave balances validated per policy
- Payroll entries immutable after run finalization (adjustment entries)
- Attendance overlap prevented

## Database Entities
`employees`, `attendance`, `leave_requests`, `payroll_runs`, `payroll_entries`.

## API Endpoints
`/api/v1/hr` — employees, attendance, leave, payroll (RBAC).

## User Permissions
`hr:view/create/update`, `hr:payroll`, `hr:approve-leave`; self-service for own records.

## Dependencies
auth (user links), notification (leave approvals, payslips), reports.

## Internal Architecture
Service + repository per subdomain; shared employee types in module `types.ts`.

## Data Flow
Leave request → notify approver → approve → balance decrement → audit. Payroll run → snapshot employees/attendance → generate entries → finalize → export via reports.

## Validation Rules
Zod: dates, leave type enum, payroll amounts, employee refs.

## Error Handling
`ValidationError`, `ConflictError` (overlap leave), `NotFoundError`, `ForbiddenError`.

## Security Considerations
- RLS tenant scoping; employee PII redaction in logs
- Payroll data RBAC-restricted; audit `hr:*`

## Logging & Monitoring
Audit HR writes; payroll run status; alerts on failed payroll generation.

## Test Strategy
`hr.test.ts` — employee CRUD, leave workflow, payroll entry generation.

## Future Improvements
- Shift scheduling; overtime rules; payslip PDF via print templates; biometric import.

---

*Related: [Auth](auth.md) · [Reports](reports.md) · [Notifications](notification.md)*
