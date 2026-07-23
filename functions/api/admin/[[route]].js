import { adminJson, audit, ensureAdminSchema, requireAdmin, SUPER_ADMIN_EMAIL } from "../_admin.js";
import { fetchMoyasarInvoice, moyasarStatus } from "../_moyasar.js";
import { noContent } from "../_state.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById, publicPlans } from "../_subscriptions.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return noContent();
  const url = new URL(context.request.url);
  const method = context.request.method.toUpperCase();
  const parts = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);

  try {
    if (method === "GET" && !parts[0]) return adminSession(context);
    if (method === "GET" && parts[0] === "overview") return overview(context);
    if (method === "GET" && parts[0] === "users") return users(context);
    if (method === "PATCH" && parts[0] === "users" && parts[1]) return updateUser(context, parts[1]);
    if (method === "GET" && parts[0] === "subscribers") return subscribers(context);
    if (method === "PATCH" && parts[0] === "subscribers" && parts[1]) return updateSubscriber(context, parts[1]);
    if (method === "GET" && parts[0] === "plans") return plans(context);
    if (method === "GET" && parts[0] === "payments") return payments(context);
    if (method === "POST" && parts[0] === "payments" && parts[2] === "sync") return syncPayment(context, parts[1]);
    if (method === "POST" && parts[0] === "payments" && parts[2] === "activate") return activatePayment(context, parts[1]);
    if (method === "GET" && parts[0] === "ai") return aiManagement(context);
    if (method === "PUT" && parts[0] === "ai" && parts[1] === "settings") return updateAiSettings(context);
    if (method === "GET" && parts[0] === "audit") return auditLogs(context);
    if (method === "GET" && parts[0] === "admins") return admins(context);
    if (method === "POST" && parts[0] === "admins") return createAdmin(context);
    if (method === "PATCH" && parts[0] === "admins" && parts[1]) return updateAdmin(context, parts[1]);
    if (method === "DELETE" && parts[0] === "admins" && parts[1]) return deleteAdmin(context, parts[1]);
    return adminJson({ error: "Admin route was not found.", code: "NOT_FOUND" }, method === "GET" ? 404 : 405);
  } catch (error) {
    console.error("Admin API failed", { path: url.pathname, name: error?.name, message: error?.message });
    return adminJson({ error: "Admin operation failed.", code: "ADMIN_API_FAILED" }, 500);
  }
}

async function adminSession(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  return adminJson({ authenticated: true, admin: access.admin, super_admin_email: SUPER_ADMIN_EMAIL });
}

async function overview(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  await ensureUserTable(access.db);
  const users = await count(access.db, "users");
  const activeUsers = await scalar(access.db, "SELECT COUNT(*) AS value FROM users WHERE account_status = 'active'");
  const subscribers = await scalar(access.db, "SELECT COUNT(*) AS value FROM subscriptions WHERE status IN ('active','trial')");
  const adminsCount = await scalar(access.db, "SELECT COUNT(*) AS value FROM admin_memberships WHERE status = 'active'");
  const applications = await count(access.db, "applications");
  const resumes = await count(access.db, "resumes");
  const usage = await usageSummary(access.db);
  const recent = await recentAudit(access.db, 8);
  return adminJson({
    admin: access.admin,
    kpis: { users, active_users: activeUsers, subscribers, admins: adminsCount, applications, resumes, ai_cost_usd: usage.cost_usd },
    ai: usage,
    recent_audit: recent,
    alerts: buildAlerts(access, usage),
  });
}

async function users(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  await ensureUserTable(access.db);
  const url = new URL(context.request.url);
  const q = `%${String(url.searchParams.get("q") || "").trim()}%`;
  const status = String(url.searchParams.get("status") || "").trim();
  const where = status ? "WHERE account_status = ? AND (email LIKE ? OR display_name LIKE ?)" : "WHERE email LIKE ? OR display_name LIKE ?";
  const bindings = status ? [status, q, q] : [q, q];
  const { results = [] } = await access.db.prepare(`
    SELECT u.id, u.email, u.display_name, u.provider, u.account_status, u.created_at, u.last_login_at,
      u.accepted_terms_at, u.onboarding_completed_at,
      COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'trial') AS subscription_status,
      COALESCE(s.ai_monthly_limit_usd, 5) AS ai_monthly_limit_usd
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ${where}
    ORDER BY u.last_login_at DESC
    LIMIT 100
  `).bind(...bindings).all();
  return adminJson({ users: results });
}

