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

## 7. Confirmed defect found during this gate (migration-introduced, NOT retirement-related)

`workers/ingestion/src/index.js` `incrementMetric()` uses
`ON CONFLICT(metric_key,bucket) DO UPDATE SET value=value+excluded.value`, which PostgreSQL rejects with **`column reference "value" is ambiguous`** (proven with a rolled-back probe; the qualified form `value=ingestion_metrics.value+excluded.value` works). Effect: `ingestion_metrics` counters stop updating and every scanned source is wrongly marked with `last_error` and pushed to a 6-hour retry — job ingestion itself still writes. **Recommended fix:** qualify the column reference, redeploy the ingestion Worker, verify a scan clears `last_error`. Not applied here because this gate's commit scope is docs/config only.
