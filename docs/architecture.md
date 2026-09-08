# Architecture

## The organising principle

The deterministic engine decides; the model only rewrites prose.

Nothing a language model returns influences a score, a match decision, or
whether a requirement counts as met. That ordering is what makes the product's
two central claims defensible: the score is reproducible and explainable, and
the anti-fabrication guarantee does not depend on the model cooperating.

```
upload ──► parse ──► match ──► score ──┐
                                        ├──► propose ──► validate ──► review ──► generate
job description ──► parse ─────────────┘      (model or rules)   (deterministic)
```

`propose` is the only step a model participates in, and its output passes
through the same validation as the rule-based engine's.

## Layers

| Layer         | Location                | Responsibility                                    |
| ------------- | ----------------------- | ------------------------------------------------- |
| Routes        | `app/`                  | HTTP and rendering only. No business logic.       |
| Route wrapper | `server/api/handler.ts` | Auth, CSRF, rate limiting, error sanitization     |
| Services      | `server/services/`      | Orchestration and persistence for one use case    |
| Repositories  | `server/repositories/`  | Data access, every query scoped by user           |
| Domain        | `lib/`                  | Pure logic: parsing, matching, scoring, documents |
| Schemas       | `lib/domain/schemas.ts` | Zod definitions; types are inferred from them     |

The dependency direction is strictly downward. `lib/` imports nothing from
`server/` or `app/`, which is what allows the entire engine to be unit-tested
with no database, network or framework.

## Request flow

A representative write path, `POST /api/optimizations`:

1. `route()` applies the origin check, resolves the session (verifying the token
   _and_ its epoch against the database), and consumes a rate-limit token.
2. The body is parsed with Zod. Failures become field errors the form renders
   inline.
3. `runOptimization` loads the analysis, resume and job description — each
   through a repository function that takes `userId`, so another account's row
   simply does not exist.
4. A run row is written _before_ the work starts, and marked `failed` if it
   throws. An interrupted run is visible in history rather than absent.
5. `optimizeResume` calls the model if one is configured, falling back to the
   rule-based engine on any failure.
6. `validateAndApplyProposal` checks every change against the source resume and
   discards what it cannot support.
7. `verifyImmutableSections` is a final backstop over the whole profile.
8. Change records are written, one row per proposed change.
9. Any thrown value becomes an `AppError`; only its user-facing message crosses
   the network. The real error is logged under an incident id.

## Why these boundaries

**Repositories take `userId`, always.** There is no `findResumeById`. IDOR is
prevented by the shape of the API rather than by a check each caller must
remember. A row belonging to someone else reports 404, never 403 — a 403 would
confirm the id exists.

**The route wrapper owns the cross-cutting concerns.** Authentication, CSRF and
rate limiting live in one file. A route cannot forget them, because they are the
wrapper rather than the route body.

**One layout model for three renderers.** `lib/documents/layout.ts` produces a
flat block list that the PDF renderer, the DOCX renderer and the on-screen
preview all consume. Section order and headings are decided once, so the preview
cannot drift from the downloaded file. The model has no table, column or image
block, so an ATS-hostile layout is not expressible.

**Zod schemas are the source of truth.** Types are inferred from them. The same
definition validates an HTTP body, a model response and a database column, so
the three cannot disagree.

## The engine

### Normalization (`lib/matching/normalize.ts`)

Folds case, accents and typographic punctuation, and rewrites punctuated
technology names to slugs so `C++` does not degrade to `c` and `.NET` does not
vanish. It never stems: aggressive stemming is what makes naive matchers claim
`Java` satisfies `JavaScript`.

Matching is on token boundaries. For the hot loop both sides are pre-tokenized
into padded strings, turning each comparison into a native substring search that
still respects boundaries — `" java "` is not found inside `" javascript "`.

### Aliases (`lib/matching/aliases.ts`)

Three distinct relationships:

- **aliases** — the same skill by another name. Full credit both ways.
- **implies** — directional. PostgreSQL evidences SQL; SQL does not evidence
  PostgreSQL. Expanded transitively (Next.js → React → JavaScript).
- **related** — adjacent. Partial credit only, never enough to satisfy.

Cloud providers are deliberately unrelated to one another. AWS experience is not
GCP experience.

### How a match reports itself (`lib/matching/matcher.ts`)

Every match carries a `method` saying how it was established. All five are
lexical:

| `method`     | Established by                                         | Ceiling               |
| ------------ | ------------------------------------------------------ | --------------------- |
| `exact`      | The requirement's own token appears                    | full credit           |
| `alias`      | A known equivalent appears (`k8s` → Kubernetes)        | full credit           |
| `normalized` | An implication evidences it (PostgreSQL → SQL)         | full credit           |
| `related`    | An adjacent skill (Redis → NoSQL)                      | partial, never strong |
| `fuzzy`      | Token overlap against free text with no canonical form | scaled by overlap     |

**There is deliberately no semantic or embedding-based method.** A match must
cite the exact span that supports it, because the anti-fabrication validator
checks quoted evidence against the source. An embedding score is neither
reproducible across model versions nor quotable back to the user, so it cannot
replace this path — only supplement it, clearly labelled and with a confidence
floor. See [issue #17](https://github.com/zain-ul-abideen-5036/RoleFit/issues/17).

`related` and `fuzzy` were once both reported as `semantic`, which wrongly
implied a model participates in matching.

### Evidence index (`lib/matching/evidence.ts`)

Flattens a resume into addressable spans with a section weight. A skill listed
in a Skills section is a claim; the same skill demonstrated in an experience
bullet is proof, and weighted higher. This is what stops a keyword-stuffed
skills block from dominating the score.

### Scoring (`lib/matching/scoring.ts`)

Seven dimensions with fixed weights summing to 1. Required requirements carry
more weight than preferred ones, and partial evidence earns partial credit.

## Serverless considerations

The application is built to deploy to Vercel:

- No process-level state is required between requests. The database pool and AI
  client are memoised on `globalThis` so a warm instance reuses them, but a cold
  start is correct.
- Uploads are capped at 4.5 MB, matching the serverless request body limit.
- Long routes declare `maxDuration`.
- Optimization runs synchronously today, but the run row exists in
  `queued`/`running` state first. Moving the processing step to a queue worker
  is a change to one service, not to the API contract or the client.
- `RATE_LIMIT_DRIVER=memory` is per-instance and documented as unsuitable for a
  scaled deployment; `upstash` uses shared Redis.
- `STORAGE_DRIVER=local` is rejected outright on a serverless platform, since
  the filesystem does not persist between invocations.

## Error handling

`AppError` carries a user-facing `message`, a machine `code`, an HTTP `status`,
optional `fieldErrors`, and a server-only `context` and `cause`. Only
`toPublicJSON()` crosses the network. An unrecognised thrown value becomes a
generic `INTERNAL` with an incident id that correlates with the server log — a
parser stack trace never reaches a user.

## Logging

`lib/logger.ts` is the only thing that writes to stdout, and it redacts by key
at every depth: passwords, tokens, API keys, resume text, job descriptions,
contact details. Free text over 120 characters is replaced by a length summary
rather than truncated, because a truncated resume is still personal data.
