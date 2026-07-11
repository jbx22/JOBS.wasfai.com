# Deployment Handoff - JOBS.wasfai.com

Production hosting target: **Cloudflare Pages** (static PWA + Pages Functions).

The Cloudflare production build ships:

- `public/` static assets for the PWA shell.
- `functions/api/bootstrap.js` for a JSON seed-data bootstrap API.
- `functions/api/[[route]].js` for structured JSON errors on unsupported API routes.

The Rust/Axum backend remains the full local/backend implementation. The
Cloudflare Pages version is a production-readable launch version with seed data
and graceful read-only behavior for write actions.

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

`npm run deploy` runs:

1. `npm run check:contract`
2. `node --check public/app.js`
3. `node --check public/sw.js`
4. Manifest JSON parse validation.
5. Cloudflare Functions syntax checks.
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
```

Expected:

- Static assets return `200`.
- `/api/bootstrap` returns `200 application/json`.
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

## Known Limitations

- Cloudflare production is currently read-only seed-data mode.
- The full write API remains in the Rust/Axum backend until a Worker/D1-backed
  persistence layer is added.
- Some recursive resolvers may take a short time to observe the new
  `jobs.wasfai.com` DNS record.
