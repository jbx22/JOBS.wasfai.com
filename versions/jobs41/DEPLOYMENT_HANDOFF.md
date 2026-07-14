# Deployment Handoff - JOBS.wasfai.com

Production hosting target: **Cloudflare Pages** (PWA + Pages Functions), the ingestion Worker/D1 stack, and a token-protected Cloudflare Container running the Rust/Typst Arabic PDF renderer.

The Cloudflare production build ships:

- `public/` static assets for the PWA shell.
- `functions/api/bootstrap.js` for clearly-labelled example-data bootstrap content.
- `functions/api/ghostwriter.js` for the bilingual subscriber application kit.
- `functions/api/[[route]].js` for structured JSON errors on unsupported API routes.

The Rust/Axum Typst renderer is packaged by `Dockerfile.typst` and exposed only through `workers/pdf-renderer/`. Pages calls it using `TYPST_RENDER_URL` and the shared `TYPST_RENDER_TOKEN`; Pages never serves a non-shaping Arabic PDF.

## Live URLs

- **Production:** https://jobs-wasfai.pages.dev
- **Latest deployment:** https://18d291e4.jobs-wasfai.pages.dev
- **Custom domain:** https://jobs.wasfai.com
- **Custom domain status:** Active in Cloudflare Pages; DNS record created and HTTPS verified.

## Cloudflare Account

- **Account ID:** `20af8653055a0b9e99aa4a30e346f3d4`
- **Zone:** `wasfai.com`
- **Zone ID:** `a89ce8e535d861aff7b1fbfffe97cdb9`
- **Project name:** `jobs-wasfai`
- **Production branch:** `main`
- **Compatibility date:** `2026-07-11`
- **Latest production deployment short ID:** `18d291e4`

## Custom Domain DNS

Cloudflare DNS record:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `jobs` | `jobs-wasfai.pages.dev` | Proxied |

Record ID: `988386b7ba2b2460f134fc374b03b526`

## Deploy Command

```powershell
cd D:\AI\openclaw\.openclaw\workspace\jobs-wasfai
$env:CLOUDFLARE_ACCOUNT_ID = "20af8653055a0b9e99aa4a30e346f3d4"
$env:CLOUDFLARE_API_TOKEN = "<token>"
npm run deploy
```

Before the Pages deployment, apply migration 004 and deploy the renderer:

```powershell
npx wrangler d1 execute jobs-wasfai-db --remote --file workers/ingestion/migrations/004_normalize_user_state.sql
npx wrangler d1 execute jobs-wasfai-db --remote --file workers/ingestion/migrations/005_backfill_user_state_documents.sql
npm run deploy:pdf
```

Set `TYPST_RENDER_TOKEN` on the renderer Worker and Pages, set Pages `TYPST_RENDER_URL`, and set a separate `AI_HEALTH_TOKEN` for authenticated provider smoke checks.

`npm run deploy` runs:

1. `npm run check:contract`
2. `node --check public/app.js`
3. `node --check public/sw.js`
4. Manifest JSON parse validation.
5. Cloudflare Functions syntax checks, including `/api/ghostwriter`.
6. `wrangler pages deploy public --project-name jobs-wasfai --commit-dirty=true`

Wrangler automatically bundles the root `functions/` directory with the Pages
deployment.

## Production Smoke Test