async function updateUser(context, id) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  const body = await readBody(context);
  const status = cleanChoice(body.account_status, ["active", "suspended"], "active");
  await ensureUserTable(access.db);
  await access.db.prepare("UPDATE users SET account_status = ? WHERE id = ?").bind(status, id).run();
  await audit(context, access, "user.status_update", "user", id, { account_status: status });
  return adminJson({ ok: true, id, account_status: status });
}

async function subscribers(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  await ensureUserTable(access.db);
  const { results = [] } = await access.db.prepare(`
    SELECT u.id, u.email, u.display_name, u.account_status,
      COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'trial') AS subscription_status,
      COALESCE(s.ai_monthly_limit_usd, 5) AS ai_monthly_limit_usd,
      s.current_period_end, s.updated_at,
      COALESCE(SUM(a.cost_usd), 0) AS ai_cost_usd,
      COALESCE(SUM(a.input_tokens + a.output_tokens), 0) AS ai_tokens
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN ai_usage a ON a.user_id = u.id
    GROUP BY u.id
    ORDER BY ai_cost_usd DESC, u.last_login_at DESC
    LIMIT 100
  `).all();
  return adminJson({ subscribers: results });
}

async function plans(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  await ensureSubscriptionSchema(access.db);
  const gateway = moyasarStatus(context.env || {}, context.request);
  const summary = await paymentSummary(access.db);
  return adminJson({
    plans: publicPlans(),
    gateway,
    summary,
    setup: {
      moyasar_dashboard: "https://dashboard.moyasar.com",
      callback_url: gateway.callback_url,
      webhook_url: gateway.webhook_url,
      env_vars: gateway.required_env,
    },
  });
}

async function payments(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  await ensureSubscriptionSchema(access.db);
  const { results: rows = [] } = await access.db.prepare(`
    SELECT p.id, p.user_id, p.plan, p.provider, p.provider_invoice_id, p.provider_payment_id,
      p.amount_sar, p.currency, p.status, p.checkout_url, p.description, p.created_at, p.updated_at,
      u.email, u.display_name
    FROM subscription_payments p
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.id DESC
    LIMIT 120
  `).all();
  const { results: events = [] } = await access.db.prepare(`
    SELECT provider, event_type, provider_object_id, status, created_at
    FROM payment_events ORDER BY id DESC LIMIT 40
  `).all();
  return adminJson({ payments: rows, events, gateway: moyasarStatus(context.env || {}, context.request), summary: await paymentSummary(access.db) });
}

