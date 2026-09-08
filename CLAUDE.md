# RoleFit

An AI resume-tailoring app. The product promise is that nothing is invented: every
proposed change is traceable to text the user's own resume already contains. Most
of the rules below exist to protect that promise.

## Architecture

Next.js 15 App Router, React 19, TypeScript strict. Drizzle ORM over postgres.js
against PostgreSQL 16 (local: port **5433**). Zod schemas are the single source of
truth — infer types from them rather than declaring a parallel interface.

Layering: `app/` routes → `server/services/` → `server/repositories/` → `db/`.
Pure domain logic lives in `lib/` and takes no database or network dependency.

## Rules that are not style preferences

- **No `any`.** `noUncheckedIndexedAccess` is on; an index access is possibly
  undefined and must be handled, not asserted away.
- **Secrets are server-only.** `lib/config/env.ts` and anything reading it import
  `server-only`. `AI_API_KEY` and storage credentials must never reach a client
  bundle. Only `NEXT_PUBLIC_*` is inlined into the browser.
- **Never log** resume text, passwords, API keys, tokens, or connection strings.
- **Every query is scoped to the account.** A user must never be able to read or
  write another user's resume, analysis, or document. Repository functions take
  the account id and filter on it; a service must not fetch by id alone.
- **Scores are deterministic.** Matching and scoring are lexical and run without a
  model. A model may rewrite prose; it may never influence a score, a match
  decision, or whether a requirement counts as met.
- **No fabrication.** A proposed change must be supported by evidence from the
  source resume. `lib/optimization/anti-fabrication.ts` verifies the output, not
  the prompt — do not weaken it by trusting instructions to the model instead.

## Known traps

- **postgres.js cannot bind a JS `Date` as an untyped parameter.** Use a drizzle
  operator, or `.toISOString()` with an explicit `::timestamptz` cast. This has
  been hit repeatedly.
- **`??` does not catch `''`, and zod `.default()` only fires on `undefined`.** A
  hosting platform supplies a variable defined-but-empty as `''`. `getEnv()`
  strips empty values for this reason; do not bypass it.
- **`server-only` throws under plain Node.** Scripts that import it need
  `tsx --conditions=react-server`.
- **Playwright starts `webServer` before `globalSetup`**, so the web server boots
  against an unmigrated database. `webServer.url` must not require the schema.

## Styling

Three layers: primitives → semantic tokens → components, all in
`app/globals.css`. **A component must never contain a raw hex value, radius or
shadow** — reference a token. Every foreground/background pair must clear WCAG AA
(4.5:1); the E2E suite runs axe and will fail otherwise.

## Testing

`npm run verify` = format, lint, typecheck, unit. Also `npm run test:integration`
(real PostgreSQL) and `npm run test:e2e` (Playwright against a production build).

Tests assert on behaviour and user-visible text, not on class names or internals.
A test that would pass against a broken implementation is worse than no test — if
you fix a bug, first confirm the new test fails against the old code.
