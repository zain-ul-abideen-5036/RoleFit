# Testing

| Suite                        | Count | Runtime | Runs against                                   |
| ---------------------------- | ----- | ------- | ---------------------------------------------- |
| Unit                         | 114   | ~2s     | Pure functions. No database, network or model. |
| Integration                  | 27    | ~25s    | A real PostgreSQL instance.                    |
| End-to-end                   | 12    | ~40s    | A production build in Chromium.                |
| Accessibility and responsive | 19    | ~50s    | A production build in Chromium.                |

Both browser suites run under `npm run test:e2e` — 31 tests in total.

```bash
npm test                  # unit
npm run test:integration  # needs PostgreSQL: npm run db:up
npm run test:e2e          # builds and starts the app itself
npm run verify            # format, lint, typecheck, unit
```

## What is actually tested

The suites are weighted towards the claims the product makes, not towards a
coverage percentage.

### Anti-fabrication — 40 unit tests

Every case feeds the validator output a cooperative model would never produce:

- A rewrite introducing AWS, Kubernetes or Java when the resume has none.
- A metric invented from nothing (`improved performance` → `by 40%`).
- A metric altered (`35%` → `55%`).
- A metric **borrowed from a different role** — present in the resume, but under
  another employer.
- An employer that never appears in the source.
- `helped migrate` promoted to `led the migration`.
- A fabricated evidence quote.
- An added degree, an added certification, an altered job title, altered dates,
  an altered contact email.
- A "reorder" that quietly adds an item.

And the cases that must _pass_: aligning `Postgres` to `PostgreSQL`, preserving
an existing `35%` exactly, and reordering without flagging it as fabrication.

### Matching — 30 unit tests

The false positive the engine exists to prevent — `Java` matching a JavaScript
resume — plus alias resolution, one-directional implication (PostgreSQL
evidences SQL, never the reverse), cloud providers staying distinct, transitive
implication, evidence weighting (demonstrated beats merely listed), and
determinism across runs.

### Documents — 28 unit tests

Round trip, not inspection: generate, re-open, read the text back.

- PDF and DOCX carry valid signatures, contain every expected section, preserve
  the candidate's contact details and an existing metric, and paginate 60
  bullets without dropping any.
- DOCX contains no tables, text boxes or images.
- Both formats render the same sections in the same order.
- The post-generation gate rejects an empty file, a wrong signature, and a
  document missing expected content.

**Geometric verification** is the unusual part. Six tests read the real glyph
positions out of the generated PDF and assert that no run crosses a margin, no
two lines overlap, a 300-character URL hard-wraps rather than overflowing, long
content starts a new page rather than drawing below the bottom margin, and dates
are right-aligned to the margin. That is stricter than eyeballing a render, and
it runs on every commit.

### Authorization — 9 integration + 4 E2E tests

A second account attempts to read, delete and generate from the first account's
resume, analysis, optimization run, change record and document. Every attempt
must return **404**, not 403 — a 403 would confirm the identifier exists. List
endpoints are asserted empty for the attacker, and the victim's data is verified
untouched afterwards.

E2E additionally covers unauthenticated API access (401), a state-changing
request with no `Origin` header (403), and one from a foreign origin (403).

### Accessibility and responsive — 19 tests

axe (WCAG 2.2 AA tags) runs against every public page, the landing page in dark
mode, and every authenticated screen with real data in it — dashboard, all four
optimize steps, change review, preview, history, the full analysis page and
settings. The dashboard is additionally scanned in dark mode at 390px.

Beyond axe: eight breakpoints from 320px to 1920px are checked for horizontal
overflow, the mobile drawer is asserted to trap focus and restore it to the
trigger on Escape, the skip link is asserted to be the first tab stop, and the
sign-in form is completed with the keyboard alone.

Automated checks catch roughly a third of accessibility problems. They are a
floor, not a certificate.

### Full journey — end-to-end

Signup → upload a real PDF → paste a job description → analyse → optimize →
review → download PDF and DOCX. The downloads are read from disk and checked by
byte signature. The optimized panel is asserted **not** to contain `AWS` or
`Kubernetes` — the two skills the demo posting requires and the demo resume
lacks — while still containing the candidate's real name and employer.

A second journey rejects every change and asserts the applied document is
identical to the original.

## Design of the suites

**Unit tests never touch a database or a network.** `server-only` is aliased to
its own empty module under Vitest, so the import still documents intent in
source while the Next.js build continues to enforce it.

**Integration tests use real PostgreSQL.** The point of them is the actual SQL,
constraints and cascade behaviour, which a fake would defeat. `next/headers` is
mocked with an in-process cookie jar so the real session logic — signing, epoch
checks, expiry — is what gets exercised, rather than stubbing out the auth
service and testing nothing.

**End-to-end runs against a production build.** Dev-mode behaviour differs
enough (double-invoked effects, no route caching, unminified bundles) that
passing there is not evidence the deployed application works.

**The E2E resume fixture is generated by the application's own PDF renderer**
during global setup, not committed as a binary. A committed fixture would
silently drift from what the product actually produces.

## Defects these suites found

Each was a real bug, fixed rather than tested around.

| Found by | Defect                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Unit     | A word boundary cannot anchor after `+` or `#`, so `C++` and `C#` were never slugified                                         |
| Unit     | The same bug made `40%` extract as bare `40`, letting a fabricated percentage pass whenever the bare number appeared elsewhere |
| Unit     | Terminology alignment produced `REST APIs APIs`, and rewrote a candidate's _data pipelines_ into _Data Engineering_            |
| Unit     | pdf.js needs `workerSrc` left untouched in Node; assigning it defeats fake-worker detection                                    |
| Unit     | `Łukasz` lost its first letter — `Ł` has no canonical decomposition for the accent-stripping path to recover                   |
| E2E      | The environment validator refused to start any production build using the local storage driver                                 |
| E2E      | Rate limits were not configurable, so a full pass tripped the signup limiter                                                   |
| E2E      | The uploader accepted a file before React hydrated and silently dropped it                                                     |
| E2E      | Server components threw a 401 that logged a stack trace on every signed-out visit                                              |

## Coverage

`npm run test:coverage` enforces 70% on lines, functions, branches and
statements across `lib/` and `server/`.

The threshold is deliberately modest and the suite deliberately targeted.
Coverage measures which lines ran, not whether the guarantees hold; the 40
adversarial anti-fabrication tests are worth more than the percentage they add.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. **static** — format, lint, typecheck. First and alone, so a missing semicolon
   does not wait behind a database container.
2. **unit** — with coverage, uploaded as an artifact.
3. **integration** — against a PostgreSQL service container.
4. **build** — production build.
5. **e2e** — Playwright, gated behind static and unit so it only spends runner
   time once the cheaper checks are green.

A single `ci` job aggregates them, so branch protection needs one required check
rather than an entry per job.
