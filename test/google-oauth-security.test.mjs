import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Exercise the real Pages Function source without a Cloudflare account or
// real Google credentials. Dependencies are replaced with controlled mocks.
async function importSource(path, prelude = "") {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/^import\s+[^\n]+;\s*$/gm, "");
  const code = `${prelude}\n${source}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

const auth = await importSource("functions/api/auth/_auth.js");
globalThis.__jobsOAuthTestAuth = auth;
const injected = `
  const { authConfig, json, parseCookies, sessionCookie, clearReturnCookie,
          clearStateCookie, clearTermsCookie, stateCookie, returnCookie,
          termsCookie } = globalThis.__jobsOAuthTestAuth;
  const getJobDb = () => globalThis.__jobsOAuthTestDb;
`;
const start = await importSource("functions/api/auth/google/start.js", injected);
const callback = await importSource("functions/api/auth/google/callback.js", injected);
const env = {
  GOOGLE_CLIENT_ID: "fake-client.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "fake-client-secret",
  AUTH_COOKIE_SECRET: "test-session-signing-secret",
};

function ctx(url, cookie = "") {
  return {
    env,
    request: new Request(url, { headers: cookie ? { Cookie: cookie } : {} }),
  };
}
function dbWithAccount(existing) {
  const tracked = { inserts: 0 };
  const db = {
    prepare(sql) {
      const statement = String(sql).replace(/\s+/g, " ");
      return {
        bind(...params) { this.params = params; return this; },
        async run() {
          if (/INSERT INTO users/.test(statement)) tracked.inserts += 1;
          return { success: true };
        },
        async first() {
          if (/SELECT onboarding_completed_at, account_status FROM users/.test(statement)) return existing;
          if (/SELECT account_status FROM users/.test(statement)) {
            return existing || (tracked.inserts ? { account_status: "active" } : null);
          }
          throw new Error("Unexpected SQL query: " + statement);
        },
      };
    },
  };
  return { db, tracked };
}

function googleFetch(identity) {
  return async (url) => {
    if (String(url).includes("/token")) {
      return Response.json({ access_token: "fake-access-token" });
    }
    if (String(url).includes("/userinfo")) {
      return Response.json(identity);
    }
    throw new Error("Unexpected network call: " + url);
  };
}

test("Cloudflare preview OAuth starts on canonical custom domain", async () => {
  const response = await start.onRequestGet(ctx("https://abc123.jobs-wasfai.pages.dev/api/auth/google/start?terms=1"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://jobs.wasfai.com/api/auth/google/start?terms=1");
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("Production Google redirect_uri stays canonical", async () => {
  const response = await start.onRequestGet(ctx("https://jobs.wasfai.com/api/auth/google/start?terms=1"));
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get("Location"));
  assert.equal(redirect.origin, "https://accounts.google.com");
  assert.equal(redirect.searchParams.get("redirect_uri"), "https://jobs.wasfai.com/api/auth/google/callback");
  assert.ok(response.headers.get("Set-Cookie")?.includes("HttpOnly"));
});

test("OAuth does not start if Google client secret is absent", async () => {
  const response = await start.onRequestGet({ ...ctx("https://jobs.wasfai.com/api/auth/google/start"), env: { GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "GOOGLE_OAUTH_NOT_CONFIGURED");
});

test("Google callback refuses unverified email", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = dbWithAccount(null);
  globalThis.__jobsOAuthTestDb = fixture.db;
  globalThis.fetch = googleFetch({ sub: "user-123", email: "candidate@example.com", email_verified: false });
  try {
    const response = await callback.onRequestGet(ctx(
      "https://jobs.wasfai.com/api/auth/google/callback?state=good&code=ok",
      "jobs_oauth_state=good",
    ));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "GOOGLE_IDENTITY_UNVERIFIED");
    assert.equal(fixture.tracked.inserts, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Google login never reactivates suspended account", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = dbWithAccount({ account_status: "suspended", onboarding_completed_at: "2026-01-01" });
  globalThis.__jobsOAuthTestDb = fixture.db;
  globalThis.fetch = googleFetch({ sub: "user-123", email: "candidate@example.com", email_verified: true });
  try {
    const response = await callback.onRequestGet(ctx(
      "https://jobs.wasfai.com/api/auth/google/callback?state=good&code=ok",
      "jobs_oauth_state=good",
    ));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ACCOUNT_RESTRICTED");
    assert.equal(fixture.tracked.inserts, 0);
    assert.ok(!response.headers.get("Set-Cookie")?.includes("jobs_session="));
  } finally { globalThis.fetch = originalFetch; }
});

test("Verified new Google user receives a signed, HttpOnly session", async () => {
  const originalFetch = globalThis.fetch;
  const fixture = dbWithAccount(null);
  globalThis.__jobsOAuthTestDb = fixture.db;
  globalThis.fetch = googleFetch({ sub: "verified-user", email: "candidate@example.com", name: "Candidate", email_verified: true });
  try {
    const response = await callback.onRequestGet(ctx(
      "https://jobs.wasfai.com/api/auth/google/callback?state=good&code=ok",
      "jobs_oauth_state=good; jobs_terms_consent=1",
    ));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "/onboarding");
    assert.equal(fixture.tracked.inserts, 1);
    const setCookies = response.headers.get("Set-Cookie") || "";
    assert.ok(setCookies.includes("jobs_session="));
    assert.ok(setCookies.includes("HttpOnly"));
    assert.ok(setCookies.includes("Secure"));
  } finally { globalThis.fetch = originalFetch; }
});

test("Tampered session cookie is rejected", async () => {
  const cookie = await auth.sessionCookie({ sub: "user-1", email: "candidate@example.com" }, env.AUTH_COOKIE_SECRET);
  const valid = await auth.readSession(new Request("https://jobs.wasfai.com/", { headers: { Cookie: cookie.split(";")[0] } }), env.AUTH_COOKIE_SECRET);
  assert.equal(valid.sub, "user-1");
  const damaged = cookie.split(";")[0].slice(0, -1) + "!";
  const invalid = await auth.readSession(new Request("https://jobs.wasfai.com/", { headers: { Cookie: damaged } }), env.AUTH_COOKIE_SECRET);
  assert.equal(invalid, null);
});
