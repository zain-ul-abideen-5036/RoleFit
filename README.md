<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/mark-dark.svg" />
  <img src="public/brand/mark.svg" alt="RoleFit logo" width="88" height="88" />
</picture>

<h1>RoleFit</h1>

<h3>Tailor your resume. Match the role. Get hired.</h3>

<p>
  <b>RoleFit is an AI resume optimizer that refuses to lie for you.</b><br />
  It reads your resume and a job description, shows you exactly where you match and<br />
  where you don't, and rewrites only the experience you already have.
</p>

<p>
  <a href="https://rolefit-topaz.vercel.app"><b>Live app&nbsp;&rarr;</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="TECHNICAL_README.md"><b>Technical Documentation</b></a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#quickstart">Quickstart</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#inside-the-app">Screenshots</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#what-you-can-do">Features</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#built-with">Built with</a>
</p>

</div>

<br />

<img src="docs/screenshots/landing.png" alt="The RoleFit landing page: the headline Tailor your resume for a Backend Engineer and get hired, beside a resume being rewritten on the page" width="100%" />

<br />

## The problem it solves

Every AI resume tool will happily add AWS to your resume because the posting
asked for AWS. You then get the interview, and you have to talk about AWS.

That is not a rough edge. It is the default behaviour of asking a language
model to make a resume match a job, and it is why the output of these tools
cannot be sent without reading every line first.

RoleFit takes the opposite position: **your resume may only ever say things
your resume already said.** Rewrites sharpen your own wording. Anything the
posting wants that you cannot evidence is reported to you as a gap, in a list,
and never written in.

**Who it is for**

- Anyone applying to roles that screen with an ATS, who wants their real
  experience described in the employer's vocabulary
- People who have been burned by a generated resume that claimed something they
  could not defend in an interview
- Anyone who wants to know _why_ a resume scores badly against a posting, rather
  than being handed a number

**What makes it different**

|                                  |                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **It cannot invent experience**  | Every rewrite is checked against your source document before you see it. A new skill, employer, metric, date or degree — or a promotion from "helped migrate" to "led the migration" — is discarded automatically. |
| **The score is arithmetic**      | Seven weighted dimensions, computed deterministically. No model decides the number, so it is reproducible and every point traces back to something you can change.                                                 |
| **Gaps are shown, not filled**   | The requirements you do not meet are listed explicitly, so you know what the employer will notice. They are never quietly written into the document.                                                               |
| **You approve every change**     | Each rewrite is presented with your original beside it and a reason. Nothing you have not accepted reaches the exported file, and every decision is reversible.                                                    |
| **It works with no AI provider** | The default engine is rule-based and runs locally — no network calls, no resume text leaving the machine. Configure a provider only if you want sentence-level rewriting.                                          |

<br />

## Quickstart

**Requirements:** Node.js 20+, npm, and Docker (for PostgreSQL).

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

