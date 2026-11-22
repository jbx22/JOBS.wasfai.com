import { getAuthenticatedUser, json, noContent } from "../_state.js";
import { requireProtectedRequest } from "../_security.js";
import { createMoyasarInvoice, moyasarCheckoutUrl, moyasarInvoiceRecord, moyasarStatus } from "../_moyasar.js";
import {
  ensureSubscriptionSchema,
  nextPeriodEnd,
  paymentDescription,
  planAmountHalalas,
  planById,
  publicPlans,
} from "../_subscriptions.js";
import { getJobDb } from "../_db.js";

export async function onRequestGet(context) {
  const db = getJobDb(context.env);
  const session = await getAuthenticatedUser(context);
  let subscription = null;
  if (db && session) {
    await ensureSubscriptionSchema(db);
    subscription = await db.prepare("SELECT plan, status, ai_monthly_limit_usd, current_period_end, updated_at FROM subscriptions WHERE user_id = ?")
      .bind(session.sub).first();
  }
  return json({
    plans: publicPlans(),
    current: subscription,
    authenticated: Boolean(session),
    user: session ? { email: session.email, name: session.name } : null,
    payment_ready: moyasarStatus(context.env || {}, context.request).configured,
    payment_gateway: publicGatewayStatus(context),
    currency: "SAR",
    vat_note: "Prices can be shown VAT-inclusive at checkout.",
  });
}

