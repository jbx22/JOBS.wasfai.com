import { getPublicJob, matchPublicJobs, plainDescription } from "./_public_jobs.js";
import { matchJob, normalizeProfile } from "../../workers/ingestion/src/index.js";
import { EMPLOYER_BOARDS, presentCentralSource, SOURCE_CONNECTORS } from "../../workers/ingestion/src/boards.js";
import {
  json,
  noContent,
  requireAuthenticatedState,
  updateJobState,
  upsertSourceState,
  writeUserState,
} from "./_state.js";
import { getJobDb } from "./_db.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return noContent();

  const url = new URL(context.request.url);
  const method = context.request.method.toUpperCase();
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  try {
    if (method === "POST" && parts[0] === "jobs" && parts[1] === "match") return await jobsMatch(context);
    if (method === "POST" && parts.length === 2 && parts[0] === "jobs" && parts[1] === "evaluate") return await evaluateJob(context);
    if (method === "POST" && parts.length === 2 && parts[0] === "jobs" && parts[1] === "import") return await importJob(context);
    if (method === "PATCH" && parts[0] === "jobs" && parts[1] === "bulk-status") return await bulkStatus(context);
    if ((method === "PATCH" || method === "PUT") && parts[0] === "jobs" && parts[2] === "status") return await jobStatus(context, parts[1]);
    if ((method === "PATCH" || method === "PUT") && parts[0] === "jobs" && parts[1]) return await jobUpdate(context, parts[1]);
    if (method === "DELETE" && parts[0] === "jobs" && parts[1]) return await jobDelete(context, parts[1]);
    if (method === "GET" && parts.length === 1 && parts[0] === "sources") return await centralSources(context);
    if (method === "POST" && parts[0] === "sources" && !parts[1]) return await sourceCreate(context);
    if ((method === "POST" || method === "PUT" || method === "PATCH") && parts[0] === "sources" && parts[2] === "schedule") return await sourceSchedule(context, parts[1]);
    if (method === "POST" && parts[0] === "sources" && parts[2] === "scan") return await sourceScan(context, parts[1]);
    if (method === "POST" && parts[0] === "drafts") return await draftCreate(context);
    if (method === "POST" && parts[0] === "packages" && parts[2] === "generate") return await packageGenerate(context, parts[1]);
    if ((method === "POST" || method === "PUT" || method === "PATCH") && parts[0] === "profile") return await profileSave(context);

    return json({
      error: "This feature is not available on this route yet.",
      code: "STATIC_DEPLOY",
      path: url.pathname,
      method,
    }, method === "GET" ? 404 : 405);
  } catch (error) {
    if (error?.code === "STATE_CONFLICT") return json({ error: error.message, code: error.code }, 409);
    console.error("API route failed", { path: new URL(context.request.url).pathname, name: error?.name, code: error?.code });
    return json({
      error: "API operation failed.",
      code: "API_FAILED",
    }, 500);
  }
}

async function withState(context, mutate) {
  const result = await requireAuthenticatedState(context);
  if (result.error) return result.error;
  const expectedRevisions = result.state.__revisions;
  const original = JSON.stringify(result.state);
  const output = await mutate(result.state, result.user);
  if (JSON.stringify(result.state) !== original) {
    await writeUserState(getJobDb(context.env), result.user, result.state, { expectedRevisions });
  }
  return output;
}

async function readBody(context) {
  try {
    return await context.request.json();
  } catch {
    return {};
  }
}

async function jobsMatch(context) {
  const body = await readBody(context);
  const access = await requireAuthenticatedState(context);
  if (access.error) return access.error;
  try {
    return json(await matchPublicJobs(context.env, body.profile || {}, body.limit));
  } catch {
    return json({ ok: false, jobs: [], matched: 0, error: "Job matching is temporarily unavailable.", code: "MATCH_UNAVAILABLE" }, 503);
  }
}

async function evaluateJob(context) {
  const access = await requireAuthenticatedState(context);
  if (access.error) return access.error;
  const body = await readBody(context);
  const fields = ["title", "employer", "location", "description", "seniority", "sector"];
  const job = Object.fromEntries(fields.map((field) => [field, String(body.job?.[field] || "").trim().slice(0, field === "description" ? 12000 : 200)]));
  if (!job.title || !job.employer) return json({ code: "BAD_REQUEST", error: "Add a job title and employer before evaluating fit." }, 400);
  const profile = normalizeProfile(body.profile || {});
  if (!profile.roles.length) return json({ code: "PROFILE_REQUIRED", error: "Add target roles to the approved resume before evaluating fit." }, 400);
  return json(matchJob(job, profile));
}

