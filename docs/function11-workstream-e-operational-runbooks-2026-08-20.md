# Function 11 Workstream E: Operational Runbooks and Release Documentation

**Date:** 20 August 2026  
**Implementation commit:** `19bbd0a`  
**Documentation status:** Documentation commit pending

## Scope delivered

Workstream E synchronizes the operator-facing documentation with Function 11 Workstreams A–D. The deployment guide now describes the supported Railway, Vercel, self-hosted Compose, and disposable local paths; the actual migration chain ending at `071_branch_contract_compatibility.ts`; guarded CI/release promotion; readiness/version/correlation smoke checks; production runtime/migration database role separation; Docker image and security gates; backup evidence; and forward-only rollback boundaries.

`docs/engineering/OPERATIONS-RUNBOOKS.md` provides the required detailed procedures for release preflight, deployment, failed readiness, failed migration, provider outage, worker recovery, backup/restore drill, tenant-isolation incident, application rollback, and evidence/communications. Each procedure names the required operator authority, safe stopping point, evidence to retain, and whether the action changes production data or external provider state. The runbooks explicitly avoid hardcoded clinic identity, currency, tax, payment, messaging, voice, AI, or jurisdictional defaults.

The release plan, environment guide, configuration reference, incident-response plan, and release-decision log are synchronized with the shipped A–D controls. They retain the authoritative **Development only** state and state that documentation completion is not clinical, privacy, security, financial, recovery, or production approval. The incident-response plan no longer hardcodes regulatory notification deadlines; the applicable clinic jurisdiction and compliance plan determine those obligations.

The legacy `deployment/scripts/docker-deploy.sh` helper was hardened. It now requires an explicit environment file, validates Compose interpolation, builds and starts the selected Compose file, waits for backend readiness and frontend availability, prints only operator-controlled local endpoints, and never creates or prints demo credentials.

## Validation evidence

| Validation | Result |
|---|---|
| Local Markdown links | Passed for seven synchronized documents; all relative targets resolve. |
| Command declarations | Passed: all ten root release commands and four backend gate commands exist in package manifests. |
| Shell syntax and helper mode | Passed `bash -n`; deployment helper remains executable. |
| Stale documentation scan | Passed; no stale 154-test count, migration 001–029 claim, demo credentials, removed `INSTAPAY_WALLET`, or obsolete repository URL remains in synchronized release docs. |
| Whitespace | `git diff --check` passed after removing Markdown trailing-space markers. |
| Runtime application gates | Workstreams A–D already passed full unit, integration, E2E, migration, security, and build validation before this documentation slice. |
| Docker helper runtime | Not executed because this sandbox has no Docker daemon; the helper and Compose commands were syntax/configuration reviewed, and CI/Docker smoke remain the runtime validation environment. |

## Operational boundary

The runbooks are complete as engineering procedures, but the repository’s governance state remains Development only. Before a real clinic production release, named owners must complete clinical workflow acceptance, tenant/role/branch/department review, provider sandbox or production-account validation, a representative isolated backup/restore drill, security/privacy review, financial reconciliation review, pilot evidence, and formal release approval. No runbook step authorizes use of Health-ERP as a hospital system of record.
