import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import os from 'node:os';
import {
  collectReadinessChecks,
  getUptimeSeconds,
  getVersionIdentity,
  summarizeReadiness,
  type ReadinessCheck,
} from '../../services/health-readiness.js';

type HealthChecks = Record<string, ReadinessCheck | Record<string, ReadinessCheck>>;

function requestId(request: FastifyRequest): string {
  return String(request.id);
}

function livePayload(request: FastifyRequest) {
  const identity = getVersionIdentity();
  return {
    alive: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: getUptimeSeconds(),
    version: identity.version,
    commit: identity.commit,
    requestId: requestId(request),
  };
}

async function readinessPayload(request: FastifyRequest): Promise<{ checks: HealthChecks; ready: boolean; status: 'healthy' | 'degraded' }> {
  const checks = await collectReadinessChecks();
  const summary = summarizeReadiness(checks);
  return { checks, ready: summary.ready, status: summary.status };
}

function sendReadiness(reply: FastifyReply, request: FastifyRequest, payload: Awaited<ReturnType<typeof readinessPayload>>) {
  const identity = getVersionIdentity();
  return reply.status(payload.ready ? 200 : 503).send({
    ready: payload.ready,
    status: payload.status,
    timestamp: new Date().toISOString(),
    uptime: getUptimeSeconds(),
    version: identity.version,
    commit: identity.commit,
    requestId: requestId(request),
    services: payload.checks,
  });
}

export async function registerHealthModule(app: FastifyInstance) {
  app.get('/api/v1/health', async (request, reply) => {
    const payload = await readinessPayload(request);
    const env = process.env.NODE_ENV || 'development';
    return reply.status(payload.ready ? 200 : 503).send({
      status: payload.status,
      ready: payload.ready,
      timestamp: new Date().toISOString(),
      uptime: getUptimeSeconds(),
      version: getVersionIdentity().version,
      commit: getVersionIdentity().commit,
      environment: env,
      requestId: requestId(request),
      services: payload.checks,
      runtime: {
        nodeVersion: process.version,
        platform: os.platform(),
        cpuCount: os.cpus().length,
      },
    });
  });

  app.get('/api/v1/ready', async (request, reply) => sendReadiness(reply, request, await readinessPayload(request)));
  app.get('/api/v1/health/ready', async (request, reply) => sendReadiness(reply, request, await readinessPayload(request)));
  app.get('/api/v1/live', async (request) => livePayload(request));
  app.get('/api/v1/health/live', async (request) => livePayload(request));
}
