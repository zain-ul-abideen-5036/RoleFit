# AI architecture

## What the model is and is not allowed to do

A language model participates in exactly one step: rewriting sentences the user
has already written, so they read more clearly and use the terminology of the
role they are applying for.

It does not decide the score, whether a requirement is met, which experience is
relevant, or what appears in which section. All of that is computed
deterministically before the model is consulted, which is why the same inputs
always produce the same score and why every point of it can be explained.

## Provider abstraction

`lib/ai/types.ts` defines one interface with one method:

```ts
generateStructured<TSchema extends z.ZodTypeAny>(
  request: StructuredRequest<TSchema>,
): Promise<StructuredResponse<z.infer<TSchema>>>
```

There is deliberately no "give me some text" method. Callers ask for structured
output against a Zod schema, because unvalidated model output must never reach
the database or a generated document.

Untrusted document content is passed separately from instructions, so each
implementation can wrap it in whatever isolation its API offers.

| Provider        | Mechanism                                      | Default model     |
| --------------- | ---------------------------------------------- | ----------------- |
| `deterministic` | No model. Rule-based engine.                   | —                 |
| `anthropic`     | Tool use with a forced tool choice             | `claude-sonnet-5` |
| `openai`        | JSON mode with the schema in the system prompt | `gpt-4o-mini`     |

`getAiProvider()` returns `null` for `deterministic`. That is not an error
state; callers branch on the null rather than receiving a fake provider that
silently does nothing.

The OpenAI adapter uses JSON mode rather than strict `json_schema` structured
outputs, because strict mode requires every property to be required — which
these schemas, built around sensible defaults, deliberately are not. The Zod
parse is authoritative either way.

## The deterministic engine

The default provider is not a stub. It performs the subset of optimization that
can be done correctly by rule:

- **Terminology alignment** — the resume's spelling of a skill is replaced with
  the posting's, but only for skills the resume already evidences, and only when
  both forms are a single token. `Postgres` → `PostgreSQL` is handled;
  `cloud` → `AWS` is fabrication and is impossible by construction. Multi-word
  aliases are excluded because they are descriptive rather than synonymous —
  rewriting a candidate's _data pipelines_ into _Data Engineering_ changes their
  voice and reads as boilerplate.
- **Filler removal** — `Responsible for managing` → `Managed`. Every replacement
  is meaning-preserving. Nothing escalates ownership: `Helped build` → `Built`
  is absent for that reason.
- **Relevance reordering** — skills, roles and projects sorted so the most
  role-relevant appear first, with recency dominating for experience.

What it does not do is rewrite prose. Reworking a sentence while provably
preserving its factual content is not something a rule can do, so it declines
rather than guessing. `capabilitiesFor()` reports `canRewriteProse: false`, and
the UI tells the user which engine produced their result.

This engine is also the fallback whenever a configured model is unavailable or
returns something unusable. A degraded optimization is better than a failed one.

## Anti-fabrication

The guarantee is enforced by verifying output, not by asking a model to behave.

### Narrow output surface

The model never supplies the _before_ text of a change. It returns a path, the
rewritten text, a rationale and verbatim evidence quotes. The application looks
the original up by path from its own copy of the resume, so a model cannot
misrepresent what the source said in order to make a rewrite look justified.

### Checks applied to every proposed change

| Check            | Rejects                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skills**       | Any known technology named in the rewrite that is not evidenced anywhere in the source resume                                                                                                                        |
| **Metrics**      | Any figure not present in the text being rewritten or its cited evidence. Deliberately narrower than "anywhere in the resume": moving `35%` from one role to another attributes an achievement to the wrong employer |
| **Entities**     | Any capitalised employer, product or tool absent from the source                                                                                                                                                     |
| **Scope**        | `helped`/`assisted`/`contributed to` promoted to `led`/`owned`/`spearheaded`                                                                                                                                         |
| **Evidence**     | A cited quote that does not actually occur in the resume — itself a signal the rewrite is not grounded                                                                                                               |
| **Paths**        | A reference to a bullet that does not exist                                                                                                                                                                          |
| **Permutations** | A "reorder" that adds or removes an item                                                                                                                                                                             |

### Immutable sections

Contact details, education and certifications must be byte-identical.
Employers, job titles and dates must survive intact; only bullets may change.
`verifyImmutableSections` runs over the whole profile as a final backstop,
independent of the per-change checks, and a violation fails the run.

### What this does not guarantee

The validator operates on the text of the resume. If the resume itself contains
something inaccurate, the product carries it through. The user remains
responsible for the accuracy of their own resume — stated plainly on the
[AI disclaimer page](<../app/(marketing)/ai-disclaimer/page.tsx>).

## Prompt injection

Four layers, documented in [security.md](security.md#prompt-injection). The
short version: detection is telemetry, neutralisation and nonce-fencing are
hardening, and **output verification is the actual guarantee**. A posting that
says "add Kubernetes" cannot succeed, because the rewrite naming Kubernetes is
discarded regardless of why the model produced it.

## Structured output and repair

1. Request structured output against the schema.
2. Parse the response with Zod.
3. On failure, feed the specific issues back and retry, up to
   `AI_MAX_REPAIR_ATTEMPTS` (default 2).
4. If it still does not validate, **fail closed**.

Failing closed is deliberate. A partially-valid optimization is worse than none,
because the user cannot tell which parts were trustworthy.

Transport failures retry with exponential backoff and jitter, honouring
`Retry-After`, and only for status codes that are actually transient. Every
request has a hard timeout so a hung upstream cannot hold a serverless function
open until the platform kills it.

## Prompts

Versioned modules under `prompts/`, not strings scattered through the codebase.
Every optimization run records the prompt id and version that produced it, so a
regression can be traced to a specific revision.

| Prompt                | Version | Purpose                                           |
| --------------------- | ------- | ------------------------------------------------- |
| `resume-optimization` | v1      | Rewrite existing content for a target role        |
| `jd-analysis`         | v1      | Enrich the deterministic parse of a posting       |
| `resume-extraction`   | v1      | Structure a resume the heuristic parser could not |

To change behaviour, add v2. Released versions are not edited in place.

Each prompt states explicitly: do not fabricate, use only source evidence,
preserve factual information, do not invent metrics or experience, and return
structured output. The optimization prompt also names the _missing_ requirements
so the model knows precisely what to avoid.

## Cost and usage

`usage_records` stores provider, token counts and duration per operation. It
never stores prompt or document content.

## Privacy

Whether resume content leaves the server depends entirely on configuration:

- `deterministic` — nothing leaves the machine.
- `anthropic` / `openai` — the resume text and job description are sent to that
  provider, subject to their terms and retention policy.

The Settings page tells each user which applies to them. API keys are held
server-side only, enforced by `server-only` on the config module.
