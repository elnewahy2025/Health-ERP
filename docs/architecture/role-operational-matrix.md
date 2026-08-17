# Hospital ERP Operational Role Matrix

**Repository examined:** `elnewahy2025/Health-ERP`  
**Primary sources:** shared authorization catalog, frontend route-permission map, frontend pages, and backend route guards.

## How to read this document

The codebase does not define 39 independent permission matrices. It defines **39 hospital role slugs** in `HOSPITAL_ROLE_CATALOG`; each slug points to one of the existing base templates in `SEED_ROLES`. The base template supplies the effective permission-and-scope grants, while the catalog supplies the role name, level, and default scope metadata.

> A role can open a page only when its effective grants satisfy the page’s route permission. The backend remains the final authority. A page being visible in the frontend does not itself grant access to its API operations.

The operational page mapping below comes from `packages/frontend/src/router/index.tsx` and `App.tsx`. The backend operations come from `authorize(...)` guards in `packages/backend/src/modules`.

## Direct example: Pharmacist versus Pharmacy Technician

In the current codebase, **Pharmacist** and **Pharmacy Technician are functionally identical**. Both catalog entries inherit the `pharmacist` base template, both have `branch` as their catalog default scope, and both receive:

| Effective right | Page/function | Backend operation |
|---|---|---|
| `pharmacy.*` at `branch` | `/pharmacy` | View pharmacy inventory and prescriptions; add drugs; update stock; create prescriptions; dispense prescriptions. |
| `patients.view` at `branch` | Patient lookup used by pharmacy workflows and `/patients` | Patient list/search/detail operations subject to branch policy. |
| `emr.view` at `branch` | `/emr` and patient clinical context | EMR list/detail and patient EMR-related reads subject to branch policy. |

The visible pharmacy page has two tabs: **Inventory** and **Prescriptions**. Users with `pharmacy.create` see the **Add Drug** and **New Prescription** controls. Users with `pharmacy.approve` see the **Dispense** control. Because both roles inherit `pharmacy.*`, both satisfy those frontend gates.

The pharmacy backend now uses action-specific guards: `pharmacy.create` for adding inventory and creating prescriptions, `pharmacy.edit` for stock updates, and `pharmacy.approve` for dispensing prescriptions. The frontend `Can` gates and backend guards now align. This still does not distinguish Pharmacist from Pharmacy Technician; both roles inherit `pharmacy.*` and therefore satisfy all four operation permissions.

## All 39 roles

