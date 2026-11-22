import { authConfig, json, returnCookie, stateCookie, termsCookie } from "../_auth.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  const requestUrl = new URL(context.request.url);
  const hostname = requestUrl.hostname.toLowerCase();
  if (hostname === "jobs-wasfai.pages.dev" || hostname.endsWith(".jobs-wasfai.pages.dev")) {
    // Start on the same host that will receive the Google callback; otherwise
    // the short-lived state cookie is lost when Google redirects to production.
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://jobs.wasfai.com${requestUrl.pathname}${requestUrl.search}`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (!config.clientId || !config.clientSecret || !config.cookieSecret) {
    return json({ error: "Google sign-in is not fully configured.", code: "GOOGLE_OAUTH_NOT_CONFIGURED" }, 503);
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
  const next = safeReturnPath(requestUrl.searchParams.get("next") || "");
  if (next) headers.append("Set-Cookie", returnCookie(next));
  if (requestUrl.searchParams.get("terms") === "1") headers.append("Set-Cookie", termsCookie());
  return new Response(null, { status: 302, headers });
}

function safeReturnPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  if (/[\r\n]/.test(value)) return "";
  return value.slice(0, 160);
}
