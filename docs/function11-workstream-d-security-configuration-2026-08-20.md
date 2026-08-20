# Function 11 Workstream D: Security and Production-Configuration Evidence

**Date:** 20 August 2026  
**Status:** Implementation committed as `4c411f8`; documentation commit pending

## Scope delivered

Workstream D adds a deterministic security and production-configuration gate without creating a second authorization or tenant-isolation mechanism. The gate is implemented in `packages/backend/scripts/security-config-gate.ts` and exposed as `npm run security:config-gate`.

In production mode, the gate fails closed unless JWT signing secrets, CSRF protection, database credentials, and field-encryption keys are present, sufficiently long, non-default, and distinct where required. It requires secure cookies, HTTPS `APP_URL` and `CORS_ORIGIN`, Redis and object storage to be explicitly required, and workers not to be disabled. The live production mode connects as the configured runtime database role and verifies that the role is neither a PostgreSQL superuser nor `BYPASSRLS`. The static-production mode used in CI verifies the release configuration without connecting to a deployment database; the PostgreSQL integration and RLS gates remain responsible for exercising the real non-BYPASSRLS role.

The gate verifies that backend and frontend final Docker stages run as `appuser`, that the documented Nginx configurations include the required security headers, and that the built frontend bundle contains neither forbidden secret variable names nor secret-shaped provider/JWT values. It also runs `npm audit --omit=dev --audit-level=high --json` and fails on any high or critical production dependency vulnerability.

The dependency review remediated the direct high/critical findings by upgrading `@fastify/jwt` to `10.2.2`, `@fastify/static` to `10.1.3`, `@fastify/swagger-ui` to `6.1.1`, `react-router-dom` to `6.30.4`, and `postcss` to `8.5.6`. The remaining production-reachable `brace-expansion` advisory was closed with the narrow npm override to fixed version `5.0.9`; no broad `npm audit fix --force` operation was used. The final production audit reports **zero high and zero critical vulnerabilities**, with three moderate findings remaining for later controlled review.

The backend production image now prunes development dependencies before copying runtime `node_modules`, while retaining the production `tsx` dependency required by the TypeScript migration startup contract. Production Compose now requires separate runtime and migration database credentials. The canonical migration runner uses `DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD` when supplied, then grants the runtime role explicit schema/table/sequence privileges. Local Compose defaults remain compatible with the existing development setup.

The CI workflow now contains a security/configuration gate and a container vulnerability gate. The security gate builds the frontend bundle, runs the fail-closed static-production check, and depends on the migration and PostgreSQL integration gates. The container gate builds both production images and scans them with Trivy for unfixed high/critical OS and library vulnerabilities. The release promotion gate now requires both security jobs in addition to the existing build, migration, integration, E2E, and Docker smoke gates.

## Validation evidence

| Validation | Result |
|---|---|
| Workspace lint and type checks | Passed for shared, backend, and frontend. |
| Full backend unit suite after dependency upgrades | **46 test files passed; 301 tests passed; 13 files and 46 tests skipped.** |
| Full frontend unit suite after dependency upgrades | **13 test files passed; 49 tests passed.** |
| PostgreSQL integration matrix after dependency upgrades | **13 targets passed; 46 integration tests passed.** |
| Migration role split | Passed: migrations ran as the operator role, runtime privileges were granted, and the live role reported `rolsuper=false`, `rolbypassrls=false`. |
| Security gate positive path | Passed in non-production mode, static-production mode, and live production mode against the disposable non-BYPASSRLS role. |
| Security gate fail-closed path | Passed negative test: weak secrets, wildcard CORS, insecure cookies, HTTP URLs, and disabled production dependencies were rejected. |
| Dependency audit | **0 high, 0 critical** production vulnerabilities after targeted upgrades and the `brace-expansion` 5.0.9 override; 3 moderate findings remain. |
| Frontend bundle secret scan | Passed with the production build. |
| Container identity/header checks | Passed statically for both Dockerfiles and both Nginx configurations. |
| Managed authenticated release E2E after upgrades | **10 tests passed.** |
| Managed unauthenticated smoke E2E after upgrades | **7 tests passed.** |
| Production build | Passed for shared, backend, and frontend. |
| Docker/Trivy execution | The Docker daemon is unavailable in this sandbox, so image builds and Trivy execution were not run locally. The CI jobs are configured to execute both gates and block promotion on failure. |

The disposable validation used no production database, provider credential, payment, SMS, voice, tax, or model call. Redis connection warnings in the intentionally optional local E2E/integration environment were non-failing and did not weaken the production gate, which requires Redis.

## Safety and rollback boundary

The dependency upgrades are package-level security maintenance and were validated by the complete unit, integration, E2E, lint, and build suites. The migration runner role split is backward-compatible when `DB_MIGRATION_USER` is absent and fail-closed for production Compose until separate runtime/migration credentials are supplied. No destructive migration was introduced. The npm override is narrowly scoped to a transitive dependency and can be removed after its upstream dependency range advances beyond the fixed release.

Workstream D does not add operational runbooks, incident procedures, backup/restore operator instructions, provider-outage procedures, or worker-recovery documentation. Those remain Workstream E and must not be treated as complete from this slice.
