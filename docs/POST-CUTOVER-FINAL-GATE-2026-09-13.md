# Jobs — post-cutover final gate (Cloudflare D1 → VPS PostgreSQL)

- **Date:** 2026-09-13 (Asia/Riyadh) · executed at owner's explicit direction ("CONTINUE now"), ending the soak early (was scheduled 2026-09-20).
- **Scope:** Jobs only. Non-destructive: D1 was **not** renamed, reset or deleted.
- **Result:** **ALL GATES PASSED.** D1 is classified **ROLLBACK-ONLY** and proven frozen; the runtime no longer reads or writes it.

## 1. Reconciliation — frozen D1 anchor vs live VPS `jobs`

Anchor = `d1-precutover-20260913-013408.tar.gpg` (D1 export taken at cutover: 20 tables / 128 rows). Target = VPS PostgreSQL `jobs` (container `jobs-postgres`).

| Check | Result |
| --- | --- |
| Tables | **20** on both sides |
| Row counts | 19 of 20 tables identical; the only difference is `audit_logs` 0 → 2 |
| Content hash (canonical row-digest) | 16 of 19 non-audit tables **byte-identical**; 3 differ only in post-cutover timestamps (below) |
| Key sets | equal for every table (no insert/delete besides `audit_logs`) |
| Row totals | anchor 128 → target 130 (+2 audited no-op rows) |

### Post-cutover writes — all accounted for

- `audit_logs` **+2**: ids `2` (2026-09-12 23:42:18 UTC) and `3` (2026-09-13 05:03:10 UTC), both `action=user.status_update`, `resource_type=user`, actor role `super_admin` — the two audited **reversible no-op** verification writes (migration cutover + gateway-hostname hardening).
- Timestamp-only advances from legitimate activity: `admin_memberships.last_active_at`; `sources.last_scanned_at / next_scan_at / updated_at / last_error`; `jobs.updated_at / last_verified_at`. These are written by the scheduled **ingestion Worker** (cron `*/30 * * * *`) and the app — i.e. the live VPS PostgreSQL is actively serving production.

### D1 is frozen — zero writes since cutover

Live D1 was read through a **temporary, token-gated, read-only probe Worker** (the `cloudflare [worker api]` token has no D1 scope; the probe was deleted immediately after use, verified gone). Canonical row-hash comparison against the frozen anchor: **20/20 tables byte-identical**. D1 has received **no writes** (no insert, update or delete) since the cutover.

## 2. Runtime no longer uses D1

- **Pages production** env: `JOBS_DB_GATEWAY_URL=https://jobs-db.wasfai.com` (+ `JOBS_DB_GATEWAY_TOKEN` secret) — canonical deployment `361f2142-e6d0-4d0f-aa4c-1971c5365938`.
- **Ingestion Worker** `jobs-wasfai-ingestion`: `JOBS_DB_GATEWAY_URL=https://jobs-db.wasfai.com` (plain_text) + gateway token.
- Code: `functions/api/_db.js` and `workers/ingestion/src/_db.js` construct a D1-shaped adapter that talks **only** to the gateway; no source file references the `JOBS_DB` binding. The `JOBS_DB` D1 binding declarations remain in `wrangler.jsonc` **deliberately** as preserved rollback config (harmless: unused by code).
- **R2 blobs remain authoritative:** bucket `jobs-wasfai-resumes` is bound as `RESUME_FILES` and used by `functions/api/resumes/_files.js`; it is private (anonymous list rejected) and holds the résumé objects. `resume_files`/`resume_versions` counts are unchanged from the anchor.

## 3. Rollback anchors — intact

| Anchor | State |
| --- | --- |
| Pages previous production deployment | `392dfcc8-7e22-4ee6-825b-65fe070e7453` (commit `fabae1e0`) — present |
| Ingestion Worker previous version | `f470d4d5-a629-4631-b428-0fbc359dcf16` — present |
| D1 database | `jobs-wasfai-db` (`8471b0c2-e32b-4bc0-84fe-d2b6250a374e`) — intact, frozen, bindings preserved |
| D1 pre-cutover artifact | `s3://vps-backups/jobs-db-backups/d1-precutover-20260913-013408.tar.gpg` |

