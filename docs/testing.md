# Testing

| Suite                        | Count | Runtime | Runs against                                   |
| ---------------------------- | ----- | ------- | ---------------------------------------------- |
| Unit                         | 589   | ~15s    | Pure functions. No database, network or model. |
| Component                    | 68    | ~4s     | React components in jsdom.                     |
| Integration                  | 72    | ~70s    | A real PostgreSQL instance.                    |
| End-to-end                   | 25    | ~55s    | A production build in Chromium.                |
| Accessibility and responsive | 19    | ~50s    | A production build in Chromium.                |

Both browser suites run under `npm run test:e2e` — 44 tests in total.

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

### Provider adapters — 26 unit tests

The Anthropic and OpenAI adapters talk to a mocked `fetch`, never a real API.
What they verify is the behaviour that only appears under failure: schema
repair with the specific issues fed back, failing closed rather than returning
partially-valid data, retrying a 429 but not a 400, aborting on timeout, a
fresh fence nonce per request, and never leaking an upstream error body — an
invalid-API-key response must not put the key in a user-facing message.

Before these existed the adapters sat at 7% coverage: entirely unexercised code
that talks to a paid API.

### Parsing — 42 unit tests

Upload validation is treated as the security control it is: an HTML file
renamed `.pdf`, a `.xlsx` renamed `.docx`, a legacy `.doc`, an encrypted PDF, an
empty file, an oversized file, and a declared MIME type that contradicts the
bytes. Filename sanitisation is tested against directory traversal in both
separator styles.

The resume parser is tested for what it extracts _and_ for what it refuses to
invent: no name when the first line is not name-like, null contact fields when
the resume has none, and a number inside a URL not mistaken for a phone number.

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

### ATS readiness — 33 unit tests

The score the product is most careful about. Two properties are asserted across
every check, for both a complete and an empty resume: each says what it
observed, and each non-passing one says what to do about it.

Layout checks are driven through the extractor's signals rather than the parsed
profile, because parsed content cannot reveal that a resume was laid out in two
columns — the very thing that makes a parser read it in the wrong order.
`generatedDocumentSignals` is asserted to let our own output pass every layout
check, which is a fact about the layout model rather than an assumption.

### Model request building — 23 unit tests

No model is called; a fake provider captures the request, because what matters
is not what a model replies but what it is handed. Every rewritable bullet
carries its path, so a returned path resolves exactly. Education and
certifications are rendered deliberately without one — a path is an invitation
to rewrite. A resume whose summary reads "IGNORE ALL PREVIOUS INSTRUCTIONS" is
asserted to reach the model only inside a fenced document.

### Pipeline and fallback — 17 unit tests

What happens when the model misbehaves. With no provider the rule-based engine
runs; when the model throws, the run falls back and reports `deterministic` —
never the provider that failed, because the UI tells the user which engine
produced their result.

The immutable-section backstop is driven by stubbing per-change validation to
let a changed employer, a changed degree and an invented certification through.
Each must throw rather than return a result with a warning attached, because a
user has no way to judge that warning.

### Components — 68 tests

`vitest.config.ts` had a `unit-dom` project — jsdom, DOM matchers, a setup file
patching `matchMedia` and `ResizeObserver` — from the first commit, and nothing
used it. These are the first tests in it.

**Score presentation.** The product's most consequential copy. `ScoreDisclaimer`
is asserted to contain both claims that keep the number honest, and asserted
_not_ to contain "guarantee", "ensure", "will pass" or "ATS compliant" — a copy
regression test, which is the right shape for a promise that lives in words.
`ScoreRing` is asserted to give assistive technology the same number a sighted
user reads off the ring: if those disagree, the second user is being told
something different about their own resume.

**The field contract.** Labels are checked through `getByLabelText`, which only
resolves via a real association. The description and the error are announced
_together_ rather than the error replacing the description, since the
requirement is still relevant while the value is wrong. A subcomponent used
outside `<Field>` throws, because silently rendering an unassociated label
produces a form that looks correct and is unusable with a screen reader.

**Status presentation.** Meaning never carried by colour alone: every badge
carries a text label, and all four change actions are distinguishable by label.
The loading button is asserted to change its accessible _name_, not just show a
spinner — a spinner is invisible to a screen reader.

### Errors — 36 unit tests

The load-bearing assertions are negative. An error whose cause reads
`connection string: postgres://user:hunter2@db/rolefit` must not serialise the
password or the scheme; one carrying another account's resume id in its context
must not serialise the id. Everything useful for debugging is also useful to an
attacker, which is why the public body is exactly three keys.

`isAppError` is asserted to reject a duck-typed lookalike — the guard decides
whether a value is safe to send to a user, so structural similarity must not be
enough. `toAppError` returns an existing error by identity rather than
re-wrapping, because re-wrapping would mint a second incident id for one event
and the log would disagree with the reference the user quotes.

