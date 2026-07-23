import { authConfig, readSession } from "./auth/_auth.js";
import { json } from "./_state.js";

export const SUPER_ADMIN_EMAIL = "jabosaag@gmail.com";

const ADMIN_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS admin_memberships (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('admin', 'super_admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
    scopes TEXT NOT NULL DEFAULT '["users","subscribers","jobs","sources","ai","reports"]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL DEFAULT '',
    last_active_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'trial',
    ai_monthly_limit_usd REAL NOT NULL DEFAULT 5,
    current_period_end TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    route TEXT NOT NULL DEFAULT '',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ai_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL DEFAULT ''
  )`,
];

export async function ensureAdminSchema(db) {
  for (const sql of ADMIN_SCHEMA) await db.prepare(sql).run();
  await db.prepare(`
    INSERT INTO admin_memberships (user_id, email, display_name, role, status, scopes, created_by)
    VALUES ('google:${SUPER_ADMIN_EMAIL}', ?, 'Jaber Abosaag', 'super_admin', 'active',
      '["owner","admins","users","subscribers","jobs","sources","ai","billing","audit","settings"]', 'system')
    ON CONFLICT(email) DO UPDATE SET role='super_admin', status='active', revoked_at=NULL
  `).bind(SUPER_ADMIN_EMAIL).run();
}

export async function requireAdmin(context, options = {}) {
  const db = context.env?.JOBS_DB;
  if (!db) return { error: json({ error: "Admin storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503) };
  const config = authConfig(context.env || {}, context.request);
  const session = await readSession(context.request, config.cookieSecret);
  if (!session) return { error: json({ error: "Sign in with Google to access admin.", code: "AUTH_REQUIRED" }, 401) };
  await ensureAdminSchema(db);
  const email = String(session.email || "").trim().toLowerCase();
  if (email === SUPER_ADMIN_EMAIL) {
    await db.prepare(`
      INSERT INTO admin_memberships (user_id, email, display_name, role, status, scopes, created_by, last_active_at)
      VALUES (?, ?, ?, 'super_admin', 'active',
        '["owner","admins","users","subscribers","jobs","sources","ai","billing","audit","settings"]', 'system', CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET user_id=excluded.user_id, display_name=excluded.display_name,
        role='super_admin', status='active', revoked_at=NULL, last_active_at=CURRENT_TIMESTAMP
    `).bind(session.sub, email, session.name || "Jaber Abosaag").run();
  }
  const member = await db.prepare(
    "SELECT user_id, email, display_name, role, status, scopes, last_active_at FROM admin_memberships WHERE (user_id = ? OR email = ?) AND status = 'active'",
  ).bind(session.sub, email).first();
  if (!member) return { error: json({ error: "This Google account is not an active admin.", code: "ADMIN_REQUIRED" }, 403) };
  if (options.superAdmin && member.role !== "super_admin") {
    return { error: json({ error: "Super admin permission is required.", code: "SUPER_ADMIN_REQUIRED" }, 403) };
  }
  await db.prepare("UPDATE admin_memberships SET user_id = ?, display_name = ?, last_active_at = CURRENT_TIMESTAMP WHERE email = ?")
    .bind(session.sub, session.name || member.display_name || "", email).run();
  return { db, session, admin: { ...member, user_id: session.sub, email, display_name: session.name || member.display_name || "" } };
}

export async function audit(context, access, action, resourceType, resourceId = "", metadata = {}) {
  try {
    await ensureAdminSchema(access.db);
    await access.db.prepare(`
      INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, resource_type, resource_id, metadata, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      access.admin.user_id || access.session.sub || "",
      access.admin.email || access.session.email || "",
      access.admin.role || "",
      action,
      resourceType,
      String(resourceId || ""),
      JSON.stringify(metadata || {}),
      context.request.headers.get("CF-Connecting-IP") || "",
      String(context.request.headers.get("User-Agent") || "").slice(0, 240),
    ).run();
  } catch {
    // Admin actions should not fail only because audit persistence is temporarily unavailable.
  }
}

export function adminJson(payload, status = 200) {
  return json(payload, status);
}
