import { fetchMoyasarInvoice, verifyWebhookSecret } from "../../_moyasar.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../../_subscriptions.js";

export async function processMoyasarPayload(context, payload, options = {}) {
  const db = context.env?.JOBS_DB;
  if (!db) return { ok: false, code: "STORAGE_NOT_CONFIGURED" };
  await ensureSubscriptionSchema(db);
  const normalized = normalizeMoyasarPayload(payload);
  if (options.requireWebhookSecret && !verifyWebhookSecret(context.env || {}, payload)) {
    return { ok: false, code: "BAD_WEBHOOK_SECRET" };
  }
  await db.prepare(`
    INSERT OR IGNORE INTO payment_events(provider, event_type, provider_object_id, status, raw_payload)
    VALUES ('moyasar', ?, ?, ?, ?)
  `).bind(normalized.event_type, normalized.object_id, normalized.status, JSON.stringify(redactWebhookSecret(payload))).run();
  if (!normalized.invoice_id) return { ok: true, ignored: true, reason: "missing_invoice_id" };

  let row = await db.prepare("SELECT * FROM subscription_payments WHERE provider_invoice_id = ?")
    .bind(normalized.invoice_id).first();
  // Never trust a browser redirect, invoice callback, or webhook body to grant access.
  // The server-side invoice lookup is the source of truth.
  let invoice = null;
  if (!context.env?.MOYASAR_SECRET_KEY) return { ok: false, code: "MOYASAR_NOT_CONFIGURED" };
  try { invoice = await fetchMoyasarInvoice(context.env, normalized.invoice_id); } catch { return { ok: false, code: "PAYMENT_VERIFICATION_FAILED" }; }
  if (!row && invoice?.metadata?.user_id && invoice?.metadata?.plan) {
    await db.prepare(`
      INSERT INTO subscription_payments(user_id, plan, provider, provider_invoice_id, provider_payment_id, amount_halalas, amount_sar, currency, status, checkout_url, description, raw_payload, updated_at)
      VALUES (?, ?, 'moyasar', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      String(invoice.metadata.user_id),
      String(invoice.metadata.plan),
      invoice.id || normalized.invoice_id,
      invoice.payments?.[0]?.id || normalized.payment_id || "",
      Number(invoice.amount || normalized.amount || 0),
      Number(invoice.amount || normalized.amount || 0) / 100,
      invoice.currency || normalized.currency || "SAR",
      invoice.status || normalized.status || "initiated",
      invoice.url || "",
      invoice.description || "",
      JSON.stringify(invoice),
    ).run();
    row = await db.prepare("SELECT * FROM subscription_payments WHERE provider_invoice_id = ?")
      .bind(invoice.id || normalized.invoice_id).first();
  }
  if (!row) return { ok: true, ignored: true, reason: "unknown_invoice" };

  const status = invoice?.status || normalized.status || row.status;
  await db.prepare(`
    UPDATE subscription_payments SET status = ?, provider_payment_id = COALESCE(NULLIF(?, ''), provider_payment_id),
      raw_payload = ?, updated_at = CURRENT_TIMESTAMP
    WHERE provider_invoice_id = ?
  `).bind(status, normalized.payment_id || invoice?.payments?.[0]?.id || "", JSON.stringify(invoice || payload || {}), row.provider_invoice_id).run();

  if (String(status) === "paid") {
    const plan = planById(row.plan);
    if (plan) await activatePaidSubscription(db, row.user_id, plan, invoice || { id: row.provider_invoice_id, status, payments: [{ id: normalized.payment_id || "" }] });
  }
  return { ok: true, invoice_id: row.provider_invoice_id, status };
}

function redactWebhookSecret(payload) {
  if (!payload || typeof payload !== "object") return {};
  const copy = { ...payload };
  delete copy.secret_token;
  return copy;
}

export function normalizeMoyasarPayload(payload = {}) {
  const eventType = payload.type || (payload.id && payload.amount ? "invoice_callback" : "unknown");
  const data = payload.data || payload;
  const invoiceId = data.invoice_id || (data.url && data.id ? data.id : "") || data.metadata?.invoice_id || "";
  const isInvoice = Boolean(data.url && data.amount && data.id);
  return {
    event_type: String(eventType),
    object_id: String(data.id || payload.id || ""),
    invoice_id: String(invoiceId),
    payment_id: String(data.invoice_id ? data.id || "" : data.payments?.[0]?.id || ""),
    status: String(data.status || ""),
    amount: Number(data.amount || 0),
    currency: String(data.currency || "SAR"),
    invoice: isInvoice ? data : null,
  };
}
