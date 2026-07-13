# JOBS.wasfai.com Ingestion Worker

Cloudflare Worker for full live crawling ingestion:

- **Cron** runs every 30 minutes and enqueues due sources.
- **Queue** consumes source scan jobs.
- **D1** stores sources, normalized jobs, scan timestamps, dedupe keys, and errors.
- **KV** caches fetched source HTML briefly so retries and smoke tests do not hammer job boards.
- **HTTP admin/read API** exposes `/health`, `/sources`, `/jobs`, `/match`, `/admin/scan-now`, and `/admin/enqueue-due`.
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
```

## Notes

LinkedIn/Indeed remain approved-API sources. This worker only scans sources marked `public_html`; anything requiring credentials or prohibited scraping should be integrated through an approved API connector.

The crawler should not blindly store every link from a job board. Add source-specific parsers for important boards, keep category/navigation pages out of D1, then use DeepSeek/AI Writer on the approved resume and clean job records for matching explanations and tailored documents.
