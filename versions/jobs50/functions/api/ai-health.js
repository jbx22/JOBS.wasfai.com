import { getAuthenticatedUser, json } from "./_state.js";

/** Safe, account-only readiness signal. It never exposes keys or provider errors. */
export async function onRequestGet(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ error: "Sign in is required to check AI availability.", code: "AUTH_REQUIRED" }, 401);
  const env = context.env || {};
  const deepseek = Boolean(env.DEEPSEEK_API_KEY || env.AI_API_KEY);
  const openrouter = Boolean(env.OPENROUTER_API_KEY);
  return json({
    ready: deepseek || openrouter,
    providers: {
      deepseek: deepseek ? "configured" : "missing",
      openrouter: openrouter ? "configured" : "missing",
    },
    checked_at: new Date().toISOString(),
  });
}

/** Deployment-only provider smoke check. Protected separately from user auth. */
export async function onRequestPost(context) {
  const env = context.env || {};
  const expected = String(env.AI_HEALTH_TOKEN || "");
  const actual = String(context.request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !safeEqual(actual, expected)) {
    return json({ error: "Health-check authorization required.", code: "AUTH_REQUIRED" }, 401);
  }
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
  if (!apiKey) return json({ ready: false, provider: "deepseek", error: "missing_key" }, 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const base = String(env.DEEPSEEK_BASE_URL || env.AI_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || env.AI_MODEL || "deepseek-v4-flash",
        max_tokens: 8,
        temperature: 0,
        messages: [{ role: "user", content: "Reply with READY only." }],
      }),
    });
    return json({ ready: response.ok, provider: "deepseek", status: response.status, checked_at: new Date().toISOString() }, response.ok ? 200 : 502);
  } catch (error) {
    return json({ ready: false, provider: "deepseek", error: error?.name === "AbortError" ? "timeout" : "provider_error" }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
