<div align="center">

<img src="public/brand/mark.svg" width="56" alt="" />

# RoleFit

**Tailor Your Resume. Match the Role. Get Hired.**

AI-powered, job-specific resume optimization that rewrites the experience you
already have — and refuses to invent the experience you don't.

[Architecture](docs/architecture.md) ·
[Security](docs/security.md) ·
[AI](docs/ai.md) ·
[Database](docs/database.md) ·
[Deployment](docs/deployment.md) ·
[Testing](docs/testing.md) ·
[Product](docs/product.md)

</div>

---

## What it does

You give RoleFit an existing resume and a job description. It:

1. Parses the resume (PDF or DOCX) into structured, addressable sections.
2. Extracts the posting's requirements, separating required from preferred.
3. Matches each requirement against evidence in your resume, deterministically.
4. Reports what you genuinely match — and what you don't.
5. Proposes rewrites of your own content, each with the original alongside it
   and the source text that justifies it.
6. Generates an ATS-friendly PDF and DOCX, verified after generation by reading
   the text back out.

## The part that matters

Most AI resume tools add whatever the posting asks for. RoleFit will not, and
it is built so that it cannot.

Every proposed rewrite is checked against your source document before you ever
see it. A rewrite that introduces a skill, employer, degree, certification,
date, metric, achievement, or a greater degree of ownership than your resume
states is **discarded automatically**. Requirements you cannot evidence are
reported as gaps instead.

This does not depend on the model cooperating. Prompts ask; the validator
verifies:

| Check              | What it rejects                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Skills             | A technology not evidenced anywhere in the source resume                                                           |
| Metrics            | A figure absent from the text being rewritten — `improved performance` never becomes `improved performance by 40%` |
| Entities           | An employer, product or tool that does not appear in the resume                                                    |
| Scope              | `helped migrate` promoted to `led the migration`                                                                   |
| Evidence           | A quote the model cited that does not actually occur in the resume                                                 |
| Immutable sections | Any change to employers, titles, dates, education or certifications                                                |

Forty adversarial unit tests feed the validator output a cooperative model
would never produce. See [`lib/optimization/anti-fabrication.ts`](lib/optimization/anti-fabrication.ts).

## ATS Readiness Score

Seven weighted dimensions, computed deterministically. No model decides the
number, so it is reproducible and every point is attributable to something the
user can change.

| Dimension                | Weight |
| ------------------------ | ------ |
| Skill alignment          | 25%    |
| Keyword alignment        | 20%    |
| Responsibility alignment | 15%    |
| Resume structure         | 12%    |
| Relevance to the role    | 10%    |
| Formatting compatibility | 10%    |
| Section completeness     | 8%     |

> This score estimates compatibility using common ATS-friendly formatting and
> job-description alignment practices. Different employers and ATS systems may
> score resumes differently.

No ATS vendor publishes its algorithm. RoleFit does not claim to reproduce one,
and never presents the score without that caveat.

## Features

- **Resume parsing** — PDF and DOCX, with layout signals (columns, tables, text
  boxes, embedded images) that the ATS checks depend on and that are lost once
  a document is flattened to text.
- **Job description analysis** — requirements, responsibilities, qualifications,
  certifications, years of experience and keywords, with benefits and
  boilerplate excluded.
- **Deterministic matching** — token-boundary matching so `Java` can never
  satisfy a `JavaScript` requirement, a skill alias dictionary that separates
  equivalence from one-directional implication (PostgreSQL evidences SQL, not
  the reverse), and adjacency that earns only partial credit.
- **Change-by-change review** — accept, edit or reject each rewrite. Nothing you
  have not accepted reaches the document, and every decision is reversible.
- **Document generation** — single-column PDF and DOCX from one shared layout
  model, so the two exports and the on-screen preview cannot drift apart.
- **Privacy** — resume text is never written to application logs. Account
  deletion removes every record and every stored file.
- **Version history** — your original upload is kept untouched as version 1.

## Tech stack

| Layer      | Choice                                     | Why                                                                       |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Framework  | Next.js 15 (App Router), React 19          | Server components keep resume content off the client                      |
| Language   | TypeScript, strict                         | `noUncheckedIndexedAccess` and no `any`                                   |
| Styling    | Tailwind CSS v4                            | CSS-first design tokens; light/dark is a token swap                       |
| Database   | PostgreSQL + Drizzle ORM                   | Typed SQL without a query-engine binary                                   |
| Validation | Zod                                        | One schema is both the runtime guard and the type                         |
| Auth       | bcrypt + `jose` JWT sessions               | No third-party identity dependency                                        |
| Documents  | `pdf-lib`, `docx`, `pdfjs-dist`, `mammoth` | Real typeset text, never a rasterised page                                |
| Storage    | S3-compatible, or local for development    | Server-generated keys only                                                |
| Testing    | Vitest, Playwright                         | Unit, integration against real PostgreSQL, E2E against a production build |

