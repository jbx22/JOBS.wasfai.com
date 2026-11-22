import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie, readSession, safeReturnPath, parseCookies, readActiveSession, pkceChallenge } from "../functions/api/auth/_auth.js";
import { onRequestGet as start } from "../functions/api/auth/google/start.js";
import { onRequestGet as callback } from "../functions/api/auth/google/callback.js";
import { onRequestGet as session } from "../functions/api/auth/session.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import { requireAdmin } from "../functions/api/_admin.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const verifier = "a".repeat(64);
function callbackContext(env = testEnv, cookieExtra = "", query = "code=valid-code&state=valid-state") {
  return { env, request: new Request("https://jobs.wasfai.com/api/auth/google/callback?" + query, {
    headers: { Cookie: "jobs_oauth_state=valid-state; jobs_oauth_pkce=" + verifier + cookieExtra },
  }) };
}
async function signedRequest(path = "/api/me/state", user = { sub: "google-user", email: "stale@example.com", name: "Old name" }) {
  return new Request("https://jobs.wasfai.com" + path, { headers: { Cookie: (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0] } });
}
function hasIssuedSession(response) {
  return response.headers.getSetCookie().some((c) => c.startsWith("jobs_session=") && !c.includes("Max-Age=0"));
}

test("Arabic session names survive signing and verification; tampered and malformed cookies fail safely", async () => {
  const user = { sub: "google-user", name: "جابر حسن أبوساق 👷" };
  const cookie = await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET);
  const request = new Request("https://jobs.wasfai.com", { headers: { Cookie: cookie.split(";")[0] + "; unrelated=%ZZ" } });
  assert.equal((await readSession(request, testEnv.AUTH_COOKIE_SECRET)).name, user.name);
  assert.equal(await readSession(request, "wrong-secret"), null);
  assert.equal(parseCookies(request).unrelated, undefined);
  await assert.rejects(() => sessionCookie(user, ""), /not configured/);
});

test("OAuth return paths reject external, backslash and encoded redirect variants", () => {
  for (const value of ["//evil.test", "/\\evil.test", "/%5cevil.test", "/%2f%2fevil.test", "/%0d%0aLocation:evil", "/bad\npath", "https://evil.test", "/%", "/" + "a".repeat(170)]) {
    assert.equal(safeReturnPath(value), "", value);
  }
  assert.equal(safeReturnPath("/account?tab=cv"), "/account?tab=cv");
});

test("OAuth start requires complete credentials and durable storage", async () => {
  for (const field of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_COOKIE_SECRET", "JOBS_DB_GATEWAY_TOKEN"]) {
    const response = await start({ env: { ...testEnv, [field]: "" }, request: new Request("https://jobs.wasfai.com/api/auth/google/start") });
    assert.equal(response.status, 503, field);
    assert.equal(response.headers.get("Location"), null);
  }
});

