# Production database migration — Cloudflare D1 → VPS PostgreSQL (jobs.wasfai.com)

**Date:** 2026-09-13 (Asia/Riyadh)
**Scope:** migrate the production relational store and server API storage of
`jobs.wasfai.com` from Cloudflare D1 (`jobs-wasfai-db`, binding `JOBS_DB`) to the
dedicated VPS PostgreSQL database `jobs` in the `jobs-postgres` container.
Cloudflare keeps DNS/WAF/frontend, and R2 `RESUME_FILES` keeps every
résumé/file blob. D1 is **not** decommissioned.

---

## 1. Proven production path (live evidence)

| Layer | Identity | Evidence |
|---|---|---|
| Public frontend | Cloudflare Pages project `jobs-wasfai`, production branch `main`, domains `jobs-wasfai.pages.dev` + `jobs.wasfai.com` | `GET /` → 200, `server: cloudflare`; Pages API project read |
| Server API | Pages Functions in `functions/` (bundled by `wrangler pages deploy public`) | `GET /api/bootstrap` 200, `/api/me/state` 200, `/api/auth/session` 200 |
| Edge middleware | `functions/_middleware.js` (CSP, CSRF/origin check, body limits) | CSP + `x-frame-options` on HTML; cross-origin PATCH → 403 |
| Ingestion Worker | `jobs-wasfai-ingestion` (cron `*/30 * * * *`, queue producer+consumer) | `GET /sources` 200 (4), `GET /jobs` 200 |
| PDF renderer | `jobs-wasfai-pdf-renderer` (container, `jobs-renderer.wasfai.com`) | untouched by this migration |
| Source store (before) | D1 `jobs-wasfai-db` `8471b0c2-e32b-4bc0-84fe-d2b6250a374e`, binding `JOBS_DB` | Pages production `deployment_configs` + worker `wrangler.jsonc` |
| Object store | R2 `jobs-wasfai-resumes`, binding `RESUME_FILES` | Pages production `deployment_configs.r2_buckets`; R2 API bucket read |
| Target store | VPS `jobs` database in container `jobs-postgres` (PG 16.15) | provisioned in this migration; volume `jobs-postgres-data` |

The local checkout `~/.openclaw/workspace/jobs-wasfai` was **rejected as deployable
truth**: 798 tracked files differ only by CRLF↔LF normalisation (working tree CRLF,
committed LF). All work was done in a clean clone of `jbx22/JOBS.wasfai.com`
`main` at `fabae1e0` (= the commit of the then-live Pages deployment).

> Note: `GET /api/health` returns `404 STATIC_DEPLOY`. That is correct behaviour —
> there is no `functions/api/health.js`; the catch-all `functions/api/[[route]].js`
> answers unknown API routes with a structured `STATIC_DEPLOY`/`NOT_FOUND` JSON body.

## 2. State inventory (D1, authoritative snapshot before cutover)

20 application tables, **128 rows** total (`_cf_KV` is D1-internal and excluded):

| Class | Tables (rows) |
|---|---|
| Accounts / auth | `users` (1), `admin_memberships` (2) |
| Profiles / workspace | `user_states` (2), `user_state_documents` (34), `resumes` (1), `resume_versions` (1) |
| Applications | `applications` (5), `application_events` (0), `generated_kits` (0) |
| Ingestion / sources | `sources` (4), `jobs` (65), `ingestion_metrics` (5) |
| Subscriptions / payments | `subscriptions` (0), `subscription_payments` (0), `payment_events` (0) |
| AI usage / settings | `ai_usage` (0), `ai_settings` (0) |
| Admin / audit / security | `audit_logs` (0), `api_rate_limits` (7) |
| R2 metadata | `resume_files` (1, `status='deleted'`) |

Résumé/file **blobs stay in R2** (`jobs-wasfai-resumes`); PostgreSQL carries only
the `resume_files` metadata (`object_key`, `size_bytes`, `sha256`,
`encryption_version`, `status`). The object key format is unchanged. The single
reference is a soft-deleted QA artifact and is also absent from R2 both before and
after the migration — R2 was never touched (`objects: []`, unchanged).

Active readers/writers of D1: the Pages Functions API (all `/api/*` routes) and the
ingestion Worker (cron, queue consumer, `/sources` + `/jobs` reads). Both were
moved to PostgreSQL. The `jobs` queue, `JOBS_CACHE` KV and R2 bindings are unchanged.

## 3. Target architecture

```
browser ──HTTPS──> Cloudflare (DNS/WAF/CSP) ──> Pages frontend (static assets)
                                            └──> Pages Functions /api/*
                                                    │  bearer-token HTTPS
                                                    ▼
                                   jobs-db-gateway (VPS container, internal)
                                                    │  pg, least-privilege role
                                                    ▼
                                   PostgreSQL `jobs` (jobs-postgres, private)
                                   ingestion Worker ──┘ (same gateway)
R2 `jobs-wasfai-resumes` — unchanged, still bound to the edge (résumé blobs)
```

