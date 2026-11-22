import { authConfig, clearSessionCookie, json, readSession } from "./_auth.js";
import { getJobDb } from "../_db.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  const session = await readSession(context.request, config.cookieSecret);
  const db = getJobDb(context.env);
  const googleConfigured = Boolean(config.clientId && config.clientSecret && config.cookieSecret && db);
  let account = null;
  if (session && db) {
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
          picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
        )
      `).run();
      account = await db.prepare(
        "SELECT created_at, last_login_at, account_status, accepted_terms_at, onboarding_completed_at FROM users WHERE id = ?",
      ).bind(session.sub).first();
    } catch {
      return json({ error: "Account storage is temporarily unavailable.", code: "ACCOUNT_STORAGE_UNAVAILABLE" }, 503);
    }
  }
  const authenticated = Boolean(session && account?.account_status === "active");
  return json(
    { authenticated, user: authenticated ? session : null, account: authenticated ? account : null, google_configured: googleConfigured },
    200,
    session && !authenticated ? { "Set-Cookie": clearSessionCookie() } : {},
  );
}
