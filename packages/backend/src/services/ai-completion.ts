import { decryptField } from '@healthcare/shared/utils';
import { db } from '../core/database.js';
import { validateProviderValidationEndpoint } from './clinic-provider-adapters.js';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 64_000;

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatInput {
  tenantId: string;
  userId: string | null;
  assistantId?: string;
  modelId?: string;
  prompt: string;
  messages?: AiChatMessage[];
  source?: string;
  idempotencyKey?: string;
}

export interface AiCompletionData {
  id: string;
  assistantId: string | null;
  modelId: string;
  modelName: string;
  response: string | null;
  status: 'completed' | 'failed' | 'processing';
  promptTokens: number;
  completionTokens: number;
  cost: number;
  latencyMs: number;
  errorCode: string | null;
  error: string | null;
  source: string;
  replayed: boolean;
}

interface AiRequestRecord {
  id: string;
  tenant_id: string;
  assistant_id: string | null;
  model_id: string | null;
  prompt: string;
  response: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency_ms: number;
  status: string;
  error_code: string | null;
  error: string | null;
  source: string | null;
}

interface AiProviderRecord {
  id: string;
  tenant_id: string;
  provider: string;
  api_endpoint: string | null;
  api_key_encrypted: string | null;
  config: unknown;
  is_active: boolean;
}

interface AiModelRecord {
  id: string;
  tenant_id: string;
  provider_id: string;
  model_name: string;
  capabilities: unknown;
  cost_per_1k_input: number | string | null;
  cost_per_1k_output: number | string | null;
  max_tokens: number | string | null;
  is_active: boolean;
}

interface AiAssistantRecord {
  id: string;
  tenant_id: string;
  model_id: string | null;
  system_prompt: string | null;
  config: unknown;
  is_active: boolean;
}

interface ResolvedAiConfig {
  assistant: AiAssistantRecord | null;
  model: AiModelRecord;
  provider: AiProviderRecord;
  apiKey: string;
  endpoint: string;
  timeoutMs: number;
  systemPrompt: string | null;
}

interface ProviderResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return asRecord(JSON.parse(value)); } catch { return {}; }
  }
  return asRecord(value);
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function trimErrorMessage(value: unknown, fallback: string): string {
  const message = typeof value === 'string' ? value.trim() : '';
  return message ? message.slice(0, 500) : fallback;
}

function capabilitiesIncludeChat(value: unknown): boolean {
  const values = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[,\s]+/)
      : [];
  return values.map((item) => item.toLowerCase()).some((item) => item === 'chat' || item === 'multimodal');
}