- The browser never receives the gateway URL/token and never speaks to PostgreSQL.
- PostgreSQL has **no published port**; it is reachable only on the internal
  `coolify` Docker network (`172.16.0.17`).
- The gateway is a small token-authenticated service
  (`vps/db-gateway/`, ~200 lines) that runs the application's existing
  D1-shaped SQL through a tested SQLite→PostgreSQL translation layer and
  connects as `jobs_app` (`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`).
- Edge adapter `functions/api/_db.js` (+ `workers/ingestion/src/_db.js`)
  implements the D1 surface (`prepare/bind/first/all/run/batch`) over the
  gateway, so handler code is unchanged apart from the binding lookup.
- Origin access is authenticated (bearer token) and TLS-terminated by the
  existing Traefik instance at `jobs-db.169.58.202.29.sslip.io`. A future
  `jobs-db.wasfai.com` record would additionally put it behind the Cloudflare WAF.

### Dialect conversion rules (`vps/db-gateway/sql.mjs`, 15 unit tests)

| SQLite/D1 | PostgreSQL |
|---|---|
| `?` / `?N` placeholders (numbered globally across literals) | `$1 … $n` |
| `INTEGER` / `REAL` | `bigint` / `double precision` (SQLite is 64-bit) |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY` |
| `CURRENT_TIMESTAMP` | `to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')` |
| `INSERT OR IGNORE INTO` | `INSERT INTO … ON CONFLICT DO NOTHING` |
| bare columns under `GROUP BY` | explicit `GROUP BY` column list (admin subscriber roll-up) |

Timestamp columns deliberately stay `TEXT`, so every existing value — including
empty-string sentinels such as `valid_through = ''` — round-trips byte for byte.
Gateway safety rails: single statement per call, statement allowlist
(SELECT/INSERT/UPDATE/DELETE + idempotent `CREATE TABLE/INDEX IF NOT EXISTS`),
translation invariant check, 15 s statement timeout, no SQL/value logging.

## 4. Converter, rehearsal and invariants

`tools/migration/d1_to_postgres.mjs` converts the read-only D1 export
(`schema.json` + `rows/<table>.json`) into `schema.sql` (idempotent DDL) and
`data.sql` (transactional full-replace load + identity-sequence sync) plus a
sanitized `manifest.json`. It is idempotent: re-running converges to the same
state.

Rehearsal result: **20 tables / 128 rows** loaded, then verified against the
frozen D1 source with 32 invariants (`tools/migration/reconcile.mjs`):
per-table counts, user status split, job verification/source splits, newest job
timestamp, source enabled flags, application status split, distinct state
document users + revision sum, admin status split, résumé status split and
object keys.

**Final reconciliation: 32/32 match, 1 explained difference**
(`audit_logs` D1=0 vs PG=1 — the audited no-op write performed during live
verification). Zero unexplained mismatches.

## 5. Backups and restore proofs (before cutover)

Daily job installed: `/etc/crontab` → `/usr/local/bin/jobs-db-backup.sh`
**daily 02:45**, `pg_dump` → gzip → AES-256 (gpg) → R2 `s3://vps-backups/jobs-db-backups/`
(account `20af8653055a0b9e99aa4a30e346f3d4`), 14-day on-host and 30-day R2
retention, failure visibility via non-zero exit + `/var/log/jobs-backup.log`.
The pre-existing SKNAI cron line was preserved unchanged.

| Artifact (off-site) | Restore test | Result |
|---|---|---|
| `s3://vps-backups/jobs-db-backups/d1-precutover-20260913-013408.tar.gpg` (60 KB) | encrypted D1 export → isolated DB `jobs_verify_d1` | 20 tables, counts identical to the D1 manifest |
| `s3://vps-backups/jobs-db-backups/pg_dump-jobs-20260913-013411.sql.gpg` (47 KB) | R2 object → decrypt → isolated DB `jobs_verify_pg` | 20 tables, counts identical to live `jobs` |

Counts observed in both restore targets and the live database:
`admin_memberships=2, ai_settings=0, ai_usage=0, api_rate_limits=7,
application_events=0, applications=5, audit_logs=0, generated_kits=0,
ingestion_metrics=5, jobs=65, payment_events=0, resume_files=1,
resume_versions=1, resumes=1, sources=4, subscription_payments=0,
subscriptions=0, user_state_documents=34, user_states=2, users=1`.
No dumps or secrets are committed to Git.

## 6. No-loss cutover

The store is quiet (1 user, 0 subscriptions, 0 sessions), so a short boundary
was used rather than dual-write. A fresh D1 export immediately before the switch
showed **no change** from the loaded snapshot (128 rows, zero count differences).