## 4. Fresh encrypted off-site backup + restore proof

- Triggered `/usr/local/bin/jobs-db-backup.sh` exactly as cron runs it → exit 0 → **`s3://vps-backups/jobs-db-backups/pg_dump-jobs-20260913-085113.sql.gz.gpg`** (AES-256). Canonical `.sql.gz.gpg` suffix; matches the retention matcher (`pg_dump-jobs-*.sql.gz.gpg` and legacy `*.sql.gpg`).
- Downloaded that exact object, decrypted, restored into isolated database `jobs_restoregate`:
  - **20 tables, counts identical to live (20/20)**, schema fingerprint identical (md5 `a4b07bcf…`), users 1 / jobs 65 / sources 4 / audit_logs 2.
- Isolated DB dropped; local plaintext dump/temp securely shredded. No passphrase or credential printed.

## 5. Live smoke after classification

- Public `GET /` → **200**; `GET /api/auth/session` → **200**; anonymous `GET /api/admin/overview` → **401**; unknown `/api/*` → **404**.
- Ingestion Worker reads: `GET /sources` → **200** (4 sources), `GET /jobs` → **200**.
- Gateway via the Cloudflare edge: authenticated `POST /v1/query` → **200** (`{"ok":true,…}`); unauthenticated → **401**.
- Old-origin refusal: direct `jobs-db.169.58.202.29.sslip.io` → **403**; raw origin IP with `Host: jobs-db.wasfai.com` → **403** (Cloudflare-only ingress intact).
- PG connection utilization: `jobs` 7/100.

## 6. Retirement decision

**D1: ROLLBACK-ONLY — left fully intact.** Cloudflare D1 exposes no non-destructive archive/pause (only destructive delete/reset), so no change was made. The database, its bindings and the Pages/Worker prior versions are preserved; no runtime reads or writes it.

## 7. Confirmed defect (migration-introduced) — **RESOLVED** in `965c5a6` / jobs56

### Root cause

Two upserts used an **unqualified self-reference** in an `ON CONFLICT … DO UPDATE SET` clause:

- `workers/ingestion/src/index.js` `incrementMetric()` — `SET value=value+excluded.value`
- `functions/api/_security.js` `requireProtectedRequest()` — `SET requests = requests + 1`

PostgreSQL resolves the bare name against **both** the target row and the special `excluded` row and rejects the statement:

```
ERROR: column reference "value" is ambiguous
```

SQLite/D1 accept either form, so the defect only appeared after the store moved to VPS PostgreSQL. Proven with a rolled-back probe using role `jobs_app` (temp probe table; the qualified form increments 1 → 2 correctly).

### Effect (observed in production)

`ingestion_metrics` counters **froze** (newest `updated_at` `2026-09-12 21:00:51Z`) and every scanned source was given a bogus `last_error` plus a 6 h retry gate even though job writes succeeded:

| Source | Observed `last_error` | Real? |
| --- | --- | --- |
| `remotive` | `column reference "value" is ambiguous` | **no — this defect** |
| `hiringcafe` | `source returned 403` | yes (upstream 403) |
| `bayt`, `wazzuf` | `source returned 403` | yes (disabled sources) |

The rate limiter failed on every protected AI route (`ghostwriter`, `resume-coach`, `ai-writer-chat`, `export-package`).

### Fix — smallest, dialect-safe

Qualify the target column; valid in **both** PostgreSQL and SQLite/D1, so the preserved D1 rollback path keeps working:

- `SET value=ingestion_metrics.value+excluded.value`
- `SET requests = api_rate_limits.requests + 1`

