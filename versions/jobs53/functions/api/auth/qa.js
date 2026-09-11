import { authConfig, json, sessionCookie } from "./_auth.js";

export async function onRequestPost(context) {
  const supplied = context.request.headers.get("X-QA-Auth-Token") || "";
  const expected = context.env?.QA_AUTH_TOKEN || "";
  if (!expected || supplied.length !== expected.length || !constantTimeEqual(supplied, expected)) {
    return json({ error: "Not found.", code: "NOT_FOUND" }, 404);
  }
  if (!context.env?.JOBS_DB) return json({ error: "Account storage is unavailable.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const user = {
    sub: "qa-production-release-gate",
    email: "qa-release@jobs.wasfai.com",
    name: "Production QA",
    provider: "qa",
    account_status: "active",
  };
  await context.env.JOBS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
      picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
    )
  `).run();
  await context.env.JOBS_DB.prepare(`
    INSERT INTO users (id, email, display_name, provider, accepted_terms_at, onboarding_completed_at)
    VALUES (?, ?, ?, 'qa', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET last_login_at=CURRENT_TIMESTAMP, account_status='active'
  `).bind(user.sub, user.email, user.name).run();
  const config = authConfig(context.env || {}, context.request);
  return json({ authenticated: true, user }, 200, {
    "Set-Cookie": await sessionCookie(user, config.cookieSecret),
  });
}

function constantTimeEqual(a, b) {
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
