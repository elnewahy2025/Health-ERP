# Explicit 39-Role Operational Authorization Matrix

**Generated from:** `packages/shared/src/authz/index.ts`

**Status:** Every catalog role is backed by an explicit grant map. There are **39 roles**, **39 unique grant signatures**, and **0 duplicate-grant groups**.

The frontend route guard is UX-only; every backend operation remains authoritative. A role can open a page when it has a matching `*.view`/module wildcard grant, and individual buttons/actions require their corresponding granular grant.

## 1. Super Administrator (`super_administrator`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| system | system | super_admin (metadata only) | unique |

### Pages and links

- All permission-mapped pages in the active tenant/system scope

### Backend functions and rights

- `*` — all actions; scope: system


## 2. Tenant Administrator (`tenant_administrator`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| system | tenant | admin (metadata only) | unique |

### Pages and links

- All permission-mapped pages in the active tenant/system scope

### Backend functions and rights

- `*` — all actions; scope: tenant


## 3. Hospital Executive (`hospital_executive`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | manager (metadata only) | unique |

### Pages and links

- /analytics-dashboard (analytics_dashboard)\n- /appointments (appointments)\n- /billing (billing)\n- /compliance (compliance)\n- /emr (emr)\n- /financial-reports (financial_reports)\n- /hr (hr)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `analytics_dashboard.view` — view/read; scope: tenant\n- `appointments.view` — view/read; scope: tenant\n- `billing.view` — view/read; scope: tenant\n- `compliance.view` — view/read; scope: tenant\n- `emr.view` — view/read; scope: tenant\n- `financial_reports.view` — view/read; scope: tenant\n- `hr.view` — view/read; scope: tenant\n- `patients.view` — view/read; scope: tenant\n- `reports.*` — all actions; scope: tenant


## 4. Hospital Operations Manager (`hospital_operations_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | manager (metadata only) | unique |

### Pages and links

- /analytics-dashboard (analytics_dashboard)\n- /appointments (appointments)\n- /branches (branches)\n- /emr (emr)\n- /inventory (inventory)\n- /patients (patients)\n- /reports (reports)\n- /workflow (workflow)

### Backend functions and rights

- `analytics_dashboard.*` — all actions; scope: tenant\n- `appointments.edit` — edit/update; scope: tenant\n- `appointments.view` — view/read; scope: tenant\n- `branches.view` — view/read; scope: tenant\n- `emr.view` — view/read; scope: tenant\n- `inventory.view` — view/read; scope: tenant\n- `patients.view` — view/read; scope: tenant\n- `reports.*` — all actions; scope: tenant\n- `workflow.*` — all actions; scope: tenant


## 5. Branch Manager (`branch_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | manager (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /branches (branches)\n- /hr (hr)\n- /inventory (inventory)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /queue (queue)\n- /reports (reports)

### Backend functions and rights

- `appointments.*` — all actions; scope: branch\n- `billing.view` — view/read; scope: branch\n- `branches.manage` — manage/configure; scope: branch\n- `branches.view` — view/read; scope: branch\n- `hr.view` — view/read; scope: branch\n- `inventory.*` — all actions; scope: branch\n- `patients.edit` — edit/update; scope: branch\n- `patients.view` — view/read; scope: branch\n- `pharmacy.view` — view/read; scope: branch\n- `queue.*` — all actions; scope: branch\n- `reports.export` — export; scope: branch\n- `reports.view` — view/read; scope: branch


## 6. Department Head (`department_head`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | manager (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /emr (emr)\n- /hr (hr)\n- /laboratory (laboratory)\n- /nursing (nursing)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /radiology (radiology)\n- /reports (reports)\n- /workflow (workflow)

### Backend functions and rights

- `appointments.view` — view/read; scope: department\n- `emr.edit` — edit/update; scope: department\n- `emr.view` — view/read; scope: department\n- `hr.edit` — edit/update; scope: department\n- `hr.view` — view/read; scope: department\n- `laboratory.view` — view/read; scope: department\n- `nursing.*` — all actions; scope: department\n- `patients.edit` — edit/update; scope: department\n- `patients.view` — view/read; scope: department\n- `pharmacy.view` — view/read; scope: department\n- `radiology.view` — view/read; scope: department\n- `reports.view` — view/read; scope: department\n- `workflow.edit` — edit/update; scope: department\n- `workflow.view` — view/read; scope: department