| # | Role slug | Display name | Base rights package | Default scope metadata | Pages that can open from route guards | Operational interpretation |
|---:|---|---|---|---|---|---|
| 1 | `super_administrator` | Super Administrator | `super_admin` | `system` | All permission-mapped application pages | Full system-wide access to all catalog modules and operations. |
| 2 | `tenant_administrator` | Tenant Administrator | `admin` | `tenant` | All permission-mapped pages inside the active tenant | Full tenant administration, including users, roles, settings, clinical, financial, operational, reporting, and integration areas; never another tenant. |
| 3 | `hospital_executive` | Hospital Executive | `manager` | `tenant` | `/reports`, `/hr`, `/analytics-dashboard`, `/patients`, `/appointments`, `/emr` | Tenant-wide management reporting and read access to HR, dashboard, patients, appointments, and EMR. |
| 4 | `hospital_operations_manager` | Hospital Operations Manager | `manager` | `tenant` | Same as Hospital Executive | Same effective rights as Hospital Executive in current code. |
| 5 | `branch_manager` | Branch Manager | `manager` | `branch` | Same as manager package | The catalog says branch default, but inherited grants are tenant-scoped; current effective rights are the same as `manager`. |
| 6 | `department_head` | Department Head | `manager` | `department` | Same as manager package | The catalog says department default, but inherited grants are tenant-scoped; current effective rights are the same as `manager`. |
| 7 | `medical_director` | Medical Director | `manager` | `tenant` | Same as manager package | Same effective rights as the other manager-derived roles. |
| 8 | `physician` | Physician | `doctor` | `assigned_patients` | `/patients`, `/appointments`, `/emr`, `/laboratory`, `/radiology`, `/pharmacy`, `/billing`, `/insurance`, `/chat`, `/dms` | Works with assigned patients: clinical records, appointments, EMR, selected lab/radiology/pharmacy/billing/insurance reads, chat, and patient documents. |
| 9 | `consultant_physician` | Consultant Physician | `doctor` | `assigned_patients` | Same as Physician | Same effective rights as Physician in current code. |
| 10 | `resident_physician` | Resident Physician | `doctor` | `assigned_patients` | Same as Physician | Same effective rights as Physician in current code. |
| 11 | `nurse_manager` | Nurse Manager | `nurse` | `department` | `/patients`, `/appointments`, `/emr`, `/nursing`, `/queue`, `/laboratory`, `/pharmacy` | Department clinical work, nursing tasks/notes, queue operations at branch scope, and department clinical reads. |
| 12 | `registered_nurse` | Registered Nurse | `nurse` | `department` | Same as Nurse Manager | Same effective rights as Nurse Manager in current code. |
| 13 | `nurse_assistant` | Nurse Assistant | `nurse` | `assigned_patients` | Same as nurse package | Catalog default differs, but inherited nurse grants remain department/branch-scoped; no separate assistant permission package exists. |
| 14 | `pharmacist` | Pharmacist | `pharmacist` | `branch` | `/pharmacy`, `/patients`, `/emr` | Pharmacy inventory, prescription creation, dispensing, stock operations, and branch patient/EMR context. |
| 15 | `pharmacy_technician` | Pharmacy Technician | `pharmacist` | `branch` | Same as Pharmacist | **Identical to Pharmacist in current code**; no technician-specific restriction exists. |
| 16 | `laboratory_manager` | Laboratory Manager | `lab_tech` | `department` | `/laboratory`, `/patients`, `/emr` | Laboratory catalog/orders/results/status/printing plus department patient and EMR context. |
| 17 | `laboratory_technician` | Laboratory Technician | `lab_tech` | `department` | Same as Laboratory Manager | **Identical to Laboratory Manager in current code**. |
| 18 | `radiology_manager` | Radiology Manager | `radiologist` | `department` | `/radiology`, `/patients`, `/emr` | Radiology orders, updates, reporting workflow, printing/export-capable radiology operations, and department patient/EMR context. |
| 19 | `radiologist` | Radiologist | `radiologist` | `department` | Same as Radiology Manager | **Identical to Radiology Manager in current code**. |
| 20 | `radiology_technician` | Radiology Technician | `radiologist` | `department` | Same as Radiology Manager | **Identical to Radiology Manager in current code**. |
| 21 | `medical_records_officer` | Medical Records Officer | `nurse` | `department` | `/patients`, `/appointments`, `/emr`, `/nursing`, `/queue`, `/laboratory`, `/pharmacy` | Same effective rights as the nurse package, including nursing and department clinical access. No separate medical-records package exists. |
| 22 | `medical_coder` | Medical Coder | `billing_staff` | `department` | `/billing`, `/insurance`, `/patients` | Billing operations at branch scope plus insurance and patient reads. The catalog default department does not rewrite the billing_staff branch grants. |
| 23 | `receptionist` | Receptionist | `receptionist` | `branch` | `/patients`, `/appointments`, `/billing`, `/queue`, `/insurance`, `/communications`, `/emr` | Front-desk patient and appointment workflows, queue, billing creation/view, insurance view, communications, and branch EMR view. |
| 24 | `appointment_coordinator` | Appointment Coordinator | `receptionist` | `branch` | Same as Receptionist | Same effective rights as Receptionist in current code. |
| 25 | `triage_officer` | Triage Officer | `nurse` | `branch` | Same as nurse package | Same effective rights as the nurse package; the catalog branch default does not rewrite the inherited department/branch grant scopes. |
| 26 | `billing_manager` | Billing Manager | `billing_staff` | `branch` | `/billing`, `/insurance`, `/patients` | Branch billing, insurance view, and patient view. Despite the title, no separate manager billing package exists. |
| 27 | `billing_officer` | Billing Officer | `billing_staff` | `branch` | Same as Billing Manager | Same effective rights as Billing Manager in current code. |
| 28 | `accountant` | Accountant | `accountant` | `tenant` | `/billing`, `/reports`, `/financial-reports` | Tenant-wide billing/revenue viewing and export plus general and financial report viewing/export. |
| 29 | `insurance_manager` | Insurance Manager | `accountant` | `tenant` | `/billing`, `/reports`, `/financial-reports` | Currently inherits accountant rights, not insurance-management rights. It does not inherit `insurance.*` or `insurance_claims.*` in the shared catalog. |
| 30 | `insurance_claims_officer` | Insurance Claims Officer | `billing_staff` | `branch` | `/billing`, `/insurance`, `/patients` | Currently inherits billing_staff rights. It has `insurance.view`, but not `insurance_claims.view`; therefore `/insurance-claims` is not granted by its current base package. |
| 31 | `hr_manager` | HR Manager | `manager` | `tenant` | `/reports`, `/hr`, `/analytics-dashboard`, `/patients`, `/appointments`, `/emr` | Currently manager-derived: HR view and general operational/clinical reporting reads. No dedicated HR management grant package exists. |
| 32 | `hr_officer` | HR Officer | `manager` | `department` | Same as manager package | Same effective rights as HR Manager in current code; catalog department metadata does not narrow inherited tenant grants. |
| 33 | `inventory_manager` | Inventory Manager | `manager` | `branch` | `/reports`, `/hr`, `/analytics-dashboard`, `/patients`, `/appointments`, `/emr` | Currently does not inherit `inventory.*`; the name is not reflected in its effective rights. Inventory page access is not granted by the manager package. |
| 34 | `procurement_officer` | Procurement Officer | `manager` | `branch` | Same as manager package | Currently does not inherit procurement or inventory permissions; same effective rights as manager. |
| 35 | `compliance_officer` | Compliance Officer | `manager` | `tenant` | Same as manager package | Currently does not inherit `compliance.*` or `compliance_reports.*`; the name is not reflected in its effective rights. |
| 36 | `reporting_bi_analyst` | Reporting and BI Analyst | `accountant` | `tenant` | `/billing`, `/reports`, `/financial-reports` | Currently inherits accountant rights, not `bi.*` or `analytics_dashboard.*`; the role name is broader than its code-defined rights. |
| 37 | `it_system_administrator` | IT/System Administrator | `admin` | `tenant` | All permission-mapped pages inside the tenant | Same tenant-wide wildcard rights as Tenant Administrator and Patient Portal Administrator. |
| 38 | `patient_portal_administrator` | Patient Portal Administrator | `admin` | `tenant` | All permission-mapped pages inside the tenant | Same tenant-wide wildcard rights as Tenant Administrator and IT/System Administrator. |
| 39 | `patient_portal_user` | Patient Portal User | `patient` | `self` | `/patients`, `/appointments`, `/emr`, `/laboratory`, `/radiology`, `/pharmacy`, `/billing`, `/dms`, `/chat`, `/patient-portal`, `/notifications` | Self-service access to the user’s own patient, appointment, clinical, pharmacy, billing, documents, chat, portal, and notifications data. |

