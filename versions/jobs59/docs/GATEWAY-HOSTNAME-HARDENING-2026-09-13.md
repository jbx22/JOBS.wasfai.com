# Jobs DB gateway — Cloudflare hostname hardening (`jobs-db.wasfai.com`)

**Date:** 2026-09-13 (Asia/Riyadh)
**Scope:** replace the temporary origin hostname `jobs-db.169.58.202.29.sslip.io`
with `jobs-db.wasfai.com` behind Cloudflare, restrict origin ingress to Cloudflare
proxy networks, repoint the Pages project + ingestion Worker, and disable the old
public route. **No** database, data, D1, R2 or StocksAI change.

This document is the handoff for the **server-only** (not repo-managed) Traefik
configuration, including exact rollback. Everything here is sanitized: no token,
password or credential value appears.

---

## 1. Cloudflare DNS

| Item | Value |
|---|---|
| Zone | `wasfai.com` (`a89ce8e535d861aff7b1fbfffe97cdb9`) |
| Record | `A jobs-db.wasfai.com → 169.58.202.29`, **proxied = true** |
| Record id | `0d87a36daa2c3bfe736ffc6de2b835f5` |
| Created | 2026-09-13, initially DNS-only for ACME issuance, then flipped to proxied |
| Unrelated records | 28 pre-existing records untouched (no update/delete issued) |

Rollback: delete record `0d87a36daa2c3bfe736ffc6de2b835f5` (or set `proxied=false`).

## 2. Origin TLS certificate

Issued by **Let's Encrypt** (Traefik `letsencrypt` ACME resolver, HTTP-01 on the
`http` entrypoint, store `/data/coolify/proxy/acme.json`). The zone has
**Always Use HTTPS** enabled, but Cloudflare exempts
`/.well-known/acme-challenge/` from that redirect — verified live: the ACME path
over port 80 reaches Traefik through Cloudflare with `cf-cache-status: DYNAMIC`
(no edge caching), so **automatic renewal keeps working while proxied**.

A Cloudflare Origin CA certificate was considered and rejected: the supplied DNS
credential is not authorised to create Origin CA certificates (API error 1016).

## 3. Traefik dynamic route (server-only, not repo-managed)

File: `/data/coolify/proxy/dynamic/jobs-db-gateway.yaml` (mode `0600`, `root`).
Traefik watches this directory (`providers.file.watch=true`) and reloads without a
restart or container recreation. Sanitized content:

```yaml
http:
  routers:
    jobsdb-wasfai-https:                 # the new public route
      entryPoints: [https]
      middlewares: [jobsdb-wasfai-cf-only]
      service: jobsdb-wasfai
      rule: 'Host(`jobs-db.wasfai.com`)'
      tls:
        certResolver: letsencrypt
    jobsdb-sslip-deny:                   # shadows the old public route
      entryPoints: [https, http]
      priority: 1000
      middlewares: [jobsdb-sslip-blocked]
      service: jobsdb-sslip-noop
      rule: 'Host(`jobs-db.169.58.202.29.sslip.io`)'
      tls:
        certResolver: letsencrypt
  services:
    jobsdb-wasfai:
      loadBalancer:
        servers:
          - url: 'http://jobs-db-gateway:8080'
    jobsdb-sslip-noop:
      loadBalancer:
        servers: {}
  middlewares:
    jobsdb-wasfai-cf-only:
      ipAllowList:
        sourceRange:                     # Cloudflare published proxy networks
          # 15 IPv4 + 7 IPv6 ranges, from GET https://api.cloudflare.com/client/v4/ips
          # (captured 2026-09-13) — refresh by re-fetching that endpoint.
    jobsdb-sslip-blocked:
      ipAllowList:
        sourceRange: ['192.0.2.1/32']    # TEST-NET-1: refuses every client (403)
```

Notes:

- The gateway container keeps its original docker label router
  (`traefik.http.routers.jobsdb` → the sslip host). It is **shadowed** by the
  higher-priority `jobsdb-sslip-deny` router, so the old hostname cannot bypass
  Cloudflare. Because labels are immutable, true label removal requires recreating
  the container (see §5); shadowing was chosen deliberately to avoid production
  downtime on the internal gateway.
