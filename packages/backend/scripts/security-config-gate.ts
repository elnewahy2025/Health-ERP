import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(backendRoot, '../..');
const failures: string[] = [];
const staticProduction = process.argv.includes('--static-production');
const production = process.env.NODE_ENV === 'production' || staticProduction;

function fail(message: string): void {
  failures.push(message);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required`);
  return value || '';
}

function isInsecure(value: string): boolean {
  return [
    '',
    'postgres',
    'password',
    'CHANGE_ME',
    'CHANGE_ME_USE_STRONG_PASSWORD',
    'CHANGE_ME_GENERATE_WITH_openssl_rand_hex_32',
    'CHANGE_ME_GENERATE_A_DIFFERENT_openssl_rand_hex_32',
    'dev-secret-change-in-production',
    'dev-refresh-secret-change-in-production',
    'minioadmin',
  ].includes(value);
}

function requireStrongSecret(name: string, minimumLength = 32): string {
  const value = required(name);
  if (value.length < minimumLength) fail(`${name} must be at least ${minimumLength} characters`);
  if (isInsecure(value)) fail(`${name} uses an insecure default`);
  return value;
}

async function scanFrontendBundle(): Promise<void> {
  const bundleRoot = path.join(repoRoot, process.env.FRONTEND_BUNDLE_DIR || 'packages/frontend/dist');
  let entries;
  try {
    entries = await readdir(bundleRoot, { withFileTypes: true, recursive: true });
  } catch {
    fail(`frontend bundle directory is missing: ${bundleRoot}`);
    return;
  }

  const forbiddenNames = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'CSRF_SECRET',
    'ENCRYPTION_KEY',
    'DB_PASSWORD',
    'DB_USER',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'FAWRY_SECURITY_KEY',
    'TWILIO_AUTH_TOKEN',
    'WHATSAPP_API_TOKEN',
    'SUPABASE_SERVICE_KEY',
    'SENDGRID_API_KEY',
    'OPENAI_API_KEY',
    'MINIO_SECRET_KEY',
    'AWS_SECRET_ACCESS_KEY',
  ];
  const forbiddenPatterns = [/sk_(?:live|test)_[A-Za-z0-9]+/g, /whsec_[A-Za-z0-9]+/g, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    const content = await readFile(filePath, 'utf8');
    for (const name of forbiddenNames) {
      if (content.includes(name)) fail(`frontend bundle contains forbidden secret name: ${name}`);
    }
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) fail(`frontend bundle contains a forbidden secret-shaped value in ${path.relative(repoRoot, filePath)}`);
      pattern.lastIndex = 0;
    }
  }

  const configuredSecretValues = (process.env.FRONTEND_SECRET_VALUES || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const secretValue of configuredSecretValues) {
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(entry.parentPath, entry.name);
      const content = await readFile(filePath, 'utf8');
      if (content.includes(secretValue)) fail(`frontend bundle contains a configured secret value in ${path.relative(repoRoot, filePath)}`);
    }
  }
}

async function checkDockerDefinitions(): Promise<void> {
  for (const filename of ['Dockerfile.backend', 'Dockerfile.frontend']) {
    const filePath = path.join(repoRoot, filename);
    const content = await readFile(filePath, 'utf8');
    const stages = content.split(/^FROM\s+/m);
    const finalStage = stages.at(-1) || '';
    if (!/\bUSER\s+appuser\b/.test(finalStage)) fail(`${filename} final stage must run as appuser`);
    if (/^USER\s+root\s*$/m.test(finalStage)) fail(`${filename} final stage explicitly runs as root`);
  }

  for (const filename of ['deployment/nginx/default.conf', 'deployment/nginx/prod.conf']) {
    const filePath = path.join(repoRoot, filename);
    const content = await readFile(filePath, 'utf8');
    for (const header of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Strict-Transport-Security']) {
      if (!content.includes(header)) fail(`${filename} is missing security header ${header}`);
    }
  }
}

async function checkProductionDatabaseRole(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'healthcare',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();
    const result = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    if (result.rows.length !== 1) fail('database runtime role could not be resolved');
    else {
      if (result.rows[0].rolsuper) fail('database runtime role must not be superuser');
      if (result.rows[0].rolbypassrls) fail('database runtime role must not have BYPASSRLS');
    }
  } catch {
    fail('database runtime role check failed');
  } finally {
    await client.end().catch(() => undefined);
  }
}

function runDependencyAudit(): void {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let report: { metadata?: { vulnerabilities?: { high?: number; critical?: number } } } = {};
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch {
    fail('npm audit did not return valid JSON');
    return;
  }
  const vulnerabilities = report.metadata?.vulnerabilities || {};
  if ((vulnerabilities.high || 0) > 0 || (vulnerabilities.critical || 0) > 0) {
    fail(`npm audit reports ${vulnerabilities.high || 0} high and ${vulnerabilities.critical || 0} critical production vulnerabilities`);
  }
  if (result.error) fail(`npm audit failed to execute: ${result.error.message}`);
}

async function main(): Promise<void> {
  if (production) {
    const jwt = requireStrongSecret('JWT_SECRET');
    const refresh = requireStrongSecret('JWT_REFRESH_SECRET');
    if (jwt && refresh && jwt === refresh) fail('JWT_SECRET and JWT_REFRESH_SECRET must be different');
    requireStrongSecret('CSRF_SECRET');
    requireStrongSecret('ENCRYPTION_KEY');
    const dbPassword = requireStrongSecret('DB_PASSWORD');
    if (dbPassword === 'postgres') fail('DB_PASSWORD must not be the default postgres password');
    if (process.env.COOKIE_SECURE !== 'true') fail('COOKIE_SECURE must be true in production');
    if (process.env.CORS_ORIGIN === '*') fail('CORS_ORIGIN must not be wildcard in production');
    if (!String(process.env.CORS_ORIGIN || '').startsWith('https://')) fail('CORS_ORIGIN must use HTTPS in production');
    if (!String(process.env.APP_URL || '').startsWith('https://')) fail('APP_URL must use HTTPS in production');
    if (process.env.REDIS_REQUIRED !== 'true') fail('REDIS_REQUIRED must be true in production');
    if (process.env.OBJECT_STORAGE_REQUIRED !== 'true') fail('OBJECT_STORAGE_REQUIRED must be true in production');
    if (process.env.WORKERS_REQUIRED === 'false') fail('WORKERS_REQUIRED must not be false in production');
    if (!staticProduction) await checkProductionDatabaseRole();
  }

  await checkDockerDefinitions();
  await scanFrontendBundle();
  runDependencyAudit();

  if (failures.length > 0) {
    console.error('Security/configuration gate failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ event: 'security_configuration_gate_passed', production, databaseRole: staticProduction ? 'verified-by-non-bypassrls-integration' : 'verified', dependencyAudit: 'no-high-or-critical-production-vulnerabilities', containers: 'non-root', bundle: 'no-forbidden-secrets' }));
}

await main();