## 7. Medical Director (`medical_director`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | manager (metadata only) | unique |

### Pages and links

- /analytics-dashboard (analytics_dashboard)\n- /appointments (appointments)\n- /clinical-ai (clinical_ai)\n- /compliance (compliance)\n- /emr (emr)\n- /laboratory (laboratory)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /radiology (radiology)\n- /referrals (referrals)\n- /reports (reports)

### Backend functions and rights

- `analytics_dashboard.*` — all actions; scope: tenant\n- `appointments.view` — view/read; scope: tenant\n- `clinical_ai.*` — all actions; scope: tenant\n- `compliance.view` — view/read; scope: tenant\n- `emr.approve` — approve/finalize; scope: tenant\n- `emr.edit` — edit/update; scope: tenant\n- `emr.view` — view/read; scope: tenant\n- `laboratory.view` — view/read; scope: tenant\n- `patients.view` — view/read; scope: tenant\n- `pharmacy.view` — view/read; scope: tenant\n- `radiology.view` — view/read; scope: tenant\n- `referrals.*` — all actions; scope: tenant\n- `reports.*` — all actions; scope: tenant


## 8. Physician (`physician`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | assigned_patients | doctor (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /chat (chat)\n- /dms (documents)\n- /emr (emr)\n- /insurance (insurance)\n- /laboratory (laboratory)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /radiology (radiology)

### Backend functions and rights

- `appointments.edit` — edit/update; scope: assigned_patients\n- `appointments.view` — view/read; scope: assigned_patients\n- `billing.view` — view/read; scope: assigned_patients\n- `chat.*` — all actions; scope: assigned_patients\n- `documents.download` — download; scope: assigned_patients\n- `documents.view` — view/read; scope: assigned_patients\n- `emr.*` — all actions; scope: assigned_patients\n- `insurance.view` — view/read; scope: assigned_patients\n- `laboratory.print` — print; scope: assigned_patients\n- `laboratory.view` — view/read; scope: assigned_patients\n- `patients.edit` — edit/update; scope: assigned_patients\n- `patients.view` — view/read; scope: assigned_patients\n- `pharmacy.view` — view/read; scope: assigned_patients\n- `radiology.view` — view/read; scope: assigned_patients


## 9. Consultant Physician (`consultant_physician`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | assigned_patients | doctor (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /chat (chat)\n- /clinical-ai (clinical_ai)\n- /dms (documents)\n- /emr (emr)\n- /insurance (insurance)\n- /laboratory (laboratory)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /radiology (radiology)\n- /referrals (referrals)\n- /telemedicine (telemedicine)

### Backend functions and rights

- `appointments.*` — all actions; scope: assigned_patients\n- `billing.view` — view/read; scope: assigned_patients\n- `chat.*` — all actions; scope: assigned_patients\n- `clinical_ai.*` — all actions; scope: assigned_patients\n- `documents.*` — all actions; scope: assigned_patients\n- `emr.*` — all actions; scope: assigned_patients\n- `insurance.view` — view/read; scope: assigned_patients\n- `laboratory.*` — all actions; scope: assigned_patients\n- `patients.edit` — edit/update; scope: assigned_patients\n- `patients.view` — view/read; scope: assigned_patients\n- `pharmacy.view` — view/read; scope: assigned_patients\n- `radiology.view` — view/read; scope: assigned_patients\n- `referrals.*` — all actions; scope: assigned_patients\n- `telemedicine.*` — all actions; scope: assigned_patients


## 10. Resident Physician (`resident_physician`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | assigned_patients | doctor (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /chat (chat)\n- /dms (documents)\n- /emr (emr)\n- /laboratory (laboratory)\n- /nursing (nursing)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /radiology (radiology)

### Backend functions and rights

- `appointments.edit` — edit/update; scope: assigned_patients\n- `appointments.view` — view/read; scope: assigned_patients\n- `billing.view` — view/read; scope: assigned_patients\n- `chat.view` — view/read; scope: assigned_patients\n- `documents.view` — view/read; scope: assigned_patients\n- `emr.create` — create; scope: assigned_patients\n- `emr.edit` — edit/update; scope: assigned_patients\n- `emr.view` — view/read; scope: assigned_patients\n- `laboratory.view` — view/read; scope: assigned_patients\n- `nursing.view` — view/read; scope: assigned_patients\n- `patients.view` — view/read; scope: assigned_patients\n- `pharmacy.view` — view/read; scope: assigned_patients\n- `radiology.view` — view/read; scope: assigned_patients


