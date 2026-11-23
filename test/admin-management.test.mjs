import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/admin/[[route]].js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const env = { ...testEnv, JOBS_ADMIN_SERVICE_TOKEN: "test-central-admin" };
const owner = { sub: "default-owner", email: "jabosaag@gmail.com", provider: "google" };
const regular = { sub: "standard-user", email: "manager@example.com", provider: "google" };

async function admin(path, { method = "GET", body, user, service = false, operator } = {}) {
  const headers = new Headers();
  if (user) headers.set("cookie", (await sessionCookie(user, env.AUTH_COOKIE_SECRET)).split(";")[0]);
  if (service) headers.set("x-jobs-admin-service", env.JOBS_ADMIN_SERVICE_TOKEN);
  if (operator) headers.set("x-jobs-admin-operator", operator);
  if (body) headers.set("content-type", "application/json");
  return onRequest({ env, request: new Request("https://jobs.wasfai.com/api/admin" + path, { headers, method, body: body ? JSON.stringify(body) : undefined }) });
}

test("Google super admin, standard scopes and account protection follow the same native routes as SAdmin", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  fixture.addUser("active", regular);

  assert.equal((await admin("")).status, 401);
  assert.equal((await admin("", { user: { ...owner, provider: "qa" } })).status, 403);
  const session = await admin("", { user: owner });
  assert.equal((await session.json()).admin.role, "super_admin");

  const grant = await admin("/admins", { user: owner, method: "POST", body: { email: regular.email } });
  assert.equal(grant.status, 201);
  const duplicate = await admin("/admins", { user: owner, method: "POST", body: { email: regular.email, role: "super_admin" } });
  assert.equal(duplicate.status, 409);
  assert.equal((await admin("/payments", { user: regular })).status, 403);
  assert.equal((await admin("/audit", { user: regular })).status, 403);
  const overview = await admin("/overview", { user: regular });
  assert.equal(overview.status, 200);
  assert.deepEqual((await overview.json()).recent_audit, []);
  const filtered = await admin("/users?q=MANAGER&status=active", { user: regular });
  assert.equal(filtered.status, 200);
  assert.deepEqual((await filtered.json()).users.map(user => user.id), [regular.sub]);
  assert.equal((await admin("/users?offset=-1", { user: regular })).status, 400);

  for (const caller of [{ user: owner }, { user: regular }, { service: true }]) {
    const protectedUpdate = await admin("/users/" + owner.sub, { ...caller, method: "PATCH", body: { account_status: "suspended" } });
    assert.equal(protectedUpdate.status, 409);
  }
  assert.equal((await admin("/admins/" + owner.sub, { service: true, method: "DELETE" })).status, 409);
  assert.equal((await admin("/admins/service%3Asadmin", { user: owner, method: "DELETE" })).status, 409);
  assert.equal((await admin("/admins", { service: true, method: "POST", body: { email: "other@example.com", role: "super_admin" } })).status, 409);

  const result = await admin("/admins/" + encodeURIComponent(regular.email), {
    service: true, operator: owner.email, method: "PATCH", body: { role: "admin", status: "revoked" },
  });
  assert.equal(result.status, 200);
  assert.equal((await admin("", { user: regular })).status, 403);
  const row = fixture.db.prepare("SELECT actor_email, metadata FROM audit_logs WHERE action = 'admin.update'").get();
  assert.equal(row.actor_email, "service@sadmin.wasfai.com");
  assert.equal(JSON.parse(row.metadata).central_operator, owner.email);
});
