import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet as subscriptions } from "../functions/api/subscriptions/index.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { getJobDb } from "../functions/api/_db.js";
import { ensureSubscriptionSchema } from "../functions/api/_subscriptions.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

test("payment history shows only the signed-in owner's ten latest orders and known refund amounts", async t => {
  const f = gatewayFixture(t);
  f.addUser();
  const db = getJobDb(testEnv);
  await ensureSubscriptionSchema(db);
  const add = f.db.prepare(`INSERT INTO subscription_payments
    (user_id, plan, provider_invoice_id, amount_halalas, amount_sar, currency, status, created_at, raw_payload)
    VALUES (?, 'gold_monthly', ?, 5000, 50, 'SAR', ?, '2026-09-01 09:00:00', 'private-test-marker')`);
  for (let i = 0; i < 12; i++) add.run(f.identity.sub, 'invoice-' + i, i === 11 ? 'partially_refunded' : 'paid');
  add.run('other-user', 'other-invoice', 'paid');
  f.db.prepare("INSERT INTO payment_refunds(provider_invoice_id, refunded_halalas) VALUES (?, ?)").run("invoice-11", 1250);
  const read = async headers => subscriptions({ request: new Request("https://jobs.wasfai.com/api/subscriptions", { headers }), env: testEnv });
  const guest = await read({});
  assert.deepEqual((await guest.json()).recent_payments, []);
  const cookie = (await sessionCookie(f.identity, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  const response = await read({ Cookie: cookie });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  const { recent_payments: recent } = await response.json();
  assert.deepEqual(recent.map(order => Number(order.id)), [12,11,10,9,8,7,6,5,4,3]);
  assert.deepEqual(recent[0], {
    id: 12, plan: "gold_monthly", amount_sar: 50, refunded_sar: 12.5, currency: "SAR",
    status: "partially_refunded", created_at: "2026-09-01 09:00:00",
  });
  assert.equal(recent[1].refunded_sar, null);
  assert.doesNotMatch(JSON.stringify(recent), /private-test-marker|invoice-11|other-user/);
});
