import type { FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { redis } from '../../core/redis.js';
import { getEnv } from '@healthcare/shared/config';
import * as os from 'os';

const startTime = Date.now();

export async function registerHealthModule(app: FastifyInstance) {
  app.get('/api/v1/health', async (request, reply) => {
    const checks: Record<string, unknown> = {};

    try {
      const dbStart = Date.now();
      await db.raw('SELECT 1');
      checks.database = { status: 'healthy', latency: `${Date.now() - dbStart}ms` };
    } catch (err: unknown) {
      checks.database = { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) };
    }

    try {
      const redisStart = Date.now();
      await redis.ping();
      checks.redis = { status: 'healthy', latency: `${Date.now() - redisStart}ms` };
    } catch (err: unknown) {
      checks.redis = { status: 'degraded', error: err instanceof Error ? err.message : String(err) };
    }

    const allHealthy = Object.values(checks as Record<string, unknown>).every((c) => (c as Record<string, unknown>).status === 'healthy');
    const env = getEnv();

    return reply.status(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
      environment: env.NODE_ENV,
      services: checks,
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        nodeVersion: process.version,
        memory: `${Math.round(os.freemem() / 1024 / 1024)}MB free / ${Math.round(os.totalmem() / 1024 / 1024)}MB`,
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg().map(l => l.toFixed(2)),
      },
    });
  });

  app.get('/api/v1/ready', async (request, reply) => {
    try {
      await db.raw('SELECT 1');
      return reply.status(200).send({ ready: true });
    } catch {
      return reply.status(503).send({ ready: false });
    }
  });

  app.get('/api/v1/live', async (request, reply) => {
    return reply.status(200).send({ alive: true, uptime: Math.floor((Date.now() - startTime) / 1000) });
  });

}
