import { authConfig, json, readSession } from "./_auth.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  const session = await readSession(context.request, config.cookieSecret);
  let account = null;
  if (session && context.env?.JOBS_DB) {
    await context.env.JOBS_DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
        picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
      )
    `).run();
    account = await context.env.JOBS_DB.prepare(
      "SELECT created_at, last_login_at, account_status, accepted_terms_at, onboarding_completed_at FROM users WHERE id = ?",
    ).bind(session.sub).first();
  }
  return json({ authenticated: Boolean(session), user: session || null, account, google_configured: Boolean(config.clientId) });
}