## 11. Nurse Manager (`nurse_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | nurse (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /emr (emr)\n- /hr (hr)\n- /laboratory (laboratory)\n- /nursing (nursing)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /queue (queue)\n- /reports (reports)

### Backend functions and rights

- `appointments.view` — view/read; scope: department\n- `emr.create` — create; scope: department\n- `emr.edit` — edit/update; scope: department\n- `emr.view` — view/read; scope: department\n- `hr.edit` — edit/update; scope: department\n- `hr.view` — view/read; scope: department\n- `laboratory.view` — view/read; scope: department\n- `nursing.*` — all actions; scope: department\n- `patients.edit` — edit/update; scope: department\n- `patients.view` — view/read; scope: department\n- `pharmacy.view` — view/read; scope: department\n- `queue.*` — all actions; scope: branch\n- `reports.view` — view/read; scope: department


## 12. Registered Nurse (`registered_nurse`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | nurse (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /emr (emr)\n- /laboratory (laboratory)\n- /nursing (nursing)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /queue (queue)

### Backend functions and rights

- `appointments.view` — view/read; scope: department\n- `emr.create` — create; scope: department\n- `emr.view` — view/read; scope: department\n- `laboratory.view` — view/read; scope: department\n- `nursing.create` — create; scope: department\n- `nursing.edit` — edit/update; scope: department\n- `nursing.view` — view/read; scope: department\n- `patients.edit` — edit/update; scope: department\n- `patients.view` — view/read; scope: department\n- `pharmacy.view` — view/read; scope: department\n- `queue.*` — all actions; scope: branch


## 13. Nurse Assistant (`nurse_assistant`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | assigned_patients | nurse (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /emr (emr)\n- /laboratory (laboratory)\n- /nursing (nursing)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /queue (queue)

### Backend functions and rights

- `appointments.view` — view/read; scope: assigned_patients\n- `emr.view` — view/read; scope: assigned_patients\n- `laboratory.view` — view/read; scope: assigned_patients\n- `nursing.create` — create; scope: assigned_patients\n- `nursing.view` — view/read; scope: assigned_patients\n- `patients.view` — view/read; scope: assigned_patients\n- `pharmacy.view` — view/read; scope: assigned_patients\n- `queue.view` — view/read; scope: branch


## 14. Pharmacist (`pharmacist`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | pharmacist (metadata only) | unique |

### Pages and links

- /dms (documents)\n- /emr (emr)\n- /inventory (inventory)\n- /patients (patients)\n- /pharmacy (pharmacy)

### Backend functions and rights

- `documents.view` — view/read; scope: branch\n- `emr.view` — view/read; scope: branch\n- `inventory.edit` — edit/update; scope: branch\n- `inventory.view` — view/read; scope: branch\n- `patients.view` — view/read; scope: branch\n- `pharmacy.*` — all actions; scope: branch


## 15. Pharmacy Technician (`pharmacy_technician`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | pharmacist (metadata only) | unique |

### Pages and links

- /barcodes (barcodes)\n- /emr (emr)\n- /inventory (inventory)\n- /patients (patients)\n- /pharmacy (pharmacy)

### Backend functions and rights

- `barcodes.create` — create; scope: branch\n- `barcodes.view` — view/read; scope: branch\n- `emr.view` — view/read; scope: branch\n- `inventory.edit` — edit/update; scope: branch\n- `inventory.view` — view/read; scope: branch\n- `patients.view` — view/read; scope: branch\n- `pharmacy.create` — create; scope: branch\n- `pharmacy.edit` — edit/update; scope: branch\n- `pharmacy.print` — print; scope: branch\n- `pharmacy.view` — view/read; scope: branch


## 16. Laboratory Manager (`laboratory_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | lab_tech (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /departments (departments)\n- /emr (emr)\n- /laboratory (laboratory)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `audit.view` — view/read; scope: department\n- `departments.create` — create; scope: department
- `departments.delete` — delete; scope: department
- `departments.edit` — edit/update; scope: department
- `departments.manage` — manage/configure; scope: department\n- `departments.view` — view/read; scope: department\n- `emr.view` — view/read; scope: department\n- `laboratory.*` — all actions; scope: department\n- `patients.view` — view/read; scope: department\n- `reports.export` — export; scope: department\n- `reports.view` — view/read; scope: department


