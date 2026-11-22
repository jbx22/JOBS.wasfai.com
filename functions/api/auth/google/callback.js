import { authConfig, clearSessionCookie, oauthCleanupHeaders, parseCookies, safeReturnPath, sessionCookie, USERS_SCHEMA } from "../_auth.js";
import { getJobDb } from "../../_db.js";

const GOOGLE_ERROR_CODES = new Set([
  "invalid_client", "invalid_grant", "invalid_request", "unauthorized_client",
  "invalid_token", "insufficient_scope", "server_error", "temporarily_unavailable",
]);

function logGoogleRejection(stage, status, payload) {
  const reason = GOOGLE_ERROR_CODES.has(payload?.error) ? payload.error : "unclassified";
  console.warn("Google OAuth upstream rejection", stage, status, reason);
}

async function fetchGoogleJson(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  } finally {
    clearTimeout(timeout);
  }
}

function failure(code, status, message, browserRetry) {
  const headers = oauthCleanupHeaders();
  headers.append("Set-Cookie", clearSessionCookie());
  if (browserRetry) {
    headers.set("Location", browserRetry);
    return new Response(null, { status: 303, headers });
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ error: message, code }), { status, headers });
}

export async function onRequestGet(context) {
  const request = context.request;
  const config = authConfig(context.env || {}, request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookies = parseCookies(request);
  const params = new URLSearchParams({ oauth_retry: "1" });
  const next = safeReturnPath(cookies.jobs_oauth_return);
  if (next) params.set("next", next);
  const browserRetry = request.headers.get("Accept")?.includes("text/html") ? `/login?${params}` : "";

  if (!config.clientId || !config.clientSecret || !config.cookieSecret) {
    return failure("GOOGLE_OAUTH_NOT_CONFIGURED", 503, "Google OAuth is not configured.");
  }
  if (!state || state !== cookies.jobs_oauth_state) {
    return failure("BAD_OAUTH_STATE", 400, "Invalid or expired Google sign-in. Please try again.", browserRetry);
  }
  if (url.searchParams.has("error")) {
    console.info("Google OAuth authorization did not complete", url.searchParams.get("error") === "access_denied" ? "access_denied" : "other");
    return failure("GOOGLE_OAUTH_CANCELLED", 400, "Google sign-in was cancelled. Please try again.", browserRetry);
  }
  if (!code || !/^[a-zA-Z0-9._~-]{43,128}$/.test(cookies.jobs_oauth_pkce || "")) {
    return failure("BAD_OAUTH_STATE", 400, "Invalid or expired Google sign-in. Please try again.", browserRetry);
  }
  const db = getJobDb(context.env);
  if (!db) return failure("STORAGE_NOT_CONFIGURED", 503, "Account storage is unavailable.");

  let user;
  let stage = "token";
  try {
    const token = await fetchGoogleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.origin + "/api/auth/google/callback",
        grant_type: "authorization_code", code_verifier: cookies.jobs_oauth_pkce,
      }).toString(),
    });
    if (!token.ok) {
      logGoogleRejection(stage, token.status, token.data);
      return failure("TOKEN_EXCHANGE_FAILED", 502, "Google sign-in could not be completed.", browserRetry);
    }
    const accessToken = token.data?.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      console.warn("Google OAuth upstream missing access token");
      return failure("TOKEN_EXCHANGE_FAILED", 502, "Google sign-in could not be completed.", browserRetry);
    }
    stage = "userinfo";
    const userinfo = await fetchGoogleJson("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!userinfo.ok) {
      logGoogleRejection(stage, userinfo.status, userinfo.data);
      return failure("USERINFO_FAILED", 502, "Google account verification failed.", browserRetry);
    }
    user = userinfo.data;
    if (typeof user?.sub !== "string" || !user.sub || typeof user.email !== "string" || !user.email || user.email_verified !== true) {
      return failure("GOOGLE_IDENTITY_INVALID", 403, "A verified Google email address is required.");
    }
  } catch (error) {
    const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout"
      : error?.name === "TypeError" ? "request_type_error" : "unavailable";
    console.warn("Google OAuth upstream request failed", stage, reason);
    return failure("GOOGLE_PROVIDER_UNAVAILABLE", 502, "Google sign-in is temporarily unavailable. Please try again.", browserRetry);
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
  headers.set("Location", next || (account.onboarding_completed_at ? "/account" : "/onboarding"));
  headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}
