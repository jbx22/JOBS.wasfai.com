import { authConfig, readSession } from "../auth/_auth.js";
import { json, noContent } from "../_state.js";
import { ensureSubscriptionSchema, planById, publicPlans, SUBSCRIPTION_PLANS } from "../_subscriptions.js";

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
    payment_ready: false,
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
  await db.prepare(`
    INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
      ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
      updated_at=CURRENT_TIMESTAMP
  `).bind(
    session.sub,
    plan.id,
    plan.status_after_select,
    plan.ai_monthly_limit_usd,
    nextPeriodEnd(plan.billing),
  ).run();
  const current = await db.prepare("SELECT plan, status, ai_monthly_limit_usd, current_period_end, updated_at FROM subscriptions WHERE user_id = ?")
    .bind(session.sub).first();
  return json({
    ok: true,
    current,
    selected_plan: publicPlans().find((item) => item.id === plan.id),
    next_action: plan.id === "free" ? "free_active" : "payment_pending",
    message: plan.id === "free"
      ? "Free plan is active."
      : "Gold request is saved. Payment checkout can be connected next.",
  });
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

function nextPeriodEnd(billing) {
  const days = billing === "yearly" ? 365 : 30;
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
