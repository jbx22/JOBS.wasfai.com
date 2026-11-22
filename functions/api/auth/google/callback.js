import { authConfig, clearSessionCookie, oauthCleanupHeaders, parseCookies, safeReturnPath, sessionCookie, USERS_SCHEMA } from "../_auth.js";
import { getJobDb } from "../../_db.js";

function failure(code, status, message) {
  const headers = oauthCleanupHeaders();
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.append("Set-Cookie", clearSessionCookie());
  return new Response(JSON.stringify({ error: message, code }), { status, headers });
}

export async function onRequestGet(context) {
  const request = context.request;
  const config = authConfig(context.env || {}, request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookies = parseCookies(request);

  if (!config.clientId || !config.clientSecret || !config.cookieSecret) {
    return failure("GOOGLE_OAUTH_NOT_CONFIGURED", 503, "Google OAuth is not configured.");
  }
  if (!state || state !== cookies.jobs_oauth_state) {
    return failure("BAD_OAUTH_STATE", 400, "Invalid or expired Google sign-in. Please try again.");
  }
  if (url.searchParams.has("error")) {
    return failure("GOOGLE_OAUTH_CANCELLED", 400, "Google sign-in was cancelled. Please try again.");
  }
  if (!code || !/^[a-zA-Z0-9._~-]{43,128}$/.test(cookies.jobs_oauth_pkce || "")) {
    return failure("BAD_OAUTH_STATE", 400, "Invalid or expired Google sign-in. Please try again.");
  }
  const db = getJobDb(context.env);
  if (!db) return failure("STORAGE_NOT_CONFIGURED", 503, "Account storage is unavailable.");

  let user;
  try {
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.origin + "/api/auth/google/callback",
        grant_type: "authorization_code", code_verifier: cookies.jobs_oauth_pkce,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!token.ok) return failure("TOKEN_EXCHANGE_FAILED", 502, "Google sign-in could not be completed.");
    const tokenData = await token.json();
    if (typeof tokenData.access_token !== "string" || !tokenData.access_token) {
      return failure("TOKEN_EXCHANGE_FAILED", 502, "Google sign-in could not be completed.");
    }
    const userinfo = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
      signal: AbortSignal.timeout(10000),
    });
    if (!userinfo.ok) return failure("USERINFO_FAILED", 502, "Google account verification failed.");
    user = await userinfo.json();
    if (typeof user.sub !== "string" || !user.sub || typeof user.email !== "string" || !user.email || user.email_verified !== true) {
      return failure("GOOGLE_IDENTITY_INVALID", 403, "A verified Google email address is required.");
    }
  } catch {
    return failure("GOOGLE_PROVIDER_UNAVAILABLE", 502, "Google sign-in is temporarily unavailable. Please try again.");
  }

  let account;
  try {
    await db.prepare(USERS_SCHEMA).run();
    const existing = await db.prepare("SELECT account_status FROM users WHERE id = ?").bind(user.sub).first();
    if (existing && existing.account_status !== "active") {
      return failure("ACCOUNT_RESTRICTED", 403, "This account is restricted.");
    }
    await db.prepare(`
      INSERT INTO users (id, email, display_name, picture_url, provider, accepted_terms_at)
      VALUES (?, ?, ?, ?, 'google', CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT(id) DO UPDATE SET
        email=excluded.email, display_name=excluded.display_name, picture_url=excluded.picture_url,
        last_login_at=CURRENT_TIMESTAMP,
        accepted_terms_at=COALESCE(users.accepted_terms_at, excluded.accepted_terms_at)
      WHERE users.account_status = 'active'
    `).bind(user.sub, user.email.toLowerCase(), user.name || "", user.picture || "", cookies.jobs_terms_consent === "1" ? 1 : 0).run();
    account = await db.prepare("SELECT account_status, onboarding_completed_at FROM users WHERE id = ?").bind(user.sub).first();
    if (!account) return failure("ACCOUNT_PERSISTENCE_FAILED", 503, "Your account could not be verified.");
    // Recheck after the write to cover a concurrent admin restriction.
    if (account.account_status !== "active") return failure("ACCOUNT_RESTRICTED", 403, "This account is restricted.");
  } catch {
    return failure("ACCOUNT_STORAGE_UNAVAILABLE", 503, "Account verification is temporarily unavailable.");
  }
  const cookie = await sessionCookie({
    provider: "google", sub: user.sub, email: user.email.toLowerCase(),
    name: user.name || "", picture: user.picture || "", account_status: account.account_status,
  }, config.cookieSecret);
  const headers = oauthCleanupHeaders();
  headers.set("Location", safeReturnPath(cookies.jobs_oauth_return) || (account.onboarding_completed_at ? "/account" : "/onboarding"));
  headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
