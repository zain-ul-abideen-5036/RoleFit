# Database

PostgreSQL, accessed through Drizzle ORM. Eleven tables, all keyed by UUID, all
cascading from `users`.

## Why Drizzle

Typed SQL without a query-engine binary. Prisma's engine adds cold-start weight
and a build step that serverless deployment does not need, and Drizzle's schema
is plain TypeScript, so row types are inferred rather than generated.

## Schema

```
users ─┬─ profiles                (1:1)
       ├─ resumes ────┬─ resume_versions
       │              ├─ analyses ──── optimization_runs ──── change_records
       │              └─ generated_documents
       ├─ job_descriptions ─────── analyses
       ├─ usage_records
       └─ audit_records
```

| Table                 | Purpose                     | Notable columns                                                              |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `users`               | Account and credentials     | `password_hash`, `session_epoch`, `failed_login_count`, `locked_until`       |
| `profiles`            | Display and preferences     | `display_name`, `analytics_opt_in`, `auto_purge_uploads`                     |
| `resumes`             | An uploaded resume          | `raw_text`, `profile` (jsonb), `content_hash`, `deleted_at`                  |
| `resume_versions`     | Immutable content snapshots | `version_number`, `label`, `profile`                                         |
| `job_descriptions`    | A posting and its parse     | `raw_text`, `profile` (jsonb)                                                |
| `analyses`            | A scored comparison         | `overall_score`, `report`, `ats_report`                                      |
| `optimization_runs`   | One optimization attempt    | `status`, `provider`, `prompt_version`, `change_set`, `projected_score`      |
| `change_records`      | One proposed change         | `target_path`, `action`, `before_text`, `after_text`, `evidence`, `decision` |
| `generated_documents` | An exported file            | `storage_key`, `checksum`, `validation`                                      |
| `usage_records`       | Cost accounting             | `provider`, token counts, `duration_ms`                                      |
| `audit_records`       | Security-relevant events    | `action`, `ip_prefix`, `user_agent_hash`                                     |

## Design decisions

**`session_epoch` on `users`.** Bumped on password change, invalidating every
issued JWT immediately. This is what lets the product revoke sessions without a
session table and without waiting for token expiry.

**`profile` as `jsonb`.** A resume's structure is genuinely variable — one
candidate has zero projects and four skill groups, another the reverse.
Normalising it into a dozen tables would mean a dozen joins to render one page,
for a document that is always read and written whole. The shape is enforced by
Zod at every boundary rather than by DDL.

**`raw_text` alongside `profile`.** Keeping the extracted text lets the parser
be improved and re-run against existing uploads without asking users to
re-upload.

**`content_hash`.** Re-uploading the same file returns the existing record
rather than creating a duplicate the user then has to tell apart.

**One row per change.** `change_records` makes acceptance auditable, and means
the final document is rebuilt from the original plus decisions alone. The resume
is never mutated in place, so a change of mind is always reversible.

**Soft delete on `resumes` and `generated_documents`.** `deleted_at` removes an
item from the product immediately while leaving room to recover from an
accidental deletion. Account deletion is a hard cascade.

**Version 1 is always the original.** Written in the same transaction as the
resume, so a user can always return to exactly what they uploaded.

**`audit_records.ip_prefix`.** Truncated to /24 (IPv4) or /48 (IPv6) before
storage. Enough to correlate abuse, not enough to track a person.

## Indexes

Every index exists because a real query needs it.

| Index                                    | Serves                                  |
| ---------------------------------------- | --------------------------------------- |
| `users_email_unique`                     | Login lookup and duplicate-signup check |
| `resumes_user_created_idx`               | Dashboard and history listings          |
| `resumes_user_hash_idx`                  | Duplicate-upload detection              |
| `analyses_user_created_idx`              | Recent analyses                         |
| `optimization_runs_user_created_idx`     | Recent runs                             |
| `change_records_run_idx`                 | Loading a review screen                 |
| `generated_documents_storage_key_unique` | Guards against key collision            |
| `audit_records_action_created_idx`       | Security review by event type           |

Composite `(user_id, created_at DESC)` rather than two separate indexes: every
listing is scoped by user _and_ ordered by recency, so one index serves both.

## Migrations

Generated by `drizzle-kit` from the schema, never hand-written:

```bash
npm run db:generate   # after editing db/schema.ts
npm run db:migrate    # apply
```

`scripts/migrate.ts` opens its own single connection rather than using the
pooled application client — migrations must run serially and must not compete
with request traffic for pool slots.

Migrations are checked in and applied as a release step before new application
code is promoted.

## Connection pooling

Pooled with `postgres.js` and memoised on `globalThis`, so dev-mode module
reloading does not open a new pool on every edit and a warm serverless instance
reuses its connection.

`DATABASE_POOL_MAX` defaults to 5. Serverless scales by process count, so a
large per-instance pool exhausts PostgreSQL's connection limit long before it
helps throughput. Behind PgBouncer keep it at 1–2; `prepare: false` is already
set, which transaction pooling requires.

## Local development

```bash
npm run db:up        # PostgreSQL 16 on localhost:5433
npm run db:migrate
npm run db:down
```

Port 5433 rather than 5432, so the container does not collide with a PostgreSQL
already installed on the host.

Three databases are used: `rolefit` for development, `rolefit_test` for
integration tests, and `rolefit_e2e` for Playwright.
