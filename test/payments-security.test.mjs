import test from "node:test";
import assert from "node:assert/strict";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../functions/api/_subscriptions.js";
import { processMoyasarPayload } from "../functions/api/payments/moyasar/_shared.js";
import { onRequestPost as selectPlan } from "../functions/api/subscriptions/index.js";
import { onRequestGet as paymentStatus } from "../functions/api/payments/moyasar/status.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { getJobDb } from "../functions/api/_db.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const plan = planById("gold_monthly");
function paidInvoice(patch = {}) {
  return { id: "invoice-1", status: "paid", amount: 5000, currency: "SAR", metadata: { user_id: "user-1", plan: plan.id }, payments: [{ id: "payment-1" }], ...patch };
}
test("payment activation rejects status, amount, currency, user and plan tampering", async (t) => {
  const { db } = gatewayFixture(t);
  const gateway = getJobDb(testEnv);
  for (const patch of [
    { status: "initiated" }, { amount: 4999 }, { currency: "USD" },
    { metadata: { user_id: "different-user", plan: plan.id } },
    { metadata: { user_id: "user-1", plan: "gold_annual" } }, { id: "" },
  ]) {
    await assert.rejects(() => activatePaidSubscription(gateway, "user-1", plan, paidInvoice(patch)), { code: "PAYMENT_VERIFICATION_FAILED" });
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM subscriptions").get().n, 0);
});

test("verified invoice activates once; callback replay cannot renew or restore cancelled access", async (t) => {
  const { db } = gatewayFixture(t);
  const gateway = getJobDb(testEnv);
  const first = await activatePaidSubscription(gateway, "user-1", plan, paidInvoice());
  assert.equal(first.activated, true);
  const before = db.prepare("SELECT * FROM subscriptions WHERE user_id='user-1'").get();
  db.exec("UPDATE subscriptions SET status='cancelled'");
  const replay = await activatePaidSubscription(gateway, "user-1", plan, paidInvoice());
  assert.equal(replay.already_activated, true);
  const after = db.prepare("SELECT * FROM subscriptions WHERE user_id='user-1'").get();
  assert.equal(after.current_period_end, before.current_period_end);
  assert.equal(after.status, "cancelled");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payment_activations").get().n, 1);
});

test("a separate verified renewal invoice extends an active period", async (t) => {
  const { db } = gatewayFixture(t);
  const gateway = getJobDb(testEnv);
  await activatePaidSubscription(gateway, "user-1", plan, paidInvoice());
  const before = db.prepare("SELECT current_period_end FROM subscriptions WHERE user_id='user-1'").get().current_period_end;
  await activatePaidSubscription(gateway, "user-1", plan, paidInvoice({ id: "invoice-2" }));
  const after = db.prepare("SELECT current_period_end FROM subscriptions WHERE user_id='user-1'").get().current_period_end;
  assert.equal((new Date(after) - new Date(before)) / 86400000, 30);
});

test("webhook requires its secret and a server lookup; a browser supplied paid status cannot grant access", async (t) => {
  const { db, calls } = gatewayFixture(t, { otherFetch: async (url) => {
    assert.ok(String(url).startsWith("https://api.moyasar.com/v1/invoices/"));
    return Response.json(paidInvoice({ status: "initiated" }));
  } });
  const context = { env: { ...testEnv, MOYASAR_SECRET_KEY: "sk_live_fixture", MOYASAR_WEBHOOK_SECRET: "webhook-test-secret" } };
  await ensureSubscriptionSchema(getJobDb(testEnv));
  db.prepare("INSERT INTO subscription_payments(user_id,plan,provider_invoice_id,amount_halalas) VALUES (?,?,?,?)").run("user-1", plan.id, "invoice-1", 5000);
  const untrusted = { type: "payment_paid", secret_token: "wrong", data: { id: "payment-1", invoice_id: "invoice-1", status: "paid" } };
  assert.equal((await processMoyasarPayload(context, untrusted, { requireWebhookSecret: true })).code, "BAD_WEBHOOK_SECRET");
  assert.ok(!calls.some((call) => call.url.includes("api.moyasar.com")));
  assert.equal((await processMoyasarPayload(context, { ...untrusted, secret_token: "webhook-test-secret" }, { requireWebhookSecret: true })).status, "initiated");
  assert.ok(calls.some((call) => call.url.includes("api.moyasar.com")));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM subscriptions").get().n, 0);
});

test("production checkout reuses an open invoice, preserves paid access, and verifies the exact order", async (t) => {
  let metadata;
  let creates = 0;
  const provider = { ...paidInvoice({ status: "initiated" }), url: "https://checkout.moyasar.com/invoices/invoice-1" };
  const fixture = gatewayFixture(t, { otherFetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith("/invoices")) {
      creates++;
      const data = JSON.parse(init.body);
      assert.match(data.success_url, /^https:\/\/jobs\.wasfai\.com\/pricing\/\?payment=success&order=\d+$/);
      assert.equal(data.metadata.email, undefined);
      metadata = data.metadata;
    } else {
      assert.equal(url, "https://api.moyasar.com/v1/invoices/invoice-1");
    }
    return Response.json({ ...provider, metadata });
  } });
  fixture.addUser();
  const env = { ...testEnv, MOYASAR_SECRET_KEY: "sk_live_fixture" };
  const cookie = (await sessionCookie(fixture.identity, env.AUTH_COOKIE_SECRET)).split(";")[0];
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const choose = (plan, bindings = env) => selectPlan({ env: bindings, request: new Request("https://jobs.wasfai.com/api/subscriptions", {
    method: "POST", headers, body: JSON.stringify({ plan }),
  }) });
  const status = (id) => paymentStatus({ env, request: new Request(`https://jobs.wasfai.com/api/payments/moyasar/status?order=${id}`, { headers }) });
  assert.equal((await choose("gold_monthly", { ...env, MOYASAR_SECRET_KEY: "sk_test_fixture" })).status, 503);
  const checkout = await choose("gold_monthly");
  assert.equal(checkout.status, 201, await checkout.clone().text());
  const first = await checkout.json();
  assert.equal((await (await choose("gold_monthly")).json()).order_id, first.order_id);
  assert.equal(creates, 1);
  assert.equal((await (await status("999")).json()).payment, null);
  assert.equal((await (await status(first.order_id)).json()).subscription_active, false);
  provider.status = "paid";
  assert.equal((await (await status(first.order_id)).json()).subscription_active, true);
  const end = fixture.db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end;
  assert.equal((await choose("free")).status, 409);
  assert.equal((await choose("gold_annual")).status, 409);
  assert.equal((await status(first.order_id)).status, 200);
  assert.equal(fixture.db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end, end);
  const unknown = await processMoyasarPayload({ env }, { id: "unknown", url: provider.url, amount: 5000 });
  assert.equal(unknown.reason, "unknown_invoice");
});
