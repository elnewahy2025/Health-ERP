import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { encryptField } from '@healthcare/shared/utils';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';

vi.mock('../../services/clinic-modules.js', () => ({ enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined) }));
const { registerAiHubModule } = await import('../ai-hub/index.js');

const enabled = process.env.RUN_AI_CHAT_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'd1000000-0000-0000-0000-000000000001',
  foreignTenant: 'd1000000-0000-0000-0000-000000000002',
  branch: 'd2000000-0000-0000-0000-000000000001',
  foreignBranch: 'd2000000-0000-0000-0000-000000000002',
  user: 'd3000000-0000-0000-0000-000000000001',
  provider: 'd4000000-0000-0000-0000-000000000001',
  foreignProvider: 'd4000000-0000-0000-0000-000000000002',
  model: 'd5000000-0000-0000-0000-000000000001',
  foreignModel: 'd5000000-0000-0000-0000-000000000002',
  assistant: 'd6000000-0000-0000-0000-000000000001',
};

function principal(): Principal {
  return {
    kind: 'user', id: IDS.user, tenantId: IDS.tenant, roles: [],
    grants: [
      { permission: 'ai_hub.view', scope: 'tenant' },
      { permission: 'ai_hub.create', scope: 'tenant' },
      { permission: 'ai_hub.manage', scope: 'tenant' },
    ],
    denials: [], branches: [IDS.branch], membership: { branchId: IDS.branch } as Principal['membership'], departmentId: null,
    locale: 'en', permVersion: 1, status: 'active',
  };
}