```powershell
$staticUrls = @(
  "https://jobs-wasfai.pages.dev/",
  "https://jobs-wasfai.pages.dev/app.js",
  "https://jobs-wasfai.pages.dev/styles.css",
  "https://jobs-wasfai.pages.dev/manifest.webmanifest",
  "https://jobs-wasfai.pages.dev/sw.js",
  "https://jobs-wasfai.pages.dev/icon.svg",
  "https://jobs-wasfai.pages.dev/icon-192.png",
  "https://jobs-wasfai.pages.dev/icon-512.png"
)
foreach ($u in $staticUrls) {
  $r = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $u
  Write-Host ("{0} {1} {2}" -f $r.StatusCode, $r.Headers["Content-Type"], $u)
}

$bootstrap = Invoke-WebRequest -UseBasicParsing -Uri "https://jobs-wasfai.pages.dev/api/bootstrap"
$data = $bootstrap.Content | ConvertFrom-Json
Write-Host ("bootstrap: {0} jobs, {1} sources, {2} checklists" -f $data.jobs.Count, $data.sources.Count, $data.application_checklists.Count)

$ghostBody = @{
  job = @{
    id = "smoke-job"
    title = "Industrial Project Manager"
    employer = "Wasfai Client"
    location = "Riyadh"
    score = 88
    description = "Lead factory setup and CAPEX planning."
  }
  profile = @{
    display_name = "Jaber"
    resume_skills = "PMP, PMI-RMP, factory design, CAPEX"
    resume_languages = "Arabic, English"
    resume_seniority = "Senior"
    resume_regions = "Saudi Arabia, GCC"
    resume_work_examples = "Led industrial projects and factory setup."
  }
} | ConvertTo-Json -Depth 6
$ghost = Invoke-RestMethod -Uri "https://jobs-wasfai.pages.dev/api/ghostwriter" -Method Post -ContentType "application/json" -Body $ghostBody
Write-Host ("ghostwriter: {0}, ar={1}, en={2}" -f $ghost.provider, [bool]$ghost.ar_resume, [bool]$ghost.en_cover_letter)
```

Expected:

- Static assets return `200`.
- `/api/bootstrap` returns `200 application/json`.
- `/api/ghostwriter` returns `200 application/json` with Arabic/English resume,
  cover-letter, and interview-prep fields.
- Bootstrap has 5 jobs, 11 sources, and 5 application checklists.
- Unsupported mutation routes return `405 application/json` with code
  `STATIC_DEPLOY`.

## Verified On 2026-07-11

- `npm run check:all` passed.
- `cargo test --lib` passed: 52 tests.
- Focused browser smoke passed for mobile `390x844`, desktop list `1440x900`,
  and desktop detail `1440x900`: no horizontal overflow, Arabic shell present,
  desktop bottom nav hidden, PWA manifest includes PNG install icons.
- `wrangler pages deploy` uploaded the Functions bundle and PWA assets.
- `https://jobs-wasfai.pages.dev/api/bootstrap` returned JSON with 5 jobs,
  11 sources, 8 activity-feed items, and 5 checklists.
- `PATCH /api/jobs/job-1/status` returned `405 application/json`.
- Cloudflare Pages custom-domain status is `active` / `active` for verification
  and validation.
- `https://jobs.wasfai.com/app` returned `200 OK` when forced through a
  Cloudflare edge IP; public Cloudflare DNS resolved the hostname. Local Windows
  DNS may lag immediately after record creation.

## Rollback

Cloudflare Pages keeps deployment history. In the Cloudflare dashboard:

Workers & Pages -> `jobs-wasfai` -> Deployments -> choose a green deployment ->
Rollback to this deployment.

Local frozen snapshots live under `versions/jobs{N}/`.

## Operational Notes

- Example jobs are labelled as examples. Live matching only returns verified ingestion records; it never creates synthetic matches.
- Ghost Writer never returns a deterministic fallback. Configure and validate
  `DEEPSEEK_API_KEY` or `AI_API_KEY` in Cloudflare Pages environment variables
  to enable live DeepSeek V4 Flash generation. Optional overrides:
  `DEEPSEEK_MODEL` defaults to `deepseek-v4-flash`, and `DEEPSEEK_BASE_URL`
  defaults to `https://api.deepseek.com/v1`.
- D1 account state is normalized into independently revisioned documents. The legacy blob remains available as a rollback source during the migration period.
- Some recursive resolvers may take a short time to observe the new
  `jobs.wasfai.com` DNS record.
