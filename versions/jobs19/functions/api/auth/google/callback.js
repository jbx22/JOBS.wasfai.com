import { authConfig, clearStateCookie, json, parseCookies, sessionCookie } from "../_auth.js";

export async function onRequestGet(context) {
  const request = context.request;
  const config = authConfig(context.env || {}, request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookies = parseCookies(request);

  if (!config.clientId || !config.clientSecret || !config.cookieSecret) {
    return json({ error: "Google OAuth credentials are missing.", code: "GOOGLE_OAUTH_NOT_CONFIGURED" }, 503);
  }
  if (!code || !state || state !== cookies.jobs_oauth_state) {
    return json({ error: "Invalid OAuth state.", code: "BAD_OAUTH_STATE" }, 400, { "Set-Cookie": clearStateCookie() });
  }

  const redirectUri = `${config.origin}/api/auth/google/callback`;
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!token.ok) return json({ error: "Google token exchange failed.", code: "TOKEN_EXCHANGE_FAILED" }, 502);
  const tokenData = await token.json();
  const userinfo = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { "Authorization": `Bearer ${tokenData.access_token}` },
  });
  if (!userinfo.ok) return json({ error: "Google userinfo failed.", code: "USERINFO_FAILED" }, 502);
  const user = await userinfo.json();
  const cookie = await sessionCookie(
    {
      provider: "google",
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
    },
    config.cookieSecret,
  );
  return new Response(null, {
    status: 302,
    headers: [
      ["Location", "/account"],
      ["Set-Cookie", clearStateCookie()],
      ["Set-Cookie", cookie],
    ],
  });
}
