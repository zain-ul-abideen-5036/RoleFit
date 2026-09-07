#!/usr/bin/env bash
#
# Creates the RoleFit labels and issue backlog on GitHub.
#
# Requires an authenticated `gh` CLI:
#   gh auth login
#
# Idempotent: labels are updated rather than duplicated, and an issue whose
# exact title already exists is skipped.

set -euo pipefail

REPO="${ROLEFIT_REPO:-zain-ul-abideen-5036/RoleFit}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: the GitHub CLI (gh) is not installed." >&2
  echo "       https://cli.github.com" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

echo "Seeding ${REPO}"
echo

# ---------------------------------------------------------------- labels ----

create_label() {
  local name="$1" colour="$2" description="$3"
  if gh label create "$name" --repo "$REPO" --color "$colour" --description "$description" >/dev/null 2>&1; then
    echo "  label created:  $name"
  else
    gh label edit "$name" --repo "$REPO" --color "$colour" --description "$description" >/dev/null 2>&1 \
      && echo "  label updated:  $name" \
      || echo "  label skipped:  $name"
  fi
}

echo "Labels"
create_label feature       0E8A16 "New capability"
create_label bug           D73A4A "Something is broken"
create_label enhancement   A2EEEF "Improves something that already works"
create_label security      B60205 "Security-relevant"
create_label frontend      5319E7 "UI and design system"
create_label backend       1D76DB "Services, API, data access"
create_label ai            FBCA04 "Model layer, prompts, anti-fabrication"
create_label database      006B75 "Schema and migrations"
create_label devops        C2E0C6 "CI, deployment, infrastructure"
create_label testing       BFD4F2 "Test coverage"
create_label documentation 0075CA "Documentation only"
echo

# ---------------------------------------------------------------- issues ----

# Titles are matched exactly to avoid duplicates on re-run.
existing_titles="$(gh issue list --repo "$REPO" --state all --limit 200 --json title --jq '.[].title' 2>/dev/null || true)"

create_issue() {
  local title="$1" labels="$2" body="$3"

  if printf '%s\n' "$existing_titles" | grep -Fxq "$title"; then
    echo "  issue skipped:  $title"
    return
  fi

  gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body" >/dev/null
  echo "  issue created:  $title"
}

echo "Issues"

create_issue "Project foundation and architecture" "feature,backend" \
"Establish the Next.js 15 + TypeScript baseline with strict compiler settings, the layered architecture (routes → services → repositories → domain), environment validation that fails fast and legibly, the error taxonomy, and a redacting logger.