export async function onRequestPost(context) {
  const db = getJobDb(context.env);
  if (!db) return json({ error: "Subscription storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const access = await requireProtectedRequest(context, "subscription-checkout", 6);
  if (access.error) return access.error;
  const session = access.user;
  const body = await readBody(context);
  const plan = planById(String(body.plan || ""));
  if (!plan) return json({ error: "Unknown subscription plan.", code: "BAD_PLAN", plans: publicPlans() }, 400);
  await ensureSubscriptionSchema(db);
  if (plan.id === "free") {
    await db.prepare(`
      INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
        ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
        updated_at=CURRENT_TIMESTAMP
      WHERE subscriptions.plan='free' OR subscriptions.status<>'active'
        OR COALESCE(subscriptions.current_period_end,'')<=?
    `).bind(session.sub, plan.id, plan.status_after_select, plan.ai_monthly_limit_usd, nextPeriodEnd(plan.billing), new Date().toISOString().slice(0,10)).run();
    const current = await readCurrentSubscription(db, session.sub);
    if (current?.plan !== "free") return json({ code: "PAID_PLAN_ACTIVE", error: "Your paid subscription stays active until the end of its term." }, 409);
    return json({
      ok: true,
      current,
      selected_plan: publicPlans().find((item) => item.id === plan.id),
      next_action: "free_active",
      message: "Free plan is active.",
    });
  }

  if (!moyasarStatus(context.env, context.request).configured) {
    return json({ code: "MOYASAR_NOT_CONFIGURED", error: "Paid checkout is temporarily unavailable." }, 503);
  }
  return checkout(context, db, session, plan);
}

async function checkout(context, db, session, plan) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS subscription_checkout_locks (
    user_id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, expires_at TEXT NOT NULL
  )`).run();
  const now = new Date().toISOString();
  const claim = crypto.randomUUID();
  const lock = await db.prepare(`INSERT INTO subscription_checkout_locks(user_id, claim_id, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET claim_id=excluded.claim_id, expires_at=excluded.expires_at
    WHERE subscription_checkout_locks.expires_at<=? RETURNING claim_id`)
    .bind(session.sub, claim, new Date(Date.now() + 60000).toISOString(), now).first();
  if (lock?.claim_id !== claim) return json({ code: "CHECKOUT_IN_PROGRESS", error: "Checkout is being prepared. Try again in a moment." }, 409);
  try {
    const current = await readCurrentSubscription(db, session.sub);
    if (current?.status === "active" && current.plan !== "free" && current.plan !== plan.id && current.current_period_end > now.slice(0,10)) {
      return json({ code: "PAID_PLAN_ACTIVE", error: "You can change paid plans after your current term ends." }, 409);
    }
    const previous = await db.prepare(`SELECT id, plan, raw_payload, checkout_url FROM subscription_payments
      WHERE user_id=? AND provider='moyasar' AND status='initiated' AND checkout_url<>'' ORDER BY id DESC LIMIT 1`)
      .bind(session.sub).first();
    const saved = parseInvoiceRecord(previous?.raw_payload);
    const previousUrl = moyasarCheckoutUrl(previous?.checkout_url);
    if (previousUrl && saved.expired_at > now) {
      if (previous.plan !== plan.id) return json({ code: "OTHER_ORDER_OPEN", error: "An invoice is already open for another plan. Resume that checkout or wait for it to expire." }, 409);
      return checkoutResponse(plan, current, previousUrl, previous.id);
    }
    const order = await db.prepare(`INSERT INTO subscription_payments(user_id, plan, amount_halalas, amount_sar, currency, description)
      VALUES (?, ?, ?, ?, 'SAR', ?) RETURNING id`).bind(session.sub, plan.id, planAmountHalalas(plan), plan.price_sar, paymentDescription(plan)).first();
    const invoice = await createCheckoutInvoice(context, session, plan, order.id);
    await db.prepare(`UPDATE subscription_payments SET provider_invoice_id=?, checkout_url=?, raw_payload=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=?`).bind(invoice.id, invoice.url, JSON.stringify(moyasarInvoiceRecord(invoice)), order.id, session.sub).run();
    return checkoutResponse(plan, current, invoice.url, order.id);
  } catch {
    return json({ code: "CHECKOUT_UNAVAILABLE", error: "Moyasar checkout could not be opened. Try again shortly." }, 502);
  } finally {
    await db.prepare("DELETE FROM subscription_checkout_locks WHERE user_id=? AND claim_id=?").bind(session.sub, claim).run();
  }
}

function checkoutResponse(plan, current, url, orderId) {
  return json({ ok: true, current, selected_plan: publicPlans().find((item) => item.id === plan.id),
    next_action: "redirect_to_moyasar", checkout_url: url, order_id: String(orderId) }, 201);
}

function parseInvoiceRecord(value) {
  try { return JSON.parse(value) || {}; } catch { return {}; }
}

export async function onRequestOptions() {
  return noContent();
}

async function readBody(context) {
  try { return await context.request.json(); } catch { return {}; }
}

async function readCurrentSubscription(db, userId) {
  return db.prepare("SELECT plan, status, ai_monthly_limit_usd, current_period_end, updated_at FROM subscriptions WHERE user_id = ?")
    .bind(userId).first();
}

async function createCheckoutInvoice(context, session, plan, orderId) {
  const origin = context.env?.ENVIRONMENT === "production" ? "https://jobs.wasfai.com" : new URL(context.request.url).origin;
  const amount = planAmountHalalas(plan);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const invoice = await createMoyasarInvoice(context.env || {}, {
    amount,
    currency: "SAR",
    description: paymentDescription(plan),
    callback_url: `${origin}/api/payments/moyasar/callback`,
    success_url: `${origin}/pricing/?payment=success&order=${orderId}`,
    back_url: `${origin}/pricing/?payment=cancelled&plan=${encodeURIComponent(plan.id)}`,
    expired_at: expiresAt,
    metadata: {
      user_id: session.sub,
      plan: plan.id,
      app: "jobs-wasfai",
      order: String(orderId),
    },
  });
  const url = moyasarCheckoutUrl(invoice?.url);
  if (!url || !invoice?.id || Number(invoice.amount) !== amount || invoice.currency !== "SAR" || invoice.status !== "initiated") {
    throw new Error("Moyasar returned an invalid invoice.");
  }
  return { ...invoice, url, expired_at: invoice.expired_at || expiresAt };
}

function publicGatewayStatus(context) {
  const gateway = moyasarStatus(context.env || {}, context.request);
  return { configured: gateway.configured };
}