## 17. Laboratory Technician (`laboratory_technician`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | lab_tech (metadata only) | unique |

### Pages and links

- /emr (emr)\n- /laboratory (laboratory)\n- /patients (patients)

### Backend functions and rights

- `emr.view` — view/read; scope: department\n- `laboratory.create` — create; scope: department\n- `laboratory.edit` — edit/update; scope: department\n- `laboratory.print` — print; scope: department\n- `laboratory.view` — view/read; scope: department\n- `patients.view` — view/read; scope: department


## 18. Radiology Manager (`radiology_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | radiologist (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /departments (departments)\n- /emr (emr)\n- /patients (patients)\n- /radiology (radiology)\n- /reports (reports)

### Backend functions and rights

- `audit.view` — view/read; scope: department\n- `departments.create` — create; scope: department
- `departments.delete` — delete; scope: department
- `departments.edit` — edit/update; scope: department
- `departments.manage` — manage/configure; scope: department\n- `departments.view` — view/read; scope: department\n- `emr.view` — view/read; scope: department\n- `patients.view` — view/read; scope: department\n- `radiology.*` — all actions; scope: department\n- `reports.export` — export; scope: department\n- `reports.view` — view/read; scope: department


## 19. Radiologist (`radiologist`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | radiologist (metadata only) | unique |

### Pages and links

- /emr (emr)\n- /patients (patients)\n- /radiology (radiology)\n- /reports (reports)

### Backend functions and rights

- `emr.view` — view/read; scope: department\n- `patients.view` — view/read; scope: department\n- `radiology.approve` — approve/finalize; scope: department\n- `radiology.create` — create; scope: department\n- `radiology.edit` — edit/update; scope: department\n- `radiology.export` — export; scope: department\n- `radiology.print` — print; scope: department\n- `radiology.reject` — reject; scope: department\n- `radiology.view` — view/read; scope: department\n- `reports.view` — view/read; scope: department


## 20. Radiology Technician (`radiology_technician`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | radiologist (metadata only) | unique |

### Pages and links

- /dms (documents)\n- /emr (emr)\n- /patients (patients)\n- /radiology (radiology)

### Backend functions and rights

- `documents.create` — create; scope: department\n- `emr.view` — view/read; scope: department\n- `patients.view` — view/read; scope: department\n- `radiology.create` — create; scope: department\n- `radiology.edit` — edit/update; scope: department\n- `radiology.print` — print; scope: department\n- `radiology.view` — view/read; scope: department


## 21. Medical Records Officer (`medical_records_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | nurse (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /dms (documents)\n- /emr (emr)\n- /forms (forms)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `audit.view` — view/read; scope: department\n- `documents.*` — all actions; scope: department\n- `emr.edit` — edit/update; scope: department\n- `emr.view` — view/read; scope: department\n- `forms.*` — all actions; scope: department\n- `patients.edit` — edit/update; scope: department\n- `patients.view` — view/read; scope: department\n- `reports.view` — view/read; scope: department


## 22. Medical Coder (`medical_coder`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | billing_staff (metadata only) | unique |

### Pages and links

- /billing (billing)\n- /dms (documents)\n- /emr (emr)\n- /insurance (insurance)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `billing.edit` — edit/update; scope: branch\n- `billing.view` — view/read; scope: branch\n- `documents.download` — download; scope: branch\n- `documents.view` — view/read; scope: branch\n- `emr.view` — view/read; scope: branch\n- `insurance.view` — view/read; scope: branch\n- `patients.view` — view/read; scope: branch\n- `reports.view` — view/read; scope: branch


## 23. Receptionist (`receptionist`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | receptionist (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /communications (communications)\n- /emr (emr)\n- /insurance (insurance)\n- /patients (patients)\n- /queue (queue)

### Backend functions and rights

- `appointments.*` — all actions; scope: branch\n- `billing.create` — create; scope: branch\n- `billing.view` — view/read; scope: branch\n- `communications.create` — create; scope: branch\n- `communications.view` — view/read; scope: branch\n- `emr.view` — view/read; scope: branch\n- `insurance.view` — view/read; scope: branch\n- `patients.*` — all actions; scope: branch\n- `queue.*` — all actions; scope: branch


