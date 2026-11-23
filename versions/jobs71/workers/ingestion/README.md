# JOBS.wasfai.com Ingestion Worker

Cloudflare Worker for full live crawling ingestion:

- **Cron** runs every 10 minutes and enqueues due sources. The standard source refresh interval is six hours.
- **Queue** processes one source per message.
- **Storage** uses the PostgreSQL gateway in production and supports D1 for local and legacy environments. It stores sources, normalized jobs, scan timestamps, dedupe keys, and errors.
- **KV** caches fetched source HTML briefly so retries and smoke tests do not hammer job boards.
- **HTTP admin/read API** exposes `/health`, `/sources`, `/jobs`, `/match`, `/admin/scan-now`, and `/admin/enqueue-due`. Every `/admin/*` route requires a bearer token.
- **Clean ingestion** prefers JSON-LD `JobPosting` data, rejects browse/category pages, dedupes jobs, and only returns likely real roles.
- **Resume-first matching** accepts the approved master-resume profile at `/match` and scores stored jobs against target titles, skills, locations, seniority, and resume text.

## Create Cloudflare Resources

```powershell
wrangler d1 create jobs-wasfai-db
wrangler queues create jobs-wasfai-scan-queue
```

Paste the returned D1 `database_id` into `workers/ingestion/wrangler.jsonc`.

## Apply Schema

```powershell
wrangler d1 execute jobs-wasfai-db --file workers/ingestion/schema.sql --remote
```

## Deploy Worker

```powershell
wrangler deploy --config workers/ingestion/wrangler.jsonc

# required before deploy; use the same value in Pages as JOBS_INGESTION_TOKEN
wrangler secret put INGESTION_ADMIN_TOKEN --config workers/ingestion/wrangler.jsonc
```

## Notes

The official Saudi government connector scans the public career sitemaps of ZATCA, EXPRO, SAMA, and MISA. Each listing stores the role, agency, location, dates when published, and the official link where candidates can read the full posting and apply. The government connector is available to the centrally configured sources.

Jadarat is available as a direct link in the vacancy directory. Integrations for LinkedIn, Indeed, and services requiring credentials use approved APIs.

The Saudi SmartRecruiters connector adapts the [Career-Ops provider](https://github.com/career-ops-hq/career-ops/blob/9d61e5a457d575cb57372aca116650933f32809e/providers/smartrecruiters.mjs) under the included MIT notice. It reads public Saudi listings from AECOM, Egis, Assystem, SGS, and Accor via the documented Posting API, paginates by offset, and stores vacancy facts and official application links.

HiringCafe appears as a direct portal in the source catalog. Its former scheduled HTML scan is retired.
