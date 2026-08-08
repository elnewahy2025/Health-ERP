# AI Instructions — Vision Healthcare ERP

**Version:** 1.0 | **Status:** Approved | **Modules:** `ai-hub`, `ai-intelligence`, `automation`, `workflow`, `bi`

---

## 1. AI System Architecture

```
Frontend (Clinical AI pages) → Backend AI modules
  ├─ ai-hub: orchestrates provider-agnostic requests
  ├─ ai-intelligence: domain logic (notes, diagnoses, predictions, smart scheduling)
  ├─ ai_providers / ai_models (config tables) → provider adapter
  ├─ ai_cost_logs / ai_requests (usage + cost accounting)
  └─ Fallback: rule-based deterministic output when provider unavailable (AI_PROVIDER=none)
```

## 2. Capabilities

| Capability | Input | Output | Storage |
|---|---|---|---|
| Clinical note drafting | encounter data | draft SOAP note | `ai_clinical_notes` |
| Diagnosis suggestions | symptoms/vitals/history | ranked ICD-10 suggestions | `ai_diagnosis_suggestions` |
| Risk scoring | patient history | risk score + factors | `patient_risk_scores` |
| Smart scheduling | demand + availability | optimal slot suggestions | `ai_smart_schedules` |
| Predictions | aggregate data | trend predictions | `ai_predictions` |

## 3. Model Selection Rationale

- **Default:** no provider configured (`AI_PROVIDER=none`) → deterministic fallbacks.
- **Provider abstraction** allows swapping models without code changes (config tables).
- **Selection criteria:** clinical accuracy, latency < 5 s for interactive suggestions,
  cost per request (logged), data residency (Egypt-friendly providers preferred).
- **Prompt models** should prefer instruction-tuned models with strong Arabic support for notes.

## 4. Prompt Engineering Guidelines

- System prompts include: role (clinical assistant, not physician), required output schema, uncertainty guidance.
- Keep prompts versioned in code (not DB) for review; include locale (AR/EN) instructions.
- Never instruct the model to produce a diagnosis as fact — always "suggestions" with confidence.
- Structure output as JSON against Zod schema; on parse failure → fallback (never crash the request).

## 5. Context Management

- Context window budget: patient summary (recent encounters, allergies, meds, vitals) — bounded token limit.
- Never include full raw EMR dumps; use structured summaries.
- PII minimization: strip NID/contact info from prompts unless strictly required; prefer anonymized tokens.

## 6. Guardrails

| Guardrail | Enforcement |
|---|---|
| No autonomous treatment decisions | Suggestions require clinician confirmation (UI + audit) |
| No PII in prompts (minimized) | Pipeline strips sensitive fields before provider call |
| Output schema validation | Zod parse; retry once, then fallback |
| Rate & cost caps | `ai_cost_logs`, per-tenant limits |
| Provider outage | Fallback chain; error surfaced, never blocks care |
| Provenance | Every suggestion linked to source encounter + model + prompt version |

## 7. Hallucination Prevention

- Constrain outputs to closed sets where possible (ICD-10 codes from DB catalog).
- Require confidence + source citations for suggestions.
- Clinician-facing "AI-generated" labels; edit/confirm before saving to EMR.
- Feedback loop: rejection/acceptance logged for future evaluation.

## 8. Fallback Strategy

1. Provider call fails / times out → retry once with backoff.
2. Still failing → deterministic rule-based output (flag as `fallback: true`).
3. API returns invalid schema → same deterministic path.
4. `AI_PROVIDER=none` → always deterministic; feature UI shows "AI unavailable".

## 9. Evaluation Metrics

- Suggestion acceptance rate; edit distance between draft and final clinical notes.
- Diagnosis suggestion precision@5 vs confirmed diagnoses.
- Latency p95; cost per suggestion; fallback rate; provider error rate.

## 10. Cost Optimization

- Cache repeated deterministic lookups; batch where possible.
- Model tiering: cheap model for drafts, premium for diagnosis suggestions.
- Per-tenant budgets via `usage_records` + `ai_cost_logs`; alert on spikes.

## 11. Safety Rules

- AI output is **never** the sole basis for treatment; clinician signs off.
- Emergency/critical alerts must not rely on AI.
- All AI features auditable: actor, tenant, prompt version, model, cost, accepted/rejected.

---

*Related: [AI modules](../modules/ai-hub.md) · [Security](../engineering/SECURITY.md) · [Risk register](../project-management/RISK-REGISTER.md)*
