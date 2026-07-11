# JOBS.wasfai.com

Arabic-first, RTL, mobile-first PWA prototype for a MENA-focused job-search command center. The UI is served by a small Rust/Axum backend.

## Run

```powershell
cargo run
```

Open `http://127.0.0.1:3030/app`.

## Versioning

Every code/UI/backend/config change MUST be followed by a version bump before the change is considered complete.

```powershell
node tools/bump-version.js "short description of changes"
node tools/bump-version.js --patch "tiny fix"
node tools/bump-version.js --major "big redesign"
```

What it does:

1. Reads `VERSION.json` (creates `jobs1` if missing).
2. Computes the next sequential `jobs{N}` (or jumps for `--major`).
3. Copies the current source tree into `versions/jobs{N}/`.
4. Writes `VERSION.json`, prepends to `CHANGELOG.md`, updates `VERSIONS.md`.
5. Appends an entry to `memory/YYYY-MM-DD.md`.

Modes: default = minor (`jobs1` → `jobs2`), `--major` (big redesign: `jobs1` → `jobs10`), `--patch` is reserved for tiny fixes that re-snapshot without bumping the integer (currently same as minor).

Files snapshotted: `public/`, `src/`, `assets/`, `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `README.md`, `tools/`, `qa/`.

Convention: `jobs{N}` is a sequential integer. `jobs1` = initial prototype, `jobs2` = next, etc. This is for change tracking and rollback, not a marketing version.

## Update safety

- `DATA_CONTRACT.md` defines system vs user files. The (future) updater will never touch user files.
- `voice-dna.md` is the user-owned voice guardrail for any future CV/cover-letter generation.
- `npm run check:contract` enforces the boundary in CI.

## Source Repo Map

- `job-ops`: primary product foundation for login, jobs/statuses, scoring, pipeline runs, Ghostwriter, generated PDFs, Gmail/IMAP follow-up, timelines, and analytics concepts.
- `career-ops`: reference for broader multi-source search, application-package workflow, and pipeline language.
- `ai-job-search`: reference for assistant-led profile, CV, cover-letter, and job-board skill workflow.

Milestone 1 intentionally does not mutate those repos and does not implement real scraping, real Gmail OAuth, payments, or subscriber billing.

## Ghost writer

- The job detail **السيرة الذاتية** tab includes **كاتب الظل** for subscriber-facing preparation.
- `POST /api/ghostwriter` returns a bilingual application kit for one job: Arabic CV, English CV, Arabic cover letter, English cover letter, Arabic interview prep, and English interview prep.
- DeepSeek V4 Flash is the default AI provider. Configure `DEEPSEEK_API_KEY` or `AI_API_KEY` in Cloudflare Pages environment variables; optional `DEEPSEEK_MODEL` defaults to `deepseek-v4-flash`.
- The route is OpenAI-compatible, so `AI_BASE_URL` / `AI_MODEL` can point to another provider when needed. Without credentials, it returns a structured deterministic kit so the production workflow remains usable.
- The UI stores the generated kit in memory for the current session and marks the application package/checklist ready. D1 persistence is planned for the production ingestion/backend phase.

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