function normalizeChatEndpoint(rawEndpoint: string, config: Record<string, unknown>): string | null {
  const validated = validateProviderValidationEndpoint(rawEndpoint, 'production');
  if ('error' in validated) return null;
  try {
    const url = new URL(validated.url);
    const configuredPath = typeof config.chatPath === 'string' ? config.chatPath.trim() : '';
    if (configuredPath) {
      if (!configuredPath.startsWith('/')) return null;
      url.pathname = configuredPath;
      url.search = '';
    } else if (!url.pathname.replace(/\/$/, '').endsWith('/chat/completions')) {
      url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function mapRequest(row: AiRequestRecord, modelName: string | null, replayed: boolean): AiCompletionData {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    modelId: row.model_id || '',
    modelName: modelName || '',
    response: row.response,
    status: row.status === 'completed' || row.status === 'failed' || row.status === 'processing' ? row.status : 'failed',
    promptTokens: Number(row.prompt_tokens || 0),
    completionTokens: Number(row.completion_tokens || 0),
    cost: Number(row.cost || 0),
    latencyMs: Number(row.latency_ms || 0),
    errorCode: row.error_code,
    error: row.error,
    source: row.source || 'chat',
    replayed,
  };
}

async function findRequest(tenantId: string, idempotencyKey: string): Promise<AiRequestRecord | undefined> {
  return await db('ai_requests').where({ tenant_id: tenantId, idempotency_key: idempotencyKey }).first() as AiRequestRecord | undefined;
}

async function resolveAiConfiguration(input: AiChatInput): Promise<ResolvedAiConfig | { code: string; message: string }> {
  let assistant: AiAssistantRecord | null = null;
  if (input.assistantId) {
    assistant = await db('ai_assistants').where({ id: input.assistantId, tenant_id: input.tenantId, is_active: true }).first() as AiAssistantRecord | undefined || null;
    if (!assistant) return { code: 'AI_ASSISTANT_UNAVAILABLE', message: 'The selected AI assistant is not available for this clinic' };
  }

  const resolvedModelId = assistant?.model_id || input.modelId;
  if (!resolvedModelId) return { code: 'AI_MODEL_REQUIRED', message: 'Select an active chat model or assistant before sending a prompt' };
  if (assistant?.model_id && input.modelId && assistant.model_id !== input.modelId) {
    return { code: 'AI_MODEL_SELECTION_CONFLICT', message: 'The selected model does not match the assistant configuration' };
  }

  const model = await db('ai_models').where({ id: resolvedModelId, tenant_id: input.tenantId, is_active: true }).first() as AiModelRecord | undefined;
  if (!model || !capabilitiesIncludeChat(model.capabilities)) {
    return { code: 'AI_MODEL_UNAVAILABLE', message: 'The selected AI model is not active or does not support chat' };
  }

  const provider = await db('ai_providers').where({ id: model.provider_id, tenant_id: input.tenantId, is_active: true }).first() as AiProviderRecord | undefined;
  if (!provider || !provider.api_endpoint || !provider.api_key_encrypted) {
    return { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Configure an active AI provider endpoint and encrypted API key before using chat' };
  }

  let apiKey: string;
  try {
    apiKey = decryptField(provider.api_key_encrypted);
  } catch {
    return { code: 'AI_PROVIDER_SECRET_INVALID', message: 'The configured AI provider secret could not be loaded safely' };
  }
  if (!apiKey) return { code: 'AI_PROVIDER_UNAVAILABLE', message: 'Configure an active AI provider endpoint and encrypted API key before using chat' };

  const config = parseJson(provider.config);
  const endpoint = normalizeChatEndpoint(provider.api_endpoint, config);
  if (!endpoint) return { code: 'AI_PROVIDER_ENDPOINT_INVALID', message: 'The configured AI provider endpoint is invalid or not allowed' };

  const configuredTimeout = Number(config.timeoutMs);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1_000
    ? Math.min(configuredTimeout, MAX_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;

  return { assistant, model, provider, apiKey, endpoint, timeoutMs, systemPrompt: assistant?.system_prompt || null };
}

async function readResponseBody(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('AI provider response exceeded the maximum size');
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function extractText(payload: ProviderResponse): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content.map((part) => {
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text || '');
      return '';
    }).join('').trim();
    return text || null;
  }
  return null;
}

function buildMessages(input: AiChatInput, systemPrompt: string | null): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (systemPrompt?.trim()) messages.push({ role: 'system', content: systemPrompt.trim() });
  for (const message of input.messages || []) messages.push({ role: message.role, content: message.content });
  messages.push({ role: 'user', content: input.prompt });
  return messages;
}

async function completeWithProvider(config: ResolvedAiConfig, input: AiChatInput): Promise<{ response: string; promptTokens: number; completionTokens: number }> {
  const modelMaxTokens = positiveInteger(config.model.max_tokens, 4096) || 4096;
  const providerConfig = parseJson(config.provider.config);
  const maxTokens = Math.min(modelMaxTokens, MAX_OUTPUT_TOKENS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model.model_name, messages: buildMessages(input, config.systemPrompt), max_tokens: maxTokens, temperature: providerConfig.temperature }),
      redirect: 'error',
      signal: controller.signal,
    });
    const raw = await readResponseBody(response);
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
    let payload: ProviderResponse;
    try { payload = JSON.parse(raw) as ProviderResponse; } catch { throw new Error('AI provider returned invalid JSON'); }
    const text = extractText(payload);
    if (!text) throw new Error('AI provider returned no assistant content');
    return {
      response: text,
      promptTokens: positiveInteger(payload.usage?.prompt_tokens, 0),
      completionTokens: positiveInteger(payload.usage?.completion_tokens, 0),
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI provider request timed out');
    throw error instanceof Error ? error : new Error('AI provider request failed');
  } finally {
    clearTimeout(timeout);
  }
}

