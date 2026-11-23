import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productionBindings, verifyDeployment } from "../.github/scripts/pages-bindings.mjs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const sha = "0123456789abcdef".repeat(2) + "01234567";
function variable(type) {
  return { type, get value() { throw new Error("Binding values must never be read"); } };
}
function project() {
  return {
    name: config.name, production_branch: "main",
    deployment_configs: { production: {
      d1_databases: { JOBS_DB: { id: config.d1_databases[0].database_id } },
      r2_buckets: { RESUME_FILES: { name: config.r2_buckets[0].bucket_name } },
      env_vars: {
        ...Object.fromEntries(Object.keys(config.vars).map((key) => [key, variable("plain_text")])),
        AUTH_COOKIE_SECRET: variable("secret_text"), DEEPSEEK_API_KEY: variable("secret_text"),
        ANOTHER_SECRET: variable("secret_text"),
      },
    } },
  };
}

test("verifies the exact production commit, resource bindings and encrypted variable metadata without reading values", () => {
  const p = project();
  const names = productionBindings(p);
  assert.equal(names.DEEPSEEK_API_KEY, "secret_text");
  const deployment = { environment: "production", deployment_trigger: { metadata: { commit_hash: sha } }, env_vars: { ...p.deployment_configs.production.env_vars } };
  verifyDeployment(deployment, sha, names);
  assert.throws(() => verifyDeployment(deployment, "wrong-commit", names), /different commit/);
  delete deployment.env_vars.ANOTHER_SECRET;
  assert.throws(() => verifyDeployment(deployment, sha, names), /ANOTHER_SECRET/);
});

test("blocks publishing if the configured DeepSeek variable has the wrong type or storage bindings changed", () => {
  const p = project();
  p.deployment_configs.production.env_vars.DEEPSEEK_API_KEY = variable("plain_text");
  assert.throws(() => productionBindings(p), /DEEPSEEK_API_KEY/);
  const other = project();
  other.deployment_configs.production.r2_buckets.RESUME_FILES.name = "wrong";
  assert.throws(() => productionBindings(other), /RESUME_FILES/);
});
