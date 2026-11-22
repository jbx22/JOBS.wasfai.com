# jobs59 — prepared release

Status: source changes prepared and tested locally; production has not been modified by this work.

## Resulting behavior

- Google sign-in uses PKCE, verified provider email and the canonical callback origin. A durable active user record is required before a session is issued. Suspended accounts cannot be reactivated by Google or the QA endpoint. Existing signed sessions are checked against current account state.
- Arabic names round-trip through signed sessions. OAuth failures clear transient cookies; provider outages return recoverable errors.
- Existing admin areas enforce stored scopes. Owner access and the dedicated SAdmin service path are retained.
- New routes: /vacancies, /vacancies/:public_id, /employers, /applications, /recruitment-admin. Existing account and matching routes stay in place; the existing Arabic-first theme is reused.
- Employers submit commercial registration details for manual admin review. Verified employers submit jobs for a separate publication review. Admins can reject or suspend companies, approve or close jobs and review durable recruitment events through the API.
- Candidate applications require explicit sharing consent and an owned encrypted CV. Only that employer can read candidate contact details or download the attachment. Withdrawal blocks further platform access. Uploading a newer CV preserves attachments of existing applications.
- Public searches support city, profession, disclosed monthly salary in SAR and minimum experience. Private source records, closed/expired jobs and stale ingested listings are excluded. The existing evidence-weighted matcher now includes reviewed employer listings; scores are not claims of AI prediction accuracy.
- Employer postings with complete factual location/date data include JobPosting JSON-LD. Imported jobs retain source links and ordinary searchable HTML; no missing dates, country or salary are invented for structured data.
- /sitemap.xml is a sitemap index with automatic job shards. Unavailable storage returns 503 rather than an empty authoritative sitemap.
- A paid invoice can activate once. Replayed callbacks cannot renew a period or restore cancelled access. Payment amount, SAR currency, user and plan still require a server-side Moyasar lookup.

## Local validation

- npm run check:all passed with jobs59: 40 passed, 2 opt-in PostgreSQL tests skipped locally. The separate gateway SQL suite passed all 15 tests. CI supplies PostgreSQL for the two integration tests.
- The Pages Functions bundle compiled with locally available Wrangler 4.118.0. The lockfile remains at Wrangler 4.110.0. Installing the pinned package locally failed because package-registry DNS was unavailable; CI compiles using the lockfile.
- Offline Chromium checks used real handlers, an isolated SQLite database and encrypted file fixtures at 1440 × 1000 and 390 × 844. Page rendering, filtered/empty results, consent, CV upload/application, shortlist, CV download and withdrawal passed with no console errors or horizontal overflow.
- Live/local HTTP browser navigation was blocked by the execution environment. Offline rendering is not production end-to-end verification.
- CI uses Node 24 and PostgreSQL 16 to exercise the translated SQL release flow and the preserved gateway regression tests. Its result must be checked on the PR.

## Rollout order

1. Back up the existing PostgreSQL database using the established backup workflow. Confirm the backup and the currently active Pages deployment and ingestion version.
2. With the existing PostgreSQL application credentials, apply migration 009_recruitment.sql and then 010_payment_activations.sql. Use psql with ON_ERROR_STOP=1 in a transaction. Do not run these PostgreSQL data migrations against the retained D1 rollback database.
3. Migration 010 must run before the new Pages code handles callbacks: it seeds activation records for already-paid active subscriptions so old invoices cannot activate again. The migration is additive and can be rerun. No existing user or CV data is deleted.
4. Verify the existing production Pages bindings and secret names: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_COOKIE_SECRET, JOBS_DB_GATEWAY_URL, JOBS_DB_GATEWAY_TOKEN, RESUME_FILES, FILE_ENCRYPTION_KEY and the existing Moyasar/AI secrets. Never expose their values. Keep the current auth signing secret so valid sessions remain readable.
5. Verify Google Cloud's authorized redirect URI is exactly https://jobs.wasfai.com/api/auth/google/callback. Check the consent-screen publication/test-user settings in the actual Google project; no console access was available during this work.
6. Run npm ci and npm run check:all, then deploy Pages through the existing production workflow and deploy the changed ingestion Worker. Existing R2/D1 bindings, database gateway and compatibility date are retained.
7. Confirm /api/version reports jobs59, then complete a real Google sign-in with the owner and a normal test account. Verify a suspended test account is denied, active CV upload/download still works, private sources stay private and a reviewed job appears in the public sitemap.
8. Use Moyasar's test mode/account for an invoice verification and replay check. No real charge was made in local testing. Validate an eligible public job page with Google's Rich Results Test.

## Rollback

Restore the recorded previous Pages deployment and ingestion version together. Keep the additive recruitment/payment tables and all existing data. A code rollback does not roll back database contents. Review callback delivery before returning to old payment code, which does not enforce the activation ledger.

## Current access limits

The connected GitHub account is available. Saved Cloudflare CLI credentials were expired; automatic browser sign-in timed out without returning authorization. Shell DNS/package downloads and browser network navigation were restricted. Live Cloudflare settings, the Google console, the production PostgreSQL database and real provider calls remain unverified.

## References

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.cloudflare.com/pages/functions/
- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://developers.google.com/search/docs/appearance/structured-data/job-posting
