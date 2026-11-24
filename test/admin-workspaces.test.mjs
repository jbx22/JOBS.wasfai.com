import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/admin/[[route]].js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const owner = { sub: "owner", email: "jabosaag@gmail.com", provider: "google" };
const support = { sub: "support", email: "support@example.com", provider: "google" };

async function request(path, { user = owner, method = "GET", data } = {}) {
  const cookie = user ? (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0] : "";
  return onRequest({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/admin" + path, {
    method,
    headers: { cookie, ...(data ? { "content-type": "application/json" } : {}) },
    body: data ? JSON.stringify(data) : undefined,
  }) });
}

test("support scopes, case workflow and atomic audit keep notes and requester emails private", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  fixture.addUser("active", support);
  assert.equal((await request("/support", { user: null })).status, 401);
  assert.equal((await request("/admins", {
    method: "POST", data: { email: support.email, scopes: ["support"] },
  })).status, 201);
  for (const area of ["/marketing", "/accounting", "/ai", "/workspaces"]) {
    assert.equal((await request(area, { user: support })).status, 403);
  }
  const created = await request("/support", {
    user: support, method: "POST",
    data: { subject: "Invoice question", requester_email: "customer@example.com", summary: "Asked about a receipt.", priority: "high" },
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const updated = await request("/support/" + id, {
    user: support, method: "PATCH",
    data: { status: "resolved", note: "Followed up with requester.", assign_to_me: true, version: 1 },
  });
  assert.equal(updated.status, 200);
  assert.equal((await request("/support/" + id, { user: support, method: "PATCH", data: { status: "open", version: 1 } })).status, 409);
  const inbox = await (await request("/support?q=INVOICE&status=resolved", { user: support })).json();
  assert.equal(inbox.counts.resolved, 1);
  assert.equal(inbox.cases[0].assigned_to, support.email);
  const rows = fixture.db.prepare("SELECT action, metadata FROM audit_logs WHERE action LIKE 'support.%' ORDER BY id").all();
  assert.deepEqual(rows.map(row => row.action), ["support.create", "support.update"]);
  assert.doesNotMatch(JSON.stringify(rows), /customer@example.com|Asked about|Followed up/);
});

test("campaign links point only to allowed JOBS pages and signup metrics use actual users", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  const data = { name: "Recruitment Week", slug: "fall-hiring", source: "newsletter", medium: "email", landing: "/employers" };
  assert.equal((await request("/marketing", { method: "POST", data: { ...data, landing: "https://example.org" } })).status, 400);
  const created = await request("/marketing", { method: "POST", data });
  assert.equal(created.status, 201);
  const { id, url } = await created.json();
  assert.equal(url, "https://jobs.wasfai.com/employers?utm_source=newsletter&utm_medium=email&utm_campaign=fall-hiring");
  assert.equal((await request("/marketing", { method: "POST", data })).status, 409);
  assert.equal((await request("/marketing/" + id, { method: "PATCH", data: { status: "active", version: 1 } })).status, 200);
  const dashboard = await (await request("/marketing")).json();
  assert.equal(Number(dashboard.funnel.signups), 1);
  assert.equal(dashboard.campaigns[0].status, "active");
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action LIKE 'marketing.%'").get().total, 2);
});

test("accounting reports verified and manual amounts separately and reviews payment data without changing it", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  assert.equal((await request("/accounting")).status, 200);
  const payment = fixture.db.prepare("INSERT INTO subscription_payments (user_id, plan, provider_invoice_id, amount_halalas, status) VALUES ('owner', 'gold_monthly', ?, 5000, ?)");
  payment.run("inv-verified", "paid");
  payment.run("inv-manual", "paid_manual");
  fixture.db.prepare("INSERT INTO payment_activations (invoice_id, user_id, plan, activation_id) VALUES ('inv-verified', 'owner', 'gold_monthly', 'verified')").run();
  const review = { status: "paid", amount_halalas: 5000, reference: "=statement-file" };
  assert.equal((await request("/accounting/1", { method: "POST", data: { ...review, amount_halalas: 10 } })).status, 409);
  assert.equal((await request("/accounting/1", { method: "POST", data: review })).status, 200);
  assert.equal((await request("/accounting/1", { method: "POST", data: review })).status, 409);
  const data = await (await request("/accounting")).json();
  assert.equal(data.totals.verified_halalas, 5000);
  assert.equal(data.totals.manual_halalas, 5000);
  assert.equal(data.rows.find(row => row.id === 1).status, "paid");
  const download = await request("/accounting/export");
  assert.match(download.headers.get("content-type"), /text\/csv/);
  assert.match(await download.text(), /"'=statement-file"/);
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS total FROM audit_logs WHERE action = 'accounting.review'").get().total, 1);
});