### The AI provider factory — 20 unit tests

The deterministic mode returns `null`, not a stub. A stub would let a caller
report that a model produced a result when none did. The capability flags are
pinned in both directions, including the invariant that `canRewriteProse` and
`sendsDataToThirdParty` always agree — a provider that rewrites prose without
sending anything anywhere does not exist here, and claiming otherwise would
understate what a user is agreeing to.

### The session cookie — 17 unit tests

None of the security model is in the token. `httpOnly`, `SameSite=Lax` and
`Secure` live in the `Set-Cookie` attributes, and each is asserted with the
reason it holds that value. Clearing is asserted to set `maxAge: 0` **with the
same attributes**, because a browser matches a cookie by name, path and flags —
a clear that differed in any of them would leave the original in place.

### Applying decisions — 33 unit tests

Where the promise is kept, so most of these assert what does not happen: a
pending change is not written (silence is not consent), rejecting everything
leaves the profile byte-identical, and a stale target path is a no-op rather
than a crash or a write somewhere else.

The reorder cases are the valuable ones: an order that drops, duplicates or
invents an entry is refused outright, because silently losing a job off
someone's resume is the worst outcome this code has available to it. One test
records a boundary that is easy to get backwards — a user's own edit is applied
verbatim even when the optimizer would never have proposed it, since the
anti-fabrication rules constrain the model, not the person.

### Embeddings — 32 unit tests

No embedding API is called. The arithmetic (cosine similarity at every
degenerate input — zero vectors, mismatched dimensions, empty), the ordering,
and above all the boundaries.

The boundary tests are the ones worth having: a requirement the lexical engine
already evidenced causes **nothing to be embedded at all**, a provider failure
returns an empty array rather than propagating, and a response with the wrong
number of vectors discards the whole result rather than using part of it. The
excerpt is asserted to be quoted verbatim from the source profile.

The adapter is asserted to place vectors by the index the API reports rather
than by arrival order, which the API does not guarantee — pairing by arrival
would attach one requirement's vector to another's text, producing plausible
and wrong output rather than an error.

### Background queue — 11 unit + 17 integration tests

The property that matters cannot be tested any other way. Two concurrent claims
against one job must yield exactly one, and three workers against three jobs
must take one each — a mock cannot exhibit `SKIP LOCKED`, and getting it wrong
is invisible until two workers process the same run in production.

Reclaiming is covered end to end: a job held by a worker that then vanished is
refused to a second worker immediately and available past the timeout, with
attempts incremented. Without that, a crashed worker strands a run permanently.

The unit half pins the retry schedule, because a backoff that grows too slowly
turns a failing dependency into a self-inflicted denial of service, and one
without a cap makes a recovered dependency wait out nine days at attempt 20. It
also asserts the claim timeout exceeds the longest a run may take — a claim
expiring mid-run would let a second worker start the same one.

### Object storage — 45 unit tests

Three levels, separated because they buy different things.

**Local driver** — the real filesystem driver against a real temporary
directory, no mocks: byte-for-byte round trip, generated documents, deletion
being idempotent, and no direct URL (local objects are streamed through an
authenticated route instead).

**Signing** — the real S3 driver and the real AWS signer with placeholder
credentials. `getSignedUrl` performs no I/O, so this asserts the exact URL a
provider would receive with no network and no account. It pins the Backblaze B2
endpoint shape (`s3.<region>.backblazeb2.com/<bucket>/<key>`), the signing
region, the expiry, the download filename, and that the application key never
appears in the URL.

**Commands** — the real SDK command objects with only the network send stubbed,
so assertions run against the request the driver actually builds: bucket, key,
content type, `ServerSideEncryption`, the checksum in metadata, and the absence
of any public ACL. Provider failures must surface as `STORAGE_FAILURE` without
leaking the upstream message, which names a key id and a bucket.

Across all three, a key the driver did not generate is refused before anything
is written, read, deleted or signed — traversal, an unknown namespace, a
non-UUID owner, an absolute path.

**No test here reaches a real provider.** Nothing has been run against a live
Backblaze account; that requires credentials CI does not have.

### Passwords — 18 unit tests

Not whether bcrypt works, but the three decisions layered on it. Cost 12 is
asserted from the hash prefix, so lowering it fails a test. `verifyPassword`
returns false on a corrupt stored hash rather than throwing — a 500 on one
address where every other gives a clean rejection is itself a signal the row
exists. `needsRehash` fails towards rehashing, so anything unparseable is
upgraded.

The dummy verification is timed against a real one and asserted to be the same
order of magnitude. That is the whole reason it exists: if it were cheap, or a
no-op, response time would enumerate registered addresses.

### Session tokens — 24 unit tests

