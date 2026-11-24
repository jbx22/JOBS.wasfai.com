import { fetchMoyasarInvoice, isMoyasarCheckoutReady, moyasarInvoiceRecord, verifyWebhookSecret } from "../../_moyasar.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planAmountHalalas, planById } from "../../_subscriptions.js";
import { getJobDb, guardedUserBatch } from "../../_db.js";

export async function processMoyasarPayload(context, payload, options = {}) {
  if (options.requireWebhookSecret && !verifyWebhookSecret(context.env || {}, payload)) {
    return { ok: false, code: "BAD_WEBHOOK_SECRET" };
  }
  const db = getJobDb(context.env);
  if (!db) return { ok: false, code: "STORAGE_NOT_CONFIGURED" };
  if (!isMoyasarCheckoutReady(context.env)) return { ok: false, code: "MOYASAR_NOT_CONFIGURED" };
  const event = normalizeMoyasarPayload(payload);
  if (!event.invoice_id) return { ok: true, ignored: true, reason: "missing_invoice_id" };

  await ensureSubscriptionSchema(db);
  const row = await db.prepare("SELECT * FROM subscription_payments WHERE provider='moyasar' AND provider_invoice_id=? ORDER BY id LIMIT 1")
    .bind(event.invoice_id).first();
  if (!row) return { ok: true, ignored: true, reason: "unknown_invoice" };
  const result = await reconcileMoyasarPayment(context.env, db, row);
  if (!result.ok) return result;
  await db.prepare(`INSERT OR IGNORE INTO payment_events(provider, event_type, provider_object_id, status, raw_payload)
    VALUES ('moyasar', ?, ?, ?, ?)`).bind(event.event_type, event.object_id, result.status, JSON.stringify({ invoice_id: event.invoice_id })).run();
  return { ok: true, invoice_id: row.provider_invoice_id, status: result.status };
}

export async function reconcileMoyasarPayment(env, db, row) {
  if (!isMoyasarCheckoutReady(env)) return { ok: false, code: "MOYASAR_NOT_CONFIGURED" };
  let invoice;
  try { invoice = await fetchMoyasarInvoice(env, row.provider_invoice_id); }
  catch { return { ok: false, code: "PROVIDER_UNAVAILABLE" }; }
  const plan = planById(row.plan);
  const meta = invoice?.metadata || {};
  if (!plan?.price_sar || invoice?.id !== row.provider_invoice_id || Number(invoice.amount) !== Number(row.amount_halalas)
    || Number(invoice.amount) !== planAmountHalalas(plan) || invoice.currency !== "SAR"
    || meta.user_id !== row.user_id || meta.plan !== row.plan || (meta.order && String(meta.order) !== String(row.id))) {
    return { ok: false, code: "PAYMENT_VERIFICATION_FAILED" };
  }
  if (invoice.status === "paid") {
    const activation = await activatePaidSubscription(db, row.user_id, plan, invoice);
    if (activation.already_activated) {
      // A replay must not change a settled or administratively updated subscription.
      return { ok: true, status: invoice.status, invoice, verified: true };
    }
  } else {
    await guardedUserBatch(db, row.user_id, "1 = 1", [], [db.prepare(`UPDATE subscription_payments SET status=?, raw_payload=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND (status NOT IN ('paid','paid_manual','refunded','voided')
        OR (status IN ('paid','paid_manual') AND ? IN ('refunded','voided')))`)
      .bind(invoice.status, JSON.stringify(moyasarInvoiceRecord(invoice)), row.id, invoice.status)]);
  }
  return { ok: true, status: invoice.status, invoice, verified: true };
}

export function normalizeMoyasarPayload(payload = {}) {
  const data = payload?.data || payload || {};
  const eventType = payload?.type || "invoice_callback";
  const id = data.invoice_id || (data.url && data.id ? data.id : "") || data.metadata?.invoice_id || "";
  return {
    event_type: String(eventType).slice(0, 100), object_id: String(payload?.type ? payload.id || data.id || "" : data.id || "").slice(0, 120),
    invoice_id: /^[A-Za-z0-9_-]{1,100}$/.test(id) ? String(id) : "",
  };
}
