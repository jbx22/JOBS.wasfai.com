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
- **Latest deployment:** https://a2a89c8c.jobs-wasfai.pages.dev
- **Custom domain target:** `jobs.wasfai.com`
- **Custom domain status:** pending DNS CNAME record.

## Cloudflare Account

- **Account ID:** `20af8653055a0b9e99aa4a30e346f3d4`
- **Zone:** `wasfai.com`
- **Zone ID:** `a89ce8e535d861aff7b1fbfffe97cdb9`
- **Project name:** `jobs-wasfai`
- **Production branch:** `main`
- **Compatibility date:** `2026-07-11`
- **Latest production deployment ID:** `a2a89c8c-6313-4331-acb7-7cfbcaa6a594`

## Custom Domain DNS

Cloudflare Pages custom domain object exists for `jobs.wasfai.com`, but
verification is pending because the CNAME is not set.

Create this DNS record in Cloudflare:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `jobs` | `jobs-wasfai.pages.dev` | Proxied |

The current API token can edit Pages but cannot edit zone DNS records. To let
Sam finish this automatically, issue a token with:

- `Account: Cloudflare Pages: Edit`
- `Account: Account Settings: Read`
- `Zone: Zone: Read`
- `Zone: DNS: Edit`

Scope the zone permission to `wasfai.com`.

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
3. `wrangler pages deploy public --project-name jobs-wasfai --commit-dirty=true`

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
  "https://jobs-wasfai.pages.dev/icon.svg"
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
- `wrangler pages deploy` uploaded the Functions bundle.
- `https://jobs-wasfai.pages.dev/api/bootstrap` returned JSON with 5 jobs,
  11 sources, 8 activity-feed items, and 5 checklists.
- `PATCH /api/jobs/job-1/status` returned `405 application/json`.

## Rollback

Cloudflare Pages keeps deployment history. In the Cloudflare dashboard:

Workers & Pages -> `jobs-wasfai` -> Deployments -> choose a green deployment ->
Rollback to this deployment.

Local frozen snapshots live under `versions/jobs{N}/`.

## Known Limitations

- Cloudflare production is currently read-only seed-data mode.
- The full write API remains in the Rust/Axum backend until a Worker/D1-backed
  persistence layer is added.
- `jobs.wasfai.com` will not resolve until the DNS CNAME is created.
