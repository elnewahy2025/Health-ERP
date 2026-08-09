import crypto from 'crypto';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import type { ApiKeyRow } from "../types.js";
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerApiGatewayModule(app: FastifyInstance) {
  // ── API Keys ──
  app.get('/api/v1/api-keys', { preHandler: [authenticate, authorize('api_keys.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const keys = await db('api_keys').where({ tenant_id: tenantId }).orderBy('created_at', 'desc');
    return sendSuccess(reply, keys.map((k: ApiKeyRow) => ({
      id: k.id, name: k.name, keyPrefix: k.key_prefix,
      permissions: k.permissions, allowedIps: k.allowed_ips,
      rateLimit: k.rate_limit, expiresAt: k.expires_at,
      isActive: k.is_active, lastUsedAt: k.last_used_at, createdAt: k.created_at
    })));
  });

  app.post('/api/v1/api-keys', { preHandler: [authenticate, authorize('api_keys.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const rawKey = 'vh_' + crypto.randomBytes(32).toString('base64url');
    const prefix = rawKey.slice(0, 12);
    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const [key] = await db('api_keys').insert({
      tenant_id: tenantId, name: body.name, key_hash: hash, key_prefix: prefix,
      permissions: body.permissions || 'read',
      allowed_ips: JSON.stringify(body.allowedIps || []),
      rate_limit: JSON.stringify(body.rateLimit || { requests: 1000, period: '1h' }),
      expires_at: body.expiresAt || null, created_by: ctx.userId,
    }).returning('*');
    return sendSuccess(reply, {
      id: key.id, name: key.name, apiKey: rawKey, keyPrefix: key.key_prefix,
      message: 'Save this key — it will not be shown again.'
    }, 'API key created', 201);
  });

  app.put('/api/v1/api-keys/:id', { preHandler: [authenticate, authorize('api_keys.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name;
    if (body.permissions) update.permissions = body.permissions;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    if (body.allowedIps) update.allowed_ips = JSON.stringify(body.allowedIps);
    if (body.expiresAt) update.expires_at = body.expiresAt;
    await db('api_keys').where({ id }).update(update);
    return sendSuccess(reply, null, 'API key updated');
  });

  app.delete('/api/v1/api-keys/:id', { preHandler: [authenticate, authorize('api_keys.edit')] }, async (request, reply) => {
    await db('api_key_logs').where({ api_key_id: (request.params as { id: string }).id }).del();
    await db('api_keys').where({ id: (request.params as { id: string }).id }).del();
    return sendSuccess(reply, null, 'API key deleted');
  });

  // ── API Key Usage Logs ──
  app.get('/api/v1/api-keys/:id/logs', { preHandler: [authenticate, authorize('api_keys.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const logs = await db('api_key_logs').where({ tenant_id: tenantId, api_key_id: id })
      .orderBy('created_at', 'desc').limit(100);
    return sendSuccess(reply, logs.map((l: Record<string, unknown>) => ({
      id: l.id, endpoint: l.endpoint, method: l.method,
      responseStatus: l.response_status, ip: l.ip, createdAt: l.created_at
    })));
  });

  // ── API Key Authentication middleware (for external API consumers) ──
  app.get('/api/v1/api-keys/verify', async (request, reply) => {
    const authHeader = request.headers['x-api-key'] as string;
    if (!authHeader) return reply.status(401).send({ success: false, error: 'API key required' });
    const hash = crypto.createHash('sha256').update(authHeader).digest('hex');
    const key = await db('api_keys').where({ key_hash: hash, is_active: true })
      .where(function() { this.whereNull('expires_at').orWhere('expires_at', '>', new Date()); })
      .first();
    if (!key) return reply.status(401).send({ success: false, error: 'Invalid or expired API key' });
    await db('api_keys').where({ id: key.id }).update({ last_used_at: new Date() });
    return sendSuccess(reply, {
      tenantId: key.tenant_id, name: key.name, permissions: key.permissions,
    }, 'API key valid');
  });

  // ── Cache Configs ──
  app.get('/api/v1/cache-configs', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const configs = await db('cache_configs').where({ tenant_id: tenantId }).orderBy('endpoint_pattern');
    return sendSuccess(reply, configs.map((c: Record<string, unknown>) => ({
      id: c.id, endpointPattern: c.endpoint_pattern,
      ttlSeconds: c.ttl_seconds, isActive: c.is_active
    })));
  });

  app.post('/api/v1/cache-configs', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const [c] = await db('cache_configs').insert({
      tenant_id: tenantId, endpoint_pattern: body.endpointPattern,
      ttl_seconds: body.ttlSeconds || 300, is_active: body.isActive !== false
    }).returning('*');
    return sendSuccess(reply, { id: c.id, endpointPattern: c.endpoint_pattern }, 'Cache config added', 201);
  });

  app.put('/api/v1/cache-configs/:id', { preHandler: [authenticate, authorize('settings.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.ttlSeconds) update.ttl_seconds = body.ttlSeconds;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    await db('cache_configs').where({ id }).update(update);
    return sendSuccess(reply, null, 'Cache config updated');
  });
}
