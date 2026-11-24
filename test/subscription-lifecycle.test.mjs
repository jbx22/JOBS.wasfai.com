import test from "node:test";
import assert from "node:assert/strict";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { getJobDb } from "../functions/api/_db.js";
import { activatePaidSubscription, effectiveSubscription, ensureSubscriptionSchema, nextPeriodEnd, planById, publicPlans } from "../functions/api/_subscriptions.js";
import { onRequestGet, onRequestPost } from "../functions/api/subscriptions/index.js";
import { onRequest as admin } from "../functions/api/admin/[[route]].js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const owner = { sub: "fixture-owner", email: "jabosaag@gmail.com", provider: "google" };
const member = { sub: "fixture-subscriber", email: "sample@example.invalid", name: "Sample" };
const endIn = days => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function context(user, path = "/api/subscriptions", method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (user) headers.Cookie = (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  return { env: testEnv, request: new Request("https://jobs.wasfai.com" + path, { method, headers,
    body: body ? JSON.stringify(body) : undefined }) };
}

function invoice(id, plan = "gold_monthly", amount = 5000) {
  return { id, status: "paid", amount, currency: "SAR", metadata: { user_id: member.sub, plan } };
}

test("subscription status falls back to Free at the existing exclusive UTC boundary, without rewriting the account", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", member);
  const visit = async user => (await onRequestGet(await context(user))).json();
  const guest = await visit(null);
  assert.equal(guest.current, null);
  const empty = await visit(member);
  assert.equal(empty.current.effective_plan, "free");
  assert.equal(empty.current.paid_active, false);
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS n FROM subscriptions").get().n, 0);
  const insert = fixture.db.prepare("INSERT INTO subscriptions(user_id,plan,status,ai_monthly_limit_usd,current_period_end) VALUES (?,?,'active',12,?)");
  insert.run(member.sub, "gold_monthly", endIn(0));
  const current = (await visit(member)).current;
  assert.deepEqual([current.plan, current.status, current.effective_plan, current.paid_active, current.ai_monthly_limit_usd], ["gold_monthly", "expired", "free", false, 1]);
  assert.equal(fixture.db.prepare("SELECT status FROM subscriptions WHERE user_id=?").get(member.sub).status, "active");
  const downgrade = await onRequestPost(await context(member, "/api/subscriptions", "POST", { plan: "free" }));
  assert.equal(downgrade.status, 200);
  assert.equal((await downgrade.json()).current.current_period_end, null);
  fixture.db.prepare("UPDATE subscriptions SET plan='gold_annual',status='active',current_period_end=?").run(endIn(15));
  assert.equal((await visit(member)).current.paid_active, true);
  assert.equal((await onRequestPost(await context(member, "/api/subscriptions", "POST", { plan: "free" }))).status, 409);
  for (const status of ["paused", "cancelled", "pending_payment"]) {
    const row = effectiveSubscription({ plan: "gold_annual", status, current_period_end: endIn(15) });
    assert.deepEqual([row.status, row.paid_active, row.effective_plan], [status, false, "free"]);
  }
});

test("an already-issued annual invoice preserves unused monthly Gold time and its recorded price", async t => {
  const fixture = gatewayFixture(t);
  const db = getJobDb(testEnv);
  await ensureSubscriptionSchema(db);
  const end = endIn(20);
  fixture.db.prepare("INSERT INTO subscriptions(user_id,plan,status,current_period_end) VALUES (?, 'gold_monthly', 'active', ?)").run(member.sub, end);
  const plan = planById("gold_annual");
  const order = invoice("older-price", plan.id, 47000);
  const activate = () => activatePaidSubscription(db, member.sub, plan, order, "active", 47000);
  assert.equal((await activate()).activated, true);
  const after = fixture.db.prepare("SELECT plan,current_period_end FROM subscriptions").get();
  assert.equal(after.plan, "gold_annual");
  assert.equal(after.current_period_end, nextPeriodEnd("yearly", { plan: "gold_monthly", status: "active", current_period_end: end }));
  assert.equal((await activate()).already_activated, true);
  assert.deepEqual(publicPlans().map(p => [p.id, p.price_sar]), [["free",0], ["gold_monthly",50], ["gold_annual",499]]);
});

test("a manual renewal adds one term; late paid snapshots cannot grant a reversed invoice", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  fixture.addUser("active", member);
  const db = getJobDb(testEnv);
  await ensureSubscriptionSchema(db);
  const currentEnd = endIn(80);
  fixture.db.prepare("INSERT INTO subscriptions(user_id,plan,status,current_period_end) VALUES (?, 'gold_monthly','active',?)").run(member.sub, currentEnd);
  const order = fixture.db.prepare("INSERT INTO subscription_payments(user_id,plan,provider_invoice_id,amount_halalas,status) VALUES (?, 'gold_monthly',?,5000,?)");
  const grant = async id => admin(await context(owner, "/api/admin/payments/" + id + "/activate", "POST"));
  const payment = order.run(member.sub, "manual-renewal", "initiated").lastInsertRowid;
  assert.equal((await grant(payment)).status, 200);
  assert.equal((await (await grant(payment)).json()).already_activated, true);
  const expectedEnd = nextPeriodEnd("monthly", { plan: "gold_monthly", status: "active", current_period_end: currentEnd });
  for (const status of ["refunded", "partially_refunded", "voided", "canceled"]) {
    const id = order.run(member.sub, status + "-order", status).lastInsertRowid;
    assert.equal((await grant(id)).status, 409);
    const verified = await activatePaidSubscription(db, member.sub, planById("gold_monthly"), invoice(status + "-order"));
    assert.equal(verified.blocked, true);
  }
  const partiallyRefunded = order.run(member.sub, "ledger-only", "initiated").lastInsertRowid;
  fixture.db.prepare("INSERT INTO payment_refunds(provider_invoice_id,refunded_halalas) VALUES (?,?)").run("ledger-only", 100);
  assert.equal((await grant(partiallyRefunded)).status, 409);
  assert.equal((await activatePaidSubscription(db, member.sub, planById("gold_monthly"), invoice("ledger-only"))).blocked, true);
  assert.equal(fixture.db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end, expectedEnd);
});
