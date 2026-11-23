import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const config = JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));
const requiredTypes = {
  ...Object.fromEntries(Object.keys(config.vars).map((name) => [name, "plain_text"])),
  AUTH_COOKIE_SECRET: "secret_text",
  DEEPSEEK_API_KEY: "secret_text",
  JOBS_RESUME_DEEPSEEK_API_KEY: "secret_text",
};

function assertBindingTypes(variables, required) {
  for (const [name, type] of Object.entries(required)) {
    if (variables?.[name]?.type !== type) throw new Error(`Missing or incorrectly typed Pages binding: ${name} (${type})`);
  }
}

export function productionBindings(project) {
  if (project.name !== config.name || project.production_branch !== "main") throw new Error("Unexpected Pages project or production branch");
  const production = project.deployment_configs?.production;
  assertBindingTypes(production?.env_vars, requiredTypes);
  for (const db of config.d1_databases) {
    if (production.d1_databases?.[db.binding]?.id !== db.database_id) throw new Error(`Unexpected Pages database binding: ${db.binding}`);
  }
  for (const bucket of config.r2_buckets) {
    if (production.r2_buckets?.[bucket.binding]?.name !== bucket.bucket_name) throw new Error(`Unexpected Pages bucket binding: ${bucket.binding}`);
  }
  return Object.fromEntries(Object.entries(production.env_vars).filter(([, entry]) => entry?.type).map(([name, entry]) => [name, entry.type]));
}

export function verifyDeployment(deployment, sha, bindings) {
  if (deployment?.environment !== "production" || deployment.deployment_trigger?.metadata?.commit_hash !== sha) {
    throw new Error("The Pages production deployment points to a different commit");
  }
  assertBindingTypes(deployment.env_vars, bindings);
}

async function check(phase) {
  if (!["before", "after"].includes(phase)) throw new Error("Expected before or after");
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, GITHUB_SHA: sha, PAGES_STAGE: stage } = process.env;
  if (!account || !token || !sha || !stage) throw new Error("Missing Pages deployment credentials or commit");
  const inventory = join(stage, "binding-types.json");
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects/${config.name}`;
  async function read(path = "") {
    const response = await fetch(endpoint + path, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Pages metadata request failed (HTTP ${response.status})`);
    const result = await response.json();
    if (!result.success || !result.result) throw new Error("Pages metadata unavailable");
    return result.result;
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    const project = await read();
    const bindings = productionBindings(project);
    if (phase === "before") {
      writeFileSync(inventory, JSON.stringify(bindings), { mode: 0o600 });
      console.log("Verified the production project and required binding types, including encrypted JOBS_RESUME_DEEPSEEK_API_KEY.");
      return;
    }
    const deployment = project.canonical_deployment;
    if (deployment?.deployment_trigger?.metadata?.commit_hash === sha && deployment.id) {
      const originalTypes = JSON.parse(readFileSync(inventory, "utf8"));
      assertBindingTypes(project.deployment_configs.production.env_vars, originalTypes);
      verifyDeployment(await read(`/deployments/${encodeURIComponent(deployment.id)}`), sha, originalTypes);
      console.log("Verified the production commit and deployment binding types, including encrypted JOBS_RESUME_DEEPSEEK_API_KEY.");
      return;
    }
    if (attempt < 11) await sleep(5000);
  }
  throw new Error("Timed out waiting for the deployed commit to become the canonical Pages production deployment");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  check(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
