# Function 9 AI Chat Completion Design

**Design date:** 20 August 2026

## Objective

Replace the current AI Hub logging stub with a real, tenant-safe chat-completion workflow. The implementation will use the existing tenant-scoped `ai_providers`, `ai_models`, and `ai_assistants` configuration records, call only a server-side configured OpenAI-compatible gateway, and persist truthful request state and usage evidence.

## Provider gateway contract

The configured AI provider stores an administrator-entered endpoint and an encrypted API key. The backend normalizes the endpoint to the configured chat-completions path, validates the URL using the existing outbound endpoint policy, and sends a bounded JSON request with the selected model, assistant system prompt, and user prompt. The endpoint must be configured by the tenant; no platform-wide provider URL or model ID is inserted into clinic data.

The response parser accepts an OpenAI-compatible `choices[0].message.content` result and optional `usage.prompt_tokens`, `usage.completion_tokens`, and `usage.total_tokens` values. A provider response without nonempty assistant content is treated as a failed completion. Upstream errors, timeouts, malformed responses, and oversized responses are normalized to safe internal error codes; the provider key, raw authorization header, full upstream body, and prompt content are never placed in the error message or audit metadata.

## Request resolution

The request may identify an assistant, a model, or both. An assistant is loaded with `tenant_id = authenticatedTenantId` and must be active. If selected, its model is authoritative unless the request’s model ID matches that assistant’s model. A directly selected model must belong to the authenticated tenant, be active, have the `chat` or `multimodal` capability, and reference an active tenant provider. The provider must be active and contain a nonempty encrypted API key and endpoint. Missing or invalid configuration causes a failed durable request and an explicit `AI_PROVIDER_UNAVAILABLE` response; no successful placeholder is returned.

A model’s persisted cost rates are used to calculate the local request estimate from provider-reported or bounded fallback token counts. The implementation does not invent a model price, currency, clinic budget, or provider default. Provider-specific metadata remains in tenant configuration.

## Durable lifecycle and replay

The route creates an `ai_requests` row with `status = processing` before the outbound call. It updates the same row to `completed` only after a nonempty response is parsed and usage/cost/latency are persisted. Configuration failures and provider failures update the row to `failed` with safe error metadata. The legacy table’s default `completed` behavior is corrected by migration 070 to `pending`, while the route explicitly supplies the initial processing state.

An optional request idempotency key is accepted and stored in a new tenant-scoped unique column. A repeated key returns the existing completed or failed request without calling the provider a second time; an existing processing request returns its current state and does not create a duplicate call. The prompt and generated response remain tenant-owned through all reads and writes.

## Authorization and audit

Chat completion remains protected by `ai_hub.create`. Provider, model, and assistant creation use `ai_hub.create`; configuration updates use `ai_hub.manage`; read-only lists remain `ai_hub.view`. The existing invalid `ai_hub.edit` guards are normalized to the shared catalog’s `manage` permission. Every attempt writes an audit event with tenant, actor, request ID, resolved model ID, source, status, and safe error code only.

The feature is assistive text generation. It does not grant access to patient records, does not retrieve clinical data automatically, and does not mark content as a diagnosis, order, prescription, or clinical approval. Clinical AI routes retain their separate permissions and patient-scope enforcement.

## Frontend behavior

The AI Hub receives the dynamic assistant and model lists, lets the user choose an active assistant/model, submits a prompt and generated idempotency key, and renders the returned assistant text with the existing safe text/markdown presentation pattern. It shows loading, completed, failed, and unavailable states. If the tenant has no usable configuration, the page explains that an administrator must configure an active provider, encrypted API key, endpoint, and chat-capable model in AI Hub; it does not show a fabricated response.

## Validation scope

Focused tests will cover successful mocked completion, tenant isolation for assistants/models/providers, no-key/unconfigured failure, upstream failure persistence, idempotent replay, invalid permission boundaries, and response redaction. Full backend/frontend tests, type checks, production build, `git diff --check`, and the dedicated PostgreSQL integration suite will run before Function 9 is committed or pushed.
