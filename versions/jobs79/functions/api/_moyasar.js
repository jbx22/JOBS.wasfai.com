const MOYASAR_API_BASE = "https://api.moyasar.com/v1";

export function moyasarStatus(env = {}, request = null) {
  const origin = request ? new URL(request.url).origin : "https://jobs.wasfai.com";
  return {
    configured: isMoyasarCheckoutReady(env),
    webhook_configured: Boolean(env.MOYASAR_WEBHOOK_SECRET),
    api_base: MOYASAR_API_BASE,
    callback_url: `${origin}/api/payments/moyasar/callback`,
    webhook_url: `${origin}/api/payments/moyasar/webhook`,
    required_env: ["MOYASAR_SECRET_KEY", "MOYASAR_WEBHOOK_SECRET"],
  };
}

export function isMoyasarCheckoutReady(env = {}) {
  const key = String(env.MOYASAR_SECRET_KEY || "").trim();
  return env.ENVIRONMENT === "production" ? key.startsWith("sk_live_") : /^sk_(test|live)_/.test(key);
}

export function moyasarCheckoutUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.host !== "checkout.moyasar.com" || url.username || url.password || !url.pathname.startsWith("/invoices/")) return "";
    url.protocol = "https:";
    return url.href;
  } catch { return ""; }
}

export const MOYASAR_INVOICE_STATUSES = new Set(["initiated", "paid", "failed", "refunded", "canceled", "on_hold", "expired", "voided"]);

export function moyasarInvoiceRecord(invoice) {
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const settled = payments.find(payment => ["paid", "captured", "refunded", "voided"].includes(payment?.status));
  const refunded = payments.reduce((sum, payment) => {
    if (!payment || !["paid", "captured", "refunded"].includes(payment.status) ||
        (payment.invoice_id && payment.invoice_id !== invoice.id) ||
        (payment.currency && payment.currency !== invoice.currency)) return sum;
    return sum + (Number.isSafeInteger(payment.refunded) && payment.refunded > 0 ? payment.refunded : 0);
  }, 0);
  return { id: invoice.id, status: invoice.status, amount: invoice.amount, currency: invoice.currency,
    payment_id: settled?.id || (payments.length === 1 && !payments[0]?.status ? payments[0]?.id : "") || "",
    refunded_halalas: invoice.status === "voided" ? invoice.amount : Math.min(invoice.amount, refunded),
    expired_at: invoice.expired_at };
}

export async function createMoyasarInvoice(env, params) {
  const secret = String(env.MOYASAR_SECRET_KEY || "").trim();
  if (!secret) {
    const error = new Error("Moyasar secret key is not configured.");
    error.code = "MOYASAR_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${MOYASAR_API_BASE}/invoices`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Authorization": `Basic ${btoa(`${secret}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency || "SAR",
      description: params.description,
      callback_url: params.callback_url,
      success_url: params.success_url,
      back_url: params.back_url,
      expired_at: params.expired_at,
      metadata: params.metadata || {},
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Moyasar invoice failed with ${response.status}`);
    error.code = "MOYASAR_INVOICE_FAILED";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function readInvoiceResource(env, url) {
  const secret = String(env.MOYASAR_SECRET_KEY || "").trim();
  if (!secret) throw new Error("Moyasar is not configured.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Basic ${btoa(`${secret}:`)}` } });
  if (!response.ok) throw new Error("Moyasar invoice lookup unavailable.");
  return response.json();
}

export function fetchMoyasarInvoice(env, id) {
  return readInvoiceResource(env, `${MOYASAR_API_BASE}/invoices/${encodeURIComponent(id)}`);
}

// Hosted invoices support searching merchant metadata. The provider's given_id
// idempotency key applies to direct payments, so recover uncertain invoice creation by order.
export async function findMoyasarOrderInvoice(env, row) {
  const url = new URL(MOYASAR_API_BASE + "/invoices");
  url.searchParams.set("metadata[order]", String(row.id));
  const result = await readInvoiceResource(env, url.href);
  if (!Array.isArray(result?.invoices)) throw new Error("Invalid Moyasar invoice list.");
  const found = result.invoices.filter(invoice => invoice?.metadata?.app === "jobs-wasfai" &&
    String(invoice.metadata.order) === String(row.id) && invoice.metadata.user_id === row.user_id && invoice.metadata.plan === row.plan);
  if (found.length > 1 || (result.meta?.next_page && !found.length)) throw new Error("Ambiguous invoice lookup.");
  return found[0] || null;
}

export async function confirmMoyasarWebhook(env, data, expectedUrl) {
  const id = data?.webhook_id;
  const code = data?.verification_code;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id || "") || !/^\d{6}$/.test(code || "")) return false;
  const url = `${MOYASAR_API_BASE}/webhooks/${id}`;
  const hook = await readInvoiceResource(env, url);
  if (hook.id !== id || hook.url !== expectedUrl) return false;
  if (hook.verified === true) return true;
  const response = await fetch(url + "/verify", { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Basic ${btoa(`${String(env.MOYASAR_SECRET_KEY).trim()}:`)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code: String(code) }) });
  if (!response.ok) throw new Error("Webhook verification unavailable.");
  const result = await response.json();
  return result.id === id && result.verified === true;
}

export function verifyWebhookSecret(env, payload) {
  const expected = String(env.MOYASAR_WEBHOOK_SECRET || "");
  if (!expected) return false;
  const actual = String(payload?.secret_token || "");
  return safeEqual(actual, expected);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function cancelMoyasarInvoice(env, invoiceId) {
  const secret = String(env.MOYASAR_SECRET_KEY || "").trim();
  const response = await fetch(`${MOYASAR_API_BASE}/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
    method: "PUT",
    headers: { Authorization: `Basic ${btoa(secret + ":")}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Invoice cancellation was not confirmed.");
}
