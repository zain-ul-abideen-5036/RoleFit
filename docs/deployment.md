# RoleFit Production Deployment

> **Status: not deployed.** RoleFit is deployment-ready and verified against a
> production build locally, but no production deployment has been performed and
> no production URL exists. This document is the procedure to follow, not a
> record of something already done.

Follow the steps in order. Each one ends with a value you paste into the next.
You do not need to understand cloud infrastructure — every value you need is
copied from a web page and pasted into another web page.

**Everything here uses a free tier, and none of the four services asks for a
credit card to sign up.**

---

## The short version

Three signups, four commands, one paste. Everything that can be decided without
an account is already decided.

```bash
# 1. Generates .env.production.local with a fresh AUTH_SECRET and every
#    non-account value already filled in.
npm run deploy:init

# 2. Fill in the 8 blanks it lists, from Neon / Backblaze / Upstash.
#    (Steps 1-3 below say exactly where each one is.)

# 3. Create the database schema.
npm run deploy:migrate

# 4. Actually talk to all three services and check every value works.
npm run deploy:preflight
```

Preflight connects to your database, uploads and deletes a real object in your
bucket, and runs a real Redis command. Nothing is guessed. If it passes, it
prints the exact variable list to paste into Vercel.

Then: import the repo in Vercel, paste that block, deploy, add
`NEXT_PUBLIC_APP_URL`, redeploy. Steps 6 and 9.

The first deploy works without `NEXT_PUBLIC_APP_URL` — the app falls back to
the hostname Vercel assigns. Setting it afterwards pins your canonical URL.
Just do not create the variable with an empty value.

**What still needs you, and why:** creating the three accounts, and clicking
Deploy. I have no credentials for Neon, Backblaze, Upstash or Vercel, and
generating fake ones would produce a guide that fails on your first attempt.
Everything on this side of that line is automated.

## Architecture

Four services. Only one of them runs your code.

```
                    ┌──────────────────────┐
   your browser ───▶│   Vercel             │  the RoleFit app itself
                    │   (Next.js hosting)  │
                    └───────┬──────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Neon          │   │ Backblaze B2  │   │ Upstash       │
│ PostgreSQL    │   │ object storage│   │ Redis         │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ accounts,     │   │ uploaded      │   │ rate limit    │
│ resumes,      │   │ resumes and   │   │ counters      │
│ analyses,     │   │ generated PDF │   │ shared across │
│ change history│   │ and DOCX files│   │ instances     │
└───────────────┘   └───────────────┘   └───────────────┘
```

| Service          | Role                    | Why it is separate                                                                                                                    |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**       | Application hosting     | Runs the Next.js app. Its filesystem is discarded between requests, which is why files cannot live here.                              |
| **Neon**         | PostgreSQL database     | Stores accounts and every record. The only durable record of which stored files exist.                                                |
| **Backblaze B2** | Document storage        | Holds uploaded resumes and generated PDF/DOCX files. Speaks the S3 API, so RoleFit's existing `s3` driver talks to it unmodified.     |
| **Upstash**      | Redis for rate limiting | Rate limit counters must be shared. Without it each serverless instance counts separately, so real limits multiply by instance count. |
| _AI provider_    | _optional_              | Not required. Without a key RoleFit runs its offline deterministic engine.                                                            |

### Free tier limits, honestly

These are the constraints you are accepting. They change, so confirm on each
provider's pricing page.

- **Neon** — around 0.5 GB of storage on the free plan, and the database
  **suspends when idle**. The first request after a quiet period takes noticeably
  longer while it wakes. That is normal, not a bug.
- **Backblaze B2** — the first 10 GB of storage is free and downloads are free
  up to a daily allowance. No credit card is requested at signup. Generated
  resumes are tens of kilobytes, so 10 GB is a great deal of headroom.
- **Upstash** — a daily command limit on the free plan. RoleFit issues a couple
  of commands per rate-limited request, so this is generous for personal use.
- **Vercel Hobby** — free, but **licensed for non-commercial use only**. Fine for
  a portfolio project; you need a paid plan if RoleFit ever earns money. Request
  bodies are capped at 4.5 MB, which is why `MAX_UPLOAD_BYTES` defaults to
  4,500,000.

