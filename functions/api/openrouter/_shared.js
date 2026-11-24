import { getJobDb } from "../_db.js";
import { getAuthenticatedUser, json } from "../_state.js";
import { requireProtectedRequest } from "../_security.js";
import { AuthError, parseCookies, pkceChallenge } from "../auth/_auth.js";

const encoder = new TextEncoder();
const domain = encoder.encode("jobs.wasfai.com/openrouter/v1");
const FLOW_COOKIE = "__Host-jobs_openrouter_flow";
export const FLOW_SECONDS = 600;

const schema = `CREATE TABLE IF NOT EXISTS user_openrouter_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credential TEXT NOT NULL DEFAULT '', connected_at TEXT,
  state_hash TEXT NOT NULL DEFAULT '', session_hash TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0
)`;

async function connectionDb(env) {
  const db = getJobDb(env);
  if (!db) throw new Error("Connection storage unavailable.");
  await db.prepare(schema).run();
  return db;
}

export async function accountAction(context, route, handler) {
  try {
    const access = route ? await requireProtectedRequest(context, route, 10)
      : { user: await getAuthenticatedUser(context) };
    if (access.error) return access.error;
    if (!access.user) return json({ code: "AUTH_REQUIRED", error: "Sign in to manage your connection." }, 401);
    return await handler(await connectionDb(context.env), access.user.sub);
  } catch (error) {
    if (error instanceof AuthError) return json({ code: error.code, error: error.message }, error.status);
    return json({ code: "CONNECTION_UNAVAILABLE", error: "The connection is temporarily unavailable." }, 503);
  }
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

export function randomNonce() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function flowCookie(value) {
  return `${FLOW_COOKIE}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${FLOW_SECONDS}`;
}

export async function sessionFingerprint(request, nonce = parseCookies(request)[FLOW_COOKIE]) {
  const session = parseCookies(request).jobs_session;
  if (!session || !/^[A-Za-z0-9_-]{43}$/.test(nonce || "")) return null;
  return pkceChallenge(JSON.stringify([session, nonce]));
}

async function keyMaterial(env) {
  if (!env.AUTH_COOKIE_SECRET) throw new Error("Connection encryption is unavailable.");
  return crypto.subtle.importKey("raw", encoder.encode(env.AUTH_COOKIE_SECRET), "HKDF", false, ["deriveBits", "deriveKey"]);
}

function parameters(parts) {
  return { name: "HKDF", hash: "SHA-256", salt: domain, info: encoder.encode(JSON.stringify(parts)) };
}

// Both the per-flow nonces and the verified session are bound into the verifier.
// Only the server can derive it. Neither the browser nor storage ever needs to hold it.
export async function codeVerifier(env, owner, state, fingerprint) {
  const params = parameters(["oauth-pkce", owner, state, fingerprint]);
  return base64url(await crypto.subtle.deriveBits(params, await keyMaterial(env), 256));
}

async function cipherKey(env, owner) {
  return crypto.subtle.deriveKey(parameters(["credential", owner]), await keyMaterial(env),
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(env, owner, credential) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cipherKey(env, owner), encoder.encode(credential));
  return `v1.${base64url(iv)}.${base64url(encrypted)}`;
}

function reconnectRequired() {
  return Object.assign(new Error("Reconnect your OpenRouter account."), { code: "OPENROUTER_RECONNECT_REQUIRED" });
}

// Used only by authenticated server-side inference. Storage or decryption errors
// must propagate so a personal request cannot accidentally use another payer.
export async function getUserOpenRouterKey(env, owner) {
  if (typeof owner !== "string" || !owner) throw new Error("An account is required.");
  const db = await connectionDb(env);
  const row = await db.prepare("SELECT credential FROM user_openrouter_connections WHERE user_id=?").bind(owner).first();
  if (!row?.credential) return null;
  const [version, iv, body, extra] = row.credential.split(".");
  if (version !== "v1" || !iv || !body || extra !== undefined) throw reconnectRequired();
  const key = await cipherKey(env, owner);
  try {
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, key, decode(body));
    return new TextDecoder("utf-8", { fatal: true }).decode(clear);
  } catch {
    throw reconnectRequired();
  }
}
