import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import knex from 'knex';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.resolve(backendRoot, '../../.env') });

const checkOnly = process.argv.includes('--check');
const migrationDirectory = path.join(backendRoot, 'migrations');

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'healthcare_test',
    user: process.env.DB_MIGRATION_USER || process.env.DB_USER || 'postgres',
    password: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD || 'postgres',
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
  },
  migrations: {
    directory: migrationDirectory,
    extension: 'ts',
  },
  pool: { min: 1, max: 5 },
});

function migrationNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && 'name' in entry) return String((entry as { name: unknown }).name);
    return JSON.stringify(entry);
  });
}

async function runMigrationGate(): Promise<void> {
  const [completedBefore, pendingBefore] = await db.migrate.list();
  const initialPending = migrationNames(pendingBefore);
  console.log(JSON.stringify({
    event: 'migration_gate_before',
    mode: checkOnly ? 'check' : 'apply',
    completed: migrationNames(completedBefore).length,
    pending: initialPending,
  }));

  if (checkOnly) {
    if (initialPending.length > 0) {
      throw new Error(`Pending migrations block promotion: ${initialPending.join(', ')}`);
    }
    console.log(JSON.stringify({ event: 'migration_gate_passed', mode: 'check', pending: [] }));
    return;
  }

  const [batch, applied] = await db.migrate.latest();
  console.log(JSON.stringify({
    event: 'migration_gate_applied',
    batch,
    applied: migrationNames(applied),
  }));

  const [, rerunApplied] = await db.migrate.latest();
  const rerun = migrationNames(rerunApplied);
  if (rerun.length > 0) {
    throw new Error(`Migration re-run was not idempotent; it applied: ${rerun.join(', ')}`);
  }

  const [completedAfter, pendingAfter] = await db.migrate.list();
  const remaining = migrationNames(pendingAfter);
  if (remaining.length > 0) {
    throw new Error(`Migration gate finished with pending migrations: ${remaining.join(', ')}`);
  }

  console.log(JSON.stringify({
    event: 'migration_gate_passed',
    mode: 'apply',
    completed: migrationNames(completedAfter).length,
    pending: [],
  }));
}

try {
  await runMigrationGate();
} catch (error) {
  console.error('Migration gate failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