- `ipAllowList` uses literal CIDRs. Cloudflare changes its ranges rarely; refresh
  procedure: `curl -s https://api.cloudflare.com/client/v4/ips`, update
  `sourceRange`, save (Traefik hot-reloads).

## 4. What was verified live (post-cutover)

| Gate | Result |
|---|---|
| DNS proxied | `jobs-db.wasfai.com` → Cloudflare edge IPs (`104.21.x`, `188.114.x`) |
| Edge → origin TLS | `curl` via edge → 200 / 401, `ssl_verify_result=0`, `cf-ray` present |
| Origin certificate | Let's Encrypt `jobs-db.wasfai.com` valid, chain verifies |
| Unauthenticated gateway | `/v1/query` → **401** `unauthorized` (fail closed) |
| Authenticated gateway read | `SELECT COUNT(*) FROM jobs` → 65, through the edge |
| **Direct origin bypass** | `--resolve …:169.58.202.29` → **403 Forbidden** (Cloudflare-only ingress) |
| **Old sslip route** | **403 Forbidden** — including with a valid admin credential |
| Pages public reads | `/api/bootstrap`, `/api/subscriptions`, `/api/me/state` → 200 |
| Pages admin reads | `/api/admin/{overview,users,subscribers,audit}` → 200 from PostgreSQL |
| Anonymous admin / résumés | 401 `AUTH_REQUIRED` |
| Wrong service credential | 401 `SERVICE_AUTH_REJECTED` |
| Reversible no-op write | `PATCH /api/admin/users/qa-production-release-gate {account_status:"active"}` → 200, state unchanged, new `audit_logs` row (id 3) in PostgreSQL |
| Ingestion Worker | `/health` 200; `/sources` 200 (4); `/jobs` 200 (reads via new hostname) |
| CSRF / content-type / CORS | cross-origin PATCH 403, `text/plain` 415, no `Access-Control-Allow-Origin` |
| R2 résumés | bucket has no public domain; anonymous résumé routes 401 |
| Latency | gateway via edge avg **0.49 s** (n=5); `/api/bootstrap` avg **0.51 s**; `/api/admin/overview` avg **1.23 s** |

**Production-traffic proof:** the old hostname was disabled and production
Pages/Worker reads and the write above *still* succeeded — the only remaining
gateway path is `https://jobs-db.wasfai.com`. This proves live traffic, not merely
that a DNS record exists.

## 5. Rollback

| Goal | Action |
|---|---|
| Restore the old hostname (incident only) | remove the `jobsdb-sslip-deny` router + `jobsdb-sslip-blocked` middleware + `jobsdb-sslip-noop` service from the dynamic file (still proxied/served) |
| Remove the new route entirely | delete `/data/coolify/proxy/dynamic/jobs-db-gateway.yaml` |
| Revert Cloudflare DNS | delete record `0d87a36daa2c3bfe736ffc6de2b835f5` |
| Truly remove the old label route | `docker rm -f jobs-db-gateway` then re-run `02-deploy-gateway.sh` with the label block removed (container recreate ⇒ ~seconds of gateway downtime; the deny router already blocks the route) |
| Revert app bindings | Pages: set `JOBS_DB_GATEWAY_URL` back; Worker: revert `workers/ingestion/wrangler.jsonc` and redeploy. Rollback anchors: Pages `8c93ff26-0d10-4e7b-a8c2-4f770471452d`, Worker `d420f3c3-df18-4e7a-a847-e266f544b2e9` |

## 6. Binding/deploy gotcha (important)

`wrangler pages deploy` **replaces** the Pages project's production env vars with
the `vars` declared in `wrangler.jsonc` plus the preserved secrets. A plain-text
env var set only in the dashboard is therefore **pruned on the next deploy** —
this happened to `JOBS_DB_GATEWAY_URL` on the first deploy of this change and
briefly thinned the production deployment's environment.

Fix, now committed: `JOBS_DB_GATEWAY_URL` is declared in `wrangler.jsonc` `vars`
(alongside the existing `TYPST_RENDER_URL`), so it survives every deploy. Secrets
(`JOBS_DB_GATEWAY_TOKEN`, etc.) remain dashboard-managed and were untouched.
