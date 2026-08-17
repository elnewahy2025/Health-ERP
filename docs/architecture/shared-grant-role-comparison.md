# Shared-Grant Role Comparison

**Repository:** `elnewahy2025/Health-ERP`  
**Purpose:** Explain what users with roles that currently share the same grant package can actually open and do in the application.

## Executive finding

The 39 catalog roles collapse into **11 effective grant packages**. Roles inside one package currently have the same permission keys, the same grant scopes, the same route-level page access, and the same backend operation rights. Some names and catalog default-scope values differ, but those differences do not currently transform the inherited grants.

| Grant package | Number of catalog roles | Roles |
|---|---:|---|
| `super_admin` | 1 | Super Administrator |
| `admin` | 3 | Tenant Administrator; IT/System Administrator; Patient Portal Administrator |
| `manager` | 10 | Hospital Executive; Hospital Operations Manager; Branch Manager; Department Head; Medical Director; HR Manager; HR Officer; Inventory Manager; Procurement Officer; Compliance Officer |
| `doctor` | 3 | Physician; Consultant Physician; Resident Physician |
| `nurse` | 5 | Nurse Manager; Registered Nurse; Nurse Assistant; Medical Records Officer; Triage Officer |
| `pharmacist` | 2 | Pharmacist; Pharmacy Technician |
| `lab_tech` | 2 | Laboratory Manager; Laboratory Technician |
| `radiologist` | 3 | Radiology Manager; Radiologist; Radiology Technician |
| `billing_staff` | 4 | Medical Coder; Billing Manager; Billing Officer; Insurance Claims Officer |
| `receptionist` | 2 | Receptionist; Appointment Coordinator |
| `accountant` | 3 | Accountant; Insurance Manager; Reporting and BI Analyst |
| `patient` | 1 | Patient Portal User |

> The comparison below describes **current code behavior**, not the business meaning that the role names might suggest.

## 1. `admin` package

### Roles in this group

| Catalog role | Slug | Catalog level | Catalog default scope |
|---|---|---|---|
| Tenant Administrator | `tenant_administrator` | system | tenant |
| IT/System Administrator | `it_system_administrator` | tenant | tenant |
| Patient Portal Administrator | `patient_portal_administrator` | tenant | tenant |

### Shared rights

All three roles inherit `admin`, which grants `*` at `tenant` scope. They can therefore pass every catalog permission check inside the active tenant, including clinical, financial, operational, reporting, user, role, settings, integration, audit, data-management, and portal modules.

### Pages and links

They can open every permission-mapped application route inside the active tenant, including `/patients`, `/appointments`, `/emr`, `/billing`, `/laboratory`, `/radiology`, `/pharmacy`, `/inventory`, `/hr`, `/reports`, `/analytics-dashboard`, `/admin`, `/admin/users`, `/admin/roles`, `/settings`, `/audit-logs`, `/data-export`, `/bulk-import`, `/integrations`, `/branches`, `/system-monitor`, `/developer-portal`, and the remaining mapped routes.

### Backend functions

The wildcard covers the backend operations guarded by `users.*`, `roles.*`, `settings.*`, `sessions.*`, all clinical and operational module permissions, report/export functions, data import/export, integrations, audit access, and tenant administration. The scope remains tenant-wide; it does not become system-wide merely because the catalog level for Tenant Administrator is labelled `system`.

### Difference between the three names

There is **no effective rights difference** in the current implementation. The names are different, and `Tenant Administrator` is marked `system` level while the other two are marked `tenant`, but all three inherit the same `*` at `tenant` grant package.

## 2. `manager` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Hospital Executive | `hospital_executive` | tenant |
| Hospital Operations Manager | `hospital_operations_manager` | tenant |
| Branch Manager | `branch_manager` | branch |
| Department Head | `department_head` | department |
| Medical Director | `medical_director` | tenant |
| HR Manager | `hr_manager` | tenant |
| HR Officer | `hr_officer` | department |
| Inventory Manager | `inventory_manager` | branch |
| Procurement Officer | `procurement_officer` | branch |
| Compliance Officer | `compliance_officer` | tenant |

### Shared grants

All ten roles inherit exactly:

| Permission | Effective grant scope |
|---|---|
| `reports.*` | tenant |
| `hr.view` | tenant |
| `analytics_dashboard.view` | tenant |
| `patients.view` | tenant |
| `appointments.view` | tenant |
| `emr.view` | tenant |