## 24. Appointment Coordinator (`appointment_coordinator`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | receptionist (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /communications (communications)\n- /insurance (insurance)\n- /notifications (notifications)\n- /patients (patients)\n- /queue (queue)

### Backend functions and rights

- `appointments.*` — all actions; scope: branch\n- `billing.view` — view/read; scope: branch\n- `communications.view` — view/read; scope: branch\n- `insurance.view` — view/read; scope: branch\n- `notifications.create` — create; scope: branch\n- `patients.create` — create; scope: branch\n- `patients.edit` — edit/update; scope: branch\n- `patients.view` — view/read; scope: branch\n- `queue.edit` — edit/update; scope: branch\n- `queue.view` — view/read; scope: branch


## 25. Triage Officer (`triage_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | nurse (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /emr (emr)\n- /laboratory (laboratory)\n- /nursing (nursing)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /queue (queue)\n- /referrals (referrals)

### Backend functions and rights

- `appointments.view` — view/read; scope: branch\n- `emr.view` — view/read; scope: branch\n- `laboratory.view` — view/read; scope: branch\n- `nursing.create` — create; scope: branch\n- `nursing.view` — view/read; scope: branch\n- `patients.edit` — edit/update; scope: branch\n- `patients.view` — view/read; scope: branch\n- `pharmacy.view` — view/read; scope: branch\n- `queue.*` — all actions; scope: branch\n- `referrals.create` — create; scope: branch\n- `referrals.view` — view/read; scope: branch


## 26. Billing Manager (`billing_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | billing_staff (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /billing (billing)\n- module:eta_invoicing (eta_invoicing)\n- /expenses (expenses)\n- /insurance (insurance)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `audit.view` — view/read; scope: branch\n- `billing.*` — all actions; scope: branch\n- `eta_invoicing.*` — all actions; scope: branch\n- `expenses.*` — all actions; scope: branch\n- `insurance.view` — view/read; scope: branch\n- `patients.view` — view/read; scope: branch\n- `reports.export` — export; scope: branch\n- `reports.view` — view/read; scope: branch


## 27. Billing Officer (`billing_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | billing_staff (metadata only) | unique |

### Pages and links

- /billing (billing)\n- module:eta_invoicing (eta_invoicing)\n- /expenses (expenses)\n- /insurance (insurance)\n- /patients (patients)

### Backend functions and rights

- `billing.approve` — approve/finalize; scope: branch\n- `billing.create` — create; scope: branch\n- `billing.edit` — edit/update; scope: branch\n- `billing.view` — view/read; scope: branch\n- `eta_invoicing.view` — view/read; scope: branch\n- `expenses.view` — view/read; scope: branch\n- `insurance.view` — view/read; scope: branch\n- `patients.view` — view/read; scope: branch


## 28. Accountant (`accountant`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | accountant (metadata only) | unique |

### Pages and links

- /billing (billing)\n- /data-export (data_export)\n- module:eta_invoicing (eta_invoicing)\n- /expenses (expenses)\n- /financial-reports (financial_reports)\n- /reports (reports)

### Backend functions and rights

- `billing.export` — export; scope: tenant\n- `billing.view` — view/read; scope: tenant\n- `data_export.export` — export; scope: tenant\n- `data_export.view` — view/read; scope: tenant\n- `eta_invoicing.*` — all actions; scope: tenant\n- `expenses.*` — all actions; scope: tenant\n- `financial_reports.*` — all actions; scope: tenant\n- `reports.export` — export; scope: tenant\n- `reports.view` — view/read; scope: tenant


## 29. Insurance Manager (`insurance_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | accountant (metadata only) | unique |

### Pages and links

- /billing (billing)\n- /compliance (compliance)\n- /dms (documents)\n- /insurance (insurance)\n- /insurance-claims (insurance_claims)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `billing.view` — view/read; scope: tenant\n- `compliance.view` — view/read; scope: tenant\n- `documents.view` — view/read; scope: tenant\n- `insurance_claims.*` — all actions; scope: tenant\n- `insurance.*` — all actions; scope: tenant\n- `patients.view` — view/read; scope: tenant\n- `reports.export` — export; scope: tenant\n- `reports.view` — view/read; scope: tenant


## 30. Insurance Claims Officer (`insurance_claims_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | billing_staff (metadata only) | unique |

