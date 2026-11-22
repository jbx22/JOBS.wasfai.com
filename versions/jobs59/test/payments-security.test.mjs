import test from "node:test";
import assert from "node:assert/strict";
import { activatePaidSubscription, planById } from "../functions/api/_subscriptions.js";
import { processMoyasarPayload } from "../functions/api/payments/moyasar/_shared.js";
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
  const context = { env: { ...testEnv, MOYASAR_SECRET_KEY: "server-test-secret", MOYASAR_WEBHOOK_SECRET: "webhook-test-secret" } };
  const untrusted = { type: "payment_paid", secret_token: "wrong", data: { id: "payment-1", invoice_id: "invoice-1", status: "paid" } };
  assert.equal((await processMoyasarPayload(context, untrusted, { requireWebhookSecret: true })).code, "BAD_WEBHOOK_SECRET");
  assert.ok(!calls.some((call) => call.url.includes("api.moyasar.com")));
  await processMoyasarPayload(context, { ...untrusted, secret_token: "webhook-test-secret" }, { requireWebhookSecret: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM subscriptions").get().n, 0);
});
