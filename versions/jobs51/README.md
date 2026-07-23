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

Files snapshotted: `public/`, `src/`, `assets/`, `functions/`, `workers/`, `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `README.md`, `tools/`, `qa/`.

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

## AI Writer / AI كاتب

- The job detail **السيرة الذاتية** tab includes **AI Writer / AI كاتب** for subscriber-facing preparation.
- `POST /api/ghostwriter` returns a bilingual application kit for one job: Arabic CV, English CV, Arabic cover letter, English cover letter, Arabic interview prep, and English interview prep.
- DeepSeek V4 Flash is the default AI provider. The UI also offers MiniMax M3 and GLM 5.2 model choices through OpenRouter only.
- Supported environment keys:
  - DeepSeek: `DEEPSEEK_API_KEY`, optional `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL`.
  - OpenRouter: `OPENROUTER_API_KEY` powers MiniMax M3 and GLM 5.2. Optional overrides: `MINIMAX_MODEL`, `GLM_MODEL`, and `OPENROUTER_BASE_URL`.
  - Default OpenRouter model ids: `minimax/minimax-m3` and `z-ai/glm-5.2`.
- `POST /api/resume-coach` improves the subscriber's uploaded master resume before search. The subscriber approves the improved master resume, then its target titles, keywords, locations, and resume text become the source of truth for job matching and job-specific generation.
- `POST /api/ai-writer-chat` provides interactive interview prep so subscribers can ask questions about the job, generated kit, gaps, and answers.
- `POST /api/export-package` exports approved kits as `.docx` or Arabic-shaped `.pdf`. PDF requests are authenticated and forwarded to the token-protected Cloudflare Container Typst renderer; no lightweight Helvetica fallback is used.
- Account workspace documents are stored independently in D1 (`user_state_documents`) with per-document revisions and optimistic conflict detection. The legacy JSON blob is retained only as a rollback copy during migration.

## Resume-first crawling and matching

The crawler follows the three-reference-repo concept: profile first, human approval, then matched jobs and tailored documents.

1. Subscriber uploads or pastes the original resume.
2. DeepSeek resume coach improves the master resume without inventing facts.
3. Subscriber approves the improved master resume.
4. The approved resume provides target titles, search keywords, locations, seniority, and matching signals.
5. Cloudflare D1/Queues/Cron ingestion gathers jobs from approved sources.
6. Matching filters and scores jobs against the approved resume, then AI Writer tailors the approved resume to each job's requirements before export.

DeepSeek helps with resume improvement, search-intent extraction, matching explanations, and final job-specific tailoring. It does not replace source-specific parsers or approved APIs; crawlers still need per-source rules, dedupe, robots/legal posture, and quality filters so category pages are not stored as jobs.

## Accounts and Google OAuth

The account flow is Google-first and uses secure signed HttpOnly cookies:

- `GET /api/auth/google/start` starts Google OAuth.
- `GET /api/auth/google/callback` exchanges the code and creates the session cookie.
- `GET /api/auth/session` returns the current user/session state.
- `POST /api/auth/logout` clears the session.
- `GET /api/auth/signup` exposes signup metadata, terms, and privacy URLs.

Cloudflare Pages secrets/vars:

- `AUTH_COOKIE_SECRET` signs session cookies. Already uploaded for production.
- `GOOGLE_CLIENT_ID` from Google Cloud OAuth Client.
- `GOOGLE_CLIENT_SECRET` from Google Cloud OAuth Client.
- Optional `AUTH_REDIRECT_ORIGIN`; default is the current request origin.

Google OAuth redirect URI for production:

```text
https://jobs.wasfai.com/api/auth/google/callback
```

The PWA includes `/terms` and `/privacy` screens. Email/password storage is intentionally not enabled until a durable user database and account verification flow are added.

## Cloudflare ingestion worker

`workers/ingestion/` contains the production live-ingestion worker:

- D1 database: `jobs-wasfai-db`.
- KV cache: `jobs-wasfai-ingestion-cache`.
- Queue: `jobs-wasfai-scan-queue`.
- Cron: every 30 minutes.
- Worker URL: `https://jobs-wasfai-ingestion.jabosaag.workers.dev`.
- D1 schema: `workers/ingestion/schema.sql`.
- Apply migrations `004_normalize_user_state.sql` and `005_backfill_user_state_documents.sql` before deploying the normalized account-state Functions. Migration 005 is restartable and never overwrites newer normalized records.

The production PDF renderer is in `workers/pdf-renderer/` and uses `Dockerfile.typst`. Deploy with `npm run deploy:pdf`, set `TYPST_RENDER_TOKEN` on both the renderer Worker and Pages, and set Pages `TYPST_RENDER_URL` to the renderer Worker URL.

Core endpoints:

- `GET /health`
- `GET /sources`
- `GET /jobs?limit=50`
- `POST /match` with the approved resume profile to return clean, scored matches.
- `POST /admin/enqueue-due`
- Admin ingestion routes require `Authorization: Bearer <INGESTION_ADMIN_TOKEN>`. Set the same random secret as `INGESTION_ADMIN_TOKEN` on the Worker and `JOBS_INGESTION_TOKEN` on Pages before deploying. Pages is the only caller for custom-source registration, scheduling, and scans.
- `POST /admin/scan-now` with `{ "id": "source_id" }`
- `POST /admin/scan-now?mode=direct` for direct admin smoke scans.

LinkedIn and Indeed remain approved-API only. The worker scans only `public_html` sources and records upstream/parser errors instead of bypassing access controls.

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
