# JOBS.wasfai.com Ingestion Worker

Cloudflare Worker for full live crawling ingestion:

- **Cron** runs every 30 minutes and enqueues due sources.
- **Queue** consumes source scan jobs.
- **D1** stores sources, normalized jobs, scan timestamps, dedupe keys, and errors.
- **HTTP admin/read API** exposes `/health`, `/sources`, `/jobs`, `/admin/scan-now`, and `/admin/enqueue-due`.

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