### Pages and links

They can open the following route-protected pages:

| Page | What the page provides |
|---|---|
| `/reports` | Reports list, report viewing, execution/schedule surfaces, and report export visibility subject to the specific API and frontend action guards. |
| `/hr` | Employees, attendance, leave requests, and payroll views. |
| `/analytics-dashboard` | Dashboard statistics, widgets, KPI-style operational data, and widget data. |
| `/patients` | Patient list, search, detail, and doctor lookup. |
| `/appointments` | Appointment list, detail, and today summary. |
| `/emr` | EMR list/detail and patient clinical reads. |

### Backend functions

The shared package authorizes tenant-scoped report reads and report operations covered by the `reports.*` wildcard, HR reads and the current HR operations guarded by `hr.view`, dashboard stats/widgets, patient reads, appointment reads, and EMR reads.

### Difference between the ten names

There is **no effective grant difference**. `Branch Manager`, `Department Head`, `HR Officer`, `Inventory Manager`, and `Procurement Officer` have branch/department metadata, but the inherited grants remain tenant-scoped. The catalog default scope does not automatically narrow `reports.*`, `patients.view`, `appointments.view`, or `emr.view`.

### Role-name mismatches

The following names currently overstate or misstate the actual rights:

| Role name | Actual current result |
|---|---|
| Inventory Manager | Does not receive `inventory.view`; cannot open `/inventory` through the catalog grants. |
| Procurement Officer | No procurement permission module exists in the catalog; no inventory grant is inherited. |
| Compliance Officer | Does not receive `compliance.view` or `compliance_reports.view`; cannot open the compliance pages through the catalog grants. |
| HR Manager / HR Officer | Both are manager-derived and receive HR view, not a dedicated full HR management package. |
| Branch Manager / Department Head | Their default scope labels do not narrow the tenant-scoped grants. |

## 3. `doctor` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Physician | `physician` | assigned_patients |
| Consultant Physician | `consultant_physician` | assigned_patients |
| Resident Physician | `resident_physician` | assigned_patients |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `patients.view`, `patients.edit` | `/patients` | View and edit assigned patient records. |
| `appointments.view`, `appointments.edit` | `/appointments` | View, update, check in, and complete assigned appointments. |
| `emr.*` | `/emr` | View, create, edit, add diagnosis/medication, sign/approve, and related EMR operations. |
| `laboratory.view`, `laboratory.print` | `/laboratory` | View assigned lab orders/results and print reports. |
| `radiology.view` | `/radiology` | View assigned radiology orders. |
| `pharmacy.view` | `/pharmacy` | View assigned pharmacy inventory/prescriptions. |
| `billing.view` | `/billing` | View assigned-patient invoices and billing information. |
| `insurance.view` | `/insurance` | View assigned-patient insurance information. |
| `chat.view`, `chat.create` | `/chat` | View conversations and create messages. |
| `documents.view`, `documents.download` | `/dms` | View and download assigned-patient documents. |

### Difference between the three names

There is **no effective rights difference** between Physician, Consultant Physician, and Resident Physician. All three are assigned-patient scoped and inherit the same clinical package.

## 4. `nurse` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Nurse Manager | `nurse_manager` | department |
| Registered Nurse | `registered_nurse` | department |
| Nurse Assistant | `nurse_assistant` | assigned_patients |
| Medical Records Officer | `medical_records_officer` | department |
| Triage Officer | `triage_officer` | branch |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `patients.view`, `patients.edit` at department | `/patients` | Department patient viewing/editing. |
| `appointments.view` at department | `/appointments` | Department appointment viewing. |
| `emr.view`, `emr.create` at department | `/emr` | Read and create EMR records. |
| `nursing.*` at department | `/nursing` | Nursing tasks, notes, creation, and updates. |
| `queue.view`, `queue.edit` at branch | `/queue`, `/kiosk`, `/queue-display` | Queue viewing, check-in, calling, and status changes. |
| `laboratory.view` at department | `/laboratory` | Laboratory reads. |
| `pharmacy.view` at department | `/pharmacy` | Pharmacy reads only. |

### Difference between the five names

There is **no effective grant difference**. Nurse Assistant has `assigned_patients` metadata and Triage Officer has `branch` metadata, but the inherited nurse grants remain department-scoped for clinical operations and branch-scoped for queue operations. Neither receives a distinct assistant, records, triage, or manager package.