Create an account at `/signup` and upload a PDF or DOCX resume. RoleFit runs
fully without an AI key — the rule-based engine aligns terminology, removes
filler and reorders for relevance, entirely on your machine. Full setup, every
environment variable and deployment:
**[Technical Documentation →](TECHNICAL_README.md#getting-started)**

<br />

## Inside the app

### The score, and the arithmetic behind it

Seven weighted dimensions, each with the sentence that explains it. Nothing here
is a model's opinion — every figure is computed from your resume and the
posting, and every point is attributable to something you can change.

<img src="docs/screenshots/breakdown.png" alt="The analysis page: a 49 readiness ring beside a seven-dimension score breakdown, with skill alignment at 52, keyword alignment at 24 and formatting compatibility at 95, above tabs for gaps, strong matches, partial evidence and keywords" width="100%" />

### Upload a resume, add the posting

<table>
<tr>
<td width="50%"><img src="docs/screenshots/optimize-parsed.png" alt="The upload step showing a parsed resume with its detected roles, skills and sections" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/optimize-job-description.png" alt="The job description step, with a text area for pasting the posting" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Parsed, not flattened</b> — roles, bullets, skills and dates, addressable individually</td>
<td align="center"><b>The posting</b> — requirements separated from benefits and boilerplate</td>
</tr>
</table>

### Review every change, and the gaps it refused to close

<img src="docs/screenshots/review.png" alt="The review screen: projected ATS readiness, a note that this run used the rule-based engine, and each proposed change as a card with accept, reject and undo controls" width="100%" />

Rewrites wait for your decision, with the original beside them. Minor tidy-ups —
a reorder, a single-word swap — start accepted so you are not clicking through
trivia, and every one can be undone. Below the list, the requirements the run
deliberately did **not** address are restated, so nothing is quietly dropped.

### What comes out

<table>
<tr>
<td width="50%"><img src="docs/screenshots/preview.png" alt="The preview screen showing the assembled resume exactly as it will export, with print, DOCX and PDF controls" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/dashboard.png" alt="The dashboard showing latest readiness, required gaps, projected movement, recent activity and stored resumes" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Preview</b> — single-column, selectable text, verified after generation</td>
<td align="center"><b>Dashboard</b> — where each application stands, and what to do next</td>
</tr>
</table>

<details>
<summary><b>More of the product</b> — history, settings, sign-in, the empty state and the full landing page</summary>

<br />

<table>
<tr>
<td width="50%"><img src="docs/screenshots/history.png" alt="History page listing every analysis with strong, partial and missing counts and a readiness badge" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/history-exports.png" alt="The exports tab of history, listing generated PDF and DOCX files" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>History</b> — every analysis, run and export on the account</td>
<td align="center"><b>Exports</b> — the files that were generated, and when</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/settings.png" alt="Settings page showing the account details, a theme control, and a section stating which optimization engine this deployment uses and that anti-fabrication is always on" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/login.png" alt="The sign-in page" width="100%" /></td>
</tr>
<tr>
<td align="center"><b>Settings</b> — account, theme, and what this deployment does with your resume</td>
<td align="center"><b>Sign in</b> — email and password, no third-party identity provider</td>
</tr>
</table>

**The empty state**, written rather than left blank.

<img src="docs/screenshots/dashboard-empty.png" alt="The dashboard before anything has been uploaded, explaining what to do first" width="100%" />

**The complete landing page**, top to bottom.

<img src="docs/screenshots/landing-full.png" alt="The full RoleFit landing page from the hero through how it works, the anti-fabrication section, the ATS readiness explanation, pricing and FAQ" width="100%" />

</details>

<br />

### Two themes, authored separately

Light and dark are written as two sets of tokens rather than one inverted into
the other, so the score colours stay legible instead of being flipped into
something muddy.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/landing-dark.png" alt="The landing page rendered in the dark theme" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/breakdown-dark.png" alt="The analysis page rendered in the dark theme" width="100%" /></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/review-dark.png" alt="The review screen rendered in the dark theme" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/dashboard-dark.png" alt="The dashboard rendered in the dark theme" width="100%" /></td>
</tr>
</table>

### Built for a phone, not shrunk onto one

<table>
<tr>
<td width="33%"><img src="docs/screenshots/mobile-landing.png" alt="The RoleFit landing page on a phone" width="100%" /></td>
<td width="33%"><img src="docs/screenshots/mobile-breakdown.png" alt="The score breakdown on a phone" width="100%" /></td>
<td width="33%"><img src="docs/screenshots/mobile-review.png" alt="The review screen on a phone" width="100%" /></td>
</tr>
</table>

<br />

## What you can do

<table>
<tr>
<td width="33%" valign="top">

**Parse a real resume**

PDF and DOCX, read for layout signals — columns, tables, text boxes, embedded
images — that ATS checks depend on and that are lost the moment a document is
flattened to plain text.

</td>
<td width="33%" valign="top">

**Analyse the posting**

Requirements, responsibilities, qualifications, certifications, years of
experience and keywords, with benefits and boilerplate excluded, and required
separated from merely preferred.

</td>
<td width="33%" valign="top">

**Match deterministically**

Token-boundary matching, so `Java` can never satisfy a `JavaScript`
requirement. An alias dictionary separates equivalence from implication:
PostgreSQL evidences SQL, not the reverse.

</td>
</tr>
<tr>
<td width="33%" valign="top">

**See where you don't match**

Every unmet requirement is listed, marked required or preferred. These are the
lines the employer will notice, and the ones RoleFit will not write for you.

</td>
<td width="33%" valign="top">

**Decide on every rewrite**

Accept, edit or reject each one, with your original alongside and the source
text that justifies it. Nothing unaccepted reaches the document, and every
decision is reversible.

</td>
<td width="33%" valign="top">

**Export something sendable**

Single-column PDF and DOCX from one shared layout model, so the two exports and
the on-screen preview cannot drift apart. Each file is verified after
generation by reading its text back out.

</td>
</tr>
<tr>
<td width="33%" valign="top">

**Keep your original**

Your upload is kept untouched as version 1. Every analysis, optimization run
and exported file stays on the account, so you can see what you sent to whom.

</td>
<td width="33%" valign="top">

**Run it without an AI key**

The default engine is rule-based and local: terminology alignment, filler
removal, relevance reordering. The app always tells you which engine produced
your result.

</td>
<td width="33%" valign="top">

**Own your data**

Resume text is never written to application logs. Deleting your account removes
every record and every stored file. AI keys, when configured, exist server-side
only.

</td>
</tr>
</table>

<br />

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/section-how-it-works-dark.png" />
  <img src="docs/screenshots/section-how-it-works.png" alt="Five steps. 01 Upload your resume: PDF or DOCX, parsed into structured sections so every later step can point at where something came from. 02 Add the job description: requirements, responsibilities and keywords extracted and separated into required and preferred. 03 See where you actually match: each requirement matched against evidence in your resume, and anything it cannot support reported as a gap rather than quietly filled in. 04 Review every change: rewrites proposed with the original alongside and a reason for each, accepted, edited or rejected individually. 05 Export and apply: a single-column ATS-friendly PDF or DOCX with selectable text, checked automatically before it reaches you." width="100%" />
</picture>

<br />

## The part that matters

Prompts ask a model to behave. They do not make it behave. So the rule that
RoleFit will not invent experience is not written in a prompt — it is a
validator that runs on the model's output, and it discards anything it cannot
trace back to your source document.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/section-evidence-dark.png" />
  <img src="docs/screenshots/section-evidence.png" alt="The landing page section explaining that RoleFit will not put a skill on your resume that is not already there, with a worked example of a rewrite and the gap it refused to close" width="100%" />
</picture>

| Check                  | What it rejects                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Skills**             | A technology not evidenced anywhere in the source resume                                                           |
| **Metrics**            | A figure absent from the text being rewritten — `improved performance` never becomes `improved performance by 40%` |
| **Entities**           | An employer, product or tool that does not appear in the resume                                                    |
| **Scope**              | `helped migrate` promoted to `led the migration`                                                                   |
| **Evidence**           | A quote the model cited that does not actually occur in the resume                                                 |
| **Immutable sections** | Any change to employers, titles, dates, education or certifications                                                |

27 adversarial unit tests feed this validator the output a cooperative model
would never produce — fabricated employers, invented percentages, quietly
upgraded seniority — and assert that each one is discarded. The source is
[`lib/optimization/anti-fabrication.ts`](lib/optimization/anti-fabrication.ts).

### The score, and its limits

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/section-ats-dark.png" />
  <img src="docs/screenshots/section-ats.png" alt="The landing page section explaining the ATS readiness estimate, its seven weighted dimensions and the disclaimer that different employers and ATS systems may score resumes differently" width="100%" />
</picture>

Seven weighted dimensions — skill alignment 25%, keyword alignment 20%,
responsibility alignment 15%, resume structure 12%, relevance 10%, formatting
compatibility 10%, section completeness 8%.

> This score estimates compatibility using common ATS-friendly formatting and
> job-description alignment practices. Different employers and ATS systems may
> score resumes differently.

No ATS vendor publishes its algorithm. RoleFit does not claim to reproduce one,
and never shows the score without that caveat — not on the analysis page, the
dashboard, the review screen or in history.

<br />

## Built with

<div align="center">

<h4>Framework and language</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/nextdotjs/000000/ffffff" width="42" height="42" alt="Next.js" /><br /><sub><b>Next.js</b><br />15.5</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/react/61DAFB/61DAFB" width="42" height="42" alt="React" /><br /><sub><b>React</b><br />19</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/typescript/3178C6/3178C6" width="42" height="42" alt="TypeScript" /><br /><sub><b>TypeScript</b><br />5.9 strict</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/nodedotjs/5FA04E/5FA04E" width="42" height="42" alt="Node.js" /><br /><sub><b>Node.js</b><br />20+</sub></td>
</tr>
</table>

<h4>Interface</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/tailwindcss/06B6D4/06B6D4" width="42" height="42" alt="Tailwind CSS" /><br /><sub><b>Tailwind CSS</b><br />4.3</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/radixui/161618/ffffff" width="42" height="42" alt="Radix UI" /><br /><sub><b>Radix UI</b><br />primitives</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/framer/0055FF/6f9bff" width="42" height="42" alt="Framer Motion" /><br /><sub><b>Framer Motion</b><br />13</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/lucide/F56565/F56565" width="42" height="42" alt="Lucide" /><br /><sub><b>Lucide</b><br />icons</sub></td>
</tr>
</table>

<h4>Data</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/postgresql/4169E1/7d9bff" width="42" height="42" alt="PostgreSQL" /><br /><sub><b>PostgreSQL</b><br />16</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/drizzle/C5F74F/C5F74F" width="42" height="42" alt="Drizzle ORM" /><br /><sub><b>Drizzle ORM</b><br />0.39</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/docker/2496ED/2496ED" width="42" height="42" alt="Docker" /><br /><sub><b>Docker</b><br />local Postgres</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/neon/00E599/00E599" width="42" height="42" alt="Neon" /><br /><sub><b>Neon</b><br />hosted Postgres</sub></td>
</tr>
</table>

<h4>Validation, auth and documents</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/zod/3E67B1/7fa3e0" width="42" height="42" alt="Zod" /><br /><sub><b>Zod</b><br />3.25</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/jsonwebtokens/000000/ffffff" width="42" height="42" alt="JSON Web Tokens" /><br /><sub><b>JWT</b><br />via jose</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/adobeacrobatreader/EC1C24/EC1C24" width="42" height="42" alt="PDF" /><br /><sub><b>pdf-lib</b><br />PDF out</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/microsoftword/2B7CD3/6ea8e8" width="42" height="42" alt="DOCX" /><br /><sub><b>docx</b><br />DOCX out</sub></td>
</tr>
</table>

<h4>Testing and delivery</h4>

<table>
<tr>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/vitest/6E9F18/9BD62F" width="42" height="42" alt="Vitest" /><br /><sub><b>Vitest</b><br />3.2</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/playwright/2EAD33/2EAD33" width="42" height="42" alt="Playwright" /><br /><sub><b>Playwright</b><br />1.63</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/eslint/4B32C3/8b7ae8" width="42" height="42" alt="ESLint" /><br /><sub><b>ESLint</b><br />9</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/prettier/F7B93E/F7B93E" width="42" height="42" alt="Prettier" /><br /><sub><b>Prettier</b><br />3.9</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/vercel/000000/ffffff" width="42" height="42" alt="Vercel" /><br /><sub><b>Vercel</b><br />deployment</sub></td>
<td align="center" width="118"><img src="https://cdn.simpleicons.org/github/181717/ffffff" width="42" height="42" alt="GitHub" /><br /><sub><b>GitHub</b><br />CI</sub></td>
</tr>
</table>

</div>

Also in use, but without a brand mark of their own: **pdfjs-dist** and
**mammoth** for reading PDF and DOCX, **bcryptjs** for password hashing, the
**AWS S3 client** for object storage, **axe-core** for accessibility assertions,
**class-variance-authority**, **clsx** and **tailwind-merge** for styling
ergonomics, and **tsx** for the maintenance scripts.

The full breakdown, with the role each one plays, is in the
[technical documentation](TECHNICAL_README.md#technology-stack).

<br />

## Where it is useful

- **Applying to a specific role.** The whole product is one job description at a
  time, which is the unit a resume is actually judged in.
- **Understanding a rejection.** A readiness score with seven attributable
  dimensions tells you whether the problem was the wording, the structure or a
  genuine gap in experience.
- **Deciding what to learn next.** The gap list is, in effect, the difference
  between your resume and the role you want.
- **As a reference implementation.** A full-stack Next.js application with real
  authentication, a layered architecture, a pure domain layer under test, PDF
  and DOCX generation verified geometrically, and a deployment pipeline.

RoleFit describes what your resume already contains. It does not give career
advice, it does not guarantee an interview, and it cannot tell you how any
particular employer's ATS will read your file.

<br />

## Project highlights

|                                      |                                                                                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A guarantee, not a prompt**        | The anti-fabrication rule is a validator over model output, not an instruction to the model. 27 adversarial unit tests feed it exactly what a misbehaving model would produce.                                                   |
| **Figures that cannot drift**        | The readiness score is deterministic arithmetic over your resume and the posting. The same inputs always produce the same number, and the ring, the bars and the history row all read it from one place.                         |
| **Authorization by construction**    | Every repository query is scoped by user id, so another account's record does not match rather than being found and refused. Reads answer 404, never 403 — a 403 would confirm the id exists.                                    |
| **Documents verified after writing** | Generated PDFs and DOCX files are read back and checked before download. The PDF renderer is tested geometrically: margins, line overlap, hard-wrapping and pagination asserted from real glyph positions.                       |
| **Tested where it matters**          | 763 unit, 120 component, 72 integration and 48 end-to-end tests. The integration suite runs against real PostgreSQL; the E2E suite against a production build, with axe-core over every page in both themes and zero violations. |
| **It degrades honestly**             | No AI key, no email provider and no object storage still gives a working app — and the interface says which engine ran rather than implying a model was involved.                                                                |
| **Accessible and responsive**        | Reduced-motion support throughout, a stable accessible heading behind the animated one, keyboard-reachable controls, and layouts that hold from 360px up.                                                                        |

<br />

## Documentation

Complete engineering detail — architecture, setup, environment variables,
database, testing, security and deployment — lives in one place:

<div align="center">

### [Technical Documentation &rarr;](TECHNICAL_README.md)

</div>

| Looking for                  | Go to                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Running it locally           | [Getting started](TECHNICAL_README.md#getting-started)                               |
| Every environment variable   | [Environment variables](TECHNICAL_README.md#environment-variables)                   |
| How the layers fit together  | [Architecture](docs/architecture.md)                                                 |
| How fabrication is prevented | [The anti-fabrication guarantee](TECHNICAL_README.md#the-anti-fabrication-guarantee) |
| How the score is computed    | [ATS readiness score](TECHNICAL_README.md#ats-readiness-score)                       |
| AI providers and prompts     | [AI](docs/ai.md)                                                                     |
| Database and migrations      | [Database](docs/database.md)                                                         |
| What the test suites prove   | [Testing](docs/testing.md)                                                           |
| Deploying                    | [Deployment](docs/deployment.md)                                                     |
| Security posture             | [Security](docs/security.md)                                                         |
| The product brief            | [Product](docs/product.md)                                                           |

<br />

## Project status

Deployed and running at
**[rolefit-topaz.vercel.app](https://rolefit-topaz.vercel.app)** — Vercel, with
hosted PostgreSQL and S3-compatible object storage. `/api/health` reports the
database and configuration as reachable.

Formatting, lint, TypeScript and all four test suites pass, and `npm run build`
produces a clean production build.

- 763 unit and 120 component tests passing across 38 files
- 72 integration tests against real PostgreSQL
- 48 end-to-end tests against a production build in Chromium
- 95.2% statement and 85.8% branch coverage over the domain layer
- Prettier, ESLint and `tsc --noEmit` clean
- Migrations version-controlled; `npm run deploy:preflight` verifies every
  production credential against the real service before a deploy

Known gaps, stated plainly:

- **The live instance runs the rule-based engine.** No AI provider is
  configured on it, so it analyses, scores and reorders but does not rewrite
  prose.
- **Rate limiting on the live instance is in-memory.** Limits are per-instance
  and will not hold across a horizontally scaled deployment. The Upstash driver
  is implemented and documented; it is simply not switched on yet.
- **Sentence-level rewriting needs an AI provider.** Without one, the
  rule-based engine aligns terminology, removes filler and reorders for
  relevance, but does not rewrite prose. The screenshots above were taken on
  the rule-based engine, which is why the review screen shows reorderings
  rather than rewrites.
- **Account recovery is off by default.** With `EMAIL_PROVIDER=none` there is
  no verification or password-reset delivery; the rest of the app is fully
  usable.
- **`npm run db:seed` is declared but has no script behind it.** There is no
  demo account — create one at `/signup`.

<br />

---

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/mark-dark.svg" />
  <img src="public/brand/mark.svg" alt="" width="40" height="40" />
</picture>

**RoleFit** — AI-powered, job-specific resume optimization

Built by [Zain Ul Abideen](https://github.com/zain-ul-abideen-5036)

[Repository](https://github.com/zain-ul-abideen-5036/RoleFit)
&nbsp;·&nbsp;
[Technical Documentation](TECHNICAL_README.md)
&nbsp;·&nbsp;
[MIT Licence](LICENSE)

<br />

<sub><i>Your resume should say what you did. Only what you did — and all of it.</i></sub>

</div>
