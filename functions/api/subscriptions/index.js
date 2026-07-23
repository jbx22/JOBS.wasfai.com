import { authConfig, readSession } from "../auth/_auth.js";
import { createMoyasarInvoice, moyasarStatus } from "../_moyasar.js";
import { json, noContent } from "../_state.js";
import {
  ensureSubscriptionSchema,
  nextPeriodEnd,
  paymentDescription,
  planAmountHalalas,
  planById,
  publicPlans,
} from "../_subscriptions.js";

export async function onRequestGet(context) {
  const db = context.env?.JOBS_DB;
  const session = await readCurrentSession(context);
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
  const db = context.env?.JOBS_DB;
  if (!db) return json({ error: "Subscription storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const session = await readCurrentSession(context);
  if (!session) return json({ error: "Sign in is required to choose a plan.", code: "AUTH_REQUIRED" }, 401);
  const body = await readBody(context);
  const plan = planById(String(body.plan || ""));
  if (!plan) return json({ error: "Unknown subscription plan.", code: "BAD_PLAN", plans: publicPlans() }, 400);
  await ensureSubscriptionSchema(db);
  await ensureUserRow(db, session);
  if (plan.id === "free") {
    await db.prepare(`
      INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
        ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
        updated_at=CURRENT_TIMESTAMP
    `).bind(session.sub, plan.id, plan.status_after_select, plan.ai_monthly_limit_usd, nextPeriodEnd(plan.billing)).run();
    const current = await readCurrentSubscription(db, session.sub);
    return json({
      ok: true,
      current,
      selected_plan: publicPlans().find((item) => item.id === plan.id),
      next_action: "free_active",
      message: "Free plan is active.",
    });
  }

  const gateway = moyasarStatus(context.env || {}, context.request);
  if (!gateway.configured) {
    await savePendingSubscription(db, session.sub, plan);
    return json({
      ok: false,
      current: await readCurrentSubscription(db, session.sub),
      selected_plan: publicPlans().find((item) => item.id === plan.id),
      next_action: "payment_gateway_setup_required",
      payment_ready: false,
      message: "Gold request is saved. Moyasar secret key is required before checkout can open.",
    }, 409);
  }

  const invoice = await createCheckoutInvoice(context, session, plan);
  await savePendingSubscription(db, session.sub, plan);
  await db.prepare(`
    INSERT INTO subscription_payments(user_id, plan, provider, provider_invoice_id, amount_halalas, amount_sar, currency, status, checkout_url, description, raw_payload, updated_at)
    VALUES (?, ?, 'moyasar', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    session.sub,
    plan.id,
    invoice.id || "",
    Number(invoice.amount || planAmountHalalas(plan)),
    Number(invoice.amount || planAmountHalalas(plan)) / 100,
    invoice.currency || "SAR",
    invoice.status || "initiated",
    invoice.url || "",
    invoice.description || paymentDescription(plan),
    JSON.stringify(invoice),
  ).run();
  return json({
    ok: true,
    current: await readCurrentSubscription(db, session.sub),
    selected_plan: publicPlans().find((item) => item.id === plan.id),
    next_action: "redirect_to_moyasar",
    checkout_url: invoice.url,
    invoice: publicInvoice(invoice),
    message: "Moyasar checkout is ready.",
  }, 201);
}

async function savePendingSubscription(db, userId, plan) {
  await db.prepare(`
    INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
      ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    userId,
    plan.id,
    plan.status_after_select,
    plan.ai_monthly_limit_usd,
    nextPeriodEnd(plan.billing),
  ).run();
}

export async function onRequestOptions() {
  return noContent();
}

async function readCurrentSession(context) {
  const config = authConfig(context.env || {}, context.request);
  return readSession(context.request, config.cookieSecret);
}

async function readBody(context) {
  try { return await context.request.json(); } catch { return {}; }
}

async function ensureUserRow(db, session) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
      picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
    )
  `).run();
  await db.prepare(`
    INSERT INTO users(id, email, display_name, provider)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name
  `).bind(session.sub, session.email || "", session.name || "", session.provider || "google").run();
}

async function readCurrentSubscription(db, userId) {
  return db.prepare("SELECT plan, status, ai_monthly_limit_usd, current_period_end, updated_at FROM subscriptions WHERE user_id = ?")
    .bind(userId).first();
}

async function createCheckoutInvoice(context, session, plan) {
  const origin = new URL(context.request.url).origin;
  const amount = planAmountHalalas(plan);
  const invoice = await createMoyasarInvoice(context.env || {}, {
    amount,
    currency: "SAR",
    description: paymentDescription(plan),
    callback_url: `${origin}/api/payments/moyasar/callback`,
    success_url: `${origin}/pricing/?payment=success&plan=${encodeURIComponent(plan.id)}`,
    back_url: `${origin}/pricing/?payment=cancelled&plan=${encodeURIComponent(plan.id)}`,
    expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      user_id: session.sub,
      email: session.email || "",
      plan: plan.id,
      app: "jobs-wasfai",
    },
  });
  if (!invoice?.url || !invoice?.id) {
    const error = new Error("Moyasar did not return a checkout URL.");
    error.code = "MOYASAR_BAD_INVOICE";
    throw error;
  }
  return invoice;
}

function publicInvoice(invoice) {
  return {
    id: invoice.id,
    status: invoice.status,
    amount: invoice.amount,
    currency: invoice.currency,
    amount_format: invoice.amount_format,
    url: invoice.url,
    expired_at: invoice.expired_at,
  };
}

function publicGatewayStatus(context) {
  const gateway = moyasarStatus(context.env || {}, context.request);
  return { configured: gateway.configured };
}
