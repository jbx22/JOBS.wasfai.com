import { authConfig, json, stateCookie, termsCookie } from "../_auth.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  const requestUrl = new URL(context.request.url);
  if (!config.clientId) {
    return json({ error: "Google OAuth is not configured.", code: "GOOGLE_OAUTH_NOT_CONFIGURED" }, 503);
  }
  const state = crypto.randomUUID();
  const redirectUri = `${config.origin}/api/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  const headers = new Headers({ "Location": url.toString() });
  headers.append("Set-Cookie", stateCookie(state));
  if (requestUrl.searchParams.get("terms") === "1") headers.append("Set-Cookie", termsCookie());
  return new Response(null, { status: 302, headers });
}