describeDatabase('AI chat completion PostgreSQL integration suite', () => {
  let app: FastifyInstance;
  const currentPrincipal = principal();
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'ai-chat-integration-encryption-key';
    await db.transaction(async (trx) => {
      await trx('ai_requests').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
      await trx('ai_assistants').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
      await trx('ai_models').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
      await trx('ai_providers').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
      await trx('ai_cost_logs').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
      await trx('users').where({ id: IDS.user }).delete();
      await trx('branches').whereIn('id', [IDS.branch, IDS.foreignBranch]).delete();
      await trx('tenants').whereIn('id', [IDS.tenant, IDS.foreignTenant]).delete();

      await trx('tenants').insert([
        { id: IDS.tenant, name: 'AI Chat Clinic', slug: 'ai-chat-clinic', status: 'active' },
        { id: IDS.foreignTenant, name: 'Foreign AI Clinic', slug: 'foreign-ai-clinic', status: 'active' },
      ]);
      await trx('branches').insert([
        { id: IDS.branch, tenant_id: IDS.tenant, name: 'AI Main Branch', code: 'AI-01', phone: '0000000040', address: JSON.stringify({ city: 'Giza' }) },
        { id: IDS.foreignBranch, tenant_id: IDS.foreignTenant, name: 'Foreign Branch', code: 'FAI-01', phone: '0000000041', address: JSON.stringify({ city: 'Cairo' }) },
      ]);
      await trx('users').insert({ id: IDS.user, tenant_id: IDS.tenant, email: 'ai-chat@example.test', password_hash: 'not-used', first_name: 'AI', last_name: 'Tester', branch_id: IDS.branch, status: 'active' });
      await trx('ai_providers').insert([
        { id: IDS.provider, tenant_id: IDS.tenant, name: 'Tenant OpenAI-Compatible Gateway', provider: 'openai_compatible', api_endpoint: 'https://ai.example.test/v1', api_key_encrypted: encryptField('tenant-test-api-key'), config: JSON.stringify({ timeoutMs: 5000 }), is_active: true },
        { id: IDS.foreignProvider, tenant_id: IDS.foreignTenant, name: 'Foreign Gateway', provider: 'openai_compatible', api_endpoint: 'https://foreign.example.test/v1', api_key_encrypted: encryptField('foreign-api-key'), config: JSON.stringify({}), is_active: true },
      ]);
      await trx('ai_models').insert([
        { id: IDS.model, tenant_id: IDS.tenant, provider_id: IDS.provider, model_name: 'tenant-chat-model', display_name: 'Tenant Chat Model', capabilities: 'chat', cost_per_1k_input: 0.25, cost_per_1k_output: 2, max_tokens: 4096, is_active: true },
        { id: IDS.foreignModel, tenant_id: IDS.foreignTenant, provider_id: IDS.foreignProvider, model_name: 'foreign-chat-model', display_name: 'Foreign Chat Model', capabilities: 'chat', cost_per_1k_input: 0.25, cost_per_1k_output: 2, max_tokens: 4096, is_active: true },
      ]);
      await trx('ai_assistants').insert({ id: IDS.assistant, tenant_id: IDS.tenant, name: 'Clinic Assistant', slug: 'clinic_assistant', category: 'general', system_prompt: 'Answer concisely and state when information is uncertain.', tools: JSON.stringify([]), model_id: IDS.model, config: JSON.stringify({}), is_active: true, created_by: IDS.user });
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = currentPrincipal.tenantId;
      req.ctx = { tenantId: currentPrincipal.tenantId, userId: currentPrincipal.id, roles: currentPrincipal.roles, permissions: currentPrincipal.grants.map((grant) => grant.permission), branches: currentPrincipal.branches, locale: currentPrincipal.locale, requestId: request.id, principal: currentPrincipal };
    });
    await registerAiHubModule(app);
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    await db('ai_requests').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
    await db('ai_assistants').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
    await db('ai_models').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
    await db('ai_providers').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
    await db('ai_cost_logs').whereIn('tenant_id', [IDS.tenant, IDS.foreignTenant]).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('branches').whereIn('id', [IDS.branch, IDS.foreignBranch]).delete();
    await db('tenants').whereIn('id', [IDS.tenant, IDS.foreignTenant]).delete();
    await db.destroy();
  });

  it('calls the configured tenant gateway and replays an idempotent completion without a second call', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Configured response' } }], usage: { prompt_tokens: 12, completion_tokens: 7 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const first = await app.inject({ method: 'POST', url: '/api/v1/ai/chat', payload: { assistantId: IDS.assistant, prompt: 'How should the clinic greet a patient?', idempotencyKey: 'ai-chat-replay-001' } });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ status: 'completed', response: 'Configured response', promptTokens: 12, completionTokens: 7, replayed: false });
    const second = await app.inject({ method: 'POST', url: '/api/v1/ai/chat', payload: { assistantId: IDS.assistant, prompt: 'How should the clinic greet a patient?', idempotencyKey: 'ai-chat-replay-001' } });
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toMatchObject({ id: first.json().data.id, status: 'completed', replayed: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(await db('ai_requests').where({ tenant_id: IDS.tenant, idempotency_key: 'ai-chat-replay-001', status: 'completed' })).toHaveLength(1);
    expect(await db('ai_cost_logs').where({ tenant_id: IDS.tenant, source: 'chat' })).toHaveLength(1);
  });

  it('records explicit provider unavailability instead of claiming a completion', async () => {
    await db('ai_providers').where({ id: IDS.provider, tenant_id: IDS.tenant }).update({ api_key_encrypted: null });
    const response = await app.inject({ method: 'POST', url: '/api/v1/ai/chat', payload: { modelId: IDS.model, prompt: 'This must not call an unconfigured provider', idempotencyKey: 'ai-chat-unavailable-001' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ success: false, code: 'AI_PROVIDER_UNAVAILABLE' });
    expect(await db('ai_requests').where({ tenant_id: IDS.tenant, idempotency_key: 'ai-chat-unavailable-001', status: 'failed', error_code: 'AI_PROVIDER_UNAVAILABLE' })).toHaveLength(1);
    await db('ai_providers').where({ id: IDS.provider, tenant_id: IDS.tenant }).update({ api_key_encrypted: encryptField('tenant-test-api-key') });
  });

  it('never resolves a foreign-tenant model and persists the safe failure', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/ai/chat', payload: { modelId: IDS.foreignModel, prompt: 'Cross-tenant model access must fail', idempotencyKey: 'ai-chat-foreign-001' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ success: false, code: 'AI_MODEL_UNAVAILABLE' });
    expect(await db('ai_requests').where({ tenant_id: IDS.tenant, idempotency_key: 'ai-chat-foreign-001', status: 'failed' })).toHaveLength(1);
    expect(await db('ai_requests').where({ tenant_id: IDS.foreignTenant, idempotency_key: 'ai-chat-foreign-001' })).toHaveLength(0);
  });

  it('persists a sanitized upstream failure and never stores the provider response body', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'secret provider payload must not escape' } }), { status: 502, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const response = await app.inject({ method: 'POST', url: '/api/v1/ai/chat', payload: { modelId: IDS.model, prompt: 'Trigger an upstream error', idempotencyKey: 'ai-chat-upstream-failure-001' } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ success: false, code: 'AI_PROVIDER_REQUEST_FAILED' });
    expect(JSON.stringify(response.json())).not.toContain('secret provider payload');
    const row = await db('ai_requests').where({ tenant_id: IDS.tenant, idempotency_key: 'ai-chat-upstream-failure-001' }).first();
    expect(row).toMatchObject({ status: 'failed', error_code: 'AI_PROVIDER_REQUEST_FAILED', response: null });
    expect(String(row.error)).not.toContain('secret provider payload');
  });

  it('requires AI Hub create permission for chat and uses manage for provider mutation', async () => {
    currentPrincipal.grants = [{ permission: 'ai_hub.view', scope: 'tenant' }];
    const chat = await app.inject({ method: 'POST', url: '/api/v1/ai/chat', payload: { modelId: IDS.model, prompt: 'Permission check' } });
    expect(chat.statusCode).toBe(403);
    const provider = await app.inject({ method: 'POST', url: '/api/v1/ai/providers', payload: { name: 'Denied provider', provider: 'openai_compatible', apiEndpoint: 'https://denied.example/v1', apiKey: 'denied' } });
    expect(provider.statusCode).toBe(403);
    currentPrincipal.grants = principal().grants;
  });
});
