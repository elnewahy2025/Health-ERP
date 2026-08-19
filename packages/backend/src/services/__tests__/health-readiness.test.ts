import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbRawMock, redisPingMock, getEnvMock } = vi.hoisted(() => ({
  dbRawMock: vi.fn(),
  redisPingMock: vi.fn(),
  getEnvMock: vi.fn(),
}));

vi.mock('../../core/database.js', () => ({ db: { raw: dbRawMock } }));
vi.mock('../../core/redis.js', () => ({ redis: { ping: redisPingMock } }));
vi.mock('@healthcare/shared/config', () => ({ getEnv: getEnvMock }));

describe('health readiness service', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_REQUIRED;
    delete process.env.OBJECT_STORAGE_REQUIRED;
    delete process.env.WORKERS_REQUIRED;
    getEnvMock.mockReturnValue({
      NODE_ENV: 'test',
      APP_VERSION: '2.4.0-test',
      APP_COMMIT_SHA: 'abc123',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_KEY: undefined,
      MINIO_ENDPOINT: 'localhost',
    });
    dbRawMock.mockResolvedValue([{ '?column?': 1 }]);
    redisPingMock.mockResolvedValue('PONG');
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.REDIS_REQUIRED;
    delete process.env.OBJECT_STORAGE_REQUIRED;
    delete process.env.WORKERS_REQUIRED;
  });

  it('reports healthy database, optional Redis, and local storage without requiring unstarted workers in test', async () => {
    const { collectReadinessChecks, summarizeReadiness, resetWorkerStates } = await import('../health-readiness.js');
    resetWorkerStates();
    const checks = await collectReadinessChecks();
    const summary = summarizeReadiness(checks);

    expect(summary).toEqual({ status: 'healthy', ready: true });
    expect(checks.database).toMatchObject({ status: 'healthy', code: 'database_reachable', required: true });
    expect(checks.redis).toMatchObject({ status: 'healthy', code: 'redis_reachable', required: false });
    expect(checks.objectStorage).toMatchObject({ status: 'not_configured', code: 'local_filesystem_storage', provider: 'local' });
    expect(checks.workers).toMatchObject({
      backup: expect.objectContaining({ status: 'not_started', required: false }),
      automation: expect.objectContaining({ status: 'not_started', required: false }),
    });
  });

  it('fails readiness closed for a required Redis outage without exposing the upstream error', async () => {
    process.env.REDIS_REQUIRED = 'true';
    redisPingMock.mockRejectedValue(new Error('redis://:super-secret@example.invalid connection refused'));
    const { collectReadinessChecks, summarizeReadiness } = await import('../health-readiness.js');
    const summary = summarizeReadiness(await collectReadinessChecks());
    const checks = await collectReadinessChecks();

    expect(summary).toEqual({ status: 'degraded', ready: false });
    expect(checks.redis).toEqual(expect.objectContaining({ status: 'degraded', required: true, code: 'redis_unreachable' }));
    expect(JSON.stringify(checks)).not.toContain('super-secret');
    expect(JSON.stringify(checks)).not.toContain('connection refused');
  });

  it('keeps optional Redis degradation visible without blocking readiness', async () => {
    redisPingMock.mockRejectedValue(new Error('redis unavailable'));
    const { collectReadinessChecks, summarizeReadiness } = await import('../health-readiness.js');
    const checks = await collectReadinessChecks();

    expect(summarizeReadiness(checks)).toEqual({ status: 'degraded', ready: true });
    expect(checks.redis).toMatchObject({ status: 'degraded', required: false, code: 'redis_unreachable' });
  });

  it('reports worker lifecycle and configured build identity', async () => {
    process.env.NODE_ENV = 'production';
    getEnvMock.mockReturnValue({
      NODE_ENV: 'production',
      APP_VERSION: '3.0.1',
      APP_COMMIT_SHA: 'release-sha',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_KEY: undefined,
      MINIO_ENDPOINT: 'localhost',
    });
    const { getVersionIdentity, getWorkerReadiness, markWorkerStarted, markWorkerStopped, resetWorkerStates } = await import('../health-readiness.js');
    resetWorkerStates();
    markWorkerStarted('backup');
    markWorkerStopped('backup');

    expect(getVersionIdentity()).toEqual({ version: '3.0.1', commit: 'release-sha' });
    expect(getWorkerReadiness().backup).toMatchObject({ status: 'degraded', required: true, code: 'worker_stopped' });
    expect(getWorkerReadiness().automation).toMatchObject({ status: 'not_started', required: true, code: 'worker_not_started' });
    resetWorkerStates();
  });
});

describe('health routes', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    getEnvMock.mockReturnValue({
      NODE_ENV: 'test',
      APP_VERSION: '2.4.0-test',
      APP_COMMIT_SHA: 'abc123',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_KEY: undefined,
      MINIO_ENDPOINT: 'localhost',
    });
    dbRawMock.mockResolvedValue([{ '?column?': 1 }]);
    redisPingMock.mockResolvedValue('PONG');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('serves ready and live aliases with safe version and request identity', async () => {
    const { registerHealthModule } = await import('../../modules/health/index.js');
    const app = Fastify({ genReqId: () => 'health-test-request' });
    await registerHealthModule(app);

    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    const live = await app.inject({ method: 'GET', url: '/api/v1/health/live' });

    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ ready: true, status: 'healthy', version: '2.4.0-test', commit: 'abc123', requestId: 'health-test-request' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ alive: true, status: 'alive', version: '2.4.0-test', commit: 'abc123', requestId: 'health-test-request' });
    await app.close();
  });

  it('returns a safe degraded response when database readiness fails', async () => {
    dbRawMock.mockRejectedValue(new Error('password=should-never-leak'));
    const { registerHealthModule } = await import('../../modules/health/index.js');
    const app = Fastify({ genReqId: () => 'health-degraded-request' });
    await registerHealthModule(app);

    const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    const body = response.json();

    expect(response.statusCode).toBe(503);
    expect(body).toMatchObject({ ready: false, status: 'degraded', requestId: 'health-degraded-request' });
    expect(JSON.stringify(body)).not.toContain('should-never-leak');
    await app.close();
  });
});
