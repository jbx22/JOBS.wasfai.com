import assert from "node:assert/strict";
import test from "node:test";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { getJobDb } from "../functions/api/_db.js";
import { ensureSubscriptionSchema } from "../functions/api/_subscriptions.js";
import { onRequestPost as select } from "../functions/api/subscriptions/index.js";
import { onRequestGet as readStatus } from "../functions/api/payments/moyasar/status.js";
import { onRequestPost as callback } from "../functions/api/payments/moyasar/callback.js";
import { onRequestPost as webhook } from "../functions/api/payments/moyasar/webhook.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

async function payments(t) {
  const invoices = [];
  const mode = { creation: "ok", discovery: true };
  const fixture = gatewayFixture(t, { otherFetch(input, init = {}) {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.moyasar.com");
    if (init.method === "POST") {
      assert.equal(url.pathname, "/v1/invoices");
      if (mode.creation === "rejected") return Response.json({}, { status: 422 });
      const body = JSON.parse(init.body);
      const id = "invoice-" + (invoices.length + 1);
      const invoice = { ...body, id, status: "initiated", payments: [], url: "https://checkout.moyasar.com/invoices/" + id };
      invoices.push(invoice);
      if (mode.creation === "interrupted") throw new Error("simulated response loss");
      return Response.json(invoice);
    }
    if (url.pathname === "/v1/invoices") {
      const order = url.searchParams.get("metadata[order]");
      assert.ok(order);
      return Response.json({ invoices: mode.discovery ? invoices.filter(i => i.metadata.order === order) : [] });
    }
    const found = invoices.find(invoice => url.pathname === "/v1/invoices/" + invoice.id);
    assert.ok(found, url.pathname);
    return Response.json(found);
  } });
  fixture.addUser();
  const env = { ...testEnv, MOYASAR_SECRET_KEY: "sk_live_fixture", MOYASAR_WEBHOOK_SECRET: "synthetic-hook" };
  await ensureSubscriptionSchema(getJobDb(env));
  const cookie = (await sessionCookie(fixture.identity, env.AUTH_COOKIE_SECRET)).split(";")[0];
  const request = (path, method, body) => new Request("https://jobs.wasfai.com/api/" + path, { method, headers: {
    "Content-Type": "application/json", Cookie: cookie }, body: body && JSON.stringify(body) });
  const choose = (plan = "gold_monthly", extra = {}) => select({ env, request: request("subscriptions", "POST", { plan, ...extra }) });
  const status = id => readStatus({ env, request: request("payments/moyasar/status?order=" + id, "GET") });
  const notify = (fn, body) => fn({ env, request: request("payments/moyasar/notification", "POST", body) });
  return { ...fixture, mode, invoices, choose, status, notify };
}

