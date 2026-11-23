import test from "node:test";
import assert from "node:assert/strict";
import { getJobDb } from "../functions/api/_db.js";
import { readUserState, writeUserState } from "../functions/api/_state.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../functions/api/_subscriptions.js";
import { onRequest } from "../functions/api/admin/[[route]].js";
import { onRequestPut } from "../functions/api/me/state.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const user = { sub: "record-owner", email: "jabosaag@gmail.com", provider: "google" };
const revisedProfile = { target_roles: "Mechanical engineering" };

test("a projection failure rolls back the workspace documents and first legacy snapshot together", async (t) => {
  const fixture = gatewayFixture(t);
  const db = getJobDb(testEnv);
  await readUserState(db, user);
  fixture.db.exec("CREATE TRIGGER reject_resume BEFORE INSERT ON resumes BEGIN SELECT RAISE(ABORT, 'projection rejected'); END");
  await assert.rejects(writeUserState(db, user, { profile: revisedProfile }), /projection rejected/);
  for (const table of ["user_state_documents", "user_states", "resumes", "resume_versions"]) {
    assert.equal(fixture.db.prepare("SELECT COUNT(*) AS count FROM " + table).get().count, 0);
  }
});

test("a workspace revision changed after the read rejects the complete transaction", async (t) => {
  let race = false;
  const fixture = gatewayFixture(t, { beforeQuery(payload, sql) {
    if (!race || !payload.statements?.some(entry => entry.sql.includes("UPDATE jobs_user_write_guards"))) return;
    race = false;
    sql.prepare("UPDATE user_state_documents SET payload = ?, revision = revision + 1 WHERE user_id = ? AND document_key = 'jobs'")
      .run(JSON.stringify([{ id: "saved-by-other-session" }]), user.sub);
  } });
  const db = getJobDb(testEnv);
  const first = await writeUserState(db, user, { profile: revisedProfile, jobs: [] });
  race = true;
  await assert.rejects(writeUserState(db, user, { ...first, profile: { target_roles: "Operations" } },
    { expectedRevisions: first.__revisions }), { code: "STATE_CONFLICT" });
  const state = await readUserState(db, user);
  assert.deepEqual(state.jobs, [{ id: "saved-by-other-session" }]);
  assert.deepEqual(state.profile, revisedProfile);
  assert.equal(state.__revisions.profile, first.__revisions.profile);
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS count FROM resume_versions").get().count, 1);
});

test("an unparseable workspace payload returns 400 and preserves stored revisions", async (t) => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", user);
  const db = getJobDb(testEnv);
  const written = await writeUserState(db, user, { profile: revisedProfile });
  const cookie = (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  for (const body of ["{", '{"state":null}', '{"state":{"profile":{}},"revisions":{"profile":"bad"}}']) {
    const response = await onRequestPut({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/me/state",
      { method: "PUT", headers: { cookie, "content-type": "application/json" }, body }) });
    assert.equal(response.status, 400);
  }
  assert.deepEqual((await readUserState(db, user)).__revisions, written.__revisions);
});

function invoice(id) {
  return { id, status: "paid", amount: 5000, currency: "SAR", metadata: { user_id: user.sub, plan: "gold_monthly" } };
}

test("concurrent paid renewals both extend the term and duplicate invoices do not add another term", async (t) => {
  const fixture = gatewayFixture(t);
  const db = getJobDb(testEnv);
  const plan = planById("gold_monthly");
  await ensureSubscriptionSchema(db);
  const current = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  fixture.db.prepare("INSERT INTO subscriptions (user_id,plan,status,current_period_end) VALUES (?, ?, 'active', ?)")
    .run(user.sub, plan.id, current);
  const results = await Promise.all(["invoice-a", "invoice-b"].map(id => activatePaidSubscription(db, user.sub, plan, invoice(id))));
  assert.ok(results.every(result => result.activated));
  const replay = await activatePaidSubscription(db, user.sub, plan, invoice("invoice-b"));
  assert.equal(replay.already_activated, true);
  const expected = new Date(Date.parse(current) + 60 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(fixture.db.prepare("SELECT current_period_end FROM subscriptions WHERE user_id=?").get(user.sub).current_period_end, expected);
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS count FROM payment_activations").get().count, 2);
});

async function admin(path, method, input) {
  return onRequest({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/admin/" + path, {
    method,
    headers: { cookie: (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0], "content-type": "application/json" },
    body: input ? JSON.stringify(input) : undefined,
  }) });
}

test("an admin budget update preserves plan, status and expiry, and rejects invalid expiry dates", async (t) => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", user);
  const db = getJobDb(testEnv);
  await ensureSubscriptionSchema(db);
  fixture.db.prepare("INSERT INTO subscriptions (user_id,plan,status,current_period_end) VALUES (?, 'gold_monthly', 'active', '2030-05-20')").run(user.sub);
  const response = await admin("subscribers/" + user.sub, "PATCH", { ai_monthly_limit_usd: 20 });
  assert.equal(response.status, 200);
  const row = await response.json();
  assert.deepEqual([row.plan, row.status, row.current_period_end, row.ai_monthly_limit_usd], ["gold_monthly", "active", "2030-05-20", 20]);
  assert.equal((await admin("subscribers/" + user.sub, "PATCH", { current_period_end: "2030-02-31" })).status, 400);
});

test("an audited manual grant is idempotent and later provider verification never grants a second term", async (t) => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", user);
  const db = getJobDb(testEnv);
  await ensureSubscriptionSchema(db);
  fixture.db.prepare("INSERT INTO subscription_payments (user_id,plan,status,provider_invoice_id,amount_halalas) VALUES (?, 'gold_monthly', 'initiated', 'manual-invoice', 5000)").run(user.sub);
  const manual = () => admin("payments/1/activate", "POST");
  assert.equal((await manual()).status, 200);
  const retry = await manual();
  assert.equal((await retry.json()).already_activated, true);
  const expiry = () => fixture.db.prepare("SELECT current_period_end FROM subscriptions WHERE user_id=?").get(user.sub).current_period_end;
  const before = expiry();
  assert.equal((await activatePaidSubscription(db, user.sub, planById("gold_monthly"), invoice("manual-invoice"))).activated, true);
  assert.equal(expiry(), before);
  assert.equal(fixture.db.prepare("SELECT status FROM subscription_payments").get().status, "paid");
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='payment.manual_activate'").get().count, 1);
});
