# RoleFit — Technical Documentation

Engineering detail for RoleFit: how it is put together, how to run it, every
environment variable, and what the test suites actually prove.

For the product itself — what it does and what it looks like — see the
[README](README.md).

| Section                                                           | What is in it                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------ |
| [Getting started](#getting-started)                               | Clone, configure, migrate, run                         |
| [Environment variables](#environment-variables)                   | Every key, its default and when it is required         |
| [Architecture](#architecture)                                     | Layers, dependency direction, request flow             |
| [The anti-fabrication guarantee](#the-anti-fabrication-guarantee) | What the validator rejects, and why it is not a prompt |
| [ATS readiness score](#ats-readiness-score)                       | The seven dimensions and their weights                 |
| [Technology stack](#technology-stack)                             | Each dependency and the job it does                    |
| [Database](#database)                                             | Schema, migrations, local PostgreSQL                   |
| [Scripts](#scripts)                                               | Every npm script                                       |
| [Testing](#testing)                                               | Four suites, what each one owns                        |
| [Deployment](#deployment)                                         | The intended production topology                       |
| [Security](#security)                                             | Authorization, sessions, uploads, prompt injection     |
| [Project structure](#project-structure)                           | Where things live                                      |
| [Contributing](#contributing)                                     | Branches, commits, required checks                     |

---

## Getting started

Requires Node 20 or newer, npm, and Docker for PostgreSQL.

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

Create an account at `/signup` and upload a resume. There is no seeded demo
account: the app is empty until you put something in it.

RoleFit runs fully without an AI provider. The default `deterministic` engine
performs terminology alignment, filler removal and relevance reordering
locally, with no network calls and no data leaving the machine. The app tells
the user which engine produced their result, and the review screen says so
explicitly.

To enable sentence-level rewriting, set `AI_PROVIDER=anthropic` (or `openai`)
and `AI_API_KEY` in `.env.local`. The key is read server-side only and is never
sent to the browser.

## Environment variables

Every variable is documented in [`.env.example`](.env.example). The essentials:

| Variable              | Required        | Notes                                                           |
| --------------------- | --------------- | --------------------------------------------------------------- |
| `DATABASE_URL`        | yes             | PostgreSQL connection string                                    |
| `AUTH_SECRET`         | yes             | 32+ random bytes; signs session JWTs                            |
| `AI_PROVIDER`         | no              | `deterministic` (default), `anthropic`, `openai`                |
| `AI_API_KEY`          | if provider set | Server-side only, never exposed to the browser                  |
| `STORAGE_DRIVER`      | no              | `local` (default) or `s3`; must be `s3` on serverless           |
| `STORAGE_REGION`      | if `s3`         | No default — it signs the request, so a wrong value fails late  |
| `STORAGE_BUCKET`      | if `s3`         | No default — B2 bucket names are globally unique                |
| `RATE_LIMIT_DRIVER`   | no              | `memory` (default) or `upstash`; use `upstash` in production    |
| `EMAIL_PROVIDER`      | no              | `none` (default), `console`, `resend`; `none` disables recovery |
| `QUEUE_DRIVER`        | no              | `inline` (default) or `database` with a worker process          |
| `EMBEDDINGS_PROVIDER` | no              | `none` (default) or `openai`; advisory gap hints only           |

Configuration is validated at startup and fails with every invalid key listed
at once, rather than erroring deep inside a request handler. Settings that are
legal but wrong for production — a local storage driver, an in-memory rate
limiter — are reported as warnings on boot rather than passing silently.

## Architecture

The dependency direction is strictly downward. `lib/` imports nothing from
`server/` or `app/`, which is what allows the entire engine to be unit-tested
with no database, network or framework.

| Layer         | Location                | Responsibility                                    |
| ------------- | ----------------------- | ------------------------------------------------- |
| Routes        | `app/`                  | HTTP and rendering only. No business logic.       |
| Route wrapper | `server/api/handler.ts` | Auth, CSRF, rate limiting, error sanitization     |
| Services      | `server/services/`      | Orchestration and persistence for one use case    |
| Repositories  | `server/repositories/`  | Data access, every query scoped by user           |
| Domain        | `lib/`                  | Pure logic: parsing, matching, scoring, documents |
| Schemas       | `lib/domain/schemas.ts` | Zod definitions; types are inferred from them     |

A representative write path, `POST /api/optimizations`:

1. `route()` applies the origin check, resolves the session — verifying the
   token _and_ its epoch against the database — and consumes a rate-limit token.
2. The body is parsed with Zod. Failures become field errors the form renders
   inline.
3. `runOptimization` loads the analysis, resume and job description, each
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

Full detail, including the matching engine and background work:
[`docs/architecture.md`](docs/architecture.md).

## The anti-fabrication guarantee

Most AI resume tools add whatever the posting asks for. RoleFit will not, and
it is built so that it cannot.

Every proposed rewrite is checked against the source document before the user
ever sees it. A rewrite that introduces a skill, employer, degree,
certification, date, metric, achievement, or a greater degree of ownership than
the resume states is **discarded automatically**. Requirements the resume
cannot evidence are reported as gaps instead.

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

27 adversarial unit tests feed the validator output a cooperative model would
never produce. See
[`lib/optimization/anti-fabrication.ts`](lib/optimization/anti-fabrication.ts)
and [`tests/unit/anti-fabrication.test.ts`](tests/unit/anti-fabrication.test.ts).

## ATS readiness score

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
and never presents the score without that caveat — on the analysis page, the
dashboard, the review screen and in history.

Matching is deliberately strict. Token-boundary matching means `Java` can never
satisfy a `JavaScript` requirement; a skill alias dictionary separates
equivalence from one-directional implication, so PostgreSQL evidences SQL but
not the reverse; and adjacency earns only partial credit, reported as partial
rather than counted as a match.

## Technology stack

| Layer      | Choice                                     | Why                                                                       |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Framework  | Next.js 15 (App Router), React 19          | Server components keep resume content off the client                      |
| Language   | TypeScript, strict                         | `noUncheckedIndexedAccess` and no `any`                                   |
| Styling    | Tailwind CSS v4                            | CSS-first design tokens; light/dark is a token swap                       |
| Database   | PostgreSQL 16 + Drizzle ORM                | Typed SQL without a query-engine binary                                   |
| Validation | Zod                                        | One schema is both the runtime guard and the type                         |
| Auth       | bcrypt + `jose` JWT sessions               | No third-party identity dependency                                        |
| Documents  | `pdf-lib`, `docx`, `pdfjs-dist`, `mammoth` | Real typeset text, never a rasterised page                                |
| UI         | Radix primitives, Lucide, Framer Motion    | Accessible behaviour; the styling is the project's own                    |
| Storage    | S3-compatible, or local for development    | Server-generated keys only                                                |
| Testing    | Vitest, Playwright, axe-core               | Unit, integration against real PostgreSQL, E2E against a production build |

Also in use without a section of their own: `class-variance-authority`, `clsx`
and `tailwind-merge` for styling ergonomics, `jszip` for DOCX inspection in
tests, `tsx` for the maintenance scripts, and the AWS S3 client for the
object-storage driver.

## Database

PostgreSQL 16, accessed through Drizzle ORM and the `postgres` driver. The
schema and its migrations live in [`db/`](db/); migrations are generated from
schema changes rather than written by hand.

```bash
npm run db:up        # start PostgreSQL in Docker on port 5433
npm run db:migrate   # apply migrations
npm run db:generate  # generate a migration from a schema change
npm run db:down      # stop it
```

Every repository function takes a `userId` and scopes its query by it, so a
record belonging to another account does not match rather than being found and
then refused. Account deletion cascades across every table and removes stored
files.

Detail: [`docs/database.md`](docs/database.md).

## Scripts

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `npm run dev`               | Development server                                       |
| `npm run build`             | Production build                                         |
| `npm start`                 | Serve the production build                               |
| `npm run verify`            | Format, lint, typecheck and unit tests                   |
| `npm test`                  | Unit and component tests                                 |
| `npm run test:integration`  | Integration tests (needs PostgreSQL)                     |
| `npm run test:e2e`          | End-to-end tests against a production build              |
| `npm run test:coverage`     | Unit tests with coverage                                 |
| `npm run db:up` / `db:down` | Start / stop PostgreSQL                                  |
| `npm run db:migrate`        | Apply migrations                                         |
| `npm run db:generate`       | Generate a migration from schema changes                 |
| `npm run worker`            | Background job worker (needs `QUEUE_DRIVER=database`)    |
| `npm run deploy:init`       | Write `.env.production.local` with a fresh `AUTH_SECRET` |
| `npm run deploy:migrate`    | Apply migrations to the production database              |
| `npm run deploy:preflight`  | Verify every credential against the real services        |

## Testing

| Suite       | Tests | Files | Runs against                                  |
| ----------- | ----- | ----- | --------------------------------------------- |
| Unit        | 763   | 32    | Pure functions; no database, network or model |
| Component   | 120   | 6     | React components in jsdom                     |
| Integration | 72    | 3     | A real PostgreSQL instance                    |
| End-to-end  | 48    | 4     | A production build in Chromium                |

The suites are weighted towards the guarantees that matter rather than towards
the percentage:

- **27 unit tests** attack the anti-fabrication validator with output a
  cooperative model would never produce.
- **9 integration and 4 E2E tests** attempt cross-account access, against every
  identifier the product exposes. The API must answer 404, never 403 — a 403
  confirms the id exists.
- **17 integration tests** cover the job queue, including that two workers
  never claim the same job.
- The browser suite compares the password-reset response for a known and an
  unknown address byte for byte.
- The PDF renderer is verified geometrically, with margins, line overlap,
  hard-wrapping and pagination asserted from the real glyph positions in the
  output file.
- **axe-core** runs against every page in both themes, with zero violations.

Coverage is **95.2% statements** and **85.8% branches** over the domain logic
the unit suite owns. Coverage is deliberately scoped to `lib/`: everything
excluded is covered by the integration suite against a real database, or by
Playwright against a production build, and including it would report those
modules as 0% and force the threshold down to a number that means nothing.

Every defect the suites caught is listed in
[`docs/testing.md`](docs/testing.md).

## Deployment

Deployed at **[rolefit-topaz.vercel.app](https://rolefit-topaz.vercel.app)**.
`GET /api/health` reports the configuration, the resolved drivers and database
reachability, and is the quickest way to see how an instance is set up.

The intended topology, on four services that each have a free tier and none of
which requires a payment card to sign up:

| Component        | Service                      | Holds                                       |
| ---------------- | ---------------------------- | ------------------------------------------- |
| Application      | Vercel                       | The Next.js app                             |
| Database         | Neon (PostgreSQL)            | Accounts, resumes, analyses, change history |
| Document storage | Backblaze B2 (S3-compatible) | Uploaded resumes, generated PDF and DOCX    |
| Rate limiting    | Upstash (Redis)              | Counters shared across instances            |

The live instance currently runs the application, the database and S3-compatible
storage, with two deliberate deviations from the table above: the AI provider is
`deterministic`, so it analyses and reorders but does not rewrite prose; and
`RATE_LIMIT_DRIVER` is still `memory`, which means limits are per-instance and
will not hold across a horizontally scaled deployment. The app reports both as
configuration warnings on boot rather than letting them pass silently.

The storage layer is a generic S3 driver, so AWS S3, Cloudflare R2 and MinIO
work through the same variables. `npm run deploy:preflight` verifies every
credential against the real services before a deploy is attempted.

[`docs/deployment.md`](docs/deployment.md) is a step-by-step walkthrough.

## Security

- **Authorization by construction.** Every query is scoped by user id. Reads of
  another account's records return 404, not 403.
- **Sessions.** bcrypt password hashing and signed JWT sessions via `jose`.
  Sessions carry an epoch that is verified against the database, so completing
  a password reset invalidates every existing session.
- **Account enumeration.** No path reveals whether an address has an account —
  signup, sign-in and password reset all answer identically.
- **CSRF.** State-changing requests require a same-origin header. A request
  with neither `Origin` nor `Referer` is refused before any ownership check.
- **Uploads.** Files are validated by content, not by extension, with size and
  type limits enforced server-side.
- **Prompt injection.** Job-description text is treated as untrusted input, and
  the anti-fabrication validator runs on model output regardless of what the
  model was told.
- **Privacy.** Resume text is never written to application logs. Account
  deletion removes every record and every stored file.
- **Secrets.** AI API keys exist server-side only and are never exposed to
  browser JavaScript.

Threat model, known limitations and reporting:
[`docs/security.md`](docs/security.md).

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

1. Branch from `main`: `feature/<what-it-does>`, `fix/<what-it-fixes>`.
2. Conventional commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`,
   `chore:`).
3. `npm run verify` must pass before you open a PR.
4. CI runs formatting, lint, types, unit, integration, build and E2E behind a
   single required status check.
5. Any change touching the optimizer needs a test proving it cannot fabricate.

## Licence

MIT — see [LICENSE](LICENSE).
