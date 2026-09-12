import { authConfig, json, readSession } from "./_auth.js";
import { getJobDb } from "../_db.js";

export async function onRequestPost(context) {
  const config = authConfig(context.env || {}, context.request);
  const session = await readSession(context.request, config.cookieSecret);
  if (!session) return json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, 401);
  if (!getJobDb(context.env)) return json({ error: "Account storage is unavailable.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  await getJobDb(context.env).prepare(
    "UPDATE users SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).bind(session.sub).run();
  return json({ ok: true });
}
