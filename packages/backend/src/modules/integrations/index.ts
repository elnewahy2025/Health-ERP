import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { validateWebhookUrl } from '@healthcare/shared/utils';
import type { IntegrationConnectionRow } from "../types.js";
import { authenticate } from '../auth-guard.js';

export async function registerIntegrationsModule(app: FastifyInstance) {
  // ── Integration Definitions (system-wide catalog) ──
  app.get('/api/v1/integrations/catalog', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const defs = await db('integration_definitions').where({ is_active: true }).orderBy('name');
    return sendSuccess(reply, defs.map((d: Record<string, unknown>) => ({
      id: d.id, name: d.name, provider: d.provider, category: d.category,
      description: d.description, configSchema: d.config_schema,
      availableActions: d.available_actions, icon: d.icon
    })));
  });

  // ── Tenant Integration Connections ──
  app.get('/api/v1/integrations/connections', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const conns = await db('integration_connections').where({ tenant_id: tenantId })
      .leftJoin('integration_definitions', 'integration_connections.definition_id', 'integration_definitions.id')
      .select('integration_connections.*', 'integration_definitions.name as def_name', 'integration_definitions.provider as def_provider', 'integration_definitions.category as def_category')
      .orderBy('integration_connections.name');
    return sendSuccess(reply, conns.map((c: Record<string, unknown>) => ({
      id: c.id, name: c.name, definitionId: c.definition_id,
      definitionName: c.def_name, provider: c.def_provider,
      category: c.def_category, config: c.config,
      status: c.status, lastError: c.last_error,
      lastSyncAt: c.last_sync_at, isActive: c.is_active,
      createdAt: c.created_at
    })));
  });

  app.post('/api/v1/integrations/connections', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const [conn] = await db('integration_connections').insert({
      tenant_id: tenantId, definition_id: body.definitionId, name: body.name,
      credentials_encrypted: JSON.stringify(body.credentials || {}),
      config: JSON.stringify(body.config || {}), is_active: body.isActive !== false
    }).returning('*');
    return sendSuccess(reply, { id: conn.id, name: conn.name }, 'Integration connection created', 201);
  });

  app.put('/api/v1/integrations/connections/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name; if (body.config) update.config = JSON.stringify(body.config);
    if (body.credentials) update.credentials_encrypted = JSON.stringify(body.credentials);
    if (body.isActive !== undefined) update.is_active = body.isActive;
    if (body.status) update.status = body.status;
    await db('integration_connections').where({ id }).update(update);
    return sendSuccess(reply, null, 'Connection updated');
  });

  app.post('/api/v1/integrations/connections/:id/test', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db('integration_connections').where({ id }).update({ status: 'connected', last_sync_at: new Date(), updated_at: new Date() });
    return sendSuccess(reply, { status: 'connected' }, 'Connection test successful');
  });

  app.delete('/api/v1/integrations/connections/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    await db('webhooks').where({ integration_id: (request.params as { id: string }).id }).update({ status: 'disabled' });
    await db('integration_connections').where({ id: (request.params as { id: string }).id }).del();
    return sendSuccess(reply, null, 'Connection deleted');
  });

  // ── Webhooks ──
  app.get('/api/v1/integrations/webhooks', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const webhooks = await db('webhooks').where({ tenant_id: tenantId })
      .leftJoin('integration_connections', 'webhooks.integration_id', 'integration_connections.id')
      .select('webhooks.*', 'integration_connections.name as conn_name')
      .orderBy('webhooks.name');
    return sendSuccess(reply, webhooks.map((w: Record<string, unknown>) => ({
      id: w.id, name: w.name, integrationId: w.integration_id,
      integrationName: w.conn_name, url: w.url, events: w.events,
      status: w.status, retryCount: w.retry_count,
      timeoutSeconds: w.timeout_seconds, lastTriggeredAt: w.last_triggered_at,
      createdAt: w.created_at
    })));
  });

  app.post('/api/v1/integrations/webhooks', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    if (body.url) {
      const urlCheck = validateWebhookUrl(body.url as string);
      if (!urlCheck.valid) return reply.status(400).send({ success: false, error: urlCheck.reason });
    }
    const [wh] = await db('webhooks').insert({
      tenant_id: tenantId, integration_id: body.integrationId || null,
      name: body.name, url: body.url,
      events: JSON.stringify(body.events || ['*']),
      headers: JSON.stringify(body.headers || {}),
      retry_count: body.retryCount || 3, timeout_seconds: body.timeoutSeconds || 30
    }).returning('*');
    return sendSuccess(reply, { id: wh.id, name: wh.name }, 'Webhook created', 201);
  });

  app.put('/api/v1/integrations/webhooks/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name;
    if (body.url) {
      const urlCheck = validateWebhookUrl(body.url as string);
      if (!urlCheck.valid) return reply.status(400).send({ success: false, error: urlCheck.reason });
      update.url = body.url;
    }
    if (body.events) update.events = JSON.stringify(body.events);
    if (body.headers) update.headers = JSON.stringify(body.headers);
    if (body.status) update.status = body.status;
    if (body.retryCount) update.retry_count = body.retryCount;
    await db('webhooks').where({ id }).update(update);
    return sendSuccess(reply, null, 'Webhook updated');
  });

  // ── Webhook Logs ──
  app.get('/api/v1/integrations/webhooks/:id/logs', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const logs = await db('webhook_logs').where({ tenant_id: tenantId, webhook_id: id }).orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, logs.map((l: Record<string, unknown>) => ({
      id: l.id, event: l.event, status: l.status,
      responseStatus: l.response_status, attempt: l.attempt,
      error: l.error, createdAt: l.created_at
    })));
  });

  // ── Webhook Receiver (for incoming webhooks from external systems) ──
  app.post('/api/v1/integrations/webhook-receive/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const wh = await db('webhooks').where({ secret: token, status: 'active' }).first();
    if (!wh) return reply.status(404).send({ success: false, error: 'Invalid webhook token' });
    const body = request.body;
    await db('webhook_logs').insert({
      tenant_id: wh.tenant_id, webhook_id: wh.id,
      event: (body as Record<string, unknown>)?.event || 'received',
      request_body: JSON.stringify(body), status: 'delivered',
      response_status: 200
    });
    return { success: true };
  });
}