### Pages and links

- /billing (billing)\n- /dms (documents)\n- /insurance (insurance)\n- /insurance-claims (insurance_claims)\n- /patients (patients)\n- /reports (reports)

### Backend functions and rights

- `billing.view` — view/read; scope: branch\n- `documents.view` — view/read; scope: branch\n- `insurance_claims.approve` — approve/finalize; scope: branch\n- `insurance_claims.create` — create; scope: branch\n- `insurance_claims.edit` — edit/update; scope: branch\n- `insurance_claims.reject` — reject; scope: branch\n- `insurance_claims.view` — view/read; scope: branch\n- `insurance.view` — view/read; scope: branch\n- `patients.view` — view/read; scope: branch\n- `reports.view` — view/read; scope: branch


## 31. HR Manager (`hr_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | manager (metadata only) | unique |

### Pages and links

- /analytics-dashboard (analytics_dashboard)\n- /audit-logs (audit)\n- /compliance (compliance)\n- /dms (documents)\n- /hr (hr)\n- /reports (reports)\n- /admin/users (users)

### Backend functions and rights

- `analytics_dashboard.view` — view/read; scope: tenant\n- `audit.view` — view/read; scope: tenant\n- `compliance.view` — view/read; scope: tenant\n- `documents.view` — view/read; scope: tenant\n- `hr.*` — all actions; scope: tenant\n- `reports.export` — export; scope: tenant\n- `reports.view` — view/read; scope: tenant\n- `users.view` — view/read; scope: tenant


## 32. HR Officer (`hr_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | department | manager (metadata only) | unique |

### Pages and links

- /dms (documents)\n- /hr (hr)\n- /reports (reports)\n- /admin/users (users)

### Backend functions and rights

- `documents.create` — create; scope: department\n- `documents.edit` — edit/update; scope: department\n- `documents.view` — view/read; scope: department\n- `hr.create` — create; scope: department\n- `hr.edit` — edit/update; scope: department\n- `hr.export` — export; scope: department\n- `hr.view` — view/read; scope: department\n- `reports.view` — view/read; scope: department\n- `users.view` — view/read; scope: department


## 33. Inventory Manager (`inventory_manager`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | manager (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /barcodes (barcodes)\n- /branches (branches)\n- /expenses (expenses)\n- /inventory (inventory)\n- /reports (reports)

### Backend functions and rights

- `audit.view` — view/read; scope: branch\n- `barcodes.*` — all actions; scope: branch\n- `branches.view` — view/read; scope: branch\n- `expenses.create` — create; scope: branch\n- `expenses.view` — view/read; scope: branch\n- `inventory.*` — all actions; scope: branch\n- `reports.export` — export; scope: branch\n- `reports.view` — view/read; scope: branch


## 34. Procurement Officer (`procurement_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | branch | manager (metadata only) | unique |

### Pages and links

- /barcodes (barcodes)\n- /expenses (expenses)\n- /integrations (integrations)\n- /inventory (inventory)\n- /reports (reports)

### Backend functions and rights

- `barcodes.view` — view/read; scope: branch\n- `expenses.create` — create; scope: branch\n- `expenses.edit` — edit/update; scope: branch\n- `expenses.view` — view/read; scope: branch\n- `integrations.view` — view/read; scope: branch\n- `inventory.create` — create; scope: branch\n- `inventory.edit` — edit/update; scope: branch\n- `inventory.view` — view/read; scope: branch\n- `reports.view` — view/read; scope: branch


## 35. Compliance Officer (`compliance_officer`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | manager (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /compliance (compliance)\n- /compliance-reports (compliance_reports)\n- /data-export (data_export)\n- /dms (documents)\n- /reports (reports)

### Backend functions and rights

- `audit.export` — export; scope: tenant\n- `audit.view` — view/read; scope: tenant\n- `compliance_reports.*` — all actions; scope: tenant\n- `compliance.*` — all actions; scope: tenant\n- `data_export.view` — view/read; scope: tenant\n- `documents.manage` — manage/configure; scope: tenant\n- `documents.view` — view/read; scope: tenant\n- `reports.view` — view/read; scope: tenant


## 36. Reporting and BI Analyst (`reporting_bi_analyst`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | accountant (metadata only) | unique |

### Pages and links

