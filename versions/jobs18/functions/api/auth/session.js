import { authConfig, json, readSession } from "./_auth.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  const session = await readSession(context.request, config.cookieSecret);
  return json({ authenticated: Boolean(session), user: session || null, google_configured: Boolean(config.clientId) });
}