async function updateFailedRequest(input: { tenantId: string; requestId: string; code: string; message: string; latencyMs: number }): Promise<AiRequestRecord> {
  await db('ai_requests').where({ id: input.requestId, tenant_id: input.tenantId }).update({
    status: 'failed', error_code: input.code, error: input.message.slice(0, 500), latency_ms: input.latencyMs,
  });
  return await db('ai_requests').where({ id: input.requestId, tenant_id: input.tenantId }).first() as AiRequestRecord;
}

async function updateCompletedRequest(input: { tenantId: string; requestId: string; assistantId: string | null; modelId: string; source: string; response: string; promptTokens: number; completionTokens: number; cost: number; latencyMs: number }): Promise<AiRequestRecord> {
  return await db.transaction(async (trx) => {
    await trx('ai_requests').where({ id: input.requestId, tenant_id: input.tenantId }).update({
      assistant_id: input.assistantId, model_id: input.modelId, source: input.source,
      status: 'completed', response: input.response, prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens, cost: input.cost, latency_ms: input.latencyMs,
      error_code: null, error: null,
    });

    const today = new Date().toISOString().slice(0, 10);
    const existing = await trx('ai_cost_logs').where({ tenant_id: input.tenantId, date: today, source: input.source }).forUpdate().first();
    if (existing) {
      await trx('ai_cost_logs').where({ id: existing.id, tenant_id: input.tenantId }).update({
        total_cost: Number(existing.total_cost || 0) + input.cost,
        total_requests: Number(existing.total_requests || 0) + 1,
        total_tokens: Number(existing.total_tokens || 0) + input.promptTokens + input.completionTokens,
      });
    } else {
      await trx('ai_cost_logs').insert({
        tenant_id: input.tenantId, date: today, source: input.source, total_cost: input.cost,
        total_requests: 1, total_tokens: input.promptTokens + input.completionTokens,
      });
    }
    return await trx('ai_requests').where({ id: input.requestId, tenant_id: input.tenantId }).first() as AiRequestRecord;
  });
}

export async function completeTenantAiChat(input: AiChatInput): Promise<AiCompletionData> {
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await findRequest(input.tenantId, idempotencyKey);
    if (existing) return mapRequest(existing, null, true);
  }

  let request: AiRequestRecord;
  try {
    [request] = await db('ai_requests').insert({
      tenant_id: input.tenantId, assistant_id: input.assistantId || null, model_id: input.modelId || null,
      user_id: input.userId, prompt: input.prompt, status: 'processing', source: input.source || 'chat',
      idempotency_key: idempotencyKey,
    }).returning('*') as AiRequestRecord[];
  } catch (error: unknown) {
    if (idempotencyKey && (error as { code?: string })?.code === '23505') {
      const existing = await findRequest(input.tenantId, idempotencyKey);
      if (existing) return mapRequest(existing, null, true);
    }
    throw error;
  }

  const startedAt = Date.now();
  const resolved = await resolveAiConfiguration(input);
  if ('code' in resolved) {
    const failed = await updateFailedRequest({ tenantId: input.tenantId, requestId: request.id, code: resolved.code, message: resolved.message, latencyMs: Date.now() - startedAt });
    return mapRequest(failed, null, false);
  }

  try {
    const completion = await completeWithProvider(resolved, input);
    const inputCost = Number(resolved.model.cost_per_1k_input || 0);
    const outputCost = Number(resolved.model.cost_per_1k_output || 0);
    const cost = (completion.promptTokens / 1000) * inputCost + (completion.completionTokens / 1000) * outputCost;
    const completed = await updateCompletedRequest({
      tenantId: input.tenantId, requestId: request.id, assistantId: resolved.assistant?.id || null,
      modelId: resolved.model.id, source: input.source || 'chat', response: completion.response,
      promptTokens: completion.promptTokens, completionTokens: completion.completionTokens,
      cost, latencyMs: Date.now() - startedAt,
    });
    return mapRequest(completed, resolved.model.model_name, false);
  } catch (error: unknown) {
    const message = trimErrorMessage(error instanceof Error ? error.message : null, 'AI provider request failed');
    const code = message.includes('timed out') ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_REQUEST_FAILED';
    const failed = await updateFailedRequest({ tenantId: input.tenantId, requestId: request.id, code, message, latencyMs: Date.now() - startedAt });
    return mapRequest(failed, resolved.model.model_name, false);
  }
}
