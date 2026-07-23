import { corsHeaders, getAuthenticatedUser, json, noContent, readUserState, writeUserState } from "../_state.js";

export async function onRequestGet(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ authenticated: false, state: null, storage: "guest" });
  if (!context.env?.JOBS_DB) return json({ authenticated: true, user, state: null, storage: "unconfigured" }, 503);
  const state = await readUserState(context.env.JOBS_DB, user);
  const normalized = Object.keys(state.__revisions || {}).length > 0;
  return json({ authenticated: true, user, state, storage: normalized ? "d1-normalized" : "d1-legacy" });
}

export async function onRequestPut(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ error: "Sign in with Google to save this workspace.", code: "AUTH_REQUIRED" }, 401);
  if (!context.env?.JOBS_DB) return json({ error: "Durable account storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const payload = await context.request.json();
  try {
    const state = await writeUserState(context.env.JOBS_DB, user, payload.state || payload, {
      expectedRevisions: payload.revisions || null,
    });
    return json({ authenticated: true, user, state, storage: "d1-normalized" });
  } catch (error) {
    if (error?.code === "STATE_CONFLICT") {
      return json({ error: "Workspace changed in another tab. Reload before saving.", code: "STATE_CONFLICT" }, 409);
    }
    throw error;
  }
}

export async function onRequestOptions() {
  return noContent(204, corsHeaders());
}
