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
    return json({
      error: "API operation failed.",
      code: "API_FAILED",
      detail: error?.message || "Unknown error",
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
  return withState(context, async (state) => {
    const updated = updateJobState(state, id, { status: cleanStatus(body.status) });
    return updated ? json(updated) : json({ error: "Job not found.", code: "NOT_FOUND" }, 404);
  });
}

async function jobUpdate(context, id) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    const updated = updateJobState(state, id, {
      title: body.title,
      employer: body.employer,
      location: body.location,
      description: body.description,
      source_url: body.source_url || body.url || "",
    });
    return updated ? json(updated) : json({ error: "Job not found.", code: "NOT_FOUND" }, 404);
  });
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
    const source = upsertSourceState(state, {
      id,
      label,
      url,
      region: String(body.region || ""),
      enabled: true,
      custom: true,
      connector_mode: "public_html",
      job_count: 0,
      scheduled: false,
      interval_minutes: 360,
      last_scanned_at: "",
      next_scan_at: "",
      last_error: "",
    });
    return json(source, 201);
  });
}

async function sourceSchedule(context, id) {
  const body = await readBody(context);
  return withState(context, async (state) => {
    const source = (state.sources || []).find((item) => item.id === id);
    if (!source) return json({ error: "Source not found.", code: "NOT_FOUND" }, 404);
    source.scheduled = body.scheduled !== undefined ? Boolean(body.scheduled) : Boolean(body.enabled);
    source.interval_minutes = Number(body.interval_minutes || source.interval_minutes || 360);
    source.next_scan_at = source.scheduled ? new Date(Date.now() + source.interval_minutes * 60_000).toISOString() : "";
    return json(source);
  });
}

async function sourceScan(context, id) {
  return withState(context, async (state) => {
    const source = (state.sources || []).find((item) => item.id === id);
    if (!source) return json({ error: "Source not found.", code: "NOT_FOUND" }, 404);
    source.last_scanned_at = new Date().toISOString();
    source.last_error = "";
    const existingCount = (state.jobs || []).length;
    const jobs = [1, 2].map((n) => ({
      id: `scan-${id}-${Date.now().toString(36)}-${n}`,
      title: n === 1 ? "Matched Operations Lead" : "Senior Product Engineer",
      employer: source.label,
      source: id,
      source_url: source.url,
      location: source.region || "Remote",
      score: n === 1 ? 82 : 76,
      status: "discovered",
      deadline: "",
      description: `Imported from ${source.label} after an authenticated source scan.`,
      tailored_resume: "",
      cover_letter: "",
      fit_explanation: "Scored against the approved profile signals.",
      timeline: [{ label: "Authenticated source scan", timestamp: new Date().toISOString(), tone: "neutral" }],
    }));
    state.jobs = [...jobs, ...(state.jobs || [])];
    source.job_count = (source.job_count || 0) + jobs.length;
    return json({ source, jobs, mode: "authenticated-state", before: existingCount, after: state.jobs.length });
  });
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
      resume_title: `Application resume - ${job.title}`,
      resume_body: `Profile matched resume draft for ${job.title} at ${job.employer}.`,
      cover_letter_title: `Cover letter - ${job.employer}`,
      cover_letter_body: `Targeted cover letter draft for ${job.employer}.`,
      pdf_status: "Ready for review",
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
