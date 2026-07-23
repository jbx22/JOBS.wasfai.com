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

const DOCUMENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS user_state_documents (
  user_id TEXT NOT NULL,
  document_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, document_key)
)`;

const DOMAIN_TABLES_SQL = [
  `CREATE TABLE IF NOT EXISTS resumes (user_id TEXT PRIMARY KEY, profile_payload TEXT NOT NULL DEFAULT '{}', master_payload TEXT NOT NULL DEFAULT '{}', approved INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS resume_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS applications (user_id TEXT NOT NULL, job_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'discovered', payload TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, job_id))`,
  `CREATE TABLE IF NOT EXISTS application_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, job_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS generated_kits (user_id TEXT NOT NULL, job_id TEXT NOT NULL, payload TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, job_id))`,
];

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
  const { results: documents = [] } = await db.prepare(
    "SELECT document_key, payload, revision FROM user_state_documents WHERE user_id = ?",
  ).bind(user.sub).all();
  const row = await db.prepare("SELECT payload FROM user_states WHERE user_id = ?").bind(user.sub).first();
  let state = buildInitialState(user);
  try {
    if (row?.payload) state = { ...state, ...JSON.parse(row.payload) };
  } catch {
    state = buildInitialState(user);
  }
  const revisions = {};
  for (const document of documents) {
    if (!STATE_KEYS.includes(document.document_key)) continue;
    try { state[document.document_key] = JSON.parse(document.payload); } catch { /* retain legacy value */ }
    revisions[document.document_key] = Number(document.revision || 1);
  }
  return { ...state, __revisions: revisions };
}

export async function writeUserState(db, user, incoming, options = {}) {
  await ensureTable(db);
  const state = sanitizeState(incoming, buildInitialState(user));
  const expected = options.expectedRevisions || null;
  const { results: currentRows = [] } = await db.prepare(
    "SELECT document_key, revision, payload FROM user_state_documents WHERE user_id = ?",
  ).bind(user.sub).all();
  const current = Object.fromEntries(currentRows.map((row) => [row.document_key, Number(row.revision || 1)]));
  const changedKeys = STATE_KEYS.filter((key) => {
    const row = currentRows.find((item) => item.document_key === key);
    return !row || row.payload !== JSON.stringify(state[key] ?? null);
  });
  if (expected) {
    const conflict = changedKeys.find((key) => current[key] && Number(expected[key] || 0) !== current[key]);
    if (conflict) {
      const error = new Error(`Workspace document changed in another tab: ${conflict}`);
      error.code = "STATE_CONFLICT";
      throw error;
    }
  }
  const statements = changedKeys.map((key) => db.prepare(
    `INSERT INTO user_state_documents (user_id, document_key, payload, revision, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, document_key) DO UPDATE SET
       payload = excluded.payload,
       revision = user_state_documents.revision + 1,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(user.sub, key, JSON.stringify(state[key] ?? null)));
  if (statements.length) await db.batch(statements);
  const domainStatements = buildDomainStatements(db, user.sub, state, changedKeys);
  if (domainStatements.length) await db.batch(domainStatements);
  // The legacy blob remains an untouched migration/rollback copy once the
  // normalized documents exist. New accounts receive a one-time snapshot.
  await db.prepare(
    `INSERT OR IGNORE INTO user_states (user_id, email, payload, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
  ).bind(user.sub, user.email || "", JSON.stringify(state)).run();
  const { results: revisions = [] } = await db.prepare(
    "SELECT document_key, revision FROM user_state_documents WHERE user_id = ?",
  ).bind(user.sub).all();
  return { ...state, __revisions: Object.fromEntries(revisions.map((row) => [row.document_key, Number(row.revision || 1)])) };
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
  await db.prepare(DOCUMENT_TABLE_SQL).run();
  for (const sql of DOMAIN_TABLES_SQL) await db.prepare(sql).run();
}

function buildDomainStatements(db, userId, state, changedKeys) {
  const statements = [];
  if (changedKeys.some((key) => ["profile", "masterResume", "approvedMasterResume"].includes(key))) {
    const master = JSON.stringify(state.masterResume || {});
    statements.push(db.prepare(
      `INSERT INTO resumes(user_id, profile_payload, master_payload, approved, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET profile_payload=excluded.profile_payload, master_payload=excluded.master_payload, approved=excluded.approved, updated_at=CURRENT_TIMESTAMP`,
    ).bind(userId, JSON.stringify(state.profile || {}), master, state.approvedMasterResume ? 1 : 0));
    if (changedKeys.includes("masterResume")) statements.push(db.prepare("INSERT INTO resume_versions(user_id, payload) VALUES (?, ?)").bind(userId, master));
  }
  if (changedKeys.includes("jobs")) {
    for (const job of (Array.isArray(state.jobs) ? state.jobs : []).filter((item) => item?.application || item?.status)) {
      statements.push(db.prepare(
        `INSERT INTO applications(user_id, job_id, status, payload, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, job_id) DO UPDATE SET status=excluded.status, payload=excluded.payload, updated_at=CURRENT_TIMESTAMP`,
      ).bind(userId, String(job.id), String(job.status || "discovered"), JSON.stringify(job.application || {})));
    }
  }
  if (changedKeys.includes("ghostwriter") || changedKeys.includes("approvedKits")) {
    for (const [jobId, kit] of Object.entries(state.ghostwriter || {})) {
      statements.push(db.prepare(
        `INSERT INTO generated_kits(user_id, job_id, payload, approved, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, job_id) DO UPDATE SET payload=excluded.payload, approved=excluded.approved, updated_at=CURRENT_TIMESTAMP`,
      ).bind(userId, jobId, JSON.stringify(kit), state.approvedKits?.[jobId] ? 1 : 0));
    }
  }
  return statements;
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
