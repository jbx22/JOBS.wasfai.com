# JOBS.wasfai.com

Arabic-first, RTL, mobile-first PWA prototype for a MENA-focused job-search command center. The UI is served by a small Rust/Axum backend.

## Run

```powershell
cargo run
```

Open `http://127.0.0.1:3030/app`.

## Source Repo Map

- `job-ops`: primary product foundation for login, jobs/statuses, scoring, pipeline runs, Ghostwriter, generated PDFs, Gmail/IMAP follow-up, timelines, and analytics concepts.
- `career-ops`: reference for broader multi-source search, application-package workflow, and pipeline language.
- `ai-job-search`: reference for assistant-led profile, CV, cover-letter, and job-board skill workflow.

Milestone 1 intentionally does not mutate those repos and does not implement real scraping, real Gmail OAuth, payments, production hosting, or live AI generation.

## Source scanning and monitoring

- Add a custom online job board from **المصادر** with its name, jobs URL, and region.
- Run **فحص المصدر** to add several profile-matched prototype results to the command center.
- Select multiple job cards from the search screen and move them together to processing, ready, applied, or follow-up.
- Every scanned job remains a normal tracked job with a fit score, source label, status, timeline, tailored documents, and analytics support.

Live connector behavior:

- WUZZUF, Bayt, Khamsat, and generic public boards use a real HTTP client and parse public JSON-LD `JobPosting` data or constrained job-card HTML.
- LinkedIn and Indeed are represented as approved-API connectors and are intentionally not scraped around access controls. They require provider-approved credentials before live scanning.
- Enable **فحص تلقائي** per source to persist an interval. The Rust background worker checks due sources every minute, records failures, and retries at the configured interval.
- Each connector filters by the saved role/location profile, normalizes results into the common `Job` model, and deduplicates matching source/title/employer records.

Production connectors still need per-site terms-of-service review, robots/rate-limit handling, credential storage, and deployment secrets.
