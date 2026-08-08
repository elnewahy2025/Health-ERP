# Execution Rules — Vision Healthcare ERP (for AI Agents)

**Purpose:** Rules AI agents must follow when working in this repository.

---

## 1. Before Writing Code

1. Read `docs/ai/PROJECT-CONTEXT.md` and `docs/ai/READING-MAP.md` first.
2. Check `docs/core/CHECKPOINT.md` for current phase/blockers.
3. For changes affecting decisions, read `docs/core/DECISIONS.md` to avoid contradicting prior ADRs.
4. Prefer small, focused changes; match existing patterns (read the relevant module doc + code).

## 2. During Implementation

| Rule | Detail |
|---|---|
| Build order | After changing `packages/shared`, rebuild it before backend/frontend (`npm run build`) |
| No `any` | Strict TS; derive types from shared domain types |
| Validation | Zod at route boundary; reuse shared validators |
| Security | RBAC guard + tenant scoping on new endpoints; audit writes; encrypt sensitive fields; rate-limit auth endpoints |
| i18n | New UI strings → EN + AR keys; no hardcoded text |
| Tests | Add/adjust tests; run `npm run build` + `npm test` before finishing |
| No generated caches | Never create/commit `.tsbuildinfo`, `dist/`, `.env*` |

## 3. Prohibitions

- Do NOT edit applied migrations — create a new numbered migration.
- Do NOT remove RLS or tenant scoping to make something "simpler".
- Do NOT use `Math.random()` for security-sensitive logic.
- Do NOT log tokens, passwords, or NID values.
- Do NOT introduce a new path alias for `@healthcare/shared` — workspace exports map is the mechanism.
- Do NOT skip documentation updates (module docs, CHECKPOINT, DECISIONS) for completed work.

## 4. After Implementation

1. `npm run build` — zero type errors across all packages.
2. `npm test` — all tests pass.
3. Update the relevant module doc in `docs/modules/`.
4. If a decision changed → append ADR to `docs/core/DECISIONS.md`.
5. Update `docs/core/CHECKPOINT.md` (completed work, pending, known issues).

## 5. Handling Ambiguity

- If requirements are missing, make a reasonable engineering assumption, document it in
  the relevant doc, and record it in DECISIONS.md — do not leave TODOs.
- If a change contradicts an existing document, update the document in the same change.

## 6. Definition of Done (agent version)

- [ ] Code matches module conventions (STYLEGUIDE.md)
- [ ] Build + tests pass
- [ ] i18n EN+AR keys added
- [ ] Security checklist satisfied (guards, RLS, audit, encryption, redaction)
- [ ] Docs updated (module doc, DECISIONS if needed, CHECKPOINT)

---

*Related: [Phase checkpoints](PHASE-CHECKPOINTS.md) · [Styleguide](../engineering/STYLEGUIDE.md)*
