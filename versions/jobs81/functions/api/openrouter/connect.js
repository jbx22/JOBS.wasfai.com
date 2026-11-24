import { json } from "../_state.js";
import { authConfig, pkceChallenge } from "../auth/_auth.js";
import { accountAction, codeVerifier, FLOW_SECONDS, flowCookie, randomNonce, sessionFingerprint } from "./_shared.js";

export function onRequestPost(context) {
  return accountAction(context, "openrouter-connect", async (db, owner) => {
    const state = randomNonce();
    const nonce = randomNonce();
    const fingerprint = await sessionFingerprint(context.request, nonce);
    const verifier = await codeVerifier(context.env, owner, state, fingerprint);
    // OpenRouter appends its own code query. A path nonce survives even if it replaces the query.
    const callback = new URL("/api/openrouter/callback/" + state, authConfig(context.env, context.request).origin);
    const authorization = new URL("https://openrouter.ai/auth");
    authorization.searchParams.set("callback_url", callback.href);
    authorization.searchParams.set("code_challenge_method", "S256");
    authorization.searchParams.set("code_challenge", await pkceChallenge(verifier));

    // Starting a new flow invalidates earlier attempts while preserving a working connection.
    await db.prepare(`INSERT INTO user_openrouter_connections (user_id, state_hash, session_hash, expires_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state_hash=excluded.state_hash,
      session_hash=excluded.session_hash, expires_at=excluded.expires_at`)
      .bind(owner, await pkceChallenge(state), fingerprint, Date.now() + FLOW_SECONDS * 1000).run();
    return json({ authorization_url: authorization.href }, 200, { "Set-Cookie": flowCookie(nonce) });
  });
}
