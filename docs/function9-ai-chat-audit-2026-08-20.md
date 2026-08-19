# Function 9 AI Chat Completion Audit

**Audit date:** 20 August 2026

## Current behavior

`packages/backend/src/modules/ai-hub/index.ts` exposes `POST /api/v1/ai/chat` behind `authenticate` and `ai_hub.create`, but the route only inserts an `ai_requests` row with `status = 'completed'` and returns the placeholder message `AI request logged. Provider integration required for actual completion.` It never calls a model or returns generated content.

The existing `ai_requests` table already stores tenant ID, assistant/model IDs, prompt, response, prompt/completion token counts, cost, latency, status, error, source, and timestamp. Its default status is incorrectly `completed` for a request that has not executed.

## Existing configuration model

The legacy AI Hub schema contains tenant-scoped `ai_providers`, `ai_models`, and `ai_assistants` tables. `ai_providers` includes `api_endpoint`, encrypted API-key storage, provider configuration, and activation state. `ai_models` links to a tenant provider and stores the model name, capability, token limit, and cost rates. `ai_assistants` stores the tenant system prompt, selected model, and configuration.

The current provider and model creation routes incorrectly use `ai_hub.view` instead of a mutation permission. Assistant/provider/model update routes use `ai_hub.edit`, although the shared permission catalog defines `ai_hub.view`, `ai_hub.create`, and `ai_hub.manage` rather than `ai_hub.edit`. These are authorization inconsistencies that should be corrected as part of this function.

The frontend AI Hub currently provides administration tables and create-provider/create-assistant dialogs, but does not call `aiHubApi.chat`. The API client exposes a minimal `chat` method that accepts only a prompt and optional assistant/model IDs. No completion response is rendered in the AI Hub UI.

## Safety and configuration requirements

The completion path must use only a tenant-selected active provider and model. It must validate that an assistant, when supplied, belongs to the authenticated tenant and resolves to an active tenant model. A directly supplied model ID must be tenant-bound and active. The route must fail explicitly with a safe unavailable/configuration error when no usable provider/model/API key is configured; it must never insert a successful placeholder result.

API keys must remain encrypted at rest and must never appear in API responses, audit metadata, error messages, or frontend state. Outbound provider URLs must be validated against the existing endpoint safety policy, and the request must use bounded input, output, timeout, and response-size limits. Only server-side code may call the configured model endpoint.

AI output is assistive text, not a clinical diagnosis or autonomous order. Clinical AI features remain separate and continue to require their existing clinical permissions and patient-scope checks.

## Proposed completion contract

`POST /api/v1/ai/chat` will accept `assistantId?`, `modelId?`, `prompt`, `source?`, and optional bounded conversation `messages?`. The backend resolves the tenant provider/model, sends an OpenAI-compatible chat-completions request to the configured provider endpoint, records `processing`, then `completed` with response/token/cost/latency evidence or `failed` with a sanitized error code/message. The response returns the request ID, generated text, status, resolved model ID/name, usage, and latency.

Provider configuration remains Settings-driven through the existing AI Hub provider/model records. If a tenant has no active configured model or usable encrypted API key, the route returns a clear `AI_PROVIDER_UNAVAILABLE` result and records a failed request rather than claiming completion.
