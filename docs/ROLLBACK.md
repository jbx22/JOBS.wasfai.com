# Production rollback references

Each `jobNN` reference is a GitHub branch pinned to the exact source commit submitted to Cloudflare Pages. The release marker is the value returned by [the live version endpoint](https://jobs.wasfai.com/api/version).

| Reference | Release marker | Pages production deployment | Ingestion Worker version |
| --- | --- | --- | --- |
| [`job01`](https://github.com/jbx22/JOBS.wasfai.com/tree/job01) | `jobs59` | [2feebdd6](https://dash.cloudflare.com/20af8653055a0b9e99aa4a30e346f3d4/pages/view/jobs-wasfai/2feebdd6-7f9d-4874-b1f1-35964346f1a8) | `14d10b75-1c81-4e4e-b172-6a9dcd94758c` |
| [`job02`](https://github.com/jbx22/JOBS.wasfai.com/tree/job02) | `jobs60` | [2dfe70ea](https://dash.cloudflare.com/20af8653055a0b9e99aa4a30e346f3d4/pages/view/jobs-wasfai/2dfe70ea-501e-40ec-b7cc-bffc5ad42140) | `ab863cba-9b5d-4eb0-b2e7-e243cec36585` |

## Restore a release

1. Pick one reference and use its row for both services. Open the `jobs-wasfai` Pages deployment in Cloudflare, choose **Rollback to this deployment**, and confirm. [Cloudflare Pages rollback instructions](https://developers.cloudflare.com/pages/configuration/rollbacks/)
2. In the `jobs-wasfai-ingestion` Worker's **Deployments** tab, roll back to the Worker version in the same row. [Cloudflare Workers rollback instructions](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
3. Verify the expected release marker and inspect the restored Worker deployment. Confirm the vacancy listings are reachable. [Release marker](https://jobs.wasfai.com/api/version) · [Worker health](https://jobs-wasfai-ingestion.jabosaag.workers.dev/health) · [Vacancies](https://jobs.wasfai.com/vacancies)

The first rollback target from `job02` is `job01`. The equivalent Worker command, run from a Jobs checkout, is:

```sh
npx wrangler rollback 14d10b75-1c81-4e4e-b172-6a9dcd94758c --config workers/ingestion/wrangler.jsonc
```

These references are for code and deployment recovery. Data restoration requires the [PostgreSQL backup and recovery procedure](PRODUCTION-DB-MIGRATION-VPS-POSTGRES-2026-09-13.md). The Foodics feed requires the Workable connector introduced in `job02`.

## Record the next release

Create `job03` for the next verified production release. Add a row with the exact Pages source commit reference, Pages deployment link, Worker version ID, and public release marker. Keep the previous reference branches pinned to their original commits.
