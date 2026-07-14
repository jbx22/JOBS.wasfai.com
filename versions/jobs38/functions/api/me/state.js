import { corsHeaders, getAuthenticatedUser, json, noContent, readUserState, writeUserState } from "../_state.js";

export async function onRequestGet(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ authenticated: false, state: null, storage: "guest" });
  if (!context.env?.JOBS_DB) return json({ authenticated: true, user, state: null, storage: "unconfigured" }, 503);
  const state = await readUserState(context.env.JOBS_DB, user);
  return json({ authenticated: true, user, state, storage: "d1" });
}

export async function onRequestPut(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ error: "Sign in with Google to save this workspace.", code: "AUTH_REQUIRED" }, 401);
  if (!context.env?.JOBS_DB) return json({ error: "Durable account storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const payload = await context.request.json();
  const state = await writeUserState(context.env.JOBS_DB, user, payload.state || payload);
  return json({ authenticated: true, user, state, storage: "d1" });
}

export async function onRequestOptions() {
  return noContent(204, corsHeaders());
}
