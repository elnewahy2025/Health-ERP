# Intended Use and Scope Freeze

**Document status:** Product model agreed; formal governance approval pending
**Release state:** Development only
**Effective date:** 2026-08-18
**Product:** Health-ERP

## Purpose

Health-ERP is being developed as a multi-tenant hospital enterprise resource planning and hospital information platform. The repository currently contains modules for patient administration, appointments, clinical records, nursing, pharmacy, laboratory, radiology, inventory, billing, insurance, HR, reporting, communications, documents, data export, integrations, and administration.

This document does **not** declare that any of those modules are clinically validated, legally compliant, interoperable with a named hospital, or approved to replace an existing system. Those claims require the gates defined in `docs/architecture/SHIP-READINESS-PLAN.md`.

## Intended users

The intended user groups are hospital staff whose actual duties, training, and access have been approved by a participating hospital. The current role catalog is an implementation baseline, not evidence that every role is correctly named, scoped, or suitable for every jurisdiction.

The following information is required before pilot approval and is intentionally not invented here:

| Required fact | Current value | Approval owner |
|---|---|---|
| Pilot hospital/legal entity | **TBD — pilot-specific input still required** | Hospital sponsor |
| Country and regulatory jurisdiction | **TBD — pilot-specific input still required** | Compliance/privacy owner |
| Pilot department | **TBD — pilot-specific input still required** | Hospital sponsor and clinical lead |
| Authoritative existing system during pilot | **TBD — pilot-specific input still required** | Hospital IT and sponsor |
| Patient-data classification and permitted dataset | **TBD — pilot-specific input still required** | Privacy/compliance owner |
| Required external interfaces | **TBD — hospital interface inventory still required** | Interoperability owner |
| Clinical safety lead | **Unassigned** | Product owner / hospital sponsor |
| Security owner | **Unassigned** | Product owner |
| Privacy/compliance owner | **Unassigned** | Product owner / hospital sponsor |
| Finance owner | **Unassigned** | Product owner / hospital sponsor |
| Operations/SRE owner | **Unassigned** | Product owner |

## Approved product model

The user approved the following product decisions on 2026-08-18:

| Decision | Approved model |
|---|---|
| Tenant meaning | One tenant represents one clinic organisation. A tenant may contain multiple branches and departments. |
| Product type | Configurable multi-tenant Clinic Management System; it is not hardcoded around one specialty. |
| Module authority | System/vendor administration defines which modules are available to a tenant. Tenant administrators activate and configure only modules available to that tenant. |
| Module activation and permissions | Activating a module never grants staff permissions automatically. Existing RBAC, custom roles, and operational scopes remain authoritative. |
| First release profile | Generic clinic core: clinic settings, users, roles, branches, departments, audit, notifications, patients, providers, appointments, scheduling, encounters/basic EMR, documents, basic reports, and billing basics after the applicable acceptance gates. |
| Optional modules | Pharmacy, laboratory, radiology, nursing, inventory, insurance, patient portal, online booking, advanced accounting, integrations, AI, BI, and automation are enabled only when the tenant needs them and the relevant implementation and acceptance gates pass. |
| Configuration hierarchy | Tenant defaults with optional branch and department overrides, using deterministic precedence and audited changes. |

## In-scope product direction

The product direction is to provide one coherent, configurable clinic platform with generic core workflows and optional specialty modules. Role-specific functions and server-enforced tenant, branch, department, patient, and resource boundaries remain mandatory. The first shippable release must be narrower than the entire repository and must identify the exact workflows that have passed clinical, financial, security, and operational acceptance.

## Explicit non-goals until separately approved

Health-ERP is not approved to provide autonomous diagnosis, autonomous treatment decisions, unsupervised clinical decision support, emergency-care replacement procedures, legally binding financial reporting, or certified interoperability merely because a corresponding page or permission exists. Any AI, analytics, alerting, or recommendation feature requires its own intended-use statement, risk review, validation, and user-facing limitations.

The product is not approved to become the hospital’s sole system of record until migration reconciliation, downtime procedures, restore testing, user acceptance, and go-live approval are complete.

## Scope-freeze rules

New modules, new clinical claims, new external integrations, and new patient-data sources are prohibited during the baseline gate unless they are recorded in the release decision log and reviewed for impact on clinical safety, security, privacy, data model, interoperability, testing, and support.

Changes to permissions, scopes, audit behavior, patient identity, medication, diagnostics, billing, or financial posting are safety-significant changes. They require a linked requirement, threat or hazard assessment where applicable, implementation change, regression tests, and reviewer approval.

## Approval

The configurable product model is **AGREED**, but this document remains **NOT APPROVED for pilot or production** until the pilot hospital, jurisdiction, pilot department, owners, authoritative system, permitted data, and required interfaces are supplied and signed by the required owners. No production or pilot claim may be made before those facts are approved.