test("AI usage reads and settings edits have different permissions", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  fixture.addUser("active", support);
  const created = await request("/admins", { method: "POST", data: { email: support.email, scopes: ["ai"] } });
  assert.equal(created.status, 201);
  assert.equal((await request("/ai", { user: support })).status, 200);
  assert.equal((await request("/ai/settings", { user: support, method: "PUT", data: { monthly_budget_usd: 10 } })).status, 403);
  assert.equal((await request("/admins/" + encodeURIComponent(support.email), {
    method: "PATCH", data: { role: "admin", status: "active", scopes: ["ai_controls"] },
  })).status, 200);
  assert.equal((await request("/ai/settings", { user: support, method: "PUT", data: { secret: "test-rejected" } })).status, 400);
  assert.equal((await request("/ai/settings", { user: support, method: "PUT", data: { monthly_budget_usd: 10 } })).status, 200);
  assert.equal((await (await request("/ai", { user: support })).json()).settings.monthly_budget_usd, "10");
});

test("finance, accounting and CSV distinguish collections, partial refunds, voids and noncash orders", async t => {
  const fixture = gatewayFixture(t);
  fixture.addUser("active", owner);
  assert.equal((await request("/accounting")).status, 200);
  const order = fixture.db.prepare(`INSERT INTO subscription_payments
    (user_id, plan, provider_invoice_id, amount_halalas, amount_sar, currency, status, raw_payload)
    VALUES ('owner', 'gold_monthly', ?, 10000, 100, 'SAR', ?, '{"private_fixture":"never-export"}')`);
  const activation = fixture.db.prepare("INSERT INTO payment_activations (invoice_id, user_id, plan, activation_id) VALUES (?, 'owner', 'gold_monthly', 'verified')");
  const reversal = fixture.db.prepare("INSERT INTO payment_refunds (provider_invoice_id, refunded_halalas) VALUES (?, ?)");
  const scenarios = [
    ["settled", "paid", true], ["partial", "partially_refunded", false, 3000], ["full", "refunded", false, 10000],
    ["auth-void", "voided", false, 10000], ["collection-void", "voided", true, 10000],
    ["manual", "paid_manual"], ["unpaid", "on_hold"], ["failed", "failed"],
    ["legacy", "refunded"], ["missing-proof", "paid"], ["settled", "paid"],
  ];
  for (const [id, status, paid, amount] of scenarios) {
    order.run(id, status);
    if (paid) activation.run(id);
    if (amount) reversal.run(id, amount);
  }
  const register = await (await request("/accounting")).json();
  assert.deepEqual(register.totals, {
    records: 11, gross_halalas: 40000, refunded_halalas: 13000, voided_charge_halalas: 10000, verified_halalas: 17000,
    manual_halalas: 10000, paid: 1, manual: 1, pending: 1, failed: 1, partially_refunded: 1, refunded: 1,
    voided: 2, unreconciled: 2, duplicates: 1,
  });
  const { summary } = await (await request("/payments")).json();
  assert.equal(summary.net_sar, 170);
  assert.equal(summary.gross_sar, 400);
  assert.equal(summary.refunded_sar, 130);
  assert.equal(summary.voided_charge_sar, 100);
  assert.equal(summary.manual_sar, 100);
  const net = Object.fromEntries(register.rows.map(row => [row.collection + "-" + row.provider_invoice_id, row.net_halalas]));
  assert.equal(net["partially_refunded-partial"], 7000);
  assert.equal(net["refunded-full"], 0);
  assert.equal(net["unreconciled-legacy"], null);
  assert.equal(net["duplicate-settled"], null);
  const csv = await (await request("/accounting/export")).text();
  const partial = csv.split("\r\n").find(line => line.includes('"partial"'));
  assert.match(partial, /"partially_refunded","partially_refunded","10000","3000","","7000"/);
  assert.doesNotMatch(csv, /private_fixture|never-export|raw_payload/);

  const review = { status: "partially_refunded", amount_halalas: 10000, review_amount_halalas: 7000, reference: "statement-1" };
  assert.equal((await request("/accounting/2", { method: "POST", data: review })).status, 200);
  fixture.db.prepare("UPDATE payment_refunds SET refunded_halalas=4500 WHERE provider_invoice_id='partial'").run();
  assert.equal((await request("/accounting/2", { method: "POST", data: review })).status, 409);
  const updated = await (await request("/accounting")).json();
  assert.equal(updated.totals.verified_halalas, 15500);
  assert.equal(updated.rows.find(row => row.id === 2).reviewed_at, null);
  assert.equal((await request("/accounting/2", { method: "POST", data: { ...review, review_amount_halalas: 5500, reference: "statement-2" } })).status, 200);
});