**Acceptance**
- Strict TypeScript with \`noUncheckedIndexedAccess\`; no \`any\`.
- \`lib/\` imports nothing from \`server/\` or \`app/\`, so the engine is testable without a framework.
- Configuration is validated at startup and reports every invalid key at once.
- The logger cannot emit resume text, credentials or tokens."

create_issue "Design system and brand identity" "feature,frontend" \
"Three-layer design tokens (primitive → semantic → component) as CSS variables, and an original brand mark.

**Acceptance**
- Light and dark are a token swap; no component carries a raw colour.
- The mark is original, legible at 16px, and correct in monochrome.
- \`prefers-reduced-motion\` honoured globally."

create_issue "Authentication and session management" "feature,security,backend" \
"Email/password authentication with revocable sessions.

**Acceptance**
- bcrypt cost 12; opportunistic rehash on login.
- httpOnly, SameSite=Lax, Secure-in-production session cookie.
- A session epoch invalidates every issued token on password change.
- Unknown address and wrong password are indistinguishable in message *and* timing.
- Account lockout after repeated failures."

create_issue "Resume upload and parsing" "feature,backend" \
"Accept PDF and DOCX, validate by byte signature, extract text and layout signals, and parse into a structured profile.

**Acceptance**
- Filename and Content-Type are hints; the byte signature decides.
- Encrypted, empty, scanned and non-resume files are rejected with actionable copy.
- Multi-column layouts, tables, text boxes and embedded images are detected.
- The parser leaves fields it cannot find as null rather than guessing."

create_issue "Job description analysis" "feature,backend" \
"Extract structured requirements from a posting.

**Acceptance**
- Required and preferred are distinguished by how the posting frames them.
- Benefits and company boilerplate are excluded from requirements and keywords.
- A vague posting yields fewer requirements rather than padded ones."

create_issue "Deterministic matching engine" "feature,backend" \
"Match requirements against resume evidence without a language model.

**Acceptance**
- Token-boundary matching: \`Java\` never satisfies a \`JavaScript\` requirement.
- Aliases, one-directional implication (PostgreSQL → SQL, not the reverse) and adjacency are distinct relationships.
- Cloud providers are never interchangeable.
- Every match cites the exact source span that supports it.
- Identical inputs always produce identical output."

create_issue "AI optimization engine with provider abstraction" "feature,ai" \
"A provider-agnostic AI layer that rewrites prose, plus a rule-based engine that works with no API key.

**Acceptance**
- Structured output only, validated against a Zod schema, with bounded repair and fail-closed behaviour.
- Anthropic, OpenAI and deterministic providers behind one interface.
- The rule-based engine is a real fallback, not a stub.
- Versioned prompts recorded on every run."

create_issue "Anti-fabrication validation" "feature,ai,security" \
"Guarantee that no optimization introduces information absent from the source resume — enforced by verifying output, not by prompt wording.

**Acceptance**
- Reject any rewrite introducing an unevidenced skill, a metric absent from the text being rewritten, an unknown entity, or an escalation of scope.
- Verify that cited evidence actually occurs in the resume.
- Employers, titles, dates, education and certifications are immutable.
- Covered by adversarial tests feeding the validator output a cooperative model would never produce."

create_issue "ATS readiness scoring and validation" "feature,backend" \
"Deterministic ATS checks and a transparent weighted score.

**Acceptance**
- Seven weighted dimensions summing to 1, each explained.
- Sixteen structural checks returning what was observed and what to do about it.
- The score is never presented without its estimate disclaimer.
- No claim of 'ATS compliant' or a guaranteed score anywhere in the product."

create_issue "DOCX generation" "feature,backend" \
"Generate an ATS-friendly Word document.

**Acceptance**
- Single section, single column, no tables, text boxes, images, headers or footers.
- Standard heading names and real heading styles.
- Verified by re-opening the file and reading the text back."

create_issue "PDF generation" "feature,backend" \
"Generate an ATS-friendly PDF with selectable text.

**Acceptance**
- Real typeset text, never a rasterised page.
- Correct WinAnsi handling, preserving typography the encoding supports and folding what it does not.
- Geometric verification: no run crosses a margin, no lines overlap, long URLs hard-wrap, pagination drops nothing."

create_issue "Dashboard, review and history" "feature,frontend" \
"The authenticated product surface.

**Acceptance**
- Dashboard, five-step optimize workflow, analysis breakdown, change-by-change review, print-ready preview, history, settings.
- Every empty, loading and error state deliberately designed.
- Progress reported by named stage, never a fabricated percentage.
- No horizontal overflow from 320px upward."

create_issue "Security hardening" "security,backend" \
"Close the classes of vulnerability that matter for a product holding resumes.

**Acceptance**
- Every query scoped by user id; another account's row reports 404, never 403.
- Origin-checked CSRF on state-changing requests.
- Per-bucket rate limiting, configurable, per-account when authenticated.
- Prompt injection defended by output verification, with fencing and neutralisation as hardening.
- Storage keys generated server-side; no user input reaches a path.
- Security headers including a strict CSP."

create_issue "Test coverage: unit, integration and end-to-end" "testing" \
"Prove the guarantees rather than measure line coverage.

**Acceptance**
- Unit suite with no database, network or model.
- Integration suite against real PostgreSQL, including cross-account access.
- End-to-end suite against a production build covering the full journey and both exports.
- CI runs all of it behind a single required status check."

create_issue "Production deployment" "devops" \
"Deploy to Vercel with managed PostgreSQL and S3-compatible storage.

**Acceptance**
- Production and Preview use separate databases and buckets.
- Migrations applied as a deliberate release step, not automatically on deploy.
- \`/api/health\` reports database reachability and configuration validity.
- The post-deployment smoke test in docs/deployment.md passes against the real deployment."

create_issue "Add email verification and password reset" "feature,security" \
"The most conspicuous gap before a commercial launch: an account can currently be created with an address the user does not control, and there is no way to recover one.

**Blocked on** choosing an email transport.

**Acceptance**
- Verification link on signup; unverified accounts are limited.
- Password reset by signed, single-use, expiring token.
- Reset increments the session epoch, invalidating existing sessions."

create_issue "Supplement lexical matching with embeddings" "enhancement,ai" \
"Token overlap misses paraphrase: 'built data pipelines' and 'developed ETL workflows' describe the same work and currently score as unrelated.

Add embedding similarity as a **supplementary** signal only. The deterministic score must remain reproducible and explainable, so an embedding may raise a match to 'partial' but must not by itself mark a requirement satisfied.

**Acceptance**
- The score remains reproducible for identical inputs.
- Every match still names the method that established it.
- Anti-fabrication behaviour is unchanged."

create_issue "Move optimization processing to a queue worker" "enhancement,devops" \
"Runs currently execute synchronously within the 60-second function budget. The seam already exists — the run row is created before any work begins, and the client already polls the run endpoint.

**Acceptance**
- \`POST /api/optimizations\` enqueues and returns 202 with the run id.
- \`runOptimization\` moves unchanged; it touches nothing request-scoped.
- No change to the API contract or the client."

echo
echo "Done."
echo "Next: gh pr create --fill  (see docs/github/pull-request-template.md)"