- /advanced-reporting (advanced_reporting)\n- /analytics-dashboard (analytics_dashboard)\n- /bi (bi)\n- /data-export (data_export)\n- /data-warehouse (data_warehouse)\n- /financial-reports (financial_reports)\n- /reports (reports)

### Backend functions and rights

- `advanced_reporting.*` — all actions; scope: tenant\n- `analytics_dashboard.*` — all actions; scope: tenant\n- `bi.*` — all actions; scope: tenant\n- `data_export.export` — export; scope: tenant\n- `data_warehouse.*` — all actions; scope: tenant\n- `financial_reports.export` — export; scope: tenant\n- `financial_reports.view` — view/read; scope: tenant\n- `reports.*` — all actions; scope: tenant


## 37. IT/System Administrator (`it_system_administrator`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | admin (metadata only) | unique |

### Pages and links

- /api-keys (api_keys)\n- /audit-logs (audit)\n- /data-warehouse (data_warehouse)\n- /developer-portal (developer_portal)\n- /dr-backup (dr_backup)\n- /integrations (integrations)\n- /admin/roles (roles)\n- /sessions (sessions)\n- /settings (settings)\n- /system-monitor (system_monitor)\n- /admin/users (users)

### Backend functions and rights

- `api_keys.*` — all actions; scope: tenant\n- `audit.*` — all actions; scope: tenant\n- `data_warehouse.view` — view/read; scope: tenant\n- `developer_portal.*` — all actions; scope: tenant\n- `dr_backup.*` — all actions; scope: tenant\n- `integrations.*` — all actions; scope: tenant\n- `roles.*` — all actions; scope: tenant\n- `sessions.*` — all actions; scope: tenant\n- `settings.*` — all actions; scope: tenant\n- `system_monitor.*` — all actions; scope: tenant\n- `users.*` — all actions; scope: tenant


## 38. Patient Portal Administrator (`patient_portal_administrator`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | tenant | admin (metadata only) | unique |

### Pages and links

- /audit-logs (audit)\n- /communications (communications)\n- /crm (crm)\n- /notifications (notifications)\n- /online-booking (online_booking)\n- module:patient_messages (patient_messages)\n- /patient-portal (patient_portal)\n- /patient-self-service (patient_self_service)\n- /admin/users (users)

### Backend functions and rights

- `audit.view` — view/read; scope: tenant\n- `communications.*` — all actions; scope: tenant\n- `crm.*` — all actions; scope: tenant\n- `notifications.*` — all actions; scope: tenant\n- `online_booking.*` — all actions; scope: tenant\n- `patient_messages.*` — all actions; scope: tenant\n- `patient_portal.*` — all actions; scope: tenant\n- `patient_self_service.*` — all actions; scope: tenant\n- `users.view` — view/read; scope: tenant


## 39. Patient Portal User (`patient_portal_user`)

| Catalog level | Default scope | Legacy template label | Grant signature |
|---|---|---|---|
| tenant | self | patient (metadata only) | unique |

### Pages and links

- /appointments (appointments)\n- /billing (billing)\n- /chat (chat)\n- /dms (documents)\n- /emr (emr)\n- /laboratory (laboratory)\n- /notifications (notifications)\n- /patient-self-service (patient_self_service)\n- /patients (patients)\n- /pharmacy (pharmacy)\n- /radiology (radiology)

### Backend functions and rights

- `appointments.view` — view/read; scope: self\n- `billing.view` — view/read; scope: self\n- `chat.create` — create; scope: self\n- `chat.view` — view/read; scope: self\n- `documents.download` — download; scope: self\n- `documents.view` — view/read; scope: self\n- `emr.view` — view/read; scope: self\n- `laboratory.view` — view/read; scope: self\n- `notifications.view` — view/read; scope: self\n- `patient_self_service.view` — view/read; scope: self\n- `patients.view` — view/read; scope: self\n- `pharmacy.view` — view/read; scope: self\n- `radiology.view` — view/read; scope: self

## Scope enforcement notes

Operational scopes are selected from the grant for the requested permission, not from a frontend-supplied tenant, branch, department, patient, user, role, or membership identifier. The current scope registry enforces tenant, branch, department, assigned-patient, self, branches, and system constraints where the module has the necessary context columns.

Explicit role grants are now independent of the legacy `SEED_ROLES` packages. The legacy packages remain available only for backward compatibility with existing custom/legacy tenant roles.