## 5. `pharmacist` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Pharmacist | `pharmacist` | branch |
| Pharmacy Technician | `pharmacy_technician` | branch |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `pharmacy.view` | `/pharmacy` Inventory and Prescriptions tabs | Read inventory and prescriptions. |
| `pharmacy.create` | Add Drug and New Prescription controls | Add inventory items and create prescriptions. |
| `pharmacy.edit` | Stock update operation | Update pharmacy inventory stock. |
| `pharmacy.approve` | Dispense control | Dispense prescriptions. |
| `pharmacy.*` | All pharmacy catalog actions | Both roles satisfy all pharmacy actions because the module wildcard covers create, edit, approve, reject, print, export, and manage. |
| `patients.view` | `/patients` | Branch patient lookup. |
| `emr.view` | `/emr` | Branch EMR context reads. |

### Difference between the two names

There is **no effective grant difference**. Pharmacist and Pharmacy Technician can open the same Pharmacy, Patients, and EMR pages and perform the same pharmacy functions. If the business requires technicians to dispense but not prescribe, or to manage stock but not approve clinical dispensing, a new dedicated base template is required.

## 6. `lab_tech` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Laboratory Manager | `laboratory_manager` | department |
| Laboratory Technician | `laboratory_technician` | department |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `laboratory.*` | `/laboratory` | Lab catalog, order creation, order results, status updates, approve/reject actions, printing, export, and manage actions covered by the permission catalog. |
| `patients.view` | `/patients` | Department patient lookup. |
| `emr.view` | `/emr` | Department EMR context reads. |

### Difference between the two names

There is **no effective grant difference**. Laboratory Manager and Laboratory Technician can access the same page and laboratory operations. A manager-specific role would require a separate package with laboratory management, staffing, configuration, or approval rights distinct from technician workflow rights.

## 7. `radiologist` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Radiology Manager | `radiology_manager` | department |
| Radiologist | `radiologist` | department |
| Radiology Technician | `radiology_technician` | department |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `radiology.*` | `/radiology` | Radiology order reads/creation/updates, approval/rejection, reporting, printing, export, and management actions supported by backend guards. |
| `patients.view` | `/patients` | Department patient lookup. |
| `emr.view` | `/emr` | Department EMR context reads. |

### Difference between the three names

There is **no effective grant difference**. Radiology Manager, Radiologist, and Radiology Technician are interchangeable from the authorization engine’s perspective.

## 8. `billing_staff` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Medical Coder | `medical_coder` | department |
| Billing Manager | `billing_manager` | branch |
| Billing Officer | `billing_officer` | branch |
| Insurance Claims Officer | `insurance_claims_officer` | branch |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `billing.*` at branch | `/billing` | Invoice reads, creation/payment, editing, deletion, approval, rejection, cancellation, export, and printing where the corresponding backend endpoint exists. |
| `insurance.view` at branch | `/insurance` | Insurance companies and basic insurance claim views. |
| `patients.view` at branch | `/patients` | Branch patient lookup. |

### Difference between the four names

There is **no effective grant difference**. The current code does not create separate coder, manager, officer, or claims-officer packages.

Two names expose a specific mismatch:

| Role | Mismatch |
|---|---|
| Medical Coder | Catalog default says department, but billing_staff grants are branch-scoped. |
| Insurance Claims Officer | The role name suggests claims lifecycle access, but it has `insurance.view`, not `insurance_claims.view`; the `/insurance-claims` route is therefore not granted by this package. |

## 9. `receptionist` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Receptionist | `receptionist` | branch |
| Appointment Coordinator | `appointment_coordinator` | branch |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `patients.*` | `/patients` | Patient view/search/detail/create/edit/delete/manage operations. |
| `appointments.*` | `/appointments` | Appointment view/create/edit/cancel/approve/export/manage operations. |
| `billing.view`, `billing.create` | `/billing` | Invoice viewing and invoice/payment creation. |
| `queue.*` | `/queue`, `/kiosk`, `/queue-display` | Queue creation, viewing, check-in, calling, and status changes. |
| `insurance.view` | `/insurance` | Insurance viewing. |
| `communications.view`, `communications.create` | `/communications`, `/notification-templates` | Communication and notification-template viewing/creation functions covered by backend guards. |
| `emr.view` | `/emr` | Branch EMR read access. |

