import { authConfig, readSession } from "./auth/_auth.js";
import { buildBootstrap } from "./bootstrap.js";

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS user_states (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const STATE_KEYS = [
  "profile",
  "jobs",
  "messages",
  "packages",
  "package_history",
  "sources",
  "drafts",
  "draft_history",
  "activity_feed",
  "application_checklists",
  "ghostwriter",
  "approvedKits",
  "interviewChats",
  "resumeCoach",
  "approvedMasterResume",
  "masterResume",
  "tailoringBriefs",
  "aiWriterModel",
];

export async function getAuthenticatedUser(context) {
  const config = authConfig(context.env || {}, context.request);
  const session = await readSession(context.request, config.cookieSecret);
  return session || null;
}

export async function requireAuthenticatedState(context) {
  const user = await getAuthenticatedUser(context);
  if (!user) return { error: json({ error: "Sign in with Google to save this workspace.", code: "AUTH_REQUIRED" }, 401) };
  if (!context.env?.JOBS_DB) return { error: json({ error: "Durable account storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503) };
  const state = await readUserState(context.env.JOBS_DB, user);
  return { user, state };
}

export async function readUserState(db, user) {
  await ensureTable(db);
  const row = await db.prepare("SELECT payload FROM user_states WHERE user_id = ?").bind(user.sub).first();
  if (!row?.payload) return buildInitialState(user);
  try {
    return { ...buildInitialState(user), ...JSON.parse(row.payload) };
  } catch {
    return buildInitialState(user);
  }
}

export async function writeUserState(db, user, incoming) {
  await ensureTable(db);
  const state = sanitizeState(incoming, buildInitialState(user));
  await db
    .prepare(
      `INSERT INTO user_states (user_id, email, payload, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email,
         payload = excluded.payload,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(user.sub, user.email || "", JSON.stringify(state))
    .run();
  return state;
}

export function buildInitialState(user = {}) {
  const base = buildBootstrap();
  return {
    ...base,
    profile: {
      ...base.profile,
      id: user.sub || base.profile?.id || "user-demo",
      display_name: user.name || base.profile?.display_name || "",
      email: user.email || base.profile?.email || "",
    },
    ghostwriter: {},
    approvedKits: {},
    interviewChats: {},
    resumeCoach: null,
    approvedMasterResume: false,
    masterResume: { ar: "", en: "", approved_at: "" },
    tailoringBriefs: {},
    aiWriterModel: "deepseek",
  };
}

export function sanitizeState(input = {}, fallback = buildBootstrap()) {
  const out = {};
  for (const key of STATE_KEYS) {
    if (input[key] !== undefined) out[key] = input[key];
    else if (fallback[key] !== undefined) out[key] = fallback[key];
  }
  return out;
}

export function updateJobState(state, id, patch) {
  const jobs = Array.isArray(state.jobs) ? state.jobs : [];
  const index = jobs.findIndex((job) => job.id === id);
  if (index === -1) return null;
  const updated = {
    ...jobs[index],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  state.jobs = jobs.map((job, i) => (i === index ? updated : job));
  return updated;
}

export function upsertSourceState(state, source) {
  const sources = Array.isArray(state.sources) ? state.sources : [];
  const index = sources.findIndex((item) => item.id === source.id);
  state.sources = index === -1 ? [source, ...sources] : sources.map((item, i) => (i === index ? source : item));
  return source;
}

async function ensureTable(db) {
  await db.prepare(TABLE_SQL).run();
}

export function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export function noContent(status = 204) {
  return new Response(null, { status, headers: corsHeaders() });
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
