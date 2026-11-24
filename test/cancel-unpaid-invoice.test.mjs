import assert from "node:assert/strict";
import test from "node:test";
import { onRequestPost } from "../functions/api/payments/moyasar/cancel.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { getJobDb } from "../functions/api/_db.js";
import { ensureSubscriptionSchema } from "../functions/api/_subscriptions.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

async function setup(t, onCancel) {
  let attempts = [];
  const env = { ...testEnv, MOYASAR_SECRET_KEY: "sk_live_fixture" };
  const calls = [];
  const invoice = { id: "test-invoice", amount: 5000, currency: "SAR", status: "initiated", metadata: {} };
  const fixture = gatewayFixture(t, { otherFetch: async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.moyasar.com");
    const method = init?.method || "GET";
    calls.push(method);
    if (method === "PUT") {
      assert.equal(url.pathname, "/v1/invoices/test-invoice/cancel");
      if (onCancel) return onCancel(invoice);
      invoice.status = "canceled";
    } else {
      assert.equal(method, "GET");
      assert.equal(url.pathname, "/v1/invoices/test-invoice");
    }
    return Response.json({ ...invoice, payments: attempts });
  } });
  fixture.addUser();
  await ensureSubscriptionSchema(getJobDb(env));
  const insert = fixture.db.prepare(`INSERT INTO subscription_payments
    (user_id, plan, provider_invoice_id, amount_halalas, amount_sar, status)
    VALUES (?, 'gold_monthly', ?, 5000, 50, 'initiated')`);
  insert.run(fixture.identity.sub, invoice.id);
  insert.run("unrelated-account", "different-invoice");
  invoice.metadata = { user_id: fixture.identity.sub, app: "jobs-wasfai", plan: "gold_monthly", order: "1" };
  const cookie = (await sessionCookie(fixture.identity, env.AUTH_COOKIE_SECRET)).split(";")[0];
  const cancel = (order = "1", guest = false) => onRequestPost({ env, request: new Request(
    "https://jobs.wasfai.com/api/payments/moyasar/cancel", { method: "POST", body: JSON.stringify({ order }),
      headers: { "Content-Type": "application/json", ...(guest ? {} : { Cookie: cookie }) } }) });
  return { fixture, calls, cancel, invoice, setAttempts: list => { attempts = list; } };
}

test("only the owner can cancel an unpaid invoice; retries leave it closed and preserve existing Gold", async t => {
  const { fixture: f, calls, cancel, setAttempts } = await setup(t);
  f.db.prepare("INSERT INTO subscriptions(user_id,plan,status,current_period_end) VALUES (?, 'gold_monthly', 'active', '2099-02-01')").run(f.identity.sub);
  assert.equal((await cancel("1", true)).status, 401);
  assert.equal((await cancel("2")).status, 404);
  assert.deepEqual(calls, []);
  setAttempts([{ status: "failed" }]); // A declined card can be followed by an explicit invoice cancellation.
  assert.equal((await (await cancel()).json()).status, "canceled");
  assert.equal((await (await cancel()).json()).status, "canceled");
  assert.deepEqual(calls, ["GET", "PUT", "GET"]);
  assert.equal(f.db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end, "2099-02-01");
});

test("an outstanding authorization or an already paid invoice cannot be canceled", async t => {
  const { cancel, setAttempts, invoice, calls } = await setup(t);
  setAttempts([{ status: "authorized" }]);
  assert.equal((await cancel()).status, 409);
  setAttempts([{ id: "completed", status: "paid" }]);
  invoice.status = "paid";
  assert.equal((await cancel()).status, 409);
  assert.deepEqual(calls, ["GET", "GET"]);
});

test("a lost cancellation response is confirmed against the provider; concurrent payment is preserved", async t => {
  const { cancel, fixture, calls } = await setup(t, invoice => {
    invoice.status = "paid";
    throw new Error("Response unavailable after concurrent payment");
  });
  assert.equal((await (await cancel()).json()).code, "PAYMENT_NOT_CANCELABLE");
  assert.deepEqual(calls, ["GET", "PUT", "GET"]);
  assert.equal(fixture.db.prepare("SELECT status FROM subscription_payments WHERE id=1").get().status, "paid");
  assert.equal(fixture.db.prepare("SELECT status FROM subscriptions").get().status, "active");
});

test("a canceled invoice after a lost response is reported as canceled", async t => {
  const { cancel } = await setup(t, invoice => {
    invoice.status = "canceled";
    throw new Error("Response lost after closing invoice");
  });
  assert.deepEqual(await (await cancel()).json(), { ok: true, status: "canceled", order_id: "1" });
});
