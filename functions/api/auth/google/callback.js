import { authConfig, clearReturnCookie, clearStateCookie, clearTermsCookie, json, parseCookies, sessionCookie } from "../_auth.js";

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
  let firstLogin = false;
  let account = null;
  if (context.env?.JOBS_DB) {
    await context.env.JOBS_DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
        picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
      )
    `).run();
    const existing = await context.env.JOBS_DB.prepare(
      "SELECT onboarding_completed_at FROM users WHERE id = ?",
    ).bind(user.sub).first();
    firstLogin = !existing?.onboarding_completed_at;
    const acceptedTerms = cookies.jobs_terms_consent === "1";
    await context.env.JOBS_DB.prepare(`
      INSERT INTO users (id, email, display_name, picture_url, provider, accepted_terms_at)
      VALUES (?, ?, ?, ?, 'google', CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT(id) DO UPDATE SET
        email=excluded.email, display_name=excluded.display_name, picture_url=excluded.picture_url,
        last_login_at=CURRENT_TIMESTAMP, account_status='active',
        accepted_terms_at=COALESCE(users.accepted_terms_at, excluded.accepted_terms_at)
    `).bind(user.sub, user.email || "", user.name || "", user.picture || "", acceptedTerms ? 1 : 0).run();
    account = await context.env.JOBS_DB.prepare(
      "SELECT account_status FROM users WHERE id = ?",
    ).bind(user.sub).first();
  }
  const cookie = await sessionCookie(
    {
      provider: "google",
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      account_status: account?.account_status || "active",
    },
    config.cookieSecret,
  );
  return new Response(null, {
    status: 302,
    headers: [
      ["Location", safeReturnPath(cookies.jobs_oauth_return) || (firstLogin ? "/onboarding" : "/account")],
      ["Set-Cookie", clearStateCookie()],
      ["Set-Cookie", clearReturnCookie()],
      ["Set-Cookie", clearTermsCookie()],
      ["Set-Cookie", cookie],
    ],
  });
}

function safeReturnPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  if (/[\r\n]/.test(value)) return "";
  return value.slice(0, 160);
}
