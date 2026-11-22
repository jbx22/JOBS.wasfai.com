# Production rollback references

Each `jobsNN` release reference is a GitHub branch pinned to the exact source commit submitted to Cloudflare Pages. Its name matches the version returned by [the live version endpoint](https://jobs.wasfai.com/api/version).

| Release reference | Pages production deployment | Ingestion Worker version |
| --- | --- | --- |
| [`jobs59`](https://github.com/jbx22/JOBS.wasfai.com/tree/jobs59) | [2feebdd6](https://dash.cloudflare.com/20af8653055a0b9e99aa4a30e346f3d4/pages/view/jobs-wasfai/2feebdd6-7f9d-4874-b1f1-35964346f1a8) | `14d10b75-1c81-4e4e-b172-6a9dcd94758c` |
| [`jobs60`](https://github.com/jbx22/JOBS.wasfai.com/tree/jobs60) | [2dfe70ea](https://dash.cloudflare.com/20af8653055a0b9e99aa4a30e346f3d4/pages/view/jobs-wasfai/2dfe70ea-501e-40ec-b7cc-bffc5ad42140) | `ab863cba-9b5d-4eb0-b2e7-e243cec36585` |
| [`jobs61`](https://github.com/jbx22/JOBS.wasfai.com/tree/jobs61) | [8d264c5f](https://dash.cloudflare.com/20af8653055a0b9e99aa4a30e346f3d4/pages/view/jobs-wasfai/8d264c5f-f9d4-4737-acdc-02ba6cc5f8bb) | `ab863cba-9b5d-4eb0-b2e7-e243cec36585` |
| [`jobs62`](https://github.com/jbx22/JOBS.wasfai.com/tree/jobs62) | [8567fb8e](https://dash.cloudflare.com/20af8653055a0b9e99aa4a30e346f3d4/pages/view/jobs-wasfai/8567fb8e-a1ca-431d-8a71-388308ab2b0a) | `ab863cba-9b5d-4eb0-b2e7-e243cec36585` |

## Restore a release

1. Pick one reference and use its row for both services. Open the `jobs-wasfai` Pages deployment in Cloudflare, choose **Rollback to this deployment**, and confirm. [Cloudflare Pages rollback instructions](https://developers.cloudflare.com/pages/configuration/rollbacks/)
2. In the `jobs-wasfai-ingestion` Worker's **Deployments** tab, roll back to the Worker version in the same row if a different version is active. [Cloudflare Workers rollback instructions](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
3. Verify the expected release marker and inspect the restored Worker deployment. Confirm the vacancy listings are reachable. [Release marker](https://jobs.wasfai.com/api/version) · [Worker health](https://jobs-wasfai-ingestion.jabosaag.workers.dev/health) · [Vacancies](https://jobs.wasfai.com/vacancies)

The first rollback target from `jobs62` is `jobs61`. Releases `jobs60`, `jobs61`, and `jobs62` use the same ingestion Worker version. Rolling back Pages between these releases does not require rolling back the Worker. If the active Worker version differs, run this command from a Jobs checkout:

```sh
npx wrangler rollback ab863cba-9b5d-4eb0-b2e7-e243cec36585 --config workers/ingestion/wrangler.jsonc
```

These references are for code and deployment recovery. Data restoration requires the [PostgreSQL backup and recovery procedure](PRODUCTION-DB-MIGRATION-VPS-POSTGRES-2026-09-13.md). The Foodics feed requires the Workable connector introduced in `jobs60`.

## Record the next release

Create `jobs63` for the next verified production release if it has that version marker. Add a row with the release branch, exact Pages deployment link, and Worker version ID. Keep the previous release branches pinned to their original commits.
