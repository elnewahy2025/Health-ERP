import { apiClient } from './client';

export interface AiAssistant {
  id: string;
  name: string;
  slug: string;
  category: string;
  systemPrompt?: string;
  tools: string[];
  modelId?: string;
  modelName?: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface AiProvider {
  id: string;
  name: string;
  provider: string;
  apiEndpoint?: string;
  config: Record<string, unknown>;
  apiKeyConfigured?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface AiModel {
  id: string;
  providerId: string;
  modelName: string;
  displayName?: string;
  capabilities: string;
  costPer1kInput: number;
  costPer1kOutput: number;
  maxTokens: number;
  isActive: boolean;
}

export interface AiRequest {
  id: string;
  assistantId?: string;
  modelId?: string;
  prompt?: string;
  response?: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  latencyMs: number;
  status: string;
  error?: string;
  errorCode?: string;
  idempotencyKey?: string;
  source: string;
  createdAt: string;
}

export interface AiCostDaily {
  date: string;
  source: string;
  totalCost: number;
  totalRequests: number;
  totalTokens: number;
}

export interface AiCostData {
  daily: AiCostDaily[];
  summary: {
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
  };
}

export interface CreateAiAssistantPayload {
  name: string;
  slug?: string;
  category?: string;
  systemPrompt?: string;
  tools?: string[];
  modelId?: string;
  config?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CreateAiProviderPayload {
  name: string;
  provider: string;
  apiEndpoint?: string;
  apiKey?: string;
  config?: Record<string, unknown>;
  isActive?: boolean;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatResult extends AiRequest {
  response: string;
  modelName: string;
  replayed: boolean;
}

export const aiHubApi = {
  listAssistants: (params?: { category?: string }) =>
    apiClient.get('/ai/assistants', { params }).then((r) => r.data.data as AiAssistant[]),
  createAssistant: (data: CreateAiAssistantPayload) =>
    apiClient.post('/ai/assistants', data).then((r) => r.data.data as AiAssistant),
  updateAssistant: (id: string, data: Partial<CreateAiAssistantPayload>) =>
    apiClient.put(`/ai/assistants/${id}`, data).then((r) => r.data.data),
  listProviders: () =>
    apiClient.get('/ai/providers').then((r) => r.data.data as AiProvider[]),
  createProvider: (data: CreateAiProviderPayload) =>
    apiClient.post('/ai/providers', data).then((r) => r.data.data as AiProvider),
  updateProvider: (id: string, data: Partial<CreateAiProviderPayload>) =>
    apiClient.put(`/ai/providers/${id}`, data).then((r) => r.data.data),
  listModels: () =>
    apiClient.get('/ai/models').then((r) => r.data.data as AiModel[]),
  createModel: (data: { providerId: string; modelName: string; displayName?: string; capabilities?: string; costPer1kInput?: number; costPer1kOutput?: number; maxTokens?: number }) =>
    apiClient.post('/ai/models', data).then((r) => r.data.data as AiModel),
  listRequests: (params?: { status?: string; source?: string; limit?: number }) =>
    apiClient.get('/ai/requests', { params }).then((r) => r.data.data as AiRequest[]),
  getCosts: (params?: { days?: number }) =>
    apiClient.get('/ai/costs', { params }).then((r) => r.data.data as AiCostData),
  chat: (data: { assistantId?: string; modelId?: string; prompt: string; messages?: AiChatMessage[]; source?: string; idempotencyKey?: string }) =>
    apiClient.post('/ai/chat', data).then((r) => r.data.data as AiChatResult),
};
