import type { Knex } from 'knex';
import { db } from '../core/database.js';

/**
 * Fetches a single row that must belong to the current tenant.
 * Returns `undefined` when the row does not exist or belongs to another
 * tenant, so callers can answer 404 without leaking cross-tenant existence.
 *
 * Centralizes the ownership check every write route performs before
 * mutating a resource identified by client-supplied id.
 */
export async function findTenantRow(
  table: string,
  id: string,
  tenantId: string,
  query: Knex | typeof db = db,
): Promise<Record<string, unknown> | undefined> {
  return query(table).where({ id, tenant_id: tenantId }).first() as Promise<Record<string, unknown> | undefined>;
}
