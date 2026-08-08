import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../../../.env') });

import knex from 'knex';

async function runSeeds() {
  const db = knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'healthcare',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ...(process.env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: false } } : {}),
    },
    seeds: {
      directory: path.resolve(__dirname, '../../seeds'),
      extension: 'ts',
    },
    pool: { min: 2, max: 20 },
  });

  try {
    const [seeds] = await db.seed.run();
    if (seeds.length === 0) {
      console.log('✓ No seed files found');
    } else {
      console.log(`✓ Ran ${seeds.length} seed file(s)`);
      seeds.forEach((s: string) => console.log(`  - ${s}`));
    }
  } catch (error) {
    console.error('✗ Seed failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runSeeds();
