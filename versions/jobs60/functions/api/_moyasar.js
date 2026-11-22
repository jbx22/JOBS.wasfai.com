const MOYASAR_API_BASE = "https://api.moyasar.com/v1";

export function moyasarStatus(env = {}, request = null) {
  const origin = request ? new URL(request.url).origin : "https://jobs.wasfai.com";
  return {
    configured: Boolean(env.MOYASAR_SECRET_KEY),
    webhook_configured: Boolean(env.MOYASAR_WEBHOOK_SECRET),
    api_base: MOYASAR_API_BASE,
    callback_url: `${origin}/api/payments/moyasar/callback`,
    webhook_url: `${origin}/api/payments/moyasar/webhook`,
    required_env: ["MOYASAR_SECRET_KEY", "MOYASAR_WEBHOOK_SECRET"],
  };
}

export async function createMoyasarInvoice(env, params) {
  const secret = String(env.MOYASAR_SECRET_KEY || "");
  if (!secret) {
    const error = new Error("Moyasar secret key is not configured.");
    error.code = "MOYASAR_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${MOYASAR_API_BASE}/invoices`, {
    method: "POST",
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

export async function fetchMoyasarInvoice(env, id) {
  const secret = String(env.MOYASAR_SECRET_KEY || "");
  if (!secret) {
    const error = new Error("Moyasar secret key is not configured.");
    error.code = "MOYASAR_NOT_CONFIGURED";
    throw error;
  }
  const response = await fetch(`${MOYASAR_API_BASE}/invoices/${encodeURIComponent(id)}`, {
    headers: { "Authorization": `Basic ${btoa(`${secret}:`)}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Moyasar invoice lookup failed with ${response.status}`);
    error.code = "MOYASAR_FETCH_FAILED";
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
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
