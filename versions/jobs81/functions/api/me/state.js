import { corsHeaders, getAuthenticatedUser, json, noContent, readUserState, writeUserState } from "../_state.js";
import { getJobDb } from "../_db.js";

export async function onRequestGet(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ authenticated: false, state: null, storage: "guest" });
  if (!getJobDb(context.env)) return json({ authenticated: true, user, state: null, storage: "unconfigured" }, 503);
  const state = await readUserState(getJobDb(context.env), user);
  const normalized = Object.keys(state.__revisions || {}).length > 0;
  return json({ authenticated: true, user, state, storage: normalized ? "postgres-normalized" : "postgres-legacy" });
}

export async function onRequestPut(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return json({ error: "Sign in with Google to save this workspace.", code: "AUTH_REQUIRED" }, 401);
  if (!getJobDb(context.env)) return json({ error: "Durable account storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const payload = await context.request.json().catch(() => null);
  const incoming = record(payload) && Object.hasOwn(payload, "state") ? payload.state : payload;
  const revisions = payload?.revisions ?? null;
  if (!record(incoming) || (revisions !== null && (!record(revisions) ||
    Object.values(revisions).some((value) => !Number.isSafeInteger(value) || value < 0)))) {
    return json({ error: "Invalid workspace data.", code: "INVALID_STATE" }, 400);
  }
  try {
    const state = await writeUserState(getJobDb(context.env), user, incoming, {
      expectedRevisions: revisions,
    });
    return json({ authenticated: true, user, state, storage: "postgres-normalized" });
  } catch (error) {
    if (error?.code === "INVALID_AI_PREFERENCE") {
      return json({ error: "Unsupported AI billing source or model.", code: error.code }, 400);
    }
    if (error?.code === "STATE_CONFLICT") {
      return json({ error: "Workspace changed in another tab. Reload before saving.", code: "STATE_CONFLICT" }, 409);
    }
    throw error;
  }
}

export async function onRequestOptions() {
  return noContent(204, corsHeaders());
}

function record(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
