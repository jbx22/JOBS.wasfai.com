import { getJobDb } from "../_db.js";

const COOKIE_NAME = "jobs_session";
const STATE_COOKIE = "jobs_oauth_state";
const RETURN_COOKIE = "jobs_oauth_return";
const TERMS_COOKIE = "jobs_terms_consent";

export function authConfig(env, request) {
  const url = new URL(request.url);
  const configuredOrigin = String(env.AUTH_REDIRECT_ORIGIN || "").replace(/\/+$/, "");
  const productionOrigin = "https://jobs.wasfai.com";
  return {
    origin: configuredOrigin || (env.ENVIRONMENT === "production" ? productionOrigin : url.origin),
    clientId: String(env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(env.GOOGLE_CLIENT_SECRET || "").trim(),
    cookieSecret: env.AUTH_COOKIE_SECRET || "",
  };
}

export function parseCookies(request) {
  const cookies = {};
  for (const part of String(request.headers.get("Cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    try { cookies[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* Ignore malformed cookies. */ }
  }
  return cookies;
}

export function stateCookie(value) {
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export function returnCookie(value) {
  return `${RETURN_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export function clearStateCookie() {
  return `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function clearReturnCookie() {
  return `${RETURN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function termsCookie() {
  return `${TERMS_COOKIE}=1; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export function clearTermsCookie() {
  return `${TERMS_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function sessionCookie(payload, secret) {
  const value = await signSession(payload, secret);
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export async function readSession(request, secret) {
  try {
    if (!secret) return null;
    const value = parseCookies(request)[COOKIE_NAME];
    if (!value) return null;
    const [body, signature, extra] = value.split(".");
    if (!body || !signature || extra) return null;
    const expected = await hmac(body, secret);
    if (!constantTimeEqual(signature, expected)) return null;
    const payload = JSON.parse(decodeSessionBody(body));
    if (!payload || typeof payload !== "object" || typeof payload.sub !== "string" || !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function signSession(payload, secret) {
  if (!secret) throw new Error("Session signing is not configured.");
  const bytes = new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 604800 }));
  const body = btoaUrl(String.fromCharCode(...bytes));
  return `${body}.${await hmac(body, secret)}`;
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoaUrl(String.fromCharCode(...new Uint8Array(signature)));
}

function btoaUrl(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function atobUrl(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", ...extraHeaders },
  });
}

function decodeSessionBody(body) {
  const binary = atobUrl(body);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    // Compatibility with pre-existing Latin-1 sessions.
    return binary;
  }
}

export class AuthError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export const USERS_SCHEMA = `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
  picture_url TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT 'google',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  account_status TEXT NOT NULL DEFAULT 'active', accepted_terms_at TEXT, onboarding_completed_at TEXT
)`;

export async function readActiveSession(request, env = {}) {
  const config = authConfig(env, request);
  const session = await readSession(request, config.cookieSecret);
  if (!session) return null;
  const db = getJobDb(env);
  if (!db) throw new AuthError("STORAGE_NOT_CONFIGURED", 503, "Account storage is unavailable.");
  let account;
  try {
    account = await db.prepare(
      "SELECT id, email, display_name, picture_url, provider, account_status, created_at, last_login_at, accepted_terms_at, onboarding_completed_at FROM users WHERE id = ?",
    ).bind(session.sub).first();
  } catch {
    throw new AuthError("ACCOUNT_STORAGE_UNAVAILABLE", 503, "Account verification is temporarily unavailable.");
  }
  if (!account) throw new AuthError("AUTH_REQUIRED", 401, "Sign in again to verify your account.");
  if (account.account_status !== "active") throw new AuthError("ACCOUNT_RESTRICTED", 403, "This account is restricted.");
  return {
    session: { ...session, email: account.email, name: account.display_name, picture: account.picture_url, account_status: account.account_status },
    account,
  };
}

export function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.length > 160) return "";
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return "";
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return ""; }
  if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "";
  const resolved = new URL(value, "https://jobs.wasfai.com");
  return resolved.origin === "https://jobs.wasfai.com" ? value : "";
}

export function pkceCookie(value) {
  return "jobs_oauth_pkce=" + encodeURIComponent(value) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600";
}

export function clearPkceCookie() {
  return "jobs_oauth_pkce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export function oauthCleanupHeaders() {
  const headers = new Headers({ "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" });
  for (const cookie of [clearStateCookie(), clearReturnCookie(), clearTermsCookie(), clearPkceCookie()]) headers.append("Set-Cookie", cookie);
  return headers;
}

export async function pkceChallenge(verifier) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoaUrl(String.fromCharCode(...new Uint8Array(bytes)));
}