1. `fff0d387` (jobs54) deployed to Pages — production deployment `7c5b30fc`.
2. `jobs-wasfai-ingestion` worker redeployed (version `5c4148ab`) seconds later,
   so no writer remained on D1.
3. Post-cutover reconciliation then re-read D1 and PostgreSQL: only the audited
   verification write differed.

## 7. Live verification (post-cutover)

| Gate | Result |
|---|---|
| Frontend desktop + iPhone UA, `/app.js`, manifest | 200, CSP present |
| Public API reads (`bootstrap`, `subscriptions`, `me/state`, `auth/session`) | 200 |
| Anonymous admin refusal `/api/admin/overview` | 401 `AUTH_REQUIRED` |
| Wrong service credential | 401 `SERVICE_AUTH_REJECTED` |
| Anonymous résumé list `/api/resumes` | 401 `AUTH_REQUIRED` |
| Authenticated admin reads (`overview`, `users`, `subscribers`, `plans`, `ai`, `admins`, `payments`, `audit`) | all 200 from PostgreSQL |
| Ingestion Worker reads (`/sources`, `/jobs`) | 200 from the same store |
| **Reversible no-op production write** — `PATCH /api/admin/users/qa-production-release-gate {account_status:"active"}` | 200, unchanged state; new `audit_logs` row `user.status_update` written **to PostgreSQL** (D1 remains 0) |
| CSRF | cross-origin PATCH → 403 `CROSS_ORIGIN_REQUEST`; wrong content-type → 415 |
| CORS | no `Access-Control-Allow-Origin` on `/api/*` |
| Gateway authorisation | anonymous → 401; `DROP`/`ALTER` → refused; multi-statement → refused |

## 8. Commits, deployments, rollback anchors

**Commits (pushed to `jbx22/JOBS.wasfai.com` `main`, no history rewrite)**

- `fff0d387` — jobs54: adapter, gateway, converter/backup tooling, wiring.
- `66450c77` — jobs55: portable `GROUP BY`, gateway allowlist + global
  placeholder numbering, `jobs_app` object ownership.
- `4bbf2fb` — docs: this record + handoff update.

**Deployments**

| Artifact | Post-migration | Pre-migration (rollback anchor) |
|---|---|---|
| Pages production | `8c93ff26-0d10-4e7b-a8c2-4f770471452d` (66450c77, jobs55) | `392dfcc8-7e22-4ee6-825b-65fe070e7453` (fabae1e0, jobs53) |
| `jobs-wasfai-ingestion` worker | `5c4148ab-005e-4134-9c4c-f8453ff67101` | `f470d4d5-a629-4631-b428-0fbc359dcf16` |
| VPS gateway container | `jobs-db-gateway` (image `jobs-db-gateway:1.0.0`) | n/a — stop/remove container |
| D1 `jobs-wasfai-db` | **untouched, frozen, rollback source** | — |

**Exact rollback steps**

1. **Immediate (code only, ~1 min):** in Cloudflare dashboard → Workers & Pages →
   `jobs-wasfai` → Deployments → rollback to `392dfcc8-7e22-4ee6-825b-65fe070e7453`
   (fabae1e0, jobs53), and roll the `jobs-wasfai-ingestion` worker back to version
   `f470d4d5-a629-4631-b428-0fbc359dcf16`. Both resume reading/writing D1 exactly as
   before, because the D1 binding and all Pages/Worker secrets were left in place.
2. **If the whole migration is reverted:** stop the gateway
   (`docker rm -f jobs-db-gateway`) and remove the two Pages secrets
   (`JOBS_DB_GATEWAY_URL`, `JOBS_DB_GATEWAY_TOKEN`) plus the worker secret
   `JOBS_DB_GATEWAY_TOKEN`. PostgreSQL and its backups can stay.
3. **Data rollback:** D1 was never written to after the cutover boundary, so the
   D1 bindings are a true rollback source. The pre-cutover encrypted snapshots are
   `s3://vps-backups/jobs-db-backups/d1-precutover-20260913-013408.tar.gpg` and
   `pg_dump-jobs-20260913-013411.sql.gpg`.

**Soak period:** observe until **2026-09-20**. During the soak, watch
`/var/log/jobs-backup.log`, the appearance of new
`pg_dump-jobs-*.sql.gpg` objects in R2, and application error rates. D1 (and the
staging/older artifacts) must only be retired after an explicit owner decision —
that is a separate step from migration completion.

## 9. Hygiene

- No credential values were printed, logged or committed; the gateway token and
  `jobs_app` password live only in root-only files on the VPS
  (`/root/jobsmig/gateway.env`, `jobs_app.env`) and as Cloudflare secrets.
- Temporary artifacts (probe Worker, local token files, replay payloads,
  isolated verify databases) were removed after verification.
- Committed tooling (`tools/migration/`, `vps/`) is sanitized: account ID and
  bucket names only, never secrets.
