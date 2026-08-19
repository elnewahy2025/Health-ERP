import { db } from '../core/database.js';
import { redis } from '../core/redis.js';
import { getEnv } from '@healthcare/shared/config';

type CheckStatus = 'healthy' | 'degraded' | 'unhealthy' | 'not_started' | 'not_configured';

export type ReadinessWorkerName =
  | 'reminders'
  | 'backup'
  | 'export'
  | 'reports'
  | 'eta'
  | 'automation';

export interface ReadinessCheck {
  status: CheckStatus;
  required: boolean;
  code: string;
  latencyMs?: number;
  provider?: string;
}

interface WorkerState {
  status: 'started' | 'stopped' | 'not_started';
  required: boolean;
  code: string;
  startedAt?: string;
  stoppedAt?: string;
}

const startTime = Date.now();
const workerStates = new Map<ReadinessWorkerName, WorkerState>();
const workerNames: ReadinessWorkerName[] = ['reminders', 'backup', 'export', 'reports', 'eta', 'automation'];

function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

function requiredDependency(name: 'database' | 'redis' | 'object_storage'): boolean {
  if (name === 'database') return true;
  if (name === 'redis') return process.env.REDIS_REQUIRED === 'true';
  return process.env.OBJECT_STORAGE_REQUIRED === 'true';
}

function safeFailure(code: string, required: boolean, status: CheckStatus = 'degraded'): ReadinessCheck {
  return { status, required, code };
}

export function markWorkerStarted(name: ReadinessWorkerName): void {
  workerStates.set(name, {
    status: 'started',
    required: isProduction() && process.env.WORKERS_REQUIRED !== 'false',
    code: 'worker_started',
    startedAt: new Date().toISOString(),
  });
}

export function markWorkerStopped(name: ReadinessWorkerName): void {
  const current = workerStates.get(name);
  workerStates.set(name, {
    status: 'stopped',
    required: current?.required ?? (isProduction() && process.env.WORKERS_REQUIRED !== 'false'),
    code: 'worker_stopped',
    startedAt: current?.startedAt,
    stoppedAt: new Date().toISOString(),
  });
}

export function resetWorkerStates(): void {
  workerStates.clear();
}

export function getWorkerReadiness(): Record<ReadinessWorkerName, ReadinessCheck> {
  return Object.fromEntries(workerNames.map((name) => {
    const state = workerStates.get(name);
    const required = state?.required ?? (isProduction() && process.env.WORKERS_REQUIRED !== 'false');
    if (!state || state.status === 'not_started') {
      return [name, safeFailure('worker_not_started', required, 'not_started')];
    }
    if (state.status === 'stopped') {
      return [name, safeFailure('worker_stopped', required, 'degraded')];
    }
    return [name, { status: 'healthy', required, code: state.code } satisfies ReadinessCheck];
  })) as Record<ReadinessWorkerName, ReadinessCheck>;
}

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

export function getVersionIdentity(): { version: string; commit: string | null } {
  const env = getEnv();
  return {
    version: env.APP_VERSION || '1.0.0',
    commit: env.APP_COMMIT_SHA || process.env.APP_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null,
  };
}

export async function checkDatabase(): Promise<ReadinessCheck> {
  const startedAt = Date.now();
  try {
    await db.raw('SELECT 1');
    return { status: 'healthy', required: true, code: 'database_reachable', latencyMs: Date.now() - startedAt };
  } catch {
    return safeFailure('database_unreachable', true, 'unhealthy');
  }
}

export async function checkRedis(): Promise<ReadinessCheck> {
  const required = requiredDependency('redis');
  const startedAt = Date.now();
  try {
    await redis.ping();
    return { status: 'healthy', required, code: 'redis_reachable', latencyMs: Date.now() - startedAt, provider: 'redis' };
  } catch {
    return safeFailure('redis_unreachable', required);
  }
}

export function checkObjectStorageConfiguration(): ReadinessCheck {
  const env = getEnv();
  const required = requiredDependency('object_storage');
  const hasSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);
  const hasExternalMinio = Boolean(env.MINIO_ENDPOINT && env.MINIO_ENDPOINT !== 'localhost');
  if (hasSupabase) {
    return { status: 'healthy', required, code: 'supabase_storage_configured', provider: 'supabase' };
  }
  if (hasExternalMinio) {
    return { status: 'healthy', required, code: 'minio_storage_configured', provider: 'minio' };
  }
  return { status: 'not_configured', required, code: 'local_filesystem_storage', provider: 'local' };
}

export async function collectReadinessChecks(): Promise<Record<string, ReadinessCheck | Record<string, ReadinessCheck>>> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  return {
    database,
    redis,
    objectStorage: checkObjectStorageConfiguration(),
    workers: getWorkerReadiness(),
  };
}

function isReadinessCheck(value: ReadinessCheck | Record<string, ReadinessCheck>): value is ReadinessCheck {
  return 'status' in value && typeof value.status === 'string';
}

function flattenChecks(checks: Record<string, ReadinessCheck | Record<string, ReadinessCheck>>): ReadinessCheck[] {
  return Object.values(checks).flatMap((check) =>
    isReadinessCheck(check) ? [check] : Object.values(check),
  );
}

export function summarizeReadiness(checks: Record<string, ReadinessCheck | Record<string, ReadinessCheck>>): {
  status: 'healthy' | 'degraded';
  ready: boolean;
} {
  const flatChecks = flattenChecks(checks);
  const requiredFailures = flatChecks.filter((check) => check.required && check.status !== 'healthy');
  const anyFailures = flatChecks.some((check) => {
    if (['healthy', 'not_configured'].includes(check.status)) return false;
    if (!check.required && ['not_started', 'stopped'].includes(check.status)) return false;
    return true;
  });
  return {
    status: anyFailures ? 'degraded' : 'healthy',
    ready: requiredFailures.length === 0,
  };
}
