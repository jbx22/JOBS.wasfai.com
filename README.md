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

The current source scanner is a deterministic prototype extractor. It models the source connector and relevance workflow without claiming live scraping from third-party boards; production connectors will need per-site parsers, rate limits, terms-of-service review, and scheduled jobs.
