import { confirmMoyasarWebhook, fetchMoyasarInvoice, findMoyasarOrderInvoice, isMoyasarCheckoutReady, MOYASAR_INVOICE_STATUSES, moyasarCheckoutUrl, moyasarInvoiceRecord, verifyWebhookSecret } from "../../_moyasar.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../../_subscriptions.js";
import { getJobDb, guardedUserBatch } from "../../_db.js";

export function checkoutExpiresAt(row) {
  let stored;
  try { stored = JSON.parse(row.raw_payload || "{}").expired_at; } catch { /* Older orders may lack a stored expiration. */ }
  const created = String(row.created_at || "").replace(" ", "T");
  const started = Date.parse(created.endsWith("Z") || /[+-]\d\d:\d\d$/.test(created) ? created : created + "Z");
  return Number.isFinite(Date.parse(stored)) ? Date.parse(stored) : started + 86400000;
}

export function checkoutReference(row) {
  return { order_id: String(row.id), plan: row.plan, checkout_url: row.status === "initiated" && checkoutExpiresAt(row) > Date.now() ? moyasarCheckoutUrl(row.checkout_url) : "" };
}

export function openMoyasarOrder(db, userId) {
  return db.prepare(`SELECT * FROM subscription_payments WHERE user_id=? AND provider='moyasar'
    AND status IN ('initiated','creating','on_hold') ORDER BY id DESC LIMIT 1`).bind(userId).first();
}

export async function pendingMoyasarCheckout(db, userId) {
  const row = await openMoyasarOrder(db, userId);
  return row && (row.status === "on_hold" || checkoutExpiresAt(row) > Date.now()) ? checkoutReference(row) : null;
}

export function matchesInvoiceOrder(invoice, row, requireOrder = false) {
  const meta = invoice?.metadata || {};
  return typeof invoice?.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(invoice.id) &&
    (!row.provider_invoice_id || invoice.id === row.provider_invoice_id) &&
    Number.isSafeInteger(invoice.amount) && invoice.amount > 0 && invoice.amount === Number(row.amount_halalas) &&
    invoice.currency === "SAR" && invoice.currency === row.currency && MOYASAR_INVOICE_STATUSES.has(invoice.status) &&
    meta.user_id === row.user_id && meta.plan === row.plan && (!meta.app || meta.app === "jobs-wasfai") &&
    (requireOrder ? meta.app === "jobs-wasfai" && String(meta.order) === String(row.id) : !meta.order || String(meta.order) === String(row.id));
}

export async function linkMoyasarInvoice(db, row, invoice) {
  if (!matchesInvoiceOrder(invoice, row, true)) return false;
  const url = moyasarCheckoutUrl(invoice.url);
  if (invoice.status === "initiated" && !url) return false;
  const record = moyasarInvoiceRecord(invoice);
  if (!record.expired_at && Number.isFinite(checkoutExpiresAt(row))) record.expired_at = new Date(checkoutExpiresAt(row)).toISOString();
  const linked = await db.prepare(`UPDATE subscription_payments SET provider_invoice_id=?, checkout_url=?, raw_payload=?,
    status=CASE WHEN status='creating' THEN 'initiated' ELSE status END, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND user_id=? AND (provider_invoice_id='' OR provider_invoice_id=?) RETURNING id`)
    .bind(invoice.id, url, JSON.stringify(record), row.id, row.user_id, invoice.id).first();
  return Boolean(linked);
}

export async function recoverUnlinkedOrder(env, db, row) {
  if (!isMoyasarCheckoutReady(env)) throw new Error("Moyasar environment is not ready.");
  const recovered = await findMoyasarOrderInvoice(env, row);
  if (recovered) {
    if (!await linkMoyasarInvoice(db, row, recovered)) throw new Error("Mismatched recovered invoice.");
    return { ...row, provider_invoice_id: recovered.id, checkout_url: moyasarCheckoutUrl(recovered.url) };
  }
  if (checkoutExpiresAt(row) <= Date.now()) {
    // The provider search is empty and any invoice from the original create is past its requested expiration.
    await db.prepare("UPDATE subscription_payments SET status='expired' WHERE id=? AND provider_invoice_id='' AND status IN ('creating','initiated')").bind(row.id).run();
  }
  // The original request or a callback may have linked the order while the list request was in flight.
  return db.prepare("SELECT * FROM subscription_payments WHERE id=? AND user_id=?").bind(row.id, row.user_id).first();
}