async function syncPayment(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  await ensureSubscriptionSchema(access.db);
  const row = await access.db.prepare("SELECT * FROM subscription_payments WHERE id = ?").bind(id).first();
  if (!row) return adminJson({ error: "Payment was not found.", code: "NOT_FOUND" }, 404);
  const invoice = await fetchMoyasarInvoice(context.env || {}, row.provider_invoice_id);
  await access.db.prepare("UPDATE subscription_payments SET status = ?, raw_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(invoice.status || row.status, JSON.stringify(invoice), id).run();
  if (String(invoice.status) === "paid") {
    const plan = planById(row.plan);
    if (plan) await activatePaidSubscription(access.db, row.user_id, plan, invoice);
  }
  await audit(context, access, "payment.sync", "payment", id, { invoice_id: row.provider_invoice_id, status: invoice.status });
  return adminJson({ ok: true, invoice });
}

async function activatePayment(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  await ensureSubscriptionSchema(access.db);
  const row = await access.db.prepare("SELECT * FROM subscription_payments WHERE id = ?").bind(id).first();
  if (!row) return adminJson({ error: "Payment was not found.", code: "NOT_FOUND" }, 404);
  const plan = planById(row.plan);
  if (!plan) return adminJson({ error: "Payment plan is no longer available.", code: "BAD_PLAN" }, 409);
  await access.db.prepare(`
    INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
    VALUES (?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status='active',
      ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
      updated_at=CURRENT_TIMESTAMP
  `).bind(row.user_id, plan.id, plan.ai_monthly_limit_usd, new Date(Date.now() + (plan.billing === "yearly" ? 365 : 30) * 86400000).toISOString().slice(0, 10)).run();
  await access.db.prepare("UPDATE subscription_payments SET status = 'paid_manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  await audit(context, access, "payment.manual_activate", "payment", id, { invoice_id: row.provider_invoice_id, plan: row.plan });
  return adminJson({ ok: true });
}

async function updateSubscriber(context, id) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  const body = await readBody(context);
  const plan = cleanChoice(body.plan, ["free", "gold_monthly", "gold_annual", "pro", "business", "vip"], "free");
  const status = cleanChoice(body.status, ["trial", "active", "pending_payment", "past_due", "paused", "cancelled"], "trial");
  const limit = Math.max(0, Math.min(1000, Number(body.ai_monthly_limit_usd ?? 5)));
  await access.db.prepare(`
    INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
      ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
      updated_at=CURRENT_TIMESTAMP
  `).bind(id, plan, status, limit, cleanDate(body.current_period_end)).run();
  await audit(context, access, "subscriber.update", "subscription", id, { plan, status, ai_monthly_limit_usd: limit });
  return adminJson({ ok: true, id, plan, status, ai_monthly_limit_usd: limit });
}

async function aiManagement(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  const env = context.env || {};
  const usage = await usageSummary(access.db);
  const { results: byRoute = [] } = await access.db.prepare(`
    SELECT route, provider, model, COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS cost_usd,
      COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
    FROM ai_usage GROUP BY route, provider, model ORDER BY cost_usd DESC LIMIT 50
  `).all();
  const { results: settings = [] } = await access.db.prepare("SELECT key, value, updated_at FROM ai_settings ORDER BY key").all();
  return adminJson({
    providers: [
      { id: "deepseek", label: "DeepSeek V4 Flash", configured: Boolean(env.DEEPSEEK_API_KEY || env.AI_API_KEY), model: env.DEEPSEEK_MODEL || env.AI_MODEL || "deepseek-v4-flash" },
      { id: "openrouter", label: "OpenRouter", configured: Boolean(env.OPENROUTER_API_KEY), model: env.MINIMAX_MODEL || env.OPENROUTER_MINIMAX_MODEL || "minimax/minimax-m3" },
    ],
    usage,
    by_route: byRoute,
    settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
  });
}

async function updateAiSettings(context) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const body = await readBody(context);
  const allowed = ["monthly_budget_usd", "default_provider", "per_user_daily_limit"];
  const statements = [];
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    statements.push(access.db.prepare(`
      INSERT INTO ai_settings(key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP
    `).bind(key, String(body[key]), access.admin.email));
  }
  if (statements.length) await access.db.batch(statements);
  await audit(context, access, "ai.settings_update", "ai_settings", "global", body);
  return adminJson({ ok: true });
}

async function auditLogs(context) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  return adminJson({ audit: await recentAudit(access.db, 120) });
}

async function admins(context) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const { results = [] } = await access.db.prepare(`
    SELECT user_id, email, display_name, role, status, scopes, created_at, created_by, last_active_at, revoked_at
    FROM admin_memberships ORDER BY role DESC, created_at DESC
  `).all();
  return adminJson({ admins: results });
}

async function createAdmin(context) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const body = await readBody(context);
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return adminJson({ error: "Valid admin email is required.", code: "BAD_EMAIL" }, 400);
  const role = cleanChoice(body.role, ["admin", "super_admin"], "admin");
  const displayName = String(body.display_name || email.split("@")[0]).trim().slice(0, 120);
  await access.db.prepare(`
    INSERT INTO admin_memberships(user_id, email, display_name, role, status, scopes, created_by)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name, role=excluded.role,
      status='active', scopes=excluded.scopes, revoked_at=NULL
  `).bind(`email:${email}`, email, displayName, role, scopesFor(role), access.admin.email).run();
  await audit(context, access, "admin.create", "admin", email, { role });
  return adminJson({ ok: true, email, role }, 201);
}

