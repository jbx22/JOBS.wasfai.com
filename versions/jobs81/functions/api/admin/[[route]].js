import { adminJson, audit, auditStatement, ensureAdminSchema, requireAdmin, SERVICE_ADMIN_EMAIL, SUPER_ADMIN_EMAIL } from "../_admin.js";
import { estimateCost, PERSONAL_OPENROUTER_PROVIDER } from "../_ai_usage.js";
import { adminWorkspace, paymentTotals } from "../_admin_workspaces.js";
import { guardedUserBatch, isWriteConflict } from "../_db.js";
import { DEEPSEEK_LABEL, deepseekModel } from "../_deepseek.js";
import { moyasarInvoiceRecord, moyasarStatus } from "../_moyasar.js";
import { ensureWorkspaceSchema, noContent } from "../_state.js";
import { AuthError } from "../auth/_auth.js";
import { FREE_MONTHLY_AI_BUDGET_USD, effectiveSubscription, ensureSubscriptionSchema, nextPeriodEnd, planById, publicPlans, readSubscriptionRecord, subscriptionSnapshot } from "../_subscriptions.js";
import { reconcileMoyasarPayment } from "../payments/moyasar/_shared.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return noContent();
  const url = new URL(context.request.url);
  const method = context.request.method.toUpperCase();
  const parts = url.pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean);

  try {
    if (["workspaces", "recruitment", "support", "marketing", "accounting"].includes(parts[0])) return await adminWorkspace(context, parts, method);
    if (method === "GET" && !parts[0]) return await adminSession(context);
    if (method === "GET" && parts[0] === "overview") return await overview(context);
    if (method === "GET" && parts[0] === "users") return await users(context);
    if (method === "PATCH" && parts[0] === "users" && parts[1]) return await updateUser(context, parts[1]);
    if (method === "GET" && parts[0] === "subscribers") return await subscribers(context);
    if (method === "PATCH" && parts[0] === "subscribers" && parts[1]) return await updateSubscriber(context, parts[1]);
    if (method === "GET" && parts[0] === "plans") return await plans(context);
    if (method === "GET" && parts[0] === "payments") return await payments(context);
    if (method === "POST" && parts[0] === "payments" && parts[2] === "sync") return await syncPayment(context, parts[1]);
    if (method === "POST" && parts[0] === "payments" && parts[2] === "activate") return await activatePayment(context, parts[1]);
    if (method === "GET" && parts[0] === "ai") return await aiManagement(context);
    if (method === "PUT" && parts[0] === "ai" && parts[1] === "settings") return await updateAiSettings(context);
    if (method === "GET" && parts[0] === "audit") return await auditLogs(context);
    if (method === "GET" && parts[0] === "admins") return await admins(context);
    if (method === "POST" && parts[0] === "admins") return await createAdmin(context);
    if (method === "PATCH" && parts[0] === "admins" && parts[1]) return await updateAdmin(context, parts[1]);
    if (method === "DELETE" && parts[0] === "admins" && parts[1]) return await deleteAdmin(context, parts[1]);
    return adminJson({ error: "Admin route was not found.", code: "NOT_FOUND" }, method === "GET" ? 404 : 405);
  } catch (error) {
    if (error instanceof AuthError) return adminJson({ error: error.message, code: error.code }, error.status);
    console.error("Admin API failed", { path: url.pathname, name: error?.name, code: error?.code });
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
  const subscriberCount = await access.db.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active','trial')
    AND (plan='free' OR substr(current_period_end,1,10)>?)`).bind(new Date().toISOString().slice(0, 10)).first();
  const subscribers = Number(subscriberCount?.n || 0);
  const adminsCount = await scalar(access.db, "SELECT COUNT(*) AS value FROM admin_memberships WHERE status = 'active'");
  await ensureWorkspaceSchema(access.db);
  const applications = await count(access.db, "applications");
  const resumes = await count(access.db, "resumes");
  const usage = await usageSummary(access.db);
  const recent = access.admin.role === "super_admin" ? await recentAudit(access.db, 8) : [];
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
  const q = `%${String(url.searchParams.get("q") || "").trim().slice(0, 160).toLowerCase()}%`;
  const status = cleanChoice(url.searchParams.get("status"), ["active", "suspended"], "");
  const offset = Number(url.searchParams.get("offset"));
  if (!Number.isSafeInteger(offset) || offset < 0) return adminJson({ error: "Invalid user page.", code: "BAD_OFFSET" }, 400);
  const where = "WHERE (LOWER(u.email) LIKE ? OR LOWER(u.display_name) LIKE ?)" + (status ? " AND u.account_status = ?" : "");
  const bindings = status ? [q, q, status] : [q, q];
  const { results = [] } = await access.db.prepare(`
    SELECT u.id, u.email, u.display_name, u.provider, u.account_status, u.created_at, u.last_login_at,
      u.accepted_terms_at, u.onboarding_completed_at,
      COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'trial') AS subscription_status,
      COALESCE(s.ai_monthly_limit_usd, ${FREE_MONTHLY_AI_BUDGET_USD}) AS ai_monthly_limit_usd, s.current_period_end
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ${where}
    ORDER BY u.last_login_at DESC, u.id
    LIMIT 101 OFFSET ?
  `).bind(...bindings, offset).all();
  return adminJson({ users: results.slice(0, 100).map(withSubscriptionStatus), next_offset: results.length > 100 ? offset + 100 : null });
}

async function updateUser(context, id) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  const body = await readBody(context);
  const status = cleanChoice(body.account_status, ["active", "suspended"], "");
  if (!status) return adminJson({ error: "Select a valid account status.", code: "BAD_STATUS" }, 400);
  const target = decodeURIComponent(id);
  await ensureUserTable(access.db);
  const user = await access.db.prepare("SELECT email FROM users WHERE id = ?").bind(target).first();
  if (!user) return adminJson({ error: "User was not found.", code: "USER_NOT_FOUND" }, 404);
  const member = await access.db.prepare("SELECT role FROM admin_memberships WHERE email = ? AND status = 'active'")
    .bind(user.email.toLowerCase()).first();
  if (protectedAdmin(user.email) || (member && (access.admin.role !== "super_admin" || (access.admin.service_identity && member.role === "super_admin")))) {
    return adminJson({ error: "This account is protected.", code: "OWNER_PROTECTED" }, 409);
  }
  await access.db.prepare("UPDATE users SET account_status = ? WHERE id = ?").bind(status, target).run();
  await audit(context, access, "user.status_update", "user", target, { account_status: status });
  return adminJson({ ok: true, id: target, account_status: status });
}

async function subscribers(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  await ensureUserTable(access.db);
  const { results = [] } = await access.db.prepare(`
    SELECT u.id, u.email, u.display_name, u.account_status,
      COALESCE(s.plan, 'free') AS plan, COALESCE(s.status, 'trial') AS subscription_status,
      COALESCE(s.ai_monthly_limit_usd, ${FREE_MONTHLY_AI_BUDGET_USD}) AS ai_monthly_limit_usd,
      s.current_period_end, s.updated_at,
      COALESCE(SUM(a.cost_usd), 0) AS ai_cost_usd,
      COALESCE(SUM(a.input_tokens + a.output_tokens), 0) AS ai_tokens
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN ai_usage a ON a.user_id = u.id AND a.provider != '${PERSONAL_OPENROUTER_PROVIDER}'
    GROUP BY u.id, u.email, u.display_name, u.account_status,
      s.plan, s.status, s.ai_monthly_limit_usd, s.current_period_end, s.updated_at
    ORDER BY ai_cost_usd DESC, u.last_login_at DESC
    LIMIT 100
  `).all();
  return adminJson({ subscribers: results.map(withSubscriptionStatus) });
}

function withSubscriptionStatus(row) {
  const effective = effectiveSubscription({ ...row, status: row.subscription_status });
  return { ...row, effective_status: effective.status, effective_plan: effective.effective_plan, paid_active: effective.paid_active };
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
  if (!row?.provider_invoice_id) return adminJson({ error: "Payment invoice was not found.", code: "NOT_FOUND" }, 404);
  const result = await reconcileMoyasarPayment(context.env, access.db, row);
  if (!result.ok) return adminJson({ error: "Payment could not be verified.", code: result.code }, result.code === "PAYMENT_VERIFICATION_FAILED" ? 409 : 503);
  await audit(context, access, "payment.sync", "payment", id, { invoice_id: row.provider_invoice_id, status: result.status });
  return adminJson({ ok: true, invoice: moyasarInvoiceRecord(result.invoice) });
}

async function activatePayment(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  await ensureSubscriptionSchema(access.db);
  const row = await access.db.prepare("SELECT id, user_id, plan, status, provider_invoice_id FROM subscription_payments WHERE id = ?").bind(id).first();
  if (!row) return adminJson({ error: "Payment was not found.", code: "NOT_FOUND" }, 404);
  if (row.status === "paid_manual") return adminJson({ ok: true, already_activated: true });
  if (!["initiated", "on_hold"].includes(row.status)) {
    return adminJson({ error: "The recorded payment status cannot be manually activated.", code: "PAYMENT_ALREADY_SETTLED" }, 409);
  }
  const plan = planById(row.plan);
  if (!plan?.price_sar) return adminJson({ error: "Payment plan is no longer available.", code: "BAD_PLAN" }, 409);
  const current = await readSubscriptionRecord(access.db, row.user_id);
  const snapshot = subscriptionSnapshot(current, row.user_id);
  const end = nextPeriodEnd(plan.billing, current);
  try {
    await guardedUserBatch(access.db, row.user_id,
      `(${snapshot.sql}) AND EXISTS (SELECT 1 FROM subscription_payments WHERE id=? AND status=?)
       AND NOT EXISTS (SELECT 1 FROM payment_refunds WHERE provider_invoice_id=? AND refunded_halalas>0)
       AND NOT EXISTS (SELECT 1 FROM payment_activations WHERE invoice_id=?)`,
      [...snapshot.params, row.id, row.status, row.provider_invoice_id, row.provider_invoice_id], [
      access.db.prepare(`
        INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
        VALUES (?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status='active',
          ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end, updated_at=CURRENT_TIMESTAMP
      `).bind(row.user_id, plan.id, plan.ai_monthly_limit_usd, end),
      access.db.prepare("UPDATE subscription_payments SET status = 'paid_manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id),
      auditStatement(context, access, "payment.manual_activate", "payment", id, { invoice_id: row.provider_invoice_id, plan: row.plan }),
    ]);
  } catch (error) {
    if (isWriteConflict(error)) return adminJson({ error: "Payment status changed. Refresh before trying again.", code: "PAYMENT_CHANGED" }, 409);
    throw error;
  }
  return adminJson({ ok: true });
}

async function updateSubscriber(context, id) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  const body = await readBody(context);
  const target = decodeURIComponent(id);
  const plans = ["free", "gold_monthly", "gold_annual", "pro", "business", "vip"];
  const statuses = ["trial", "active", "pending_payment", "past_due", "paused", "cancelled"];
  const hasEnd = Object.hasOwn(body, "current_period_end");
  const end = typeof body.current_period_end === "string" ? cleanDate(body.current_period_end) : null;
  const limit = body.ai_monthly_limit_usd;
  if ((body.plan !== undefined && !plans.includes(body.plan)) ||
    (body.status !== undefined && !statuses.includes(body.status)) ||
    (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 0 || limit > 1000)) ||
    (hasEnd && body.current_period_end !== null && !end) ||
    (body.plan === undefined && body.status === undefined && limit === undefined && !hasEnd)) {
    return adminJson({ error: "Provide valid subscription changes.", code: "INVALID_SUBSCRIPTION_UPDATE" }, 400);
  }
  await ensureUserTable(access.db);
  const user = await access.db.prepare("SELECT id FROM users WHERE id = ?").bind(target).first();
  if (!user) return adminJson({ error: "User was not found.", code: "USER_NOT_FOUND" }, 404);
  await ensureSubscriptionSchema(access.db);
  const fields = { plan: body.plan, status: body.status, ai_monthly_limit_usd: limit, current_period_end: hasEnd ? end : undefined };
  await guardedUserBatch(access.db, target, "1 = 1", [], [
    access.db.prepare(`
      INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET plan=COALESCE(?, subscriptions.plan),
        status=COALESCE(?, subscriptions.status), ai_monthly_limit_usd=COALESCE(?, subscriptions.ai_monthly_limit_usd),
        current_period_end=CASE WHEN ? = 1 THEN excluded.current_period_end ELSE subscriptions.current_period_end END,
        updated_at=CURRENT_TIMESTAMP
    `).bind(target, body.plan ?? "free", body.status ?? "trial", limit ?? planById(body.plan)?.ai_monthly_limit_usd ?? FREE_MONTHLY_AI_BUDGET_USD, end,
      body.plan ?? null, body.status ?? null, limit ?? null, Number(hasEnd)),
    auditStatement(context, access, "subscriber.update", "subscription", target, fields),
  ]);
  const subscription = await access.db.prepare("SELECT plan, status, ai_monthly_limit_usd, current_period_end FROM subscriptions WHERE user_id = ?").bind(target).first();
  return adminJson({ ok: true, id: target, ...subscription });
}

async function aiManagement(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  const env = context.env || {};
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const month = new Date().toISOString().slice(0, 7) + "-01 00:00:00";
  const usage = await usageSummary(access.db, since);
  const monthly = await usageSummary(access.db, month);
  const { results: byRoute = [] } = await access.db.prepare(`
    SELECT route, provider, model, COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS cost_usd,
      COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
    FROM ai_usage WHERE created_at >= ? GROUP BY route, provider, model ORDER BY cost_usd DESC LIMIT 50
  `).bind(since).all();
  const { results: settings = [] } = await access.db.prepare("SELECT key, value, updated_at FROM ai_settings ORDER BY key").all();
  return adminJson({
    providers: [
      { id: "luna", label: "GPT-5.6 Luna", configured: Boolean(env.OPENAI_API_KEY), model: env.OPENAI_MODEL || env.LUNA_MODEL || "gpt-5.6-luna" },
      { id: "deepseek", label: DEEPSEEK_LABEL, configured: Boolean(env.DEEPSEEK_API_KEY || env.AI_API_KEY), model: deepseekModel(env.DEEPSEEK_MODEL || env.AI_MODEL) },
      { id: "openrouter", label: "OpenRouter", configured: Boolean(env.OPENROUTER_API_KEY), model: env.MINIMAX_MODEL || env.OPENROUTER_MINIMAX_MODEL || "minimax/minimax-m3" },
    ],
    usage,
    since,
    month,
    monthly,
    by_route: byRoute.map(row => ({ ...row, payer: row.provider === PERSONAL_OPENROUTER_PROVIDER ? "customer" : "jobs" })),
    settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
  });
}

async function updateAiSettings(context) {
  const access = await requireAdmin(context, { scope: "ai_controls" });
  if (access.error) return access.error;
  const body = await readBody(context);
  const settings = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "default_provider" && ["luna", "deepseek", "openrouter"].includes(value)) {
      settings[key] = value;
      continue;
    }
    const number = Number(value);
    if (["monthly_budget_usd", "per_user_daily_limit"].includes(key) &&
      ["string", "number"].includes(typeof value) && String(value).trim() &&
      Number.isFinite(number) && number >= 0 && number <= 100000 &&
      (key !== "per_user_daily_limit" || Number.isInteger(number))) {
      settings[key] = String(number);
      continue;
    }
    throw new AuthError("INVALID_AI_SETTING", 400, "Enter a supported provider or a valid limit.");
  }
  const entries = Object.entries(settings);
  if (!entries.length) throw new AuthError("INVALID_AI_SETTING", 400, "Enter at least one setting.");
  const statements = entries.map(([key, value]) => access.db.prepare(`
    INSERT INTO ai_settings(key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP
  `).bind(key, value, access.admin.email));
  await access.db.batch([...statements, auditStatement(context, access, "ai.settings_update", "ai_settings", "global", settings)]);
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

function protectedAdmin(email) {
  return [SUPER_ADMIN_EMAIL, SERVICE_ADMIN_EMAIL].includes(String(email).toLowerCase());
}

function adminTarget(db, target) {
  return db.prepare(`SELECT email, role, scopes FROM admin_memberships
    WHERE email = ? OR user_id = ? ORDER BY CASE WHEN email = ? THEN 0 ELSE 1 END LIMIT 1`)
    .bind(target.toLowerCase(), target, target.toLowerCase()).first();
}

function adminChangeBlocked(access, target, role) {
  if (protectedAdmin(target.email)) return true;
  return access.admin.service_identity && (target.role === "super_admin" || role === "super_admin");
}

function protectedAdminResponse() {
  return adminJson({ error: "This administrator is protected from this change.", code: "OWNER_PROTECTED" }, 409);
}

async function createAdmin(context) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const body = await readBody(context);
  const email = String(body.email || "").trim().toLowerCase();
  if (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return adminJson({ error: "Valid admin email is required.", code: "BAD_EMAIL" }, 400);
  }
  const role = body.role ?? "admin";
  if (!["admin", "super_admin"].includes(role)) return adminJson({ error: "Select a valid role.", code: "BAD_ROLE" }, 400);
  if (adminChangeBlocked(access, { email }, role)) return protectedAdminResponse();
  const scopes = scopesFor(role, body.scopes);
  const displayName = String(body.display_name || email.split("@")[0]).trim().slice(0, 120);
  const result = await access.db.prepare(`
    INSERT INTO admin_memberships(user_id, email, display_name, role, status, scopes, created_by)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(email) DO NOTHING
  `).bind(`email:${email}`, email, displayName, role, scopes, access.admin.email).run();
  if (!result.meta.changes) return adminJson({ error: "This administrator already exists. Edit their existing record.", code: "ADMIN_EXISTS" }, 409);
  await audit(context, access, "admin.create", "admin", email, { role, scopes: JSON.parse(scopes) });
  return adminJson({ ok: true, email, role }, 201);
}

async function updateAdmin(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const body = await readBody(context);
  const { role, status } = body;
  if (!["admin", "super_admin"].includes(role) || !["active", "revoked"].includes(status)) {
    return adminJson({ error: "Select a valid role and status.", code: "BAD_ADMIN_UPDATE" }, 400);
  }
  const target = await adminTarget(access.db, decodeURIComponent(id));
  if (!target) return adminJson({ error: "Administrator was not found.", code: "ADMIN_NOT_FOUND" }, 404);
  if (adminChangeBlocked(access, target, role)) return protectedAdminResponse();
  const scopes = scopesFor(role, body.scopes, target.role === role ? target.scopes : undefined);
  const result = await access.db.prepare(`
    UPDATE admin_memberships SET role = ?, status = ?, scopes = ?, revoked_at = CASE WHEN ? = 'revoked' THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE email = ? AND role = ? AND scopes = ?
  `).bind(role, status, scopes, status, target.email, target.role, target.scopes).run();
  if (!result.meta.changes) return adminJson({ error: "Administrator changed. Refresh and try again.", code: "ADMIN_CHANGED" }, 409);
  await audit(context, access, "admin.update", "admin", target.email, { role, status, scopes: JSON.parse(scopes) });
  return adminJson({ ok: true, id: target.email, role, status });
}

async function deleteAdmin(context, id) {
  const access = await requireAdmin(context, { superAdmin: true });
  if (access.error) return access.error;
  const target = await adminTarget(access.db, decodeURIComponent(id));
  if (!target) return adminJson({ error: "Administrator was not found.", code: "ADMIN_NOT_FOUND" }, 404);
  if (adminChangeBlocked(access, target)) return protectedAdminResponse();
  const result = await access.db.prepare("DELETE FROM admin_memberships WHERE email = ? AND role = ?").bind(target.email, target.role).run();
  if (!result.meta.changes) return adminJson({ error: "Administrator changed. Refresh and try again.", code: "ADMIN_CHANGED" }, 409);
  await audit(context, access, "admin.delete", "admin", target.email, {});
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

async function usageSummary(db, since = "") {
  const row = await db.prepare(`
    SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(cost_usd), 0) AS cost_usd,
      COUNT(CASE WHEN provider = '${PERSONAL_OPENROUTER_PROVIDER}' AND (input_tokens > 0 OR output_tokens > 0) THEN 1 END) AS personal_metered_requests,
      COALESCE(SUM(CASE WHEN provider = '${PERSONAL_OPENROUTER_PROVIDER}' THEN input_tokens ELSE 0 END), 0) AS personal_input_tokens,
      COALESCE(SUM(CASE WHEN provider = '${PERSONAL_OPENROUTER_PROVIDER}' THEN output_tokens ELSE 0 END), 0) AS personal_output_tokens
    FROM ai_usage WHERE created_at >= ?
  `).bind(since).first();
  return {
    requests: Number(row?.requests || 0),
    input_tokens: Number(row?.input_tokens || 0),
    output_tokens: Number(row?.output_tokens || 0),
    cost_usd: Number(row?.cost_usd || 0),
    personal_metered_requests: Number(row?.personal_metered_requests || 0),
    personal_comparison_usd: estimateCost("deepseek-flash", Number(row?.personal_input_tokens || 0), Number(row?.personal_output_tokens || 0)),
  };
}

async function paymentSummary(db) {
  const totals = await paymentTotals(db);
  return {
    ...totals, total: totals.records, gross_sar: totals.gross_halalas / 100,
    refunded_sar: totals.refunded_halalas / 100, voided_charge_sar: totals.voided_charge_halalas / 100,
    net_sar: totals.verified_halalas / 100, manual_sar: totals.manual_halalas / 100,
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
  try {
    const body = await context.request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch { return {}; }
}

function cleanChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function cleanDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

const STANDARD_SCOPES = ["reports", "users", "employers", "jobs", "support", "subscribers", "billing", "accounting", "ai", "ai_controls", "marketing", "sources"];
const LEGACY_SCOPES = '["users","subscribers","jobs","sources","ai","reports"]';

function scopesFor(role, selection, existing) {
  if (role === "super_admin") return JSON.stringify([...STANDARD_SCOPES, "owner", "admins", "audit", "settings"]);
  if (selection === undefined) return existing || LEGACY_SCOPES;
  if (!Array.isArray(selection) || selection.some((scope) => !STANDARD_SCOPES.includes(scope))) {
    throw new AuthError("BAD_SCOPES", 400, "Choose valid administrator permissions.");
  }
  const scopes = [...new Set(selection)];
  if (scopes.includes("ai_controls") && !scopes.includes("ai")) scopes.push("ai");
  return JSON.stringify(scopes);
}
