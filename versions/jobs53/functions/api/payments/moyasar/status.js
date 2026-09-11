import { authConfig, readSession } from "../../auth/_auth.js";
import { fetchMoyasarInvoice } from "../../_moyasar.js";
import { json, noContent } from "../../_state.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../../_subscriptions.js";

export async function onRequestGet(context) {
  const db = context.env?.JOBS_DB;
  if (!db) return json({ error: "Payment storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const session = await readCurrentSession(context);
  if (!session) return json({ error: "Sign in is required.", code: "AUTH_REQUIRED" }, 401);
  await ensureSubscriptionSchema(db);
  const url = new URL(context.request.url);
  const invoiceId = String(url.searchParams.get("invoice_id") || "");
  const row = invoiceId
    ? await db.prepare("SELECT * FROM subscription_payments WHERE provider_invoice_id = ? AND user_id = ?").bind(invoiceId, session.sub).first()
    : await db.prepare("SELECT * FROM subscription_payments WHERE user_id = ? ORDER BY id DESC LIMIT 1").bind(session.sub).first();
  if (!row) return json({ payment: null });

  let invoice = null;
  if (context.env?.MOYASAR_SECRET_KEY && row.provider_invoice_id) {
    try {
      invoice = await fetchMoyasarInvoice(context.env, row.provider_invoice_id);
      await db.prepare("UPDATE subscription_payments SET status = ?, raw_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(invoice.status || row.status, JSON.stringify(invoice), row.id).run();
      if (String(invoice.status) === "paid") {
        const plan = planById(row.plan);
        if (plan) await activatePaidSubscription(db, row.user_id, plan, invoice);
      }
    } catch {
      invoice = null;
    }
  }
  return json({ payment: sanitizePayment(row, invoice), invoice: invoice ? sanitizeInvoice(invoice) : null });
}

export async function onRequestOptions() {
  return noContent();
}

async function readCurrentSession(context) {
  const config = authConfig(context.env || {}, context.request);
  return readSession(context.request, config.cookieSecret);
}

function sanitizePayment(row, invoice) {
  return {
    id: row.id,
    plan: row.plan,
    invoice_id: row.provider_invoice_id,
    amount_sar: row.amount_sar,
    currency: row.currency,
    status: invoice?.status || row.status,
    checkout_url: row.checkout_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sanitizeInvoice(invoice) {
  return {
    id: invoice.id,
    status: invoice.status,
    amount: invoice.amount,
    amount_format: invoice.amount_format,
    currency: invoice.currency,
    url: invoice.url,
    updated_at: invoice.updated_at,
  };
}
