import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex from 'knex';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'authorization';
const targets: Record<string, { env: string; testFile: string }> = {
  authorization: {
    env: 'RUN_AUTHZ_DB_TESTS',
    testFile: 'src/services/__tests__/authorization.integration.test.ts',
  },
  billing: {
    env: 'RUN_BILLING_DB_TESTS',
    testFile: 'src/modules/__tests__/billing-provider-payments.integration.test.ts',
  },
  rls: {
    env: 'RUN_RLS_DB_TESTS',
    testFile: 'src/services/__tests__/rls.integration.test.ts',
  },
  lifecycle: {
    env: 'RUN_FASTIFY_LIFECYCLE_TESTS',
    testFile: 'src/services/__tests__/fastify-rls-lifecycle.integration.test.ts',
  },
};
const selected = targets[target];
if (!selected) throw new Error(`Unknown PostgreSQL integration target: ${target}`);

const migrationDb = knex({
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
    directory: path.join(backendRoot, 'migrations'),
    extension: 'ts',
  },
  pool: { min: 1, max: 5 },
});

try {
  const [batch, migrations] = await migrationDb.migrate.latest();
  console.log(`PostgreSQL integration migrations ready (batch ${batch}, applied ${migrations.length})`);
} finally {
  await migrationDb.destroy();
}

const child = spawn(process.execPath, [path.resolve(backendRoot, '../../node_modules/vitest/vitest.mjs'), 'run', selected.testFile], {
  cwd: backendRoot,
  env: { ...process.env, [selected.env]: 'true' },
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
