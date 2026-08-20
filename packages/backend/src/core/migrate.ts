import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../../.env') });

import knex from 'knex';

async function runMigrations() {
  const db = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'healthcare',
      user: process.env.DB_MIGRATION_USER || process.env.DB_USER || 'postgres',
      password: process.env.DB_MIGRATION_PASSWORD || process.env.DB_PASSWORD || 'postgres',
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
    },
    migrations: {
      directory: path.resolve(__dirname, '../../migrations'),
      extension: 'ts',
    },
    pool: { min: 2, max: 20 },
  });

  try {
    const [batchNo, migrations] = await db.migrate.latest();
    if (migrations.length === 0) {
      console.log('✓ Database is up to date');
    } else {
      console.log(`✓ Ran ${migrations.length} migration(s) (batch ${batchNo})`);
      migrations.forEach((m: string) => console.log(`  - ${m}`));
    }

    const runtimeRole = process.env.DB_USER?.trim();
    const migrationRole = (process.env.DB_MIGRATION_USER || process.env.DB_USER || '').trim();
    if (runtimeRole && migrationRole && runtimeRole !== migrationRole) {
      const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const quotedRuntimeRole = quoteIdentifier(runtimeRole);
      const quotedMigrationRole = quoteIdentifier(migrationRole);
      await db.raw(`GRANT USAGE ON SCHEMA public TO ${quotedRuntimeRole}`);
      await db.raw(`GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO ${quotedRuntimeRole}`);
      await db.raw(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${quotedRuntimeRole}`);
      await db.raw(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationRole} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLES TO ${quotedRuntimeRole}`);
      await db.raw(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedMigrationRole} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quotedRuntimeRole}`);
      console.log(`✓ Runtime database role privileges granted to ${runtimeRole}`);
    }
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runMigrations();