async function updateAdmin(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const body = await readBody(context);
  const role = cleanChoice(body.role, ["admin", "super_admin"], "admin");
  const status = cleanChoice(body.status, ["active", "revoked"], "active");
  const target = decodeURIComponent(id).toLowerCase();
  if (target === SUPER_ADMIN_EMAIL && status !== "active") {
    return adminJson({ error: "The owner super admin cannot be revoked.", code: "OWNER_PROTECTED" }, 409);
  }
  await access.db.prepare(`
    UPDATE admin_memberships SET role = ?, status = ?, scopes = ?, revoked_at = CASE WHEN ? = 'revoked' THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE email = ? OR user_id = ?
  `).bind(role, status, scopesFor(role), status, target, target).run();
  await audit(context, access, "admin.update", "admin", target, { role, status });
  return adminJson({ ok: true, id: target, role, status });
}

async function deleteAdmin(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const target = decodeURIComponent(id).toLowerCase();
  if (target === SUPER_ADMIN_EMAIL) return adminJson({ error: "The owner super admin cannot be deleted.", code: "OWNER_PROTECTED" }, 409);
  await access.db.prepare("DELETE FROM admin_memberships WHERE email = ? OR user_id = ?").bind(target, target).run();
  await audit(context, access, "admin.delete", "admin", target, {});
  return noContent();
}

async function ensureUserTable(db) {
  await ensureAdminSchema(db);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
      picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
    )
  `).run();
}

async function usageSummary(db) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(cost_usd), 0) AS cost_usd
    FROM ai_usage
  `).first();
  return {
    requests: Number(row?.requests || 0),
    input_tokens: Number(row?.input_tokens || 0),
    output_tokens: Number(row?.output_tokens || 0),
    cost_usd: Number(row?.cost_usd || 0),
  };
}

async function paymentSummary(db) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(amount_sar), 0) AS gross_sar,
      SUM(CASE WHEN status IN ('paid','paid_manual','captured') THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status IN ('initiated','pending','on_hold') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status IN ('failed','expired','canceled','voided') THEN 1 ELSE 0 END) AS failed
    FROM subscription_payments
  `).first();
  return {
    total: Number(row?.total || 0),
    gross_sar: Number(row?.gross_sar || 0),
    paid: Number(row?.paid || 0),
    pending: Number(row?.pending || 0),
    failed: Number(row?.failed || 0),
  };
}

async function recentAudit(db, limit) {
  const { results = [] } = await db.prepare(`
    SELECT id, actor_email, actor_role, action, resource_type, resource_id, metadata, ip, created_at
    FROM audit_logs ORDER BY id DESC LIMIT ?
  `).bind(limit).all();
  return results;
}

async function count(db, table) {
  return scalar(db, `SELECT COUNT(*) AS value FROM ${table}`);
}

async function scalar(db, sql) {
  const row = await db.prepare(sql).first();
  return Number(row?.value || 0);
}

function buildAlerts(access, usage) {
  const alerts = [];
  if (access.admin.role === "super_admin") alerts.push({ tone: "teal", label: "Owner access active", detail: `${SUPER_ADMIN_EMAIL} has protected super admin access.` });
  if (!usage.requests) alerts.push({ tone: "gold", label: "Usage tracking ready", detail: "AI calls can now be summarized once token/cost records are written." });
  return alerts;
}

async function readBody(context) {
  try { return await context.request.json(); } catch { return {}; }
}

function cleanChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function scopesFor(role) {
  return role === "super_admin"
    ? '["owner","admins","users","subscribers","jobs","sources","ai","billing","audit","settings"]'
    : '["users","subscribers","jobs","sources","ai","reports"]';
}