test("an interrupted create is recovered by exact order from customer status, before checkout retries", async t => {
  const { mode, invoices, choose, status, db } = await payments(t);
  mode.creation = "interrupted";
  assert.equal((await choose()).status, 502);
  const order = db.prepare("SELECT id FROM subscription_payments").get().id;
  mode.discovery = false;
  assert.deepEqual((await (await status(order)).json()).payment, {
    id: order, plan: "gold_monthly", currency: "SAR", amount_sar: 50, invoice_id: "", status: "creating",
  });
  assert.equal((await choose()).status, 409);
  assert.equal(invoices.length, 1);
  mode.discovery = true;
  assert.equal((await (await status(order)).json()).payment.invoice_id, invoices[0].id);
  assert.equal((await (await choose()).json()).order_id, String(order));
  assert.equal(invoices.length, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM subscription_payments").get().n, 1);
});

test("definitive provider rejection is visible in the customer’s history and a retry may create an invoice", async t => {
  const { mode, invoices, choose, status, db } = await payments(t);
  mode.creation = "rejected";
  assert.equal((await choose()).status, 502);
  const order = db.prepare("SELECT id FROM subscription_payments").get().id;
  const failed = await (await status(order)).json();
  assert.equal(failed.verified, false);
  assert.equal(failed.payment.status, "failed");
  mode.creation = "ok";
  assert.equal((await choose()).status, 201);
  assert.equal(invoices.length, 1);
});

test("failed card attempt leaves its hosted invoice open; verified terminal failure can be retried", async t => {
  const { invoices, choose, status } = await payments(t);
  const first = await (await choose()).json();
  invoices[0].payments = [{ id: "card-attempt", status: "failed" }];
  assert.equal((await (await status(first.order_id)).json()).payment.status, "initiated");
  const other = await (await choose("gold_annual")).json();
  assert.equal(other.code, "OTHER_ORDER_OPEN");
  assert.equal(other.pending_checkout.order_id, first.order_id);
  assert.equal((await (await choose()).json()).order_id, first.order_id);
  invoices[0].status = "expired";
  assert.notEqual((await (await choose()).json()).order_id, first.order_id);
  assert.equal(invoices.length, 2);
});

test("paid callback without URL recovers a lost create; renewal replay and historical status stay order-specific", async t => {
  const { mode, invoices, choose, status, notify, db } = await payments(t);
  mode.creation = "interrupted";
  await choose();
  const first = invoices[0];
  first.status = "paid";
  first.payments = [{ id: "declined-attempt", status: "failed" }, { id: "settled-attempt", status: "paid" }];
  const body = { id: first.id, metadata: first.metadata };
  assert.equal((await (await notify(callback, body)).json()).status, "paid");
  assert.equal(db.prepare("SELECT provider_payment_id FROM subscription_payments").get().provider_payment_id, "settled-attempt");
  const firstOrder = first.metadata.order;
  assert.equal((await (await status(firstOrder)).json()).subscription_active, true);
  mode.creation = "ok";
  const renewal = { renew: true, renew_from: db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end };
  assert.equal((await choose()).status, 409);
  const newOrder = await (await choose("gold_monthly", renewal)).json();
  assert.ok(newOrder.order_id);
  invoices[1].status = "paid";
  assert.equal((await (await status(newOrder.order_id)).json()).subscription_active, true);
  const earlier = await (await status(firstOrder)).json();
  assert.equal(earlier.invoice_activated, true);
  assert.equal(earlier.account_paid_active, true);
  assert.equal(earlier.subscription_active, false);
  // Stale renewal screen cannot create a third invoice after its original term was extended.
  assert.equal((await choose("gold_monthly", renewal)).status, 409);
  assert.equal(invoices.length, 2);
});

test("verified refunds record actual cumulative amounts, preserve another term and resist stale delivery", async t => {
  const { invoices, choose, notify, status, db } = await payments(t);
  const first = await (await choose()).json();
  const invoice = invoices[0];
  invoice.status = "paid";
  invoice.payments = [{ id: "paid", status: "paid", amount: 5000, refunded: 0 }];
  await status(first.order_id);
  const end = db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end;
  const renewed = await (await choose("gold_monthly", { renew: true, renew_from: end })).json();
  invoices[1].status = "paid";
  await status(renewed.order_id);
  const laterEnd = db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end;
  invoice.payments[0].status = "refunded";
  invoice.payments[0].refunded = 1000;
  const hook = { id: "event-1", type: "payment_refunded", data: { id: "paid", invoice_id: invoice.id }, secret_token: "synthetic-hook" };
  assert.equal((await (await notify(webhook, hook)).json()).status, "partially_refunded");
  invoice.status = "refunded";
  invoice.payments[0].refunded = 5000;
  assert.equal((await (await notify(webhook, hook)).json()).status, "refunded");
  invoice.payments[0].refunded = 2500;
  assert.equal((await (await notify(webhook, hook)).json()).status, "refunded");
  assert.equal(db.prepare("SELECT refunded_halalas FROM payment_refunds").get().refunded_halalas, 5000);
  assert.equal(db.prepare("SELECT current_period_end FROM subscriptions").get().current_period_end, laterEnd);
  assert.equal((await (await status(renewed.order_id)).json()).subscription_active, true);
});

test("the authenticated enrollment challenge is only acknowledged for the registered Jobs webhook", async t => {
  const id = "00000000-0000-4000-8000-000000000001";
  const callbackUrl = "https://jobs.wasfai.com/api/payments/moyasar/webhook";
  let registered = callbackUrl;
  let verified = false;
  let submitted = 0;
  gatewayFixture(t, { otherFetch(input, init) {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.moyasar.com");
    if (url.pathname === "/v1/webhooks/" + id) return Response.json({ id, url: registered, verified });
    assert.equal(url.pathname, "/v1/webhooks/" + id + "/verify");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { code: "123456" });
    verified = true;
    submitted++;
    return Response.json({ id, verified });
  } });
  const env = { ...testEnv, MOYASAR_SECRET_KEY: "sk_live_fixture", MOYASAR_WEBHOOK_SECRET: "synthetic-hook" };
  const invoke = () => webhook({ env, request: new Request(callbackUrl, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "webhook_verification", secret_token: "synthetic-hook", data: { webhook_id: id, verification_code: "123456" } }) }) });
  registered = "https://example.invalid/not-registered-by-jobs";
  assert.equal((await (await invoke()).json()).ok, false);
  assert.equal(submitted, 0);
  registered = callbackUrl;
  assert.deepEqual(await (await invoke()).json(), { ok: true, verified: true });
  assert.deepEqual(await (await invoke()).json(), { ok: true, verified: true });
  assert.equal(submitted, 1);
});
