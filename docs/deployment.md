# Deployment

> **Status: not deployed.** The application is deployment-ready and verified
> against a production build locally, but no production deployment has been
> performed and no production URL exists. Everything below is the procedure to
> follow, not a record of something already done.

## What you need first

| Service                | Purpose              | Suggested                           |
| ---------------------- | -------------------- | ----------------------------------- |
| Hosting                | The app              | Vercel                              |
| PostgreSQL             | Data                 | Neon, Supabase, or RDS              |
| S3-compatible storage  | Documents            | Cloudflare R2, AWS S3, Backblaze B2 |
| Redis (optional)       | Shared rate limiting | Upstash                             |
| AI provider (optional) | Prose rewriting      | Anthropic or OpenAI                 |

Storage is **not** optional on serverless. The local driver writes to a
filesystem that does not persist between invocations, and the environment
validator rejects it outright when it detects a serverless platform.

## Environment variables

Set these in the Vercel project (or your host's equivalent). Never commit them.

### Required

| Variable                                    | Notes                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Must include `?sslmode=require` for a managed database                                                            |
| `AUTH_SECRET`                               | 32+ random bytes. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`                |
| `NEXT_PUBLIC_APP_URL`                       | Your production origin, e.g. `https://rolefit.app`. Used for SEO metadata, the sitemap, and the CSRF origin check |
| `STORAGE_DRIVER`                            | `s3`                                                                                                              |
| `STORAGE_ENDPOINT`                          | R2/B2 endpoint; omit for AWS S3                                                                                   |
| `STORAGE_REGION`                            | `auto` for R2                                                                                                     |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | Scoped to the one bucket                                                                                          |
| `STORAGE_BUCKET`                            | Must have public access blocked                                                                                   |

### Strongly recommended

| Variable                            | Value                            | Why                                                                     |
| ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `RATE_LIMIT_DRIVER`                 | `upstash`                        | The memory driver is per-instance, so limits multiply by instance count |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` |                                  | Required by the above                                                   |
| `DATABASE_POOL_MAX`                 | `2`–`5`, or `1` behind PgBouncer | Serverless scales by process count                                      |

### Optional

| Variable                | Default         | Notes                                                             |
| ----------------------- | --------------- | ----------------------------------------------------------------- |
| `AI_PROVIDER`           | `deterministic` | `anthropic` or `openai` to enable prose rewriting                 |
| `AI_API_KEY`            | —               | Server-side only. Never prefix `NEXT_PUBLIC_`                     |
| `AI_MODEL`              | per provider    | Override the default                                              |
| `LOG_LEVEL`             | `info`          |                                                                   |
| `RATE_LIMIT_MULTIPLIER` | `1`             | Leave at 1. Raising it weakens abuse protection and the app warns |

The application validates configuration at startup and fails with every invalid
key listed at once. In production it additionally rejects a placeholder
`AUTH_SECRET` and the local storage driver on serverless.

## Procedure

### 1. Provision

Create the database, the bucket (public access blocked, SSE enabled), and the
Redis instance. Note the credentials.

### 2. Configure Vercel

```bash
npm i -g vercel
vercel link
```

Add every variable above to the Production environment, and a separate set
pointing at a **different database and bucket** for Preview. Preview deployments
sharing production data is how test accounts end up in a real user's dashboard.

`vercel.json` already sets the region and per-route `maxDuration`.

### 3. Migrate

Migrations are not run automatically, because an automatic migration on every
deploy will eventually run a destructive one against production unattended.

```bash
DATABASE_URL="postgresql://...:...@host/db?sslmode=require" npm run db:migrate
```

Run this **before** promoting new application code, and only with migrations
that are backward-compatible with the currently deployed version.

### 4. Deploy

```bash
vercel --prod
```

Or connect the GitHub repository so `main` deploys automatically and pull
requests get preview deployments.

### 5. Verify

```bash
curl -s https://your-domain/api/health | jq
```

Expect `status: "ok"` with `database: "ok"`. A `degraded` response names the
failing check.

## Post-deployment smoke test

Run through this by hand on the real deployment. Nothing below is verified by
CI, because CI does not have production credentials.

| #   | Check                                       | Expected                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | `GET /`                                     | Landing page renders, no console errors                                   |
| 2   | `GET /api/health`                           | `status: ok`, `database: ok`                                              |
| 3   | Sign up                                     | Redirects to the dashboard; the session cookie is `Secure` and `HttpOnly` |
| 4   | Sign out, sign back in                      | Session restored                                                          |
| 5   | Wrong password                              | Generic message, no account disclosure                                    |
| 6   | Upload a PDF resume                         | Parsed; role and skill counts shown                                       |
| 7   | Upload a DOCX resume                        | Same                                                                      |
| 8   | Upload a non-resume file renamed `.pdf`     | Rejected with actionable copy                                             |
| 9   | Paste a job description, analyse            | Score, breakdown and gap list appear                                      |
| 10  | Run an optimization                         | Changes listed with before/after and rationale                            |
| 11  | Reject a change, reload                     | Rejection persisted                                                       |
| 12  | Download PDF                                | Opens; text is **selectable**                                             |
| 13  | Download DOCX                               | Opens in Word without a repair prompt                                     |
| 14  | Preview page, print preview                 | Clean sheet, no app chrome                                                |
| 15  | Copy a resume URL, open in a second account | 404                                                                       |
| 16  | Delete the account                          | Everything gone; signed out                                               |
| 17  | Check logs                                  | No resume text, no email addresses, no tokens                             |
| 18  | Mobile at 375px                             | No horizontal scroll, no clipped controls                                 |

## Rollback

Vercel keeps previous deployments; promote the last good one from the dashboard
or with `vercel rollback`.

Database migrations do **not** roll back automatically. This is why migrations
should be backward-compatible: deploy the schema change first, confirm the old
code still works against it, then promote the new code. An expand-then-contract
sequence (add a nullable column, backfill, switch reads, drop later) avoids ever
needing a down migration under pressure.

## Moving processing to a worker

Optimization runs synchronously inside the request today, within the 60-second
function budget. If runs start approaching that ceiling:

1. `POST /api/optimizations` already creates the run row before doing any work,
   so it can simply enqueue and return `202` with the run id.
2. The client already polls `GET /api/optimizations/[id]`.
3. `runOptimization` moves to a worker unchanged — it takes `(userId,
analysisId)` and touches nothing request-scoped.

The API contract and the client do not change.

## Operational notes

- **Backups.** Managed PostgreSQL providers offer point-in-time recovery; enable
  it. The database is the only record of which stored objects exist, so a
  database restore without a matching bucket state orphans files.
- **Bucket lifecycle.** Consider expiring `uploads/` after 90 days. Generated
  documents under `generated/` are what users return for.
- **Log retention.** Logs contain no resume content by design, but they do
  contain user ids and truncated IP prefixes. Set a retention period.
- **Monitoring.** Point an uptime check at `/api/health` — it fails when the
  database is unreachable or configuration is invalid, which is exactly what a
  liveness probe should catch.
