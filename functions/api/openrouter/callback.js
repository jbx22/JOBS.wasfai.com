import { pkceChallenge } from "../auth/_auth.js";
import { accountAction, codeVerifier, encryptCredential, sessionFingerprint } from "./_shared.js";

function finish(outcome) {
  return new Response(null, { status: 303, headers: {
    Location: "/account?openrouter=" + outcome,
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  } });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const params = url.searchParams;
  const state = url.pathname.match(/^\/api\/openrouter\/callback\/([A-Za-z0-9_-]{43})\/?$/)?.[1];
  if (!state) return finish("expired");
  const response = await accountAction(context, null, async (db, owner) => {
    const fingerprint = await sessionFingerprint(context.request);
    if (!fingerprint) return finish("expired");
    const hash = await pkceChallenge(state);
    // Claim before the remote exchange. A duplicate delivery never spends the same code twice.
    const claim = await db.prepare(`UPDATE user_openrouter_connections SET session_hash='', expires_at=0
      WHERE user_id=? AND state_hash=? AND session_hash=? AND expires_at>?`)
      .bind(owner, hash, fingerprint, Date.now()).run();
    if (!claim.meta.changes) return finish("expired");
    if (params.has("error")) return finish(params.get("error") === "access_denied" ? "cancelled" : "error");
    const code = params.get("code");
    if (!code || code.length > 4096) return finish("error");

    const verifier = await codeVerifier(context.env, owner, state, fingerprint);
    const result = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!result.ok) return finish("error");
    const { key } = await result.json();
    if (typeof key !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(key)) return finish("error");

    const saved = await db.prepare(`UPDATE user_openrouter_connections SET credential=?, connected_at=?, state_hash=''
      WHERE user_id=? AND state_hash=? AND session_hash=''`)
      .bind(await encryptCredential(context.env, owner, key), new Date().toISOString(), owner, hash).run();
    return finish(saved.meta.changes ? "connected" : "expired");
  });
  // Callback URLs can contain an authorization code. Always leave the browser on a clean account URL.
  return response.status === 303 ? response : finish([401, 403].includes(response.status) ? "expired" : "error");
}