export async function processMoyasarPayload(context, payload, options = {}) {
  if (options.requireWebhookSecret && !verifyWebhookSecret(context.env || {}, payload)) return { ok: false, code: "BAD_WEBHOOK_SECRET" };
  const db = getJobDb(context.env);
  if (!db) return { ok: false, code: "STORAGE_NOT_CONFIGURED" };
  if (!isMoyasarCheckoutReady(context.env)) return { ok: false, code: "MOYASAR_NOT_CONFIGURED" };
  if (options.requireWebhookSecret && payload?.type === "webhook_verification") {
    const origin = context.env.ENVIRONMENT === "production" ? "https://jobs.wasfai.com" : new URL(context.request.url).origin;
    try {
      return await confirmMoyasarWebhook(context.env, payload.data, origin + "/api/payments/moyasar/webhook")
        ? { ok: true, verified: true } : { ok: false, code: "WEBHOOK_VERIFICATION_FAILED" };
    } catch { return { ok: false, code: "PROVIDER_UNAVAILABLE" }; }
  }
  const event = normalizeMoyasarPayload(payload);
  if (!event.invoice_id) return { ok: true, ignored: true, reason: "missing_invoice_id" };
  await ensureSubscriptionSchema(db);
  let row = await db.prepare("SELECT * FROM subscription_payments WHERE provider='moyasar' AND provider_invoice_id=? ORDER BY id LIMIT 1").bind(event.invoice_id).first();
  if (!row && event.order) {
    row = await db.prepare("SELECT * FROM subscription_payments WHERE id=? AND provider='moyasar' AND provider_invoice_id='' AND status IN ('initiated','creating')").bind(event.order).first();
    if (row) {
      let invoice;
      try { invoice = await fetchMoyasarInvoice(context.env, event.invoice_id); }
      catch { return { ok: false, code: "PROVIDER_UNAVAILABLE" }; }
      if (invoice.id !== event.invoice_id || !await linkMoyasarInvoice(db, row, invoice)) return { ok: false, code: "PAYMENT_VERIFICATION_FAILED" };
      row.provider_invoice_id = invoice.id;
    }
  }
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
  if (!plan?.price_sar || !matchesInvoiceOrder(invoice, row)) return { ok: false, code: "PAYMENT_VERIFICATION_FAILED" };
  const record = moyasarInvoiceRecord(invoice);
  if (invoice.status === "refunded" && !record.refunded_halalas) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  if (record.refunded_halalas > 0 && ["paid", "refunded", "voided"].includes(invoice.status)) {
    await guardedUserBatch(db, row.user_id, "1 = 1", [], [
      db.prepare(`INSERT INTO payment_refunds(provider_invoice_id, refunded_halalas) VALUES(?, ?)
        ON CONFLICT(provider_invoice_id) DO UPDATE SET refunded_halalas=excluded.refunded_halalas
        WHERE payment_refunds.refunded_halalas < excluded.refunded_halalas`).bind(invoice.id, record.refunded_halalas),
      db.prepare(`UPDATE subscription_payments SET status=CASE WHEN status='voided' OR ?='voided' THEN 'voided'
        WHEN status='refunded' OR (SELECT refunded_halalas FROM payment_refunds WHERE provider_invoice_id=?)>=amount_halalas THEN 'refunded'
        ELSE 'partially_refunded' END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`).bind(invoice.status, invoice.id, row.id, row.user_id),
    ]);
  } else if (invoice.status === "paid") {
    await activatePaidSubscription(db, row.user_id, plan, invoice, undefined, Number(row.amount_halalas));
  } else {
    await guardedUserBatch(db, row.user_id, "1 = 1", [], [db.prepare(`UPDATE subscription_payments SET status=?, raw_payload=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status NOT IN ('paid','paid_manual','partially_refunded','refunded','voided','failed','expired','canceled')`)
      .bind(invoice.status, JSON.stringify(record), row.id)]);
  }
  const settled = await db.prepare("SELECT status FROM subscription_payments WHERE id=?").bind(row.id).first();
  return { ok: true, status: settled?.status || invoice.status, invoice, verified: true };
}

export function normalizeMoyasarPayload(payload = {}) {
  const data = payload?.data || payload || {};
  const id = payload?.type ? data.invoice_id : data.invoice_id || data.id;
  const order = data.metadata?.order;
  return { event_type: String(payload?.type || "invoice_callback").slice(0,100),
    object_id: String(payload?.type ? payload.id || data.id || "" : data.id || "").slice(0,120),
    invoice_id: typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : "",
    order: /^\d{1,15}$/.test(String(order || "")) ? Number(order) : null };
}
