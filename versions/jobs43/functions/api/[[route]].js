import {
  json,
  noContent,
  requireAuthenticatedState,
  updateJobState,
  upsertSourceState,
  writeUserState,
} from "./_state.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return noContent();

  const url = new URL(context.request.url);
  const method = context.request.method.toUpperCase();
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  try {
    if (method === "POST" && parts[0] === "jobs" && parts[1] === "match") return jobsMatch(context);
    if (method === "PATCH" && parts[0] === "jobs" && parts[1] === "bulk-status") return bulkStatus(context);
    if ((method === "PATCH" || method === "PUT") && parts[0] === "jobs" && parts[2] === "status") return jobStatus(context, parts[1]);
    if ((method === "PATCH" || method === "PUT") && parts[0] === "jobs" && parts[1]) return jobUpdate(context, parts[1]);
    if (method === "DELETE" && parts[0] === "jobs" && parts[1]) return jobDelete(context, parts[1]);
    if (method === "POST" && parts[0] === "sources" && !parts[1]) return sourceCreate(context);
    if ((method === "POST" || method === "PUT" || method === "PATCH") && parts[0] === "sources" && parts[2] === "schedule") return sourceSchedule(context, parts[1]);
    if (method === "POST" && parts[0] === "sources" && parts[2] === "scan") return sourceScan(context, parts[1]);
    if (method === "POST" && parts[0] === "drafts") return draftCreate(context);
    if (method === "POST" && parts[0] === "packages" && parts[2] === "generate") return packageGenerate(context, parts[1]);
    if ((method === "POST" || method === "PUT" || method === "PATCH") && parts[0] === "profile") return profileSave(context);

    return json({
      error: "This feature is not available on this route yet.",
      code: "STATIC_DEPLOY",
      path: url.pathname,
      method,
    }, method === "GET" ? 404 : 405);
  } catch (error) {
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
  const output = await mutate(result.state, result.user);
  await writeUserState(context.env.JOBS_DB, result.user, result.state);
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
  const profile = body.profile || {};
  const limit = Math.min(Number(body.limit || 40), 80);
  const upstream = String(context.env.JOBS_INGESTION_URL || "https://jobs-wasfai-ingestion.jabosaag.workers.dev").replace(/\/+$/, "");
  try {
    const response = await fetch(`${upstream}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, limit }),
    });
    if (response.ok) {
      const payload = await response.json();
      return json({ ...payload, source: "ingestion-worker" });
    }
    return json({ ok: false, jobs: [], matched: 0, source: "ingestion-worker", error: `match returned ${response.status}` }, 200);
  } catch (error) {
    return json({ ok: false, jobs: [], matched: 0, source: "ingestion-worker", error: error?.message || "match failed" }, 200);
  }
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
    if (updated) await recordApplicationEvent(context.env.JOBS_DB, user.sub, id, "status_changed", { status: updated.status });
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
    if (updated && body.application) await recordApplicationEvent(context.env.JOBS_DB, user.sub, id, "application_updated", patch.application);
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
    const id = `custom-${Date.now().toString(36)}`;
    if (!isSafePublicUrl(url)) return json({ error: "Source must use a public HTTPS URL without embedded credentials.", code: "BAD_SOURCE_URL" }, 400);
    const connectorMode = ["public_html", "public_json", "greenhouse", "lever", "ashby"].includes(body.connector_mode)
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
  return withState(context, async (state) => {
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
      });
      if (!synced.ok) {
        Object.assign(source, previous);
        return json({ error: "Source schedule could not be saved to ingestion.", code: "INGESTION_SCHEDULE_FAILED", detail: synced.error }, 502);
      }
    }
    return json(source);
  });
}

async function sourceScan(context, id) {
  return withState(context, async (state) => {
    const source = (state.sources || []).find((item) => item.id === id);
    if (!source) return json({ error: "Source not found.", code: "NOT_FOUND" }, 404);
    if (!["public_html", "public_json", "greenhouse", "lever", "ashby"].includes(source.connector_mode)) {
      return json({ error: "This source needs an approved provider API before it can be scanned.", code: "APPROVED_API_REQUIRED" }, 409);
    }

    const upstream = String(context.env.JOBS_INGESTION_URL || "https://jobs-wasfai-ingestion.jabosaag.workers.dev").replace(/\/+$/, "");
    try {
      const scan = await ingestionRequest(context, "/admin/scan-now?mode=direct", "POST", { id });
      const scanPayload = scan.payload || {};
      if (!scan.ok || !scanPayload.ok) {
        const detail = scan.error || scanPayload.error || "ingestion worker rejected scan";
        source.last_error = detail;
        return json({ error: "Live source scan failed.", code: "INGESTION_SCAN_FAILED", detail, source }, 502);
      }

      const jobsResponse = await fetch(`${upstream}/jobs?limit=100`);
      const jobsPayload = await jobsResponse.json().catch(() => ({}));
      if (!jobsResponse.ok || !Array.isArray(jobsPayload.jobs)) {
        source.last_error = "The scan completed but the ingestion jobs list could not be read.";
        return json({ error: "Live scan completed, but results could not be loaded.", code: "INGESTION_RESULTS_UNAVAILABLE", source }, 502);
      }

      const scannedAt = new Date().toISOString();
      const jobs = jobsPayload.jobs
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
          deadline: "",
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
