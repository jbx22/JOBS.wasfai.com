import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import { onRequestPost as connect } from "../functions/api/openrouter/connect.js";
import { onRequestGet as callback } from "../functions/api/openrouter/callback.js";
import { onRequestPost as disconnect } from "../functions/api/openrouter/disconnect.js";
import { onRequestGet as status } from "../functions/api/openrouter/status.js";
import { getUserOpenRouterKey } from "../functions/api/openrouter/_shared.js";

const origin = "https://jobs.wasfai.com";
const exchangeUrl = "https://openrouter.ai/api/v1/auth/keys";
const mockKey = "synthetic-personal-key-for-isolated-tests";
const disconnected = { connected: false, connected_at: null };
const owner = { sub: "owner", email: "owner@example.test" };
const other = { sub: "other", email: "other@example.test" };

function request(handler, path, cookie, method = "GET", headers = {}) {
  const context = { env: testEnv, request: new Request(new URL(path, origin), { method, headers: { Cookie: cookie, ...headers } }) };
  return middleware({ ...context, next: () => handler(context) });
}

async function sign(user, session = "one") {
  return (await sessionCookie({ ...user, session }, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
}

async function start(cookie) {
  const response = await request(connect, "/api/openrouter/connect", cookie, "POST");
  assert.equal(response.status, 200);
  const cookieHeader = response.headers.get("set-cookie");
  for (const part of ["__Host-", "HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert.ok(cookieHeader.includes(part));
  const { authorization_url } = await response.json();
  const authorization = new URL(authorization_url);
  assert.equal(authorization.origin + authorization.pathname, "https://openrouter.ai/auth");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.has("code_verifier"), false);
  const url = new URL(authorization.searchParams.get("callback_url"));
  assert.equal(url.origin, origin);
  assert.match(url.pathname, /^\/api\/openrouter\/callback\/[A-Za-z0-9_-]{43}$/);
  assert.equal(url.search, "");
  url.searchParams.set("code", "synthetic-single-use-code");
  return { url, challenge: authorization.searchParams.get("code_challenge"), binding: cookieHeader.split(";")[0] };
}

function outcome(response) {
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.body, null);
  const target = response.headers.get("location");
  assert.match(target, /^\/profile\?openrouter=(?:connected|expired|cancelled|error)$/);
  return target.split("=")[1];
}

test("OpenRouter PKCE keeps the account key and single-use verifier off the client and out of persistent plaintext", async t => {
  const exchanges = [];
  const fixture = gatewayFixture(t, { otherFetch: (url, init) => {
    assert.equal(url, exchangeUrl);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    exchanges.push(JSON.parse(init.body));
    return Response.json({ key: mockKey });
  } });
  fixture.addUser("active", owner);
  fixture.addUser("active", other);
  const cookie = await sign(owner);
  const otherCookie = await sign(other);
  const state = () => request(status, "/api/openrouter/status", cookie).then(r => r.json());
  assert.deepEqual(await state(), disconnected);
  assert.equal(await getUserOpenRouterKey(testEnv, owner.sub), null);
  const flow = await start(cookie);
  const credentials = cookie + "; " + flow.binding;
  assert.equal(outcome(await request(callback, flow.url, cookie)), "expired");
  assert.equal(outcome(await request(callback, flow.url, otherCookie + "; " + flow.binding)), "expired");
  assert.equal(outcome(await request(callback, flow.url, await sign(owner, "two") + "; " + flow.binding)), "expired");
  assert.equal(exchanges.length, 0);
  const outcomes = await Promise.all([request(callback, flow.url, credentials), request(callback, flow.url, credentials)]);
  assert.deepEqual(outcomes.map(outcome).sort(), ["connected", "expired"]);
  assert.equal(exchanges.length, 1);
  const [body] = exchanges;
  assert.equal(body.code_challenge_method, "S256");
  assert.equal(body.code, "synthetic-single-use-code");
  assert.equal(createHash("sha256").update(body.code_verifier).digest("base64url"), flow.challenge);
  const row = fixture.db.prepare("SELECT * FROM user_openrouter_connections WHERE user_id=?").get(owner.sub);
  assert.match(row.credential, /^v1\./);
  const gatewayCalls = fixture.calls.filter(call => call.url.startsWith(testEnv.JOBS_DB_GATEWAY_URL));
  for (const secret of [mockKey, body.code_verifier, body.code]) {
    assert.equal(JSON.stringify(row).includes(secret), false);
    assert.equal(JSON.stringify(gatewayCalls).includes(secret), false);
  }
  const connected = await state();
  assert.deepEqual(Object.keys(connected).sort(), ["connected", "connected_at"]);
  assert.ok(connected.connected && Date.parse(connected.connected_at));
  assert.equal(await getUserOpenRouterKey(testEnv, owner.sub), mockKey);
  assert.equal(await getUserOpenRouterKey(testEnv, other.sub), null);
  fixture.db.prepare("INSERT INTO user_openrouter_connections (user_id,credential,connected_at) VALUES (?,?,?)")
    .run(other.sub, row.credential, row.connected_at);
  const reconnect = { code: "OPENROUTER_RECONNECT_REQUIRED", message: "Reconnect your OpenRouter account." };
  await assert.rejects(getUserOpenRouterKey(testEnv, other.sub), reconnect);
  await assert.rejects(getUserOpenRouterKey({ ...testEnv, AUTH_COOKIE_SECRET: "synthetic-rotated-secret" }, owner.sub), reconnect);
  fixture.db.prepare("UPDATE user_openrouter_connections SET credential='unknown-format' WHERE user_id=?").run(other.sub);
  await assert.rejects(getUserOpenRouterKey(testEnv, other.sub), reconnect);
  await assert.rejects(getUserOpenRouterKey({ ...testEnv, JOBS_DB_GATEWAY_TOKEN: "" }, owner.sub),
    error => error.code !== reconnect.code && !error.message.includes(mockKey));
  const disconnectOwner = () => request(disconnect, "/api/openrouter/disconnect", cookie, "POST");
  assert.deepEqual(await (await disconnectOwner()).json(), disconnected);
  assert.deepEqual(await (await disconnectOwner()).json(), disconnected);
  assert.equal(await getUserOpenRouterKey(testEnv, owner.sub), null);
});

test("OpenRouter cancellation, expiry, replacement and failed reconnection preserve the current credential", async t => {
  let successful = true;
  let count = 0;
  const fixture = gatewayFixture(t, { otherFetch: (url) => {
    assert.equal(url, exchangeUrl);
    count++;
    return successful ? Response.json({ key: mockKey }) : Response.json({ error: "synthetic-private-error" }, { status: 400 });
  } });
  fixture.addUser("active", owner);
  const cookie = await sign(owner);
  const complete = flow => request(callback, flow.url, cookie + "; " + flow.binding).then(outcome);
  const previous = await start(cookie);
  const current = await start(cookie);
  assert.notEqual(previous.challenge, current.challenge);
  assert.equal(await complete(previous), "expired");
  assert.equal(await complete(current), "connected");
  const denied = await start(cookie);
  denied.url.searchParams.set("error", "access_denied");
  assert.equal(await complete(denied), "cancelled");
  assert.equal(await complete(denied), "expired");
  const expired = await start(cookie);
  fixture.db.prepare("UPDATE user_openrouter_connections SET expires_at=1 WHERE user_id=?").run(owner.sub);
  assert.equal(await complete(expired), "expired");
  assert.equal(count, 1);
  successful = false;
  const failed = await start(cookie);
  assert.equal(await complete(failed), "error");
  assert.equal(await complete(failed), "expired");
  assert.equal(count, 2);
  assert.equal(await getUserOpenRouterKey(testEnv, owner.sub), mockKey);
});

test("a disconnect during exchange cannot recreate the removed account connection", async t => {
  const began = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const fixture = gatewayFixture(t, { otherFetch: async (url) => {
    assert.equal(url, exchangeUrl);
    began.resolve();
    await finish.promise;
    return Response.json({ key: mockKey });
  } });
  fixture.addUser("active", owner);
  const cookie = await sign(owner);
  const flow = await start(cookie);
  const late = request(callback, flow.url, cookie + "; " + flow.binding);
  await began.promise;
  try { assert.deepEqual(await (await request(disconnect, "/api/openrouter/disconnect", cookie, "POST")).json(), disconnected); }
  finally { finish.resolve(); }
  assert.equal(outcome(await late), "expired");
  assert.equal(await getUserOpenRouterKey(testEnv, owner.sub), null);
});

test("OpenRouter account actions follow account status and the site's same-origin mutation policy", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  const cookie = await sign(owner);
  for (const [handler, path, method] of [[connect, "connect", "POST"], [disconnect, "disconnect", "POST"], [status, "status", "GET"]]) {
    const url = "/api/openrouter/" + path;
    assert.equal((await request(handler, url, "", method)).status, 401);
    if (method === "POST") assert.equal((await request(handler, url, cookie, method, { Origin: "https://other.example" })).status, 403);
  }
  const pending = await start(cookie);
  fixture.db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(owner.sub);
  assert.equal((await request(status, "/api/openrouter/status", cookie)).status, 403);
  assert.equal(outcome(await request(callback, pending.url, cookie + "; " + pending.binding)), "expired");
  assert.equal(fixture.calls.some(call => call.url === exchangeUrl), false);
});