### Difference between the two names

There is **no effective grant difference** between Receptionist and Appointment Coordinator. The application does not currently limit the coordinator to appointment-only operations.

## 10. `accountant` package

### Roles in this group

| Catalog role | Slug | Catalog default scope |
|---|---|---|
| Accountant | `accountant` | tenant |
| Insurance Manager | `insurance_manager` | tenant |
| Reporting and BI Analyst | `reporting_bi_analyst` | tenant |

### Shared grants and functions

| Permission | Page/function | Actual operation |
|---|---|---|
| `billing.view`, `billing.export` | `/billing` | Tenant-wide billing/revenue views and exports. |
| `reports.view`, `reports.export` | `/reports` | Tenant-wide reports and report exports. |
| `financial_reports.view`, `financial_reports.export` | `/financial-reports` | Financial report views and exports. |

### Difference between the three names

There is **no effective grant difference**. The current code does not grant `insurance.*` to Insurance Manager and does not grant `bi.*` or `analytics_dashboard.*` to Reporting and BI Analyst.

| Role name | Actual missing specialization |
|---|---|
| Insurance Manager | No `insurance.view`, `insurance_claims.view`, or insurance-management package. |
| Reporting and BI Analyst | No `bi.view`, `bi.manage`, `reports.manage`, or `analytics_dashboard.view` beyond the accountant package’s report view/export rights. |
| Accountant | The only name that directly matches the current package. |

## 11. Singleton packages

### `super_admin` — Super Administrator

The Super Administrator is the only role in this package. It grants `*` at `system` scope and can access every permission-mapped page and backend operation across the system. This is the only catalog package whose scope is system-wide.

### `patient` — Patient Portal User

The Patient Portal User is the only role in this package. It grants self-scoped viewing for patients, appointments, EMR, laboratory, radiology, pharmacy, and billing; self-scoped document view/download; notifications view; chat view/create; and patient portal view. It opens the self-service versions of `/patients`, `/appointments`, `/emr`, `/laboratory`, `/radiology`, `/pharmacy`, `/billing`, `/dms`, `/chat`, `/notifications`, and `/patient-portal`, subject to backend self-record checks.

## What differs despite identical grants?

For the groups above, the following fields differ without changing current effective access:

| Field | Effect today |
|---|---|
| Display name | Changes the label shown to administrators and users, not the permissions. |
| Catalog slug | Identifies the template, but `hospitalRoleTemplate()` maps it to the same base grants. |
| Catalog level | Metadata for role classification; it does not rewrite grants. |
| Catalog default scope | Metadata used by the template catalog; it does not transform the base grant scopes during cloning. |

The practical result is that a user assigned `branch_manager`, `department_head`, `inventory_manager`, or `compliance_officer` may not receive the specialized rights suggested by the role name. The current application must be treated according to the base grant package shown above until dedicated templates are introduced.

## Recommended specialization packages

If the business wants the role names to represent different operational responsibilities, the following dedicated packages should replace the shared mappings:

| Current shared group | Recommended split |
|---|---|
| Manager group | Separate executive, branch manager, department head, HR, inventory/procurement, and compliance templates with explicit scopes and module grants. |
| Nurse group | Separate nurse manager, registered nurse, assistant, records officer, and triage packages. |
| Pharmacist group | Separate pharmacist and technician packages, deciding who may prescribe, dispense, approve, manage inventory, and update stock. |
| Laboratory group | Separate laboratory manager approval/configuration rights from technician order/result rights. |
| Radiology group | Separate manager, radiologist reporting/approval, and technician acquisition/workflow rights. |
| Billing staff group | Separate coding, billing management, billing operations, and insurance claims lifecycle rights. |
| Accountant group | Separate accountant, insurance management, and BI/reporting rights. |
| Receptionist group | Separate front-desk general operations from appointment coordination. |

## References

[1]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/shared/src/authz/index.ts "Shared role catalog and grants"
[2]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/router/index.tsx "Frontend route permission map"
[3]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/frontend/src/App.tsx "Frontend route tree"
[4]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/modules/rbac/index.ts "Runtime RBAC API"
[5]: https://github.com/elnewahy2025/Health-ERP/blob/main/packages/backend/src/modules/pharmacy/index.ts "Action-specific pharmacy authorization"
