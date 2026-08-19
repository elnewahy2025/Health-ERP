import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { encryptField } from '@healthcare/shared/utils';
import { NotFoundError } from '@healthcare/shared/errors';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { createAiAssistantSchema, createAiModelSchema, createAiProviderSchema, chatCompletionSchema } from '../../utils/validation.js';
import { completeTenantAiChat } from '../../services/ai-completion.js';

interface AiProviderRow {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  api_endpoint: string | null;
  api_key_encrypted?: string | null;
  config: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AiAssistantRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  category: string;
  system_prompt: string | null;
  tools: unknown;
  model_id: string | null;
  config: unknown;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  // joined
  model_name?: string;
}

interface AiRequestRow {
  id: string;
  tenant_id: string;
  assistant_id: string | null;
  model_id: string | null;
  user_id: string | null;
  prompt: string;
  response: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency_ms: number;
  status: string;
  error: string | null;
  error_code?: string | null;
  source: string | null;
  idempotency_key?: string | null;
  created_at: Date;
}

interface AiCostLogRow {
  id: string;
  tenant_id: string;
  date: string;
  source: string;
  total_cost: number;
  total_requests: number;
  total_tokens: number;
  created_at: Date;
}

export async function registerAiHubModule(app: FastifyInstance) {
  // ── AI Providers ──
  app.get('/api/v1/ai/providers', { preHandler: [authenticate, authorize('ai_hub.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const providers = await db('ai_providers').where({ tenant_id: tenantId }).orderBy('name');
    return sendSuccess(reply, providers.map((p: AiProviderRow) => ({
      id: p.id, name: p.name, provider: p.provider,
      apiEndpoint: p.api_endpoint, config: p.config,
      apiKeyConfigured: Boolean(p.api_key_encrypted),
      isActive: p.is_active, createdAt: p.created_at,
    })));
  });

  app.post('/api/v1/ai/providers', { preHandler: [authenticate, authorize('ai_hub.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = createAiProviderSchema.parse(request.body);
    const [p] = await db('ai_providers').insert({
      tenant_id: tenantId, name: body.name, provider: body.provider,
      api_endpoint: body.apiEndpoint || null,
      api_key_encrypted: body.apiKey ? encryptField(body.apiKey) : null,
      config: JSON.stringify(body.config || {}),
      is_active: body.isActive !== false,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'ai.provider_created', entityType: 'ai_provider', entityId: p.id,
      metadata: { name: body.name, provider: body.provider },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: p.id, name: p.name }, 'AI provider added', 201);
  });

  app.put('/api/v1/ai/providers/:id', { preHandler: [authenticate, authorize('ai_hub.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = createAiProviderSchema.partial().parse(request.body);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) update.name = body.name;
    if (body.config !== undefined) update.config = JSON.stringify(body.config);
    if (body.isActive !== undefined) update.is_active = body.isActive;
    if (body.apiEndpoint !== undefined) update.api_endpoint = body.apiEndpoint || null;
    if (body.apiKey !== undefined) update.api_key_encrypted = encryptField(body.apiKey);
    const changed = await db('ai_providers').where({ id, tenant_id: tenantId }).update(update);
    if (!changed) throw new NotFoundError('AI provider', id);

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'ai.provider_updated', entityType: 'ai_provider', entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Provider updated');
  });

  // ── AI Models ──
  app.get('/api/v1/ai/models', { preHandler: [authenticate, authorize('ai_hub.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const models = await db('ai_models').where({ tenant_id: tenantId }).orderBy('model_name');
    return sendSuccess(reply, models.map((m: Record<string, unknown>) => ({
      id: m.id, providerId: m.provider_id, modelName: m.model_name,
      displayName: m.display_name, capabilities: m.capabilities,
      costPer1kInput: Number(m.cost_per_1k_input), costPer1kOutput: Number(m.cost_per_1k_output),
      maxTokens: m.max_tokens, isActive: m.is_active,
    })));
  });

  app.post('/api/v1/ai/models', { preHandler: [authenticate, authorize('ai_hub.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = createAiModelSchema.parse(request.body);
    const provider = await db('ai_providers').where({ id: body.providerId, tenant_id: tenantId }).first();
    if (!provider) throw new NotFoundError('AI provider', body.providerId);
    const [m] = await db('ai_models').insert({
      tenant_id: tenantId, provider_id: body.providerId, model_name: body.modelName,
      display_name: body.displayName || null, capabilities: body.capabilities || 'chat',
      cost_per_1k_input: body.costPer1kInput || 0, cost_per_1k_output: body.costPer1kOutput || 0,
      max_tokens: body.maxTokens || 4096,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'ai.model_created', entityType: 'ai_model', entityId: m.id,
      metadata: { modelName: body.modelName, providerId: body.providerId },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: m.id, modelName: m.model_name }, 'Model added', 201);
  });

  // ── AI Assistants ──
  app.get('/api/v1/ai/assistants', { preHandler: [authenticate, authorize('ai_hub.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { category } = request.query as { category?: string };
    let q = db('ai_assistants').where('ai_assistants.tenant_id', tenantId);
    if (category) q = q.andWhere('category', category);
    const assistants = await q.leftJoin('ai_models', 'ai_assistants.model_id', 'ai_models.id')
      .select('ai_assistants.*', 'ai_models.model_name')
      .orderBy('name');
    return sendSuccess(reply, assistants.map((a: AiAssistantRow) => ({
      id: a.id, name: a.name, slug: a.slug, category: a.category,
      systemPrompt: a.system_prompt, tools: a.tools,
      modelId: a.model_id, modelName: a.model_name,
      config: a.config, isActive: a.is_active,
      createdAt: a.created_at,
    })));
  });

  app.post('/api/v1/ai/assistants', { preHandler: [authenticate, authorize('ai_hub.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = createAiAssistantSchema.parse(request.body);
    if (body.modelId && !(await db('ai_models').where({ id: body.modelId, tenant_id: tenantId }).first())) throw new NotFoundError('AI model', body.modelId);
    const slug = String(body.slug || body.name.toLowerCase().replace(/\s+/g, '_'));
    const [a] = await db('ai_assistants').insert({
      tenant_id: tenantId, name: body.name, slug, category: body.category || 'general',
      system_prompt: body.systemPrompt || null, tools: JSON.stringify(body.tools || []),
      model_id: body.modelId || null, config: JSON.stringify(body.config || {}),
      created_by: ctx.userId,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'ai.assistant_created', entityType: 'ai_assistant', entityId: a.id,
      metadata: { name: body.name, slug, category: body.category },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: a.id, name: a.name, slug: a.slug }, 'Assistant created', 201);
  });

  app.put('/api/v1/ai/assistants/:id', { preHandler: [authenticate, authorize('ai_hub.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = createAiAssistantSchema.partial().parse(request.body);
    if (body.modelId && !(await db('ai_models').where({ id: body.modelId, tenant_id: tenantId }).first())) throw new NotFoundError('AI model', body.modelId);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name;
    if (body.systemPrompt !== undefined) update.system_prompt = body.systemPrompt;
    if (body.tools) update.tools = JSON.stringify(body.tools);
    if (body.modelId) update.model_id = body.modelId;
    if (body.config) update.config = JSON.stringify(body.config);
    if (body.isActive !== undefined) update.is_active = body.isActive;
    await db('ai_assistants').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'ai.assistant_updated', entityType: 'ai_assistant', entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Assistant updated');
  });

  // ── AI Request Log ──
  app.get('/api/v1/ai/requests', { preHandler: [authenticate, authorize('ai_hub.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status, source, limit } = request.query as { limit?: string; source?: string; status?: string };
    let q = db('ai_requests').where('ai_requests.tenant_id', tenantId);
    if (status) q = q.andWhere('status', status);
    if (source) q = q.andWhere('source', source);
    const rows = await q.orderBy('created_at', 'desc').limit(Number(limit) || 50);
    return sendSuccess(reply, rows.map((r: AiRequestRow) => ({
      id: r.id, assistantId: r.assistant_id, modelId: r.model_id,
      prompt: r.prompt?.substring(0, 200), response: r.response?.substring(0, 200),
      promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens,
      cost: Number(r.cost), latencyMs: r.latency_ms,
      status: r.status, error: r.error, errorCode: r.error_code, source: r.source,
      idempotencyKey: r.idempotency_key,
      createdAt: r.created_at,
    })));
  });

  // ── AI Cost Tracking ──
  app.get('/api/v1/ai/costs', { preHandler: [authenticate, authorize('ai_hub.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000).toISOString().split('T')[0];
    const costs = await db('ai_cost_logs').where({ tenant_id: tenantId }).andWhere('date', '>=', since).orderBy('date', 'desc');
    const totals = await db('ai_requests').where({ tenant_id: tenantId }).where('created_at', '>=', since)
      .sum('cost as total_cost').sum('prompt_tokens as total_tokens').count('id as total_requests').first();
    return sendSuccess(reply, {
      daily: costs.map((c: AiCostLogRow) => ({
        date: c.date, source: c.source, totalCost: Number(c.total_cost),
        totalRequests: c.total_requests, totalTokens: c.total_tokens,
      })),
      summary: {
        totalCost: Number((totals as Record<string, unknown>)?.total_cost || 0),
        totalTokens: Number((totals as Record<string, unknown>)?.total_tokens || 0),
        totalRequests: Number((totals as Record<string, unknown>)?.total_requests || 0),
      },
    });
  });

  // ── Chat Completion ──
  app.post('/api/v1/ai/chat', { preHandler: [authenticate, authorize('ai_hub.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = chatCompletionSchema.parse(request.body);
    const result = await completeTenantAiChat({
      tenantId, userId: ctx.userId, assistantId: body.assistantId, modelId: body.modelId,
      prompt: body.prompt, messages: body.messages, source: body.source || 'chat', idempotencyKey: body.idempotencyKey,
    });

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'ai.chat_request', entityType: 'ai_request', entityId: result.id,
      metadata: { source: result.source, assistantId: result.assistantId, modelId: result.modelId, status: result.status, errorCode: result.errorCode, replayed: result.replayed },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    if (result.status === 'processing') {
      return sendSuccess(reply, result, 'AI completion is still processing', 202);
    }
    if (result.status !== 'completed') {
      const statusCode = result.errorCode?.startsWith('AI_PROVIDER_') ? 503 : 400;
      return reply.status(statusCode).send({ success: false, error: result.error || 'AI completion was not available', code: result.errorCode || 'AI_COMPLETION_FAILED', data: { id: result.id, status: result.status, errorCode: result.errorCode, replayed: result.replayed }, timestamp: new Date().toISOString() });
    }
    return sendSuccess(reply, result, 'AI completion generated');
  });
}