---

## Step 1 — Neon (PostgreSQL)

1. Go to **[neon.tech](https://neon.tech)** and sign up (GitHub sign-in is fine).
2. Create a project. Name it `rolefit`. Choose the region closest to you.
3. Neon creates a database called `neondb` automatically. You do not need to
   create one yourself.
4. On the project page find the **Connection string** box.

You need **two** versions of that string. There is a **Connection pooling**
toggle next to it:

| Toggle          | Copy it as      | Used for                               | How to recognise it     |
| --------------- | --------------- | -------------------------------------- | ----------------------- |
| Pooling **on**  | `DATABASE_URL`  | The running app, on Vercel             | Host contains `-pooler` |
| Pooling **off** | _direct string_ | Running migrations, once, from your PC | Host has no `-pooler`   |

They look like this — these are placeholders, not real credentials:

```
pooled  postgresql://USER:PASSWORD@ep-example-123-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
direct  postgresql://USER:PASSWORD@ep-example-123.us-east-2.aws.neon.tech/neondb?sslmode=require
                                                ▲ no "-pooler"
```

Both must end with `?sslmode=require`. If yours does not, add it.

**Why two:** the app runs as many short-lived serverless functions, so it needs
the pooler to avoid exhausting connections. Migrations must run one at a time on
a single session, so they use the direct connection.

Save both somewhere private for now. Paste them nowhere else.

---

## Step 2 — Backblaze B2 (document storage)

RoleFit cannot store files on Vercel — that filesystem is wiped between
requests, so a generated PDF would vanish. The environment validator refuses to
start with the local driver on serverless hosting and tells you so.

**Backblaze B2 does not ask for a credit card to sign up**, which is why it is
the documented provider here.

### 2a. Create the account and bucket

1. Go to **[backblaze.com](https://www.backblaze.com)** and sign up for
   **B2 Cloud Storage**. Confirm your email address.
2. In the left sidebar choose **Buckets** → **Create a Bucket**.
3. Fill it in:

   | Field               | Value                                                         |
   | ------------------- | ------------------------------------------------------------- |
   | Bucket Unique Name  | something only you will have, e.g. `rolefit-docs-<your-name>` |
   | Files in Bucket are | **Private** ← this matters                                    |
   | Default Encryption  | **Enable**                                                    |
   | Object Lock         | Disable                                                       |

   Bucket names on B2 are **globally unique across every Backblaze customer**,
   so a plain name like `rolefit-documents` will very likely be taken. Add
   something distinctive.

   Keep it **Private**. RoleFit never needs public objects: it hands the browser
   a signed link that expires in five minutes. A public bucket would make every
   resume in it world-readable to anyone who learned a filename.

4. Create the bucket. In the bucket list you now see a line like:

   ```
   Endpoint: s3.us-west-004.backblazeb2.com
   ```

   Write that down. Two RoleFit values come out of it:

   | RoleFit variable   | Value                                                                 |
   | ------------------ | --------------------------------------------------------------------- |
   | `STORAGE_ENDPOINT` | `https://s3.us-west-004.backblazeb2.com` (add `https://`)             |
   | `STORAGE_REGION`   | `us-west-004` — the middle part, between `s3.` and `.backblazeb2.com` |

   Your region may differ. Use whatever Backblaze shows you. RoleFit checks
   these two agree when it starts, and refuses to boot if they do not — a
   mismatched region is otherwise rejected as an unexplained `403` on your first
   upload.

### 2b. Create an application key

1. Sidebar → **Application Keys** → **Add a New Application Key**.
2. Fill it in:

   | Field                       | Value                                    |
   | --------------------------- | ---------------------------------------- |
   | Name of Key                 | `rolefit-production`                     |
   | Allow access to Bucket(s)   | **select only the bucket you just made** |
   | Type of Access              | **Read and Write**                       |
   | Allow List All Bucket Names | leave unticked                           |
   | File name prefix / duration | leave blank                              |

   Restricting the key to one bucket means a leaked key reaches nothing else in
   your account. RoleFit only ever reads, writes and deletes objects in that one
   bucket, so it needs nothing broader.

3. Create it. Backblaze shows you two values **once**:

   | Backblaze shows  | Paste into RoleFit's |
   | ---------------- | -------------------- |
   | `keyID`          | `STORAGE_ACCESS_KEY` |
   | `applicationKey` | `STORAGE_SECRET_KEY` |

   Copy both now. The `applicationKey` is never shown again — if you lose it,
   delete the key and make a new one.

> Use the **application key you just created**, not your account's master key.
> The master key is unrestricted, and B2 treats it differently on the S3 API.

### 2c. What goes where, in summary

| RoleFit variable           | Where it comes from                         | Example (placeholder)                    |
| -------------------------- | ------------------------------------------- | ---------------------------------------- |
| `STORAGE_DRIVER`           | fixed                                       | `s3`                                     |
| `STORAGE_ENDPOINT`         | bucket's Endpoint line, prefixed `https://` | `https://s3.us-west-004.backblazeb2.com` |
| `STORAGE_REGION`           | middle of that endpoint                     | `us-west-004`                            |
| `STORAGE_ACCESS_KEY`       | application key `keyID`                     | `PLACEHOLDER_KEY_ID`                     |
| `STORAGE_SECRET_KEY`       | application key `applicationKey`            | `PLACEHOLDER_APPLICATION_KEY`            |
| `STORAGE_BUCKET`           | your bucket's name                          | `rolefit-docs-example`                   |
| `STORAGE_FORCE_PATH_STYLE` | fixed                                       | `true`                                   |

`STORAGE_FORCE_PATH_STYLE=true` puts the bucket in the URL path
(`https://s3.<region>.backblazeb2.com/<bucket>/<key>`), which is the form
Backblaze's own documentation uses. Both addressing styles work against B2; this
one is pinned by a test so the documented value is a decision rather than an
accident.

---

## Step 3 — Upstash (Redis for rate limiting)

1. Go to **[upstash.com](https://upstash.com)** and sign up.
2. **Create Database** → type **Redis**. Name it `rolefit`. Pick the region
   closest to the one Vercel will deploy to (`vercel.json` uses `iad1`, US East).
3. Open the database, scroll to the **REST API** section, and copy two values:

   | Upstash shows              | RoleFit variable           |
   | -------------------------- | -------------------------- |
   | `UPSTASH_REDIS_REST_URL`   | `UPSTASH_REDIS_REST_URL`   |
   | `UPSTASH_REDIS_REST_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |

   The names match exactly. Copy them across as-is.

You can skip this step, but then set `RATE_LIMIT_DRIVER=memory` and understand
what you are accepting: each serverless instance keeps its own counters, so your
real limits are multiplied by however many instances are running. RoleFit prints
a startup warning saying so rather than failing.

---

## Step 4 — AUTH_SECRET

**Already done for you.** `npm run deploy:init` generated one and wrote it into
`.env.production.local` — 48 random bytes in a URL-safe encoding. It was never
printed to the terminal and is not in version control.

If you ever need to generate another by hand:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**What it does:** it signs the session cookie that keeps people logged in. The
server uses it to verify a cookie was issued by RoleFit and not forged. It never
leaves the server and is never sent to a browser.

Two consequences worth knowing:

- Anyone who learns this value can forge a session for any account. Treat it
  like a password.
- If you change it later, every signed-in user is logged out. That is the
  intended behaviour, and it is also the emergency lever if the value ever leaks.

RoleFit refuses to start in production if this still holds a placeholder value,
and `npm run deploy:preflight` checks it too.

---

## Step 5 — Database Migration

This creates RoleFit's tables in your Neon database. Run it **once now**, from
your own machine, using the **direct** (non-pooled) connection string from
Step 1.

```bash
npm run deploy:migrate
```

That reads `DATABASE_URL` from `.env.production.local`, so there is nothing to
paste into a terminal and no credential in your shell history.

If you would rather pass it explicitly — for a one-off against a different
database — the underlying script takes it from the environment:

```powershell
$env:DATABASE_URL="YOUR_DIRECT_NEON_CONNECTION_STRING"
npm run db:migrate
```

Success looks like exactly this:

```
Migrations applied.
```

Then confirm in the Neon console under **Tables**. You should see:

13 tables: `users`, `profiles`, `resumes`, `resume_versions`,
`job_descriptions`, `analyses`, `optimization_runs`, `change_records`,
`generated_documents`, `auth_tokens`, `jobs`, `usage_records`, `audit_records`.

You do not need to check them by hand — `npm run deploy:preflight` verifies the
migration ledger for you.

**Why not automatic:** migrations are deliberately not run on deploy. An
automatic migration on every deploy will eventually run a destructive one
against production unattended, at the worst possible moment.

---

## Step 6 — Vercel

1. Go to **[vercel.com](https://vercel.com)** and choose **Continue with
   GitHub**. Use the account that owns the RoleFit repository.
2. **Add New → Project**.
3. RoleFit is a **private** repository, so Vercel will not list it until you
   grant access: click **Adjust GitHub App Permissions**, allow access to
   `RoleFit`, then come back and click **Import**.
4. Vercel detects Next.js on its own. **Change none of the build settings** —
   leave Framework Preset, Root Directory, Build Command and Output Directory
   exactly as they are. `vercel.json` in the repository already sets the region
   and the per-route function timeouts.
5. Expand **Environment Variables** and add every variable from Step 7 below.
   Do this **before** the first build.
6. Click **Deploy** and wait a few minutes.

Leave `NEXT_PUBLIC_APP_URL` out for now — you do not know your URL yet, and
Step 9 handles it properly.

---

## Step 7 — Environment Variables

Add all of these to the Vercel project. Every one is required unless marked
optional.

### Secret values — never commit these, never paste them in a chat or an issue

| Variable                   | Value                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`             | Neon **pooled** connection string (Step 1) — contains a password |
| `AUTH_SECRET`              | the generated secret (Step 4)                                    |
| `STORAGE_ACCESS_KEY`       | Backblaze application key `keyID` (Step 2b)                      |
| `STORAGE_SECRET_KEY`       | Backblaze `applicationKey` (Step 2b)                             |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token (Step 3)                                      |
| `AI_API_KEY`               | _optional_ — only if you set `AI_PROVIDER` to a real provider    |

### Non-secret values — configuration, not credentials

| Variable                   | Value                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_POOL_MAX`        | `2`                                                                                        |
| `STORAGE_DRIVER`           | `s3`                                                                                       |
| `STORAGE_ENDPOINT`         | `https://s3.<your-region>.backblazeb2.com` (Step 2a)                                       |
| `STORAGE_REGION`           | `<your-region>`, e.g. `us-west-004` (Step 2a)                                              |
| `STORAGE_BUCKET`           | your bucket name (Step 2a)                                                                 |
| `STORAGE_FORCE_PATH_STYLE` | `true`                                                                                     |
| `RATE_LIMIT_DRIVER`        | `upstash`                                                                                  |
| `UPSTASH_REDIS_REST_URL`   | Upstash REST URL (Step 3) — identifies your database, but grants nothing without the token |
| `AI_PROVIDER`              | `deterministic`                                                                            |
| `LOG_LEVEL`                | `info`                                                                                     |
| `NEXT_PUBLIC_APP_URL`      | **added in Step 9**, after Vercel gives you a URL                                          |

### Three things not to set

- **`NODE_ENV`** — Vercel sets it. Overriding it breaks the production checks.
- **`RATE_LIMIT_MULTIPLIER`** — exists so the test suite can exercise the real
  limiter. Anything above `1` weakens abuse protection everywhere.
- **`MAX_UPLOAD_BYTES`** above `4500000` — Vercel rejects larger request bodies
  before your code ever runs, so a higher value only produces a worse error.

Configuration is validated when the app starts, and it reports **every** invalid
key at once rather than failing on the first. If something is wrong you get one
clear list, not a scavenger hunt.

---

## Step 8 — Health Check

When the build finishes, Vercel shows your production URL — something like
`rolefit-abc123.vercel.app`. Open:

```
https://YOUR_DOMAIN/api/health
```

A healthy deployment returns HTTP 200 and JSON reporting `status` as `ok`, with
a `checks` object confirming configuration parsed and the database is reachable,
plus which storage and rate-limit drivers are active. It deliberately reveals no
secrets and no user data — it confirms the app is wired up, which is exactly what
a deployment check needs.

If anything is wrong you get HTTP 503 and `status: "degraded"`, with the failing
check named:

| What you see              | What it means                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `database: "unreachable"` | `DATABASE_URL` is wrong, or missing `?sslmode=require`. Check you used the **pooled** string.                                                 |
| `config: "invalid"`       | A variable failed validation. Open **Vercel → your deployment → Runtime Logs**; the error names the exact variable and what is wrong with it. |

Point an uptime monitor at this URL later. It fails when the database is
unreachable or configuration is invalid, which is what a liveness probe should
catch.

---

## Step 9 — NEXT_PUBLIC_APP_URL

Only now, once you know your real URL:

1. **Vercel → Settings → Environment Variables → Add**
   - Name: `NEXT_PUBLIC_APP_URL`
   - Value: `https://YOUR_DOMAIN` — no trailing slash
   - Environment: **Production**
2. **Deployments → ⋯ on the most recent → Redeploy**

The redeploy is required: this value is compiled into the browser bundle, so it
cannot be picked up without a rebuild.

**Why it matters.** It is used for SEO metadata and your sitemap, and it is the
origin the CSRF check trusts. It is **required in production** — if it is unset,
startup fails with a message naming it. That is deliberate: it previously
defaulted to localhost, passed validation, and then refused every sign-in,
upload and export with a `403`.

> **Do not create it empty.** Adding the variable in Vercel with a blank value
> is not the same as leaving it out: an empty value used to fail the build with
> `Invalid URL` on `/_not-found`, and then fail every request at runtime. Both
> are fixed — the app now falls back to the URL Vercel assigns — but leaving it
> out until you have a real value is still the cleaner path.

**Preview deployments need nothing here.** A preview gets a hostname generated
per deployment that nobody could configure in advance, so RoleFit trusts the
platform-provided `VERCEL_URL`, `VERCEL_BRANCH_URL` and
`VERCEL_PROJECT_PRODUCTION_URL`. Those come from Vercel itself rather than from a
request header, so a forged `Host` cannot influence them — which is precisely
why `Host` stays untrusted in production.

---

## Step 10 — Production Smoke Test

Work through this by hand on the real deployment. **None of it is covered by
CI**, because CI has no production credentials.

| #   | Check                    | What to do                                     | Expected                                                            |
| --- | ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Homepage                 | Open `/`                                       | Landing page renders, no console errors                             |
| 2   | Health endpoint          | Open `/api/health`                             | `status: ok`, database reachable                                    |
| 3   | Signup                   | Create an account                              | Lands on the dashboard; session cookie is `Secure` and `HttpOnly`   |
| 4   | Logout                   | Sign out                                       | Returned to a signed-out state                                      |
| 5   | Login                    | Sign back in                                   | Session restored, data intact                                       |
| 6   | Wrong password           | Sign in with a bad password                    | Generic message; no hint whether the account exists                 |
| 7   | PDF upload               | Upload a PDF resume                            | Parsed; role and skill counts shown                                 |
| 8   | DOCX upload              | Upload a DOCX resume                           | Same                                                                |
| 9   | Invalid file rejection   | Rename a `.txt` to `.pdf`, upload it           | Rejected with actionable copy, not a crash                          |
| 10  | Job description analysis | Paste a job description, analyse               | Analysis completes                                                  |
| 11  | ATS score                | Look at the result                             | Score shown **with** its estimate disclaimer                        |
| 12  | Gap analysis             | Read the breakdown                             | Missing requirements listed, each marked as a gap                   |
| 13  | Optimization             | Run an optimization                            | Changes listed with before/after and a rationale                    |
| 14  | Accept / reject changes  | Reject one, accept another, reload             | Both decisions persisted                                            |
| 15  | PDF export               | Download the PDF                               | Opens; text is **selectable**, not an image                         |
| 16  | DOCX export              | Download the DOCX                              | Opens in Word with no repair prompt                                 |
| 17  | History                  | Open the history page                          | The run appears                                                     |
| 18  | Storage verification     | Open your B2 bucket                            | Objects under `uploads/` and `generated/`; bucket still **Private** |
| 19  | Account isolation        | Copy a resume URL, open it in a second account | **404**, not 403 — a 403 would confirm the id exists                |
| 20  | Logs                     | Check Vercel runtime logs                      | No resume text, no passwords, no tokens                             |

If step 18 shows nothing, storage is misconfigured even though the app appeared
to work — check the Backblaze values from Step 2c.

---

## Step 11 — Custom Domain (optional)

1. **Vercel → Settings → Domains → Add**, and enter your domain.
2. Vercel shows the DNS records to create. Add them at your registrar.
3. Wait for Vercel to report the domain as valid. TLS is issued automatically.
4. **Update `NEXT_PUBLIC_APP_URL`** to the new origin and redeploy.

Step 4 is not optional. Leave it pointing at the old `.vercel.app` URL and the
CSRF origin check will reject requests coming from your new domain.

---

## Step 12 — Future deployments

Every push to `main` deploys to production automatically once the repository is
connected. Turn that off under **Settings → Git** if you would rather promote
manually.

**Migrations are never automatic.** When you pull changes that add a file under
`db/migrations/`, run Step 5 again with the **direct** Neon connection string
_before_ the new code goes live:

```powershell
$env:DATABASE_URL="YOUR_DIRECT_NEON_CONNECTION_STRING"
npm run db:migrate
```

Order matters: apply the schema change first, confirm the currently deployed
code still works against it, then let the new code deploy. Write migrations to
be backward-compatible for exactly this reason — add a nullable column, backfill
it, switch reads over, drop the old one in a later release. That sequence never
needs a down migration under pressure.

**Rolling back code:** Vercel keeps previous deployments. Promote the last good
one from the dashboard, or run `vercel rollback`. Note that a code rollback does
**not** roll back the database.

---

## Reference

### Operational notes

- **Backups.** Enable point-in-time recovery on Neon. The database is the only
  record of which stored objects exist, so restoring the database without a
  matching bucket state orphans files.
- **Bucket lifecycle.** Consider expiring `uploads/` after 90 days. Objects under
  `generated/` are what users come back for — keep those.
- **Log retention.** Logs contain no resume content by design, but they do carry
  user ids and truncated IP prefixes. Set a retention period.
- **Preview environments.** If you later add a Preview environment, point it at a
  **separate database and bucket**. Previews sharing production data is how a
  test account ends up in a real user's dashboard.

### Other S3-compatible providers

The `s3` driver is generic. Backblaze B2 is documented here because it needs no
payment card, but the same variables work elsewhere:

| Provider          | `STORAGE_ENDPOINT`                              | `STORAGE_REGION`    | `STORAGE_FORCE_PATH_STYLE` |
| ----------------- | ----------------------------------------------- | ------------------- | -------------------------- |
| Backblaze B2      | `https://s3.<region>.backblazeb2.com`           | e.g. `us-west-004`  | `true`                     |
| AWS S3            | leave blank                                     | e.g. `eu-central-1` | `false`                    |
| Cloudflare R2     | `https://<account-id>.r2.cloudflarestorage.com` | `auto`              | `true`                     |
| MinIO (self-host) | your MinIO URL                                  | any, must match     | `true`                     |

When the endpoint names a region in its hostname, RoleFit checks it against
`STORAGE_REGION` at startup and refuses to boot on a mismatch.

### Moving optimization to a worker

Optimization runs synchronously inside the request today, within the 60-second
function budget set in `vercel.json`. A deterministic run finishes in well under
a second; an LLM run finishes inside `AI_TIMEOUT_MS` (45s default). If runs start
approaching the ceiling — batch optimization, or a slower provider — see
[issue #18](https://github.com/zain-ul-abideen-5036/RoleFit/issues/18). The
groundwork exists: `POST /api/optimizations` creates the run row before doing any
work, so it can enqueue and return `202`, and `runOptimization` takes
`(userId, analysisId)` and touches nothing request-scoped. The client would need
polling added — it currently navigates on the resolved request rather than
polling.