## Rights packages and the functions/pages they cover

### `manager` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `reports.*` at tenant | `/reports` | View reports; create/execute/schedule reports through current report API guards; update/delete schedules and reports; export report output. |
| `hr.view` at tenant | `/hr` | Employee, attendance, leave, and payroll reads. Current backend also uses `hr.view` on employee and leave creation endpoints. |
| `analytics_dashboard.view` at tenant | `/analytics-dashboard` | Dashboard stats, widgets, and widget data. |
| `patients.view` at tenant | `/patients` | Patient list, search, detail, and doctor lookup. |
| `appointments.view` at tenant | `/appointments` | Appointment list, details, today summary. Current backend action guards are separate for create/edit/cancel. |
| `emr.view` at tenant | `/emr` | EMR list/detail and related patient clinical reads. |

### `doctor` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `patients.view/edit` at assigned patients | `/patients` | View and update assigned patient records. |
| `appointments.view/edit` at assigned patients | `/appointments` | View, update, check-in, and complete assigned appointments. |
| `emr.*` at assigned patients | `/emr` | View, create, edit, sign/approve, add diagnosis/medication, and related clinical operations. |
| `laboratory.view/print` at assigned patients | `/laboratory` | View laboratory orders/results and print laboratory reports. |
| `radiology.view` at assigned patients | `/radiology` | View assigned radiology orders. |
| `pharmacy.view` at assigned patients | `/pharmacy` | View pharmacy inventory/prescriptions in assigned-patient context. |
| `billing.view` at assigned patients | `/billing` | View assigned-patient invoices and billing information. |
| `insurance.view` at assigned patients | `/insurance` | View insurance information. |
| `chat.view/create` at assigned patients | `/chat` | View conversations and create messages. |
| `documents.view/download` at assigned patients | `/dms` | View and download patient documents. |

### `nurse` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `patients.view/edit` at department | `/patients` | Department patient view/edit. |
| `appointments.view` at department | `/appointments` | Department appointment view. |
| `emr.view/create` at department | `/emr` | Read and create EMR records. |
| `nursing.*` at department | `/nursing` | Nursing task reads/creation/updates and nursing notes. |
| `queue.view/edit` at branch | `/queue`, `/kiosk`, `/queue-display` | Queue and kiosk operations, status changes, calling patients. |
| `laboratory.view` at department | `/laboratory` | Laboratory reads. |
| `pharmacy.view` at department | `/pharmacy` | Pharmacy reads. |

### `pharmacist` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `pharmacy.*` at branch | `/pharmacy` | Inventory and prescription reads via `pharmacy.view`; add drug and create prescription via `pharmacy.create`; stock updates via `pharmacy.edit`; dispensing via `pharmacy.approve`. |
| `patients.view` at branch | `/patients` | Branch patient lookup. |
| `emr.view` at branch | `/emr` | Branch EMR context reads. |

### `lab_tech` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `laboratory.*` at department | `/laboratory` | Lab catalog, order list/create, results, status changes, approval/rejection, printing/export operations supported by backend guards. |
| `patients.view` at department | `/patients` | Department patient lookup. |
| `emr.view` at department | `/emr` | Department EMR context reads. |

