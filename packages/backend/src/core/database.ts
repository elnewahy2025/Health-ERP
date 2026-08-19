import knex, { type Knex } from 'knex';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getEnv } from '@healthcare/shared/config';

const env = getEnv();
type RequestDatabaseContext = { transaction: Knex.Transaction | null };
const requestTransactionStorage = new AsyncLocalStorage<RequestDatabaseContext | null>();

const baseDb = knex({
  client: 'pg',
  connection: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
  },
  pool: {
    min: 2,
    max: 10,
  },
  searchPath: ['public'],
});

function scopedDatabase(): Knex.Transaction | null {
  return requestTransactionStorage.getStore()?.transaction || null;
}

/**
 * Knex facade used by application modules. During an authenticated request it
 * routes query-builder calls to the request transaction, ensuring all queries
 * share the tenant-local PostgreSQL session context.
 */
export const db = new Proxy(baseDb, {
  apply(_target, thisArg, args) {
    const scoped = scopedDatabase();
    return scoped
      ? Reflect.apply(scoped as unknown as (...callArgs: unknown[]) => unknown, scoped, args)
      : Reflect.apply(baseDb, thisArg, args);
  },
  get(target, property, receiver) {
    const scoped = scopedDatabase();
    const propertyName = String(property);
    const useScopedConnection = scoped && !['client', 'destroy', 'migrate', 'seed'].includes(propertyName);
    const value = useScopedConnection ? Reflect.get(scoped, property) : Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(useScopedConnection ? scoped : target) : value;
  },
}) as Knex;

export function enterRequestDatabaseContext(): RequestDatabaseContext {
  const context: RequestDatabaseContext = { transaction: null };
  requestTransactionStorage.enterWith(context);
  return context;
}

export async function beginRequestTenantTransaction(tenantId: string): Promise<Knex.Transaction> {
  const trx = await baseDb.transaction();
  try {
    await trx.raw("SELECT set_config('app.current_tenant', ?, true)", [tenantId]);
    return trx;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

export function enterRequestTenantTransaction(trx: Knex.Transaction): void {
  const context = requestTransactionStorage.getStore();
  if (context) {
    context.transaction = trx;
  } else {
    requestTransactionStorage.enterWith({ transaction: trx });
  }
}

export function clearRequestTenantTransaction(): void {
  const context = requestTransactionStorage.getStore();
  if (context) context.transaction = null;
}

export async function finishRequestTenantTransaction(commit: boolean, requestTransaction?: Knex.Transaction): Promise<void> {
  const context = requestTransactionStorage.getStore();
  const trx = requestTransaction || context?.transaction || null;
  if (context) context.transaction = null;
  if (!trx) return;
  if (commit) await trx.commit();
  else await trx.rollback();
}

export async function withTenant<T>(
  tenantId: string,
  fn: (trx: Knex.Transaction) => Promise<T>,
): Promise<T> {
  const existing = scopedDatabase();
  if (existing) return fn(existing);
  return baseDb.transaction(async (trx) => {
    await trx.raw("SELECT set_config('app.current_tenant', ?, true)", [tenantId]);
    return requestTransactionStorage.run({ transaction: trx }, () => fn(trx));
  });
}
