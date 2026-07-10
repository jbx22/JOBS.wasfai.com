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