### `radiologist` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `radiology.*` at department | `/radiology` | Radiology order list/create/update, reporting/approval/rejection/printing/export operations supported by backend guards. |
| `patients.view` at department | `/patients` | Department patient lookup. |
| `emr.view` at department | `/emr` | Department EMR context reads. |

### `billing_staff` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `billing.*` at branch | `/billing` | Invoice reads, creation/payment, editing/deletion/approval/rejection/cancellation/export/printing where corresponding backend endpoints exist. |
| `insurance.view` at branch | `/insurance` | Insurance companies and claims view operations. |
| `patients.view` at branch | `/patients` | Branch patient lookup. |

### `receptionist` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `patients.*` at branch | `/patients` | Patient list/search/detail/create/edit/delete/manage operations available to the backend guard. |
| `appointments.*` at branch | `/appointments` | Appointment view/create/edit/cancel/approve/export/manage operations supported by backend guards. |
| `billing.view/create` at branch | `/billing` | View invoices and create/pay invoices. |
| `queue.*` at branch | `/queue`, `/kiosk`, `/queue-display` | Queue creation, view, status, calling, and kiosk check-in operations. |
| `insurance.view` at branch | `/insurance` | Insurance view. |
| `communications.view/create` at branch | `/communications`, `/notification-templates` | Communication templates/messages and related communication operations. |
| `emr.view` at branch | `/emr` | EMR read access. |

### `accountant` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| `billing.view/export` at tenant | `/billing` | Tenant billing/revenue reads and exports. |
| `reports.view/export` at tenant | `/reports` | Report reads and report exports. The current backend also places some create/execute/schedule operations under `reports.view`; frontend buttons require `reports.manage`. |
| `financial_reports.view/export` at tenant | `/financial-reports` | Financial profit/loss report reads and exports supported by the module. |

### `patient` package

| Permission | Page or link | Current operational functions |
|---|---|---|
| Patient/appointment/EMR/lab/radiology/pharmacy/billing `view` at self | `/patients`, `/appointments`, `/emr`, `/laboratory`, `/radiology`, `/pharmacy`, `/billing` | Self-service viewing of the user’s own clinical and financial records. |
| `documents.view/download` at self | `/dms` | View/download own documents. |
| `notifications.view` at self | `/notifications` | View notifications and unread state. |
| `chat.view/create` at self | `/chat` | View own conversations and send messages. |
| `patient_portal.view` at self | `/patient-portal` | View patient portal features. |

## Important codebase distinctions and gaps

The following are not assumptions; they are direct consequences of the current inheritance map:

| Role name suggests | Actual current code-defined result |
|---|---|
| Pharmacy Technician should be narrower than Pharmacist | It is not narrower. Both use `pharmacist` and `pharmacy.*`. |
| Laboratory Manager should differ from Laboratory Technician | They are identical through `lab_tech`. |
| Radiology Manager/Technician should differ from Radiologist | All three are identical through `radiologist`. |
| Insurance Manager should manage insurance | It inherits `accountant`, which grants billing/reports/financial reports, not insurance permissions. |
| Insurance Claims Officer should open claims lifecycle | It inherits `billing_staff`, which grants `insurance.view` but not `insurance_claims.view`; `/insurance-claims` is therefore not granted by the current base role. |
| Inventory Manager should open Inventory | It inherits `manager`, which does not include `inventory.view`; the current role cannot open `/inventory` through the catalog grants. |
| Procurement Officer should manage procurement | It inherits `manager`; there is no procurement permission module in the catalog and no inventory grant in that base package. |
| Compliance Officer should open Compliance | It inherits `manager`, which does not include `compliance.view`; `/compliance` is not granted by the current catalog mapping. |
| Reporting and BI Analyst should use BI and analytics | It inherits `accountant`, which grants reports and financial reports, not `bi.view` or `analytics_dashboard.view`. |
| Branch Manager or Department Head should be narrowed | Their catalog default scopes differ, but their inherited manager grants remain tenant-scoped. |
| HR create actions should be controlled by `hr.create` | Current backend HR routes use `hr.view` for several create operations, while the frontend gates creation with `hr.create`. |

These distinctions mean the catalog is structurally present, but several role names do not yet correspond to specialized operational rights. The attached matrix describes the **actual current behavior**, not the intended business meaning of the names.

## Source references

[1]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/shared/src/authz/index.ts "Shared role and permission catalog"
[2]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/router/index.tsx "Frontend route permissions"
[3]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/App.tsx "Frontend route tree"
[4]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/pages/PharmacyPage.tsx "Pharmacy page controls"
[5]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/modules/pharmacy/index.ts "Pharmacy backend routes"
[6]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/modules/rbac/index.ts "Runtime RBAC API"