Both statements are exported constants (`METRIC_UPSERT_SQL`, `RATE_LIMIT_UPSERT_SQL`) and pinned by `test/upsert-compat.test.mjs`. A repo-wide sweep found **no other** unqualified `DO UPDATE SET` self-reference.

### Tests

- `npm run test:sql` — **6/6 pass**: statement-safety, gateway translation (single-statement/bound/qualified), SQLite/D1 increments for both statements, and the PostgreSQL-path test run against the real VPS PostgreSQL (rolled-back transaction, real schema, 0 residue).
- `npm run check:all` — **exit 0** (`test:sql` is now part of the gate).

### Production repair (explicit and minimal)

1. Fresh encrypted off-site backup, run exactly as cron runs it: **`s3://vps-backups/jobs-db-backups/pg_dump-jobs-20260913-090348.sql.gz.gpg`** — downloaded, decrypted, 20 tables, and the pre-repair `remotive` row confirmed inside the dump.
2. One guarded statement through the production gateway:
   `UPDATE sources SET last_error='', next_scan_at='' WHERE id='remotive' AND last_error='column reference "value" is ambiguous'` → **1 row**.
3. Real 403 errors on `bayt`/`hiringcafe`/`wazzuf` left untouched; **0** residual synthetic errors.
4. `audit_logs` id **4** (`action=source.retry_gate_reset`, `resource_id=remotive`) records the repair.

### Deployments and rollback anchors

| Item | New | Previous (rollback) |
| --- | --- | --- |
| Ingestion Worker | `2a27bf86-0ab9-4db8-b404-04c7518be088` | `f98905a6-dcf1-42c3-8dd2-1b79eb82bd6d` |
| Pages production | `a02b74d8` | `361f2142-e6d0-4d0f-aa4c-1971c5365938` |
| Code commit (`main`) | `965c5a6` | `2a610d9` |

### Live verification

- Worker: `GET /health` **200**, `GET /sources` **200** (`remotive` `last_error` empty, quality `live_verified`), `GET /jobs` **200**; admin routes **401** without the admin token.
- Pages: `GET /` **200**, `/app.js` **200**, `/sw.js` **200**, `/manifest.webmanifest` **200**, `/api/bootstrap` **200**; anonymous `/api/admin/overview` **401**; unknown `/api/*` → structured 404.
- Gateway: unauthenticated **401**, wrong token **401**, `DROP TABLE` **400** (`statement verb not permitted`), multi-statement **400**, authenticated read **200**; direct origin-IP ingress **403**; legacy `*.sslip.io` hostname **403**.
- Monitor `/usr/local/bin/vps-monitor.sh` (cron): exit **0**, no alert file, `jobs` → 200.
- **Bounded production ingestion cycle — cron `*/30 * * * *` fired 07:30:00Z** (the real scheduled path, no manual trigger): `remotive` was due, so the Worker enqueued and scanned it.
  - `sources.remotive` → `last_scanned_at 2026-09-13T07:30:39Z`, `next_scan_at 2026-09-13T19:30:42Z` (+12 h = `interval_minutes` 720), `last_error` stayed **empty**; `/sources` reports `source_quality: live_verified`.
  - `ingestion_metrics` **unfroze**: `scan_success`/`remotive` **115 → 116**, `jobs_parsed`/`remotive` **2910 → 2926**, both `updated_at 2026-09-13 07:30:43Z` (previously frozen at 2026-09-12 13:00:43Z).
  - `jobs` row count stayed **65** — the dedupe upsert updated in place, no duplicate job creation.
  - No renewed ambiguous error: residual synthetic-error count **0**; `hiringcafe` retains its genuine upstream 403.

### Residual risk / notes

- The rate-limiter fix is verified at the store level (real schema, rolled back) plus statement equality; an end-to-end authenticated call on a protected AI route needs a user session (`QA_AUTH_TOKEN`/cookie secrets are not readable), so that path was not exercised.
- `hiringcafe` remains `needs_attention` from a genuine upstream 403 — not part of this defect.

