import { authConfig, AuthError, clearSessionCookie, json, readActiveSession } from "./_auth.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  try {
    const active = await readActiveSession(context.request, context.env || {});
    return json({
      authenticated: Boolean(active), user: active?.session || null, account: active?.account || null,
      google_configured: Boolean(config.clientId && config.clientSecret && config.cookieSecret),
    });
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    return json({ authenticated: false, user: null, account: null, error: error.message, code: error.code,
      google_configured: Boolean(config.clientId && config.clientSecret && config.cookieSecret) },
    error.status, error.status < 500 ? { "Set-Cookie": clearSessionCookie() } : {});
  }
}
