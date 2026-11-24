import { json, noContent } from "../../_state.js";
import { requireProtectedRequest } from "../../_security.js";
import { effectiveSubscription, ensureSubscriptionSchema } from "../../_subscriptions.js";
import { getJobDb } from "../../_db.js";
import { reconcileMoyasarPayment, recoverUnlinkedOrder } from "./_shared.js";

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
  const base = "SELECT * FROM subscription_payments WHERE provider='moyasar' AND user_id=?";
  let row = order ? await db.prepare(base + " AND id=?").bind(owner, Number(order)).first()
    : invoiceId ? await db.prepare(base + " AND provider_invoice_id=?").bind(owner, invoiceId).first()
    : await db.prepare(base + " ORDER BY id DESC LIMIT 1").bind(owner).first();
  if (!row) return json({ payment: null, verified: false });
  function receipt(status) {
    return { id: row.id, plan: row.plan, invoice_id: row.provider_invoice_id, amount_sar: row.amount_sar, currency: row.currency, status };
  }
  if (!row.provider_invoice_id && ["creating","initiated"].includes(row.status)) {
    try { row = await recoverUnlinkedOrder(context.env, db, row); }
    catch { return json({ verified: false, code: "PROVIDER_UNAVAILABLE", payment: receipt(row.status) }, 503); }
  }
  if (!row) return json({ payment: null, verified: false });
  if (!row.provider_invoice_id) return json({ verified: false, invoice_activated: false, subscription_active: false, payment: receipt(row.status) });
  const result = await reconcileMoyasarPayment(context.env, db, row);
  if (!result.ok) return json({ code: result.code, error: "Payment verification is not available yet." }, result.code === "PAYMENT_VERIFICATION_FAILED" ? 409 : 503);
  const current = await db.prepare("SELECT plan, status, current_period_end FROM subscriptions WHERE user_id=?").bind(owner).first();
  const applied = await db.prepare("SELECT invoice_id FROM payment_activations WHERE invoice_id=? AND user_id=?").bind(row.provider_invoice_id, owner).first();
  // Historical receipts remain available even when another invoice subsequently extended the account.
  const latest = applied ? await db.prepare(`SELECT p.id FROM subscription_payments p
    LEFT JOIN payment_activations a ON a.invoice_id=p.provider_invoice_id AND a.user_id=p.user_id
    WHERE p.user_id=? AND (p.status='paid_manual' OR (p.status IN ('paid','partially_refunded') AND a.invoice_id IS NOT NULL))
    ORDER BY COALESCE(a.created_at,p.updated_at) DESC,p.id DESC LIMIT 1`).bind(owner).first() : null;
  const paidActive = Boolean(effectiveSubscription(current)?.paid_active);
  return json({ verified: true, invoice_activated: Boolean(applied), account_paid_active: paidActive,
    subscription_active: Boolean(applied && Number(latest?.id) === Number(row.id) && result.status === "paid" && current?.plan === row.plan && paidActive),
    payment: receipt(result.status) });
}

export async function onRequestOptions() { return noContent(); }
