# JOBS.wasfai.com — Release plan and implementation safeguards
Date: 2026-11-22 | Repository: jbx22/JOBS.wasfai.com

## Product distinction
Current product: Arabic-first, candidate-side job-search command center with Google sign-in, encrypted CV upload, résumé coaching, job ingestion/matching, candidate application tracking, AI writing, an admin console, and Moyasar subscription endpoints.

Requested expansion: a two-sided recruitment marketplace. Employer organization verification, employer-owned openings, employer application queues and employer access control are **not the same** as candidate-side tracking. Do not expose a candidate résumé to an employer without an explicit candidate application/consent.

## Phase 0 — OAuth, account safety, and safe deployment (this branch)
- Canonical Google OAuth callback: https://jobs.wasfai.com/api/auth/google/callback
- Production and Cloudflare Pages preview hosts use the canonical host for login state.
- Require client ID, client secret and signing secret before starting OAuth.
- Reject unverified Google identities and deny suspended users.
- Session and protected API authorization must check the current account row, not only a signed cookie.
- OAuth regression checks run in CI; preview deploy and real Google sign-in still need to be exercised using legitimate Google test accounts.
- Google Cloud Auth Platform > Clients: web application; add **exact** callback above. Check app publication/test users and consent settings. Configure Cloudflare Pages GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_COOKIE_SECRET. Do not commit secrets.
- Confirm the PostgreSQL gateway URL/token are present on Pages; the auth callback needs durable storage.
- Before release: run `npm run check:all`, browser QA, backup/restore proof, version snapshot via `node tools/bump-version.js`, staged Pages deployment, rollback rehearsal. Do not merge/deploy on syntax checks alone.

## Phase 1 — Candidate improvements
Already present: Google registration, approval of master résumé, PDF/DOCX/TXT/MD upload to encrypted R2, profile-based match scoring, cover letters, application timelines.
New branch improvements: city selection on Jobs view, salary and required-experience filters guarded by structured metadata.
Remaining:
- Extend source ingestion to preserve currency-qualified minimum salary (and unit), employer-provided required years, and verified city/country; never infer these from an unstructured snippet.
- Validate files for malware, scan permitted document types, cap extracted text and model token budgets.
- Test real uploaded CV extraction (Arabic and English) and truthful AI matching with evaluation data.
- Add authorized candidate-application submission for first-party employer openings; avoid claiming applications were sent when only a draft exists.

## Phase 2 — Employers and application tracking (separate feature PR)
Data model proposal:
- `employer_organizations`: id, legal name, CR number (encrypted/restricted), verification state pending/approved/rejected/suspended, verified_by, timestamps.
- `employer_memberships`: user_id, organization_id, role owner/recruiter/viewer, status; enforce tenant scope on every query.
- `employer_job_postings`: organization_id, public id, status draft/pending/published/closed, title, full description, original datePosted, verified city/country, compensation currency/range, experience and employment type, expiry.
- `job_applications`: job_id, candidate_user_id, résumé-file version, consent timestamp, status applied/shortlisted/interview/rejected/hired/withdrawn, recruiter owner, timestamps.
- `job_application_events`: immutable actor, organization, action, application and timestamp.

Required controls:
- Admin approval before an employer can publish; CR/company verification workflow and signed audit log.
- Only authorized employer members see their own applicants; enforce on server AND data queries.
- Candidates explicitly authorize each application and employer access to their submitted résumé.
- Employers can shortlist/reject/update statuses with audited timestamps; candidates see consented application progress.
- Rate limits, abuse reports, anti-scraping, document privacy, retention/deletion, notification preferences.
- Mobile-first Arabic/English employer dashboard should reuse existing visual components without replacing candidate UI.

## Phase 3 — Search, AI, and SEO
- Improve source quality, respect board API/robots/usage rights and revalidate liveness.
- Publish crawlable `/openings/:id` only for public verified active openings, with canonical URLs and a dynamic sitemap.
- JobPosting JSON-LD only when source provides a genuine original `datePosted`, complete job description, employer, and valid location; omit when required fields are uncertain. Current ingestion truncates description to 1,200 chars, so truncated entries cannot qualify.
- Paginate public sitemap and ingestion beyond first 100 jobs when inventory grows; add Search Console, Rich Results Test, Indexing API only where Google guidelines permit.
- AI explainable match scores, per-user consent, prompt injection resistance, rate limits and usage-cost caps.
- Never invent employer identities, salary values, applications, Google indexing or external platform affiliations.

## Phase 4 — Admin, operations and payments
Already present: account/admin memberships, super-admin, audit events, AI usage, billing and Moyasar.
Remaining:
- Organization approval/revocation, per-tenant investigations, abuse queues, alerts, admin least-privilege scopes and actionable audit logs.
- Verify AI charges against provider invoices; monitor matching latency, ingestion failure %, retention, DB errors, conversion and payment reconciliation.
- Confirm Moyasar paid status, amount, currency, plan/user ownership and signed webhook before entitlement; handle refunds, chargebacks, retries, expiration and subscription state transitions.
- PostgreSQL indexes for `organization_id`, `job_id`, `candidate_user_id`, verification/status/updated_at, strict migration and rollback plan.
- Daily off-site backups with periodic verified restore tests; never store secrets, resumés or payment card details in GitHub.

## Acceptance gates
1. OAuth real production test succeeds and suspended users cannot sign in.
2. Frontend mobile/desktop smoke, unit tests, security tests, backend migrations and regression suite pass.
3. Employer and candidate test identities cannot access each other's or another tenant's data.
4. Job listings are genuine, dated, active, source-authorized, and accessible to crawlers without login.
5. Billing gates are verified server-side, with webhook idempotency and reconciliation.
6. Release tagged/versioned, backups tested, staging tested, deployment and rollback explicitly approved.

**Current status:** implementation branch only; not a production deployment or evidence that Google OAuth credentials have been configured in Cloudflare/Google.
