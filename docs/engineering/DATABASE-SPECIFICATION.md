# Database Specification — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Engine:** PostgreSQL 15

---

## 1. Connection & Configuration

- Client: `pg` via Knex (`knexfile.ts`); dotenv loads `../../.env`.
- SSL: `DB_SSL=false` local; `{ rejectUnauthorized: false }` in production profile.
- Connection env: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- CI uses service container `postgres:15-alpine` (DB `healthcare`).

## 2. Schema Management

- **Migrations:** `packages/backend/migrations/` — 29 files (`001`…`029`), sequential.
- **Command:** `npm run migrate` (root) → `knex migrate:latest`.
- **Rule:** never edit applied migrations; add new numbered file.
- **Rollback:** `knex migrate:rollback` dev-only; production rollbacks are forward-fix + release-managed.
- **Seeds:** `packages/backend/seeds/` (dev/test only).

## 3. Entity Groups (≈190 tables)

See [DATA-MODEL.md](../core/DATA-MODEL.md) for the full entity map. Core: `tenants`, `roles`, `users`,
`branches`, `patients`, `appointments`, `emr_records`, `invoices`, `payment_transactions`, `audit_logs`.

## 4. Constraints & Integrity

- PKs: UUID v4 (`id`); FKs `*_id` with `RESTRICT` unless parent-aggregate cascade is intentional.
- `NOT NULL` on tenant_id for all tenant-scoped tables.
- Unique partial indexes for race prevention: e.g., one active MRN per tenant,
  one active booking per slot, unique `(tenant_id, email)` on users.
- Check constraints for status enums where modeled (patients, appointments, invoices).
- Appointment constraints (migration 024): no overlapping same-doctor/same-room slots.
- RLS enabled (migrations 023, 027) with `app.current_tenant_id`; policies on tenant-scoped tables.

## 5. Indexing Strategy

| Pattern | Example |
|---|---|
| Tenant-scoped composite | `(tenant_id, created_at)` on appointments, invoices |
| FK lookups | `(patient_id)`, `(invoice_id)`, `(user_id)` |
| Search (pg_trgm GIN) | patients name/MRN, medication database, ICD-10 |
| Auth | `refresh_tokens(token_hash)`, `users(email)`, `login_attempts(user_id, created_at)` |
| Reporting | `dw_*` aggregate tables refreshed by ETL jobs |

## 6. Audit Fields & Soft Delete

- `created_at`, `updated_at` everywhere; `deleted_at` on soft-deletable entities.
- Writes audited → `audit_logs` (tenant_id, actor_id, action, entity, entity_id, before/after jsonb).
- Retention: `data_retention_policies`; purge jobs enforce windows (privacy + storage).

## 7. Encryption at Rest (Application Layer)

- AES-256-GCM via `ENCRYPTION_KEY`; fields: Egyptian NID, sensitive PII.
- `shared/utils/crypto.ts`: `encryptField`, `decryptField`, `isEncrypted`.
- Search over encrypted fields via hashed companion columns (deterministic).
- Backups: S3 encrypted with `BACKUP_ENCRYPTION_KEY`, retention `BACKUP_RETENTION`.

## 8. Performance Considerations

- All list queries paginated; no unbounded scans.
- Hot paths indexed by tenant + time range; heavy reporting reads from `dw_*` tables.
- `pg_trgm` extension enabled for fuzzy search.
- Connection pooling via Knex pool config (production min 2 / max 20).

## 9. Backup & Recovery

- Daily S3 backups (encrypted), retention configurable (`BACKUP_RETENTION`).
- Docker `backup` service in `docker-compose.prod.yml`.
- DR: `dr-configs`, `backup_executions`, restore runbook in `docs/security/INCIDENT_RESPONSE.md`.

## 10. Data Retention & Privacy

- Consent logs (`data_consent_logs`); patient data exportable via `data-export`.
- Retention policies per entity; anonymization before purge for audit continuity.
- Egyptian law + GDPR-style rights surfaced in patient portal.

---

*Related: [Data model](../core/DATA-MODEL.md) · [Environment](ENVIRONMENT.md)*