## Quick start

Requires Node 20+, npm, and Docker (for PostgreSQL).

```bash
git clone https://github.com/zain-ul-abideen-5036/RoleFit.git
cd RoleFit
npm install

cp .env.example .env.local
# Generate a secret and paste it into AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm run db:up        # PostgreSQL on localhost:5433
npm run db:migrate
npm run dev          # http://localhost:3000
```

RoleFit runs fully without an AI provider. The default `deterministic` engine
performs terminology alignment, filler removal and relevance reordering locally,
with no network calls and no data leaving the machine. The app tells the user
which engine produced their result.

To enable sentence-level rewriting, set `AI_PROVIDER=anthropic` (or `openai`)
and `AI_API_KEY` in `.env.local`.

## Environment

Every variable is documented in [`.env.example`](.env.example). The essentials:

| Variable            | Required        | Notes                                                        |
| ------------------- | --------------- | ------------------------------------------------------------ |
| `DATABASE_URL`      | yes             | PostgreSQL connection string                                 |
| `AUTH_SECRET`       | yes             | 32+ random bytes; signs session JWTs                         |
| `AI_PROVIDER`       | no              | `deterministic` (default), `anthropic`, `openai`             |
| `AI_API_KEY`        | if provider set | Server-side only, never exposed to the browser               |
| `STORAGE_DRIVER`    | no              | `local` (default) or `s3`; must be `s3` on serverless        |
| `RATE_LIMIT_DRIVER` | no              | `memory` (default) or `upstash`; use `upstash` in production |

Configuration is validated at startup and fails with every invalid key listed
at once, rather than erroring deep inside a request handler.

## Scripts

| Command                     | What it does                                |
| --------------------------- | ------------------------------------------- |
| `npm run dev`               | Development server                          |
| `npm run build`             | Production build                            |
| `npm run verify`            | Format, lint, typecheck and unit tests      |
| `npm test`                  | Unit tests                                  |
| `npm run test:integration`  | Integration tests (needs PostgreSQL)        |
| `npm run test:e2e`          | End-to-end tests against a production build |
| `npm run test:coverage`     | Unit tests with coverage                    |
| `npm run db:up` / `db:down` | Start / stop PostgreSQL                     |
| `npm run db:migrate`        | Apply migrations                            |
| `npm run db:generate`       | Generate a migration from schema changes    |

## Testing

| Suite       | Count | Runs against                                  |
| ----------- | ----- | --------------------------------------------- |
| Unit        | 114   | Pure functions; no database, network or model |
| Integration | 27    | A real PostgreSQL instance                    |
| End-to-end  | 12    | A production build in Chromium                |

The suites are weighted towards the guarantees that matter: 40 unit tests
attack the anti-fabrication validator, 9 integration tests and 4 E2E tests
attempt cross-account access, the PDF renderer is verified geometrically —
margins, line overlap, hard-wrapping and pagination asserted from the real glyph
positions in the output file — and axe runs against every page in both themes
with zero violations.

See [docs/testing.md](docs/testing.md).

## Project structure

```
app/                    Routes: (marketing), (auth), (app), api
components/             ui/ primitives, app/, marketing/, brand/, theme/
lib/
  ai/                   Provider interface, adapters, prompt-injection defense
  ats/                  ATS readiness checks
  documents/            Shared layout model, PDF, DOCX, encoding, validation
  domain/               Zod schemas — the single source of truth for types
  matching/             Normalization, aliases, evidence index, matcher, scoring
  optimization/         Anti-fabrication, change application, pipeline
  parsing/              File validation, PDF, DOCX, resume, job description
  security/             Password, session, CSRF, rate limiting
  storage/              Object storage drivers
prompts/                Versioned prompts, recorded on every run
server/                 db/, auth/, repositories/, services/, api/
db/                     Drizzle schema and migrations
tests/                  unit/, integration/, e2e/, fixtures/
docs/                   Architecture, security, AI, database, deployment, testing
```

## Contributing

1. Branch from `main`: `feature/<what-it-does>`.
2. Conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).
3. `npm run verify` must pass before you open a PR.
4. CI runs formatting, lint, types, unit, integration, build and E2E behind a
   single required status check.
5. Any change touching the optimizer needs a test proving it cannot fabricate.

## Licence

MIT — see [LICENSE](LICENSE).

Built by **Zain Ul Abideen**.
