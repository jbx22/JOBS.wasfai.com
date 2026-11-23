import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("PostgreSQL gateway accepts large bound data within its limits and reports oversized SQL", {
  skip: !process.env.JOBS_TEST_PG_URL && "set JOBS_TEST_PG_URL for the gateway HTTP integration test",
  timeout: 20_000,
}, async (t) => {
  const token = "integration-test-token";
  const child = spawn(process.execPath, [fileURLToPath(new URL("../vps/db-gateway/server.mjs", import.meta.url))], {
    env: { ...process.env, DATABASE_URL: process.env.JOBS_TEST_PG_URL, GATEWAY_TOKEN: token, PORT: "0", STATEMENT_TIMEOUT_MS: "1000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
  });
  const port = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = /listening on :(\d+)/.exec(stdout);
      if (match) resolve(match[1]);
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error("Gateway exited with " + code + " " + stderr)));
  });
  const query = (body) => fetch("http://127.0.0.1:" + port + "/v1/query", {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  const response = await query({ sql: "SELECT LENGTH(?) AS bytes", params: ["x".repeat(80_000)], mode: "first" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results[0].bytes, 80_000);
  const rejected = await query({ sql: "SELECT 1 " + " ".repeat(33_000) + "AS value", params: [] });
  assert.equal(rejected.status, 413);
  const timeout = await query({ sql: "SELECT pg_sleep(2)", params: [] });
  assert.equal(timeout.status, 503);
  assert.equal((await timeout.json()).error, "Database operation failed.");
});
