import { json, noContent } from "../../_state.js";
import { requireProtectedRequest } from "../../_security.js";
import { ensureSubscriptionSchema } from "../../_subscriptions.js";
import { getJobDb } from "../../_db.js";
import { reconcileMoyasarPayment } from "./_shared.js";

export async function onRequestGet(context) {
  const access = await requireProtectedRequest(context, "payment-status", 15);
  if (access.error) return access.error;
  const db = getJobDb(context.env);
  await ensureSubscriptionSchema(db);
  const url = new URL(context.request.url);
  const order = url.searchParams.get("order");
  const invoiceId = url.searchParams.get("invoice_id");
  const owner = access.user.sub;
  if (order && !/^\d{1,15}$/.test(order)) return json({ code: "BAD_ORDER", error: "Invalid checkout reference." }, 400);
  const base = "SELECT * FROM subscription_payments WHERE provider='moyasar' AND user_id=? AND provider_invoice_id<>''";
  const row = order ? await db.prepare(base + " AND id=?").bind(owner, Number(order)).first()
    : invoiceId ? await db.prepare(base + " AND provider_invoice_id=?").bind(owner, invoiceId).first()
    : await db.prepare(base + " ORDER BY id DESC LIMIT 1").bind(owner).first();
  if (!row) return json({ payment: null, verified: false });
  const result = await reconcileMoyasarPayment(context.env, db, row);
  if (!result.ok) return json({ code: result.code, error: "Payment verification is not available yet." }, result.code === "PAYMENT_VERIFICATION_FAILED" ? 409 : 503);
  const current = await db.prepare("SELECT plan, status, current_period_end FROM subscriptions WHERE user_id=?").bind(owner).first();
  return json({ verified: true, subscription_active: current?.plan === row.plan && current.status === "active"
    && current.current_period_end > new Date().toISOString().slice(0, 10), payment: {
      id: row.id, plan: row.plan, invoice_id: row.provider_invoice_id,
      amount_sar: row.amount_sar, currency: row.currency, status: result.status,
    } });
}

export async function onRequestOptions() {
  return noContent();
}
