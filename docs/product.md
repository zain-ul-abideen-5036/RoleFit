# Product

## Positioning

RoleFit is **AI-powered, job-specific resume optimization** — not an AI resume
generator. The distinction is the whole product.

A generator writes a resume. RoleFit rewrites the resume you already have so it
answers a specific posting, and tells you plainly what that posting asks for
that you cannot support.

## The promise

> Transform your existing resume into a job-specific, ATS-optimized resume
> without inventing qualifications or experience.

The second half is the part competitors do not offer, and the part that is
enforced in code rather than promised in a prompt.

## Who it is for

Students, recent graduates, software engineers, data scientists, ML engineers,
designers, product managers, career changers, international applicants and
freelancers. Adults applying for real jobs.

The interface is calibrated accordingly: restrained, dense where density helps,
no emoji, no gamification, no robot mascot.

## Why anti-fabrication is the product

Adding a skill a candidate does not have is not optimization. It produces a
document they must defend in an interview, or explain to a recruiter who checks
references. It can cost them the role and, in regulated industries, the offer.

Most AI resume tools do this by default, because the naive objective — maximise
apparent match — rewards it.

RoleFit inverts that. Match is maximised _subject to_ every claim being
traceable to the candidate's own words. Where the two conflict, the gap is
reported instead:

> **AWS** — Missing / not verified
> Your resume contains no evidence of AWS, so it was not added.

That is more useful than a fabricated match. It tells the candidate what to
learn, what to add if they do have it, and whether this role is worth applying
for at all.

## What the product will not do

- Add a skill, tool, language, framework or platform absent from the resume.
- Add an employer, job title, team or client.
- Add a degree, institution, certification or licence.
- Add or alter a date, duration, or number of years.
- Invent a metric, percentage, count or currency amount.
- Move an achievement between employers.
- Inflate scope — `helped migrate` never becomes `led the migration`.
- Keyword-stuff.
- Claim a guaranteed ATS score or a guaranteed outcome.

## The workflow

| Step | What the user does                    | What the product does                                        |
| ---- | ------------------------------------- | ------------------------------------------------------------ |
| 1    | Upload a resume                       | Parses PDF/DOCX into structured, addressable sections        |
| 2    | Paste a job description               | Extracts requirements, splitting required from preferred     |
| 3    | —                                     | Matches each requirement against evidence, deterministically |
| 4    | Reviews the analysis                  | Shows the score breakdown, strong matches, and gaps          |
| 5    | Starts the optimization               | Proposes rewrites, each validated against the source         |
| 6    | Accepts, edits or rejects each change | Rebuilds the document from decisions alone                   |
| 7    | Downloads                             | Generates and verifies PDF and DOCX                          |

Steps 3 and 5 are separate on purpose. A user sees where they stand _before_
anything is rewritten, so the score is information rather than a sales pitch for
the next button.

## User control

Substantive rewrites wait for an explicit decision. Minor tidy-ups — a reorder,
a single-word terminology swap — start accepted, because making someone click
through a dozen trivial changes is how a review screen gets skipped entirely.
Every one is visible, labelled, and undoable, and the review screen says so.

The final document is always a pure function of _(original resume, decisions)_.
There is no drifting mutable copy, so a change of mind is always reversible.

## Honesty in the interface

Claims the product makes are constrained by what it can actually verify:

| Never say                                 | Say instead                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| "ATS compliant"                           | "ATS-friendly"                                                           |
| "Guaranteed ATS score"                    | "ATS Readiness estimate"                                                 |
| "Your score in their ATS"                 | "This score estimates compatibility using common ATS-friendly practices" |
| "AI-optimized" (when the rule engine ran) | The engine that actually ran is named                                    |

`ScoreDisclaimer` is a component rather than copy, so the wording cannot drift
between pages. The score is never shown prominently without it.

When the deterministic engine produces a run, the review screen says so and
explains that it aligns terminology and removes filler but does not rewrite
prose. Presenting rule output as AI output would be the same category of
dishonesty as fabricating a skill.

## ATS readiness

Sixteen deterministic checks across three groups:

- **Completeness** — name, email, phone, experience with bullets, education,
  skills, summary.
- **Structure** — standard headings, dated roles, readable bullet lengths,
  single column.
- **Formatting** — no tables, no text boxes, extractable text, no content
  embedded in images, ATS-safe characters, reasonable length.

Each returns what it observed and what to do about it, not just a pass or fail.

Generated documents pass the formatting group by construction: one column, no
tables, no images, standard headings, real typeset text.

## Design direction

Minimalism and Swiss typography, established via the UI/UX design system and
recorded in `design-system/rolefit/MASTER.md`.

- Precision blue as the brand colour; a single warm accent reserved for
  conversion moments.
- Shadows delineate rather than decorate.
- Motion clarifies state and nothing else; `prefers-reduced-motion` is honoured
  globally.
- Dark mode is opt-in and follows the system by default, never forced.

The mark is two interlocking forms joined by a stepped seam — a candidate and a
role meeting along a joint that fits one way, with the steps reading as upward
progression. It holds up at 16px and in monochrome.

## Accessibility

Targets WCAG 2.2 AA. Concretely: visible labels on every control (never
placeholder-only), errors tied to their field by `aria-describedby` and
announced live, a focus-trapping mobile drawer that restores focus on close,
meters with accessible values, a skip link, and status conveyed by icon **and**
text rather than colour alone — which matters most in the diff view, where the
audience includes the roughly one in twelve men with a colour vision deficiency.

## Deliberately not built

Scope discipline matters as much as scope:

- **Cover letters, LinkedIn optimization, application tracking, career
  insights.** Architected for — the routes are reserved, the data model
  accommodates them — but not built. Half a feature is worse than none.
- **Admin dashboard.** No operational need yet. Adding one would add an
  authorization surface with nothing behind it.
- **Team or recruiter accounts.** A different product.
- **Resume templates.** Multiple visual templates conflict with the
  single-column ATS guarantee. One well-made layout beats twelve compromised
  ones.

## Roadmap

Ordered by what would most improve the product, not by what is easiest:

1. **Email verification and password reset.** The most conspicuous gap for a
   real launch.
2. **Semantic matching via embeddings.** Lexical overlap misses paraphrase.
   Adding it as a _supplementary_ signal keeps the deterministic score
   explainable while catching what token matching cannot.
3. **Queue-backed optimization.** The seam already exists; needed once runs
   approach the function duration budget.
4. **Cover letter drafting**, under the same anti-fabrication rules.
5. **Bulk application mode** — one resume against several postings at once.