Weighted towards refusal, since the integration suite already covers the happy
path through real HTTP. A token signed with a different secret, one edited
after signing, the `alg=none` downgrade, a wrong audience, a wrong issuer, an
expired one, and six correctly signed tokens whose claim shape is wrong —
which matters because everything downstream trusts `userId`, `email` and
`epoch` without re-checking them.

The token is also asserted to carry no claims beyond those three: a session
cookie travels to the browser on every request, so anything extra is personal
data handed out for no reason.

### Rate limiting — 24 unit tests

Isolation, failing open, and privacy. One caller exhausting a bucket must not
lock out everyone else, and exhausting signup must not block that caller from
logging in. A Redis outage returns allowed rather than blocking, because an
outage must not lock every user out of the product. An unauthenticated caller
is identified by a truncated IP prefix, and two addresses in the same /24 are
asserted to share a counter — which is what makes truncation a defense rather
than a loophole.

### Display helpers — 28 unit tests

`lib/utils.ts` renders on both the server and the client, so a disagreement
between them is a hydration mismatch rather than a cosmetic bug. Boundaries are
what matter: `formatBytes` either side of a kilobyte and a megabyte,
`formatRelative` at each of its four thresholds, `truncate` at exactly the
limit and at the 60% word-boundary rule. `formatRelative` is also given a
timestamp slightly in the future, because server and client clocks disagree and
"-1m ago" would be visible nonsense.

### CSRF origin verification — 21 unit tests

Security and availability in one file, deliberately: a change that fixes one of
these tends to break the other, and #21 was exactly that — a check so strict it
refused the deployment itself.

Refused: a foreign origin; a foreign origin on a preview deployment; the `Host`
header in production, which is attacker-supplied; a request carrying neither
`Origin` nor `Referer`; a foreign `Referer` when `Origin` is absent. A rejection
never names the origin it expected.

Allowed: the configured origin; each of the three platform-provided origins
(`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`); a
`Referer` fallback; the `Host` header outside production, so a LAN address or a
tunnel works without configuration; and a production build served on localhost,
which is what local verification and the end-to-end suite do.

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

| Found by | Defect                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit     | A word boundary cannot anchor after `+` or `#`, so `C++` and `C#` were never slugified                                                                                                                            |
| Unit     | The same bug made `40%` extract as bare `40`, letting a fabricated percentage pass whenever the bare number appeared elsewhere                                                                                    |
| Unit     | Terminology alignment produced `REST APIs APIs`, and rewrote a candidate's _data pipelines_ into _Data Engineering_                                                                                               |
| Unit     | pdf.js needs `workerSrc` left untouched in Node; assigning it defeats fake-worker detection                                                                                                                       |
| Unit     | `Łukasz` lost its first letter — `Ł` has no canonical decomposition for the accent-stripping path to recover                                                                                                      |
| E2E      | The environment validator refused to start any production build using the local storage driver                                                                                                                    |
| E2E      | Rate limits were not configurable, so a full pass tripped the signup limiter                                                                                                                                      |
| E2E      | The uploader accepted a file before React hydrated and silently dropped it                                                                                                                                        |
| E2E      | Server components threw a 401 that logged a stack trace on every signed-out visit                                                                                                                                 |
| Audit    | Two WCAG AA contrast failures, including the primary CTA at 3.77:1                                                                                                                                                |
| Audit    | The resume preview scrolled but was not keyboard-focusable                                                                                                                                                        |
| Audit    | The job description parser emitted the same requirement in two categories                                                                                                                                         |
| Unit     | A location on a shared contact line was never extracted                                                                                                                                                           |
| Unit     | Custom resume sections were dropped from short resumes                                                                                                                                                            |
| Unit     | A job posting with no section headings yielded no skills at all                                                                                                                                                   |
| Audit    | The CSRF origin check refused a Vercel preview deployment its own origin, so every request there returned 403 ([#21](https://github.com/zain-ul-abideen-5036/RoleFit/issues/21))                                  |
| Audit    | An unset `NEXT_PUBLIC_APP_URL` passed validation in production and then refused every state-changing request at runtime ([#21](https://github.com/zain-ul-abideen-5036/RoleFit/issues/21))                        |
| Unit     | The `STORAGE_BUCKET` "required when s3" check could never fire, because the field is defaulted — forgetting it silently addressed a bucket named after the default, which on Backblaze B2 belongs to someone else |

## Coverage

`npm run test:coverage` enforces 80% statements, 80% functions and 70% branches
over the domain logic the unit suite owns. Current: **94% statements, 85%
branches, 97% functions**.

The scope is deliberate. `lib/security`, `lib/storage`, `lib/config` and
`server/` are excluded because they are covered by the integration suite against
a real database, and `lib/client` by Playwright against a production build.
Including them would report those modules as 0% and force the threshold down to
a number that means nothing.

Coverage measures which lines ran, not whether the guarantees hold. The 40
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