test("OAuth start pins callback origin, sets PKCE and clears stale consent and return cookies", async () => {
  const response = await start({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/auth/google/start") });
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get("Location"));
  assert.equal(target.searchParams.get("redirect_uri"), "https://jobs.wasfai.com/api/auth/google/callback");
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  assert.equal(target.searchParams.has("prompt"), false);
  assert.equal(target.searchParams.has("max_age"), false);
  const cookies = response.headers.getSetCookie();
  const pkce = decodeURIComponent(cookies.find((c) => c.startsWith("jobs_oauth_pkce=")).split(";")[0].split("=")[1]);
  assert.equal(target.searchParams.get("code_challenge"), await pkceChallenge(pkce));
  assert.ok(cookies.find((c) => c.startsWith("jobs_terms_consent=")).includes("Max-Age=0"));
  assert.ok(cookies.find((c) => c.startsWith("jobs_oauth_return=")).includes("Max-Age=0"));
  const alternate = await start({ env: testEnv, request: new Request("https://preview.pages.dev/api/auth/google/start?terms=1") });
  assert.equal(alternate.headers.get("Location"), "https://jobs.wasfai.com/api/auth/google/start?terms=1");
  assert.equal(alternate.headers.getSetCookie().length, 0);
});

test("callback persists a verified Arabic identity before issuing a session", async (t) => {
  const { db, calls } = gatewayFixture(t);
  const response = await callback(callbackContext(testEnv, "; jobs_terms_consent=1; jobs_oauth_return=%2Faccount"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/account");
  assert.ok(hasIssuedSession(response));
  const account = db.prepare("SELECT * FROM users WHERE id = ?").get("google-user");
  assert.equal(account.display_name, "جابر حسن");
  assert.ok(account.accepted_terms_at);
  const tokenCall = calls.find((c) => c.url.endsWith("/token"));
  assert.equal(typeof tokenCall.init.body, "string");
  assert.equal(tokenCall.init.redirect, "manual");
  const tokenParams = new URLSearchParams(tokenCall.init.body);
  assert.equal(tokenParams.get("code_verifier"), verifier);
  assert.equal(tokenParams.get("redirect_uri"), "https://jobs.wasfai.com/api/auth/google/callback");
  assert.equal(response.headers.get("Cache-Control"), "no-store, private");
});

test("suspended callback cannot reactivate or mutate an existing account", async (t) => {
  const { db, addUser } = gatewayFixture(t);
  addUser("suspended");
  const response = await callback(callbackContext());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ACCOUNT_RESTRICTED");
  assert.equal(db.prepare("SELECT account_status FROM users").get().account_status, "suspended");
  assert.equal(hasIssuedSession(response), false);
});

test("callback rechecks a concurrent restriction after the account upsert", async (t) => {
  gatewayFixture(t, { beforeQuery: ({ sql }, db) => {
    if (sql.startsWith("SELECT account_status, onboarding_completed_at")) db.exec("UPDATE users SET account_status='suspended'");
  } });
  const response = await callback(callbackContext());
  assert.equal(response.status, 403);
  assert.equal(hasIssuedSession(response), false);
});

test("callback fails closed when storage is missing, unreachable, or a write fails", async (t) => {
  gatewayFixture(t, { storageError: true });
  const missing = await callback(callbackContext({ ...testEnv, JOBS_DB_GATEWAY_TOKEN: "" }));
  assert.equal(missing.status, 503);
  assert.equal(hasIssuedSession(missing), false);
  const unavailable = await callback(callbackContext());
  assert.equal(unavailable.status, 503);
  assert.equal(hasIssuedSession(unavailable), false);
});

test("callback rejects invalid state, missing PKCE, cancelled sign-in and unverified email", async (t) => {
  const { calls } = gatewayFixture(t, { identity: { sub: "unverified", email: "user@example.com", email_verified: false } });
  const invalid = await callback(callbackContext(testEnv, "", "code=x&state=wrong"));
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);
  const cancelled = await callback(callbackContext(testEnv, "", "error=access_denied&state=valid-state"));
  assert.equal((await cancelled.json()).code, "GOOGLE_OAUTH_CANCELLED");
  const noPkce = callbackContext();
  noPkce.request = new Request(noPkce.request.url, { headers: { Cookie: "jobs_oauth_state=valid-state" } });
  assert.equal((await callback(noPkce)).status, 400);
  const unverified = await callback(callbackContext());
  assert.equal(unverified.status, 403);
  assert.equal(hasIssuedSession(unverified), false);
});

test("provider outages produce a recoverable error and no session", async (t) => {
  gatewayFixture(t, { providerError: true });
  const response = await callback(callbackContext());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "GOOGLE_PROVIDER_UNAVAILABLE");
  assert.equal(hasIssuedSession(response), false);
});

test("Google callback failures return browser users to login and retain a local destination", async (t) => {
  gatewayFixture(t, { providerError: true });
  const ctx = callbackContext(testEnv, "; jobs_oauth_return=%2Fpricing%2F");
  ctx.request = new Request(ctx.request, { headers: { ...Object.fromEntries(ctx.request.headers), Accept: "text/html" } });
  const response = await callback(ctx);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/login?oauth_retry=1&next=%2Fpricing%2F");
  assert.equal(hasIssuedSession(response), false);
  assert.ok(response.headers.getSetCookie().some((c) => c.startsWith("jobs_oauth_state=") && c.includes("Max-Age=0")));
});

test("old signed sessions use current database identity and lose access on suspension", async (t) => {
  const { db, addUser } = gatewayFixture(t);
  addUser();
  const request = await signedRequest();
  assert.equal((await readActiveSession(request, testEnv)).session.email, "user@example.com");
  db.exec("UPDATE users SET account_status='suspended'");
  await assert.rejects(() => readActiveSession(request, testEnv), { code: "ACCOUNT_RESTRICTED", status: 403 });
  const response = await session({ request, env: testEnv });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).authenticated, false);
});

test("middleware blocks restricted sessions before any protected handler, including AI and admin", async (t) => {
  const { addUser } = gatewayFixture(t);
  addUser("suspended");
  for (const path of ["/api/admin/users", "/api/ghostwriter", "/api/resumes", "/api/me/state"]) {
    let called = false;
    const response = await middleware({ env: testEnv, request: await signedRequest(path), next: async () => { called = true; return Response.json({}); } });
    assert.equal(response.status, 403, path);
    assert.equal(called, false);
    assert.equal(response.headers.get("Cache-Control"), "no-store, private");
  }
});

test("missing user and unavailable storage cannot authenticate a signed session", async (t) => {
  gatewayFixture(t);
  const request = await signedRequest();
  await assert.rejects(() => readActiveSession(request, testEnv), { code: "AUTH_REQUIRED" });
  await assert.rejects(() => readActiveSession(request, { ...testEnv, JOBS_DB_GATEWAY_TOKEN: "" }), { status: 503 });
});

test("owner admin path also requires a current active account", async (t) => {
  const owner = { sub: "owner", email: "jabosaag@gmail.com", name: "Jaber" };
  const { addUser } = gatewayFixture(t);
  addUser("suspended", owner);
  const request = await signedRequest("/api/admin", owner);
  await assert.rejects(() => requireAdmin({ env: testEnv, request }), { code: "ACCOUNT_RESTRICTED" });
});