async function importJob(context) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    let url;
    try { url = new URL(String(body.url || "")); } catch { /* invalid link */ }
    if (!url || url.protocol !== "https:" || url.username || url.password) {
      return json({ code: "BAD_JOB_URL", error: "Enter a public HTTPS job link." }, 400);
    }
    const path = url.pathname.split("/").filter(Boolean);
    let job;
    if (url.origin === new URL(context.request.url).origin && path[0] === "vacancies" && path.length === 2) {
      const publicJob = await getPublicJob(context.env, path[1]);
      if (publicJob) job = { title: publicJob.title, employer: publicJob.company_name, location: publicJob.city,
        description: publicJob.description, source_url: `${url.origin}/vacancies/${encodeURIComponent(publicJob.public_id)}` };
    } else if (["job-boards.greenhouse.io", "boards.greenhouse.io"].includes(url.host) && path.length === 3
      && /^[a-z0-9_-]{1,80}$/i.test(path[0]) && path[1] === "jobs" && /^\d{1,25}$/.test(path[2])) {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${path[0]}/jobs/${path[2]}`,
        { redirect: "error", signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } }).catch(() => null);
      if (!response) return json({ code: "BOARD_UNAVAILABLE", error: "The employer board is temporarily unavailable." }, 502);
      if (response.ok) {
        const record = await response.json().catch(() => null);
        if (record?.title) job = { title: record.title, employer: record.company_name || EMPLOYER_BOARDS.find(({ id }) => id === `${path[0].toLowerCase()}-greenhouse`)?.label || path[0], location: record.location?.name,
          description: plainDescription(String(record.content || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")),
          source_url: `https://job-boards.greenhouse.io/${path[0].toLowerCase()}/jobs/${path[2]}` };
      } else if (response.status !== 404) {
        return json({ code: "BOARD_UNAVAILABLE", error: "The employer board is temporarily unavailable." }, 502);
      }
    } else {
      return json({ code: "UNSUPPORTED_JOB_LINK", error: "Use a Jobs Wasfai vacancy or a public Greenhouse job link." }, 400);
    }
    if (!job) return json({ code: "JOB_NOT_FOUND", error: "This posting is no longer available." }, 404);
    const jobs = Array.isArray(state.jobs) ? state.jobs : [];
    const existing = jobs.find((item) => item.source_url === job.source_url);
    if (existing) {
      existing.imported = true;
      return json(existing);
    }
    const imported = { id: `manual-${crypto.randomUUID()}`, source: "manual", status: "discovered", imported: true,
      title: String(job.title).slice(0, 300), employer: String(job.employer).slice(0, 200), location: String(job.location || "").slice(0, 200),
      source_url: job.source_url, description: String(job.description || "").slice(0, 12000), score: 0, timeline: [] };
    state.jobs = [imported, ...jobs];
    return json(imported, 201);
  });
}

async function bulkStatus(context) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    const ids = Array.isArray(body.ids) ? body.ids : [];
    const status = cleanStatus(body.status);
    const updated = ids.map((id) => updateJobState(state, id, { status })).filter(Boolean);
    return json(updated);
  });
}

async function jobStatus(context, id) {
  const body = await readBody(context);
  return withState(context, async (state, user) => {
    const updated = updateJobState(state, id, { status: cleanStatus(body.status) });
    if (updated) await recordApplicationEvent(getJobDb(context.env), user.sub, id, "status_changed", { status: updated.status });
    return updated ? json(updated) : json({ error: "Job not found.", code: "NOT_FOUND" }, 404);
  });
}

async function jobUpdate(context, id) {
  const body = await readBody(context);
  return withState(context, async (state, user) => {
    const patch = {};
    for (const key of ["title", "employer", "location", "description"]) {
      if (body[key] !== undefined) patch[key] = String(body[key] || "");
    }
    if (body.source_url !== undefined || body.url !== undefined) patch.source_url = String(body.source_url || body.url || "");
    if (body.application) patch.application = cleanApplication(body.application);
    const updated = updateJobState(state, id, patch);
    if (updated && body.application) await recordApplicationEvent(getJobDb(context.env), user.sub, id, "application_updated", patch.application);
    return updated ? json(updated) : json({ error: "Job not found.", code: "NOT_FOUND" }, 404);
  });
}

async function recordApplicationEvent(db, userId, jobId, type, payload) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS application_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, job_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  ).run();
  await db.prepare("INSERT INTO application_events(user_id, job_id, event_type, payload) VALUES (?, ?, ?, ?)")
    .bind(userId, jobId, type, JSON.stringify(payload || {})).run();
}

function cleanApplication(input = {}) {
  return {
    applied_at: cleanDate(input.applied_at),
    follow_up_at: cleanDate(input.follow_up_at),
    last_follow_up_at: cleanDate(input.last_follow_up_at),
    recruiter_name: String(input.recruiter_name || "").trim().slice(0, 160),
    recruiter_contact: String(input.recruiter_contact || "").trim().slice(0, 240),
    channel: String(input.channel || "").trim().slice(0, 100),
    notes: String(input.notes || "").trim().slice(0, 4000),
  };
}

function cleanDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

async function jobDelete(context, id) {
  return withState(context, async (state) => {
    state.jobs = (state.jobs || []).filter((job) => job.id !== id);
    state.packages = (state.packages || []).filter((pkg) => pkg.job_id !== id);
    state.drafts = (state.drafts || []).filter((draft) => draft.job_id !== id);
    return noContent();
  });
}

async function sourceCreate(context) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    const label = String(body.label || "").trim();
    const url = String(body.url || "").trim();
    if (!label || !url) return json({ error: "Source label and URL are required.", code: "BAD_REQUEST" }, 400);
    const id = `custom-${crypto.randomUUID()}`;
    if (!isSafePublicUrl(url)) return json({ error: "Source must use a public HTTPS URL without embedded credentials.", code: "BAD_SOURCE_URL" }, 400);
    const connectorMode = SOURCE_CONNECTORS.includes(body.connector_mode)
      ? body.connector_mode : "public_html";
    const source = upsertSourceState(state, {
      id,
      label,
      url,
      region: String(body.region || ""),
      enabled: true,
      custom: true,
      connector_mode: connectorMode,
      job_count: 0,
      scheduled: false,
      interval_minutes: 360,
      last_scanned_at: "",
      next_scan_at: "",
      last_error: "",
    });
    const synced = await ingestionRequest(context, "/admin/sources", "POST", {
      ...source,
      owner_user_id: state.profile?.id,
      scheduled: false,
    });
    if (!synced.ok) {
      state.sources = (state.sources || []).filter((item) => item.id !== id);
      return json({ error: "Source could not be registered for secure ingestion.", code: "INGESTION_SOURCE_CREATE_FAILED", detail: synced.error }, 502);
    }
    return json(source, 201);
  });
}

async function sourceSchedule(context, id) {
  const body = await readBody(context);
  return withState(context, async (state, user) => {
    const source = (state.sources || []).find((item) => item.id === id);
    if (!source) return json({ error: "Source not found.", code: "NOT_FOUND" }, 404);
    const previous = { scheduled: source.scheduled, interval_minutes: source.interval_minutes, next_scan_at: source.next_scan_at };
    source.scheduled = body.scheduled !== undefined ? Boolean(body.scheduled) : Boolean(body.enabled);
    source.interval_minutes = Math.max(30, Math.min(10080, Number(body.interval_minutes || source.interval_minutes || 360)));
    source.next_scan_at = source.scheduled ? new Date(Date.now() + source.interval_minutes * 60_000).toISOString() : "";
    if (source.custom) {
      const synced = await ingestionRequest(context, `/admin/sources/${encodeURIComponent(id)}`, "PATCH", {
        scheduled: source.scheduled,
        interval_minutes: source.interval_minutes,
        owner_user_id: user.sub,
      });
      if (!synced.ok) {
        Object.assign(source, previous);
        return json({ error: "Source schedule could not be saved to ingestion.", code: "INGESTION_SCHEDULE_FAILED", detail: synced.error }, 502);
      }
    }
    return json(source);
  });
}

async function centralSources(context) {
  const db = getJobDb(context.env);
  if (!db) return json({ code: "STORAGE_NOT_CONFIGURED", error: "Sources are temporarily unavailable." }, 503);
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { results = [] } = await db.prepare(`SELECT s.id, s.label, s.url, s.region, s.enabled, s.connector_mode, s.last_scanned_at, s.last_error,
    s.interval_minutes, s.next_scan_at, (SELECT COUNT(*) FROM jobs j WHERE j.source_id=s.id AND j.verification_status='live'
      AND j.closed_at='' AND (j.valid_through='' OR j.valid_through>=?1) AND j.last_verified_at>=?2) AS job_count
    FROM sources s WHERE s.visibility='central' AND s.owner_user_id='' AND (s.enabled=1 OR s.connector_mode='portal_only')
    ORDER BY s.label`).bind(now, since).all();
  return json({ sources: results.map((source) => ({ ...presentCentralSource(source), central: true, custom: false })) });
}

