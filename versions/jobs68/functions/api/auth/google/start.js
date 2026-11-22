import { authConfig, clearReturnCookie, clearTermsCookie, json, pkceChallenge, pkceCookie, returnCookie, safeReturnPath, stateCookie, termsCookie } from "../_auth.js";
import { getJobDb } from "../../_db.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  const requestUrl = new URL(context.request.url);
  if (!config.clientId || !config.clientSecret || !config.cookieSecret) {
    const missing = [];
    if (!config.clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!config.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!config.cookieSecret) missing.push("AUTH_COOKIE_SECRET");
    console.warn("Google OAuth configuration is incomplete", missing.join(", "));
    return json({ error: "Google OAuth is not configured.", code: "GOOGLE_OAUTH_NOT_CONFIGURED" }, 503);
  }
  if (!getJobDb(context.env)) {
    return json({ error: "Account storage is unavailable.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  }
  // Host-only state cookies must be set on the same origin as the callback.
  if (requestUrl.origin !== config.origin) {
    return new Response(null, { status: 302, headers: { Location: config.origin + requestUrl.pathname + requestUrl.search, "Cache-Control": "no-store" } });
  }
  const state = crypto.randomUUID();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.origin + "/api/auth/google/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  const headers = new Headers({ Location: url.toString(), "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", stateCookie(state));
  headers.append("Set-Cookie", pkceCookie(verifier));
  const next = safeReturnPath(requestUrl.searchParams.get("next") || "");
  headers.append("Set-Cookie", next ? returnCookie(next) : clearReturnCookie());
  headers.append("Set-Cookie", requestUrl.searchParams.get("terms") === "1" ? termsCookie() : clearTermsCookie());
  return new Response(null, { status: 302, headers });
}
