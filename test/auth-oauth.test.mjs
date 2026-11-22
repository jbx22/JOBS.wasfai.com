import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { onRequestGet as start } from "../functions/api/auth/google/start.js";
import { onRequestGet as callback } from "../functions/api/auth/google/callback.js";
import { getAuthenticatedUser } from "../functions/api/_state.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const env = {
  ENVIRONMENT: "production",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  AUTH_COOKIE_SECRET: "not-a-real-secret-for-tests",
  JOBS_DB_GATEWAY_URL: "https://gateway.example.test",
  JOBS_DB_GATEWAY_TOKEN: "test-token",
};

function oauthRequest(state = "valid-state") {
  return new Request(`https://jobs.wasfai.com/api/auth/google/callback?code=test-code&state=${state}`, {
    headers: { Cookie: "jobs_oauth_state=valid-state" },
  });
}

async function withMockGoogleAndDatabase(status, run) {
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-access-token" });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return Response.json({ sub: "google-sub-123", email: "test@example.test", name: "Example", email_verified: true });
    }
    if (url === "https://gateway.example.test/v1/query") {
      const body = JSON.parse(options.body);
      queries.push(body.sql);
      if (body.sql.includes("SELECT onboarding_completed_at")) {
        return Response.json({ ok: true, results: [{ onboarding_completed_at: null }] });
      }
      if (body.sql.includes("SELECT account_status")) {
        return Response.json({ ok: true, results: [{ account_status: status }] });
      }
      return Response.json({ ok: true, results: [] });
    }
    throw new Error("Unexpected network request: " + url);
  };
  try { return await run(queries); }
  finally { globalThis.fetch = originalFetch; }
}

test("OAuth begins on the canonical callback host so state cookies survive", async () => {
  const response = await start({
    env,
    request: new Request("https://jobs-wasfai.pages.dev/api/auth/google/start?next=%2Faccount"),
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://jobs.wasfai.com/api/auth/google/start?next=%2Faccount");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("OAuth refuses partially configured credentials", async () => {
  const response = await start({
    env: { ...env, GOOGLE_CLIENT_SECRET: "" },
    request: new Request("https://jobs.wasfai.com/api/auth/google/start"),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "GOOGLE_OAUTH_NOT_CONFIGURED");
});

test("OAuth state mismatch never reaches Google", async () => {
  const response = await callback({ env, request: oauthRequest("incorrect-state") });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "BAD_OAUTH_STATE");
});

test("suspended Google accounts cannot reactivate themselves or get sessions", async () => {
  await withMockGoogleAndDatabase("suspended", async (queries) => {
    const response = await callback({ env, request: oauthRequest() });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ACCOUNT_NOT_ACTIVE");
    assert.doesNotMatch(response.headers.get("set-cookie") || "", /jobs_session=/);
    const upsert = queries.find((q) => q.includes("INSERT INTO users"));
    assert.ok(upsert, "login must persist its user record");
    assert.doesNotMatch(upsert, /account_status\s*=\s*'active'/);
  });
});

test("active accounts can log in, but the signed session is revoked after suspension", async () => {
  await withMockGoogleAndDatabase("active", async () => {
    const response = await callback({ env, request: oauthRequest() });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("set-cookie") || "", /jobs_session=/);
  });
  const cookie = (await sessionCookie({ sub: "google-sub-123", email: "test@example.test", provider: "google" }, env.AUTH_COOKIE_SECRET)).split(";")[0];
  await withMockGoogleAndDatabase("suspended", async () => {
    const current = await getAuthenticatedUser({
      env,
      request: new Request("https://jobs.wasfai.com/api/me/state", { headers: { Cookie: cookie } }),
    });
    assert.equal(current, null);
  });
});

test("OAuth callback never reactivates the account in the on-conflict update", () => {
  const source = readFileSync(new URL("../functions/api/auth/google/callback.js", import.meta.url), "utf8");
  assert.match(source, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.doesNotMatch(source, /last_login_at=CURRENT_TIMESTAMP,\s*account_status='active'/);
});
