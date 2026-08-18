# Intended Use and Scope Freeze

**Document status:** Draft for formal approval
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
| Pilot hospital/legal entity | **TBD — user/hospital input required** | Hospital sponsor |
| Country and regulatory jurisdiction | **TBD — user/hospital input required** | Compliance/privacy owner |
| Pilot department | **TBD — user/hospital input required** | Hospital sponsor and clinical lead |
| Authoritative existing system during pilot | **TBD — user/hospital input required** | Hospital IT and sponsor |
| Patient-data classification and permitted dataset | **TBD — user/hospital input required** | Privacy/compliance owner |
| Required external interfaces | **TBD — hospital interface inventory required** | Interoperability owner |
| Clinical safety lead | **Unassigned** | Product owner / hospital sponsor |
| Security owner | **Unassigned** | Product owner |
| Privacy/compliance owner | **Unassigned** | Product owner / hospital sponsor |
| Finance owner | **Unassigned** | Product owner / hospital sponsor |
| Operations/SRE owner | **Unassigned** | Product owner |

## In-scope product direction

The product direction is to provide one coherent platform for hospital operations, with role-specific functions and server-enforced tenant, branch, department, patient, and resource boundaries. The first shippable release must be narrower than the entire repository and must identify the exact workflows that have passed clinical, financial, security, and operational acceptance.

## Explicit non-goals until separately approved

Health-ERP is not approved to provide autonomous diagnosis, autonomous treatment decisions, unsupervised clinical decision support, emergency-care replacement procedures, legally binding financial reporting, or certified interoperability merely because a corresponding page or permission exists. Any AI, analytics, alerting, or recommendation feature requires its own intended-use statement, risk review, validation, and user-facing limitations.

The product is not approved to become the hospital’s sole system of record until migration reconciliation, downtime procedures, restore testing, user acceptance, and go-live approval are complete.

## Scope-freeze rules

New modules, new clinical claims, new external integrations, and new patient-data sources are prohibited during the baseline gate unless they are recorded in the release decision log and reviewed for impact on clinical safety, security, privacy, data model, interoperability, testing, and support.

Changes to permissions, scopes, audit behavior, patient identity, medication, diagnostics, billing, or financial posting are safety-significant changes. They require a linked requirement, threat or hazard assessment where applicable, implementation change, regression tests, and reviewer approval.

## Approval

This document remains **DRAFT / NOT APPROVED** until the missing hospital, jurisdiction, pilot, ownership, and authoritative-system facts are supplied and signed by the required owners. No production or pilot claim may be made before approval.
