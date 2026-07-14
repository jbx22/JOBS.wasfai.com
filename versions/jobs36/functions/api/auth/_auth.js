const COOKIE_NAME = "jobs_session";
const STATE_COOKIE = "jobs_oauth_state";

export function authConfig(env, request) {
  const url = new URL(request.url);
  return {
    origin: env.AUTH_REDIRECT_ORIGIN || url.origin,
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    cookieSecret: env.AUTH_COOKIE_SECRET || "",
  };
}

export function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.get("Cookie") || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function stateCookie(value) {
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export function clearStateCookie() {
  return `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function sessionCookie(payload, secret) {
  const value = await signSession(payload, secret);
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`;
}

export async function readSession(request, secret) {
  if (!secret) return null;
  const value = parseCookies(request)[COOKIE_NAME];
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body, secret);
  if (!constantTimeEqual(signature, expected)) return null;
  const payload = JSON.parse(atobUrl(body));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function signSession(payload, secret) {
  const body = btoaUrl(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 604800 }));
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
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}
