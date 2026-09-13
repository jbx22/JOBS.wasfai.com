import { getAuthenticatedUser, json } from "./_state.js";
import { getJobDb } from "./_db.js";

/**
 * Rolling-minute counter upsert. The `requests` reference in the `DO UPDATE
 * SET` clause MUST be table-qualified: PostgreSQL rejects a bare self-reference
 * as ambiguous (`column reference "requests" is ambiguous`) because the name
 * resolves against both the target row and the special `excluded` row. SQLite/
 * D1 accept either form. See test/upsert-compat.test.mjs.
 */
export const RATE_LIMIT_UPSERT_SQL = `INSERT INTO api_rate_limits (user_id, route, window_start, requests)
     VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(user_id, route, window_start) DO UPDATE SET requests = api_rate_limits.requests + 1`;

const RATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS api_rate_limits (
  user_id TEXT NOT NULL,
  route TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, route, window_start)
)`;

/** Require an account and enforce a small, per-account rolling minute budget. */
export async function requireProtectedRequest(context, route, limit = 12) {
  const user = await getAuthenticatedUser(context);
  if (!user) return { error: json({ error: "Sign in is required for this action.", code: "AUTH_REQUIRED" }, 401) };
  const db = getJobDb(context.env);
  if (!db) return { error: json({ error: "Account storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503) };

  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  await db.prepare(RATE_TABLE_SQL).run();
  await db.prepare("DELETE FROM api_rate_limits WHERE window_start < ?1").bind(windowStart - 172800000).run();
  await db.prepare(RATE_LIMIT_UPSERT_SQL).bind(user.sub, route, windowStart).run();
  const row = await db.prepare(
    "SELECT requests FROM api_rate_limits WHERE user_id = ?1 AND route = ?2 AND window_start = ?3",
  ).bind(user.sub, route, windowStart).first();
  if (Number(row?.requests || 0) > limit) {
    return { error: json({ error: "Too many requests. Please wait a minute and try again.", code: "RATE_LIMITED" }, 429, { "Retry-After": "60" }) };
  }
  return { user };
}