async function sourceScan(context, id) {
  return withState(context, async (state, user) => {
    const source = (state.sources || []).find((item) => item.id === id);
    if (!source?.custom) return json({ error: "Source not found.", code: "NOT_FOUND" }, 404);
    if (!SOURCE_CONNECTORS.includes(source.connector_mode)) {
      return json({ error: "This source needs an approved provider API before it can be scanned.", code: "APPROVED_API_REQUIRED" }, 409);
    }

    try {
      const scan = await ingestionRequest(context, "/admin/scan-now?mode=direct", "POST", { id, owner_user_id: user.sub });
      const scanPayload = scan.payload || {};
      if (!scan.ok || !scanPayload.ok) {
        const detail = scan.error || scanPayload.error || "ingestion worker rejected scan";
        source.last_error = detail;
        return json({ error: "Live source scan failed.", code: "INGESTION_SCAN_FAILED", detail, source }, 502);
      }

      if (!Array.isArray(scanPayload.jobs)) {
        source.last_error = "The scan completed but the ingestion jobs list could not be read.";
        return json({ error: "Live scan completed, but results could not be loaded.", code: "INGESTION_RESULTS_UNAVAILABLE", source }, 502);
      }

      const scannedAt = new Date().toISOString();
      const jobs = scanPayload.jobs
        .filter((job) => job.source_id === id)
        .map((job) => ({
          id: job.id,
          title: job.title,
          employer: job.employer || source.label,
          source: id,
          source_url: job.source_url || source.url,
          location: job.location || source.region || "Remote",
          score: Number(job.score || 0),
          status: job.status || "discovered",
          deadline: job.valid_through || "",
          description: job.description || "",
          tailored_resume: "",
          cover_letter: "",
          fit_explanation: "Live job collected by the ingestion worker; review against the approved resume before applying.",
          timeline: [{ label: "Live source scan", timestamp: scannedAt, tone: "neutral" }],
        }));
      source.last_scanned_at = scannedAt;
      source.last_error = "";
      source.job_count = jobs.length;
      const existing = new Map((state.jobs || []).map((job) => [job.id, job]));
      for (const job of jobs) existing.set(job.id, { ...(existing.get(job.id) || {}), ...job });
      state.jobs = [...existing.values()];
      return json({ source, jobs, mode: "live-ingestion", scan: scanPayload.result || {} });
    } catch (error) {
      const detail = error?.message || "ingestion worker request failed";
      source.last_error = detail;
      return json({ error: "Live source scan is unavailable.", code: "INGESTION_UNAVAILABLE", detail, source }, 502);
    }
  });
}

async function ingestionRequest(context, path, method, body) {
  const upstream = String(context.env.JOBS_INGESTION_URL || "https://jobs-wasfai-ingestion.jabosaag.workers.dev").replace(/\/+$/, "");
  const token = String(context.env.JOBS_INGESTION_TOKEN || "");
  if (!token) return { ok: false, error: "ingestion service token is not configured" };
  try {
    const response = await fetch(`${upstream}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, payload, error: payload.error || `ingestion returned ${response.status}` };
  } catch (error) {
    return { ok: false, error: error?.message || "ingestion request failed" };
  }
}

function isSafePublicUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    return !/^(?:0|10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)(?:\.|$)/.test(host);
  } catch { return false; }
}

async function draftCreate(context) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    if (!body.job_id || !String(body.content || "").trim()) return json({ error: "Draft job_id and content are required.", code: "BAD_REQUEST" }, 400);
    const draft = { job_id: body.job_id, content: body.content, updated_at: new Date().toISOString() };
    state.drafts = [draft, ...(state.drafts || []).filter((item) => item.job_id !== draft.job_id)];
    state.draft_history = [{ ...draft, id: `draft-${Date.now()}` }, ...(state.draft_history || [])].slice(0, 50);
    return json(draft, 201);
  });
}

async function packageGenerate(context, jobId) {
  return withState(context, async (state) => {
    const job = (state.jobs || []).find((item) => item.id === jobId);
    if (!job) return json({ error: "Job not found.", code: "NOT_FOUND" }, 404);
    const pkg = {
      job_id: jobId,
      resume_title: `سيرة مخصصة - ${job.title}`,
      resume_body: `مسودة سيرة مبنية على السيرة المعتمدة لدور ${job.title} لدى ${job.employer}. راجع كل معلومة قبل التقديم.`,
      cover_letter_title: `خطاب تقديم - ${job.employer}`,
      cover_letter_body: `مسودة خطاب موجهة إلى ${job.employer} بناءً على السيرة المعتمدة والوصف الوظيفي.`,
      pdf_status: "جاهزة للمراجعة",
      generated_at: new Date().toISOString(),
    };
    state.packages = [pkg, ...(state.packages || []).filter((item) => item.job_id !== jobId)];
    state.package_history = [{ ...pkg, id: `pkg-${Date.now()}` }, ...(state.package_history || [])].slice(0, 50);
    return json(pkg, 201);
  });
}

async function profileSave(context) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    state.profile = { ...(state.profile || {}), ...(body.profile || body) };
    return json(state.profile);
  });
}

function cleanStatus(status) {
  return ["discovered", "processing", "ready", "applied", "in_progress", "expired", "skipped"].includes(status)
    ? status
    : "discovered";
}
