/**
 * JOBS.wasfai.com ingestion worker
 *
 * Cloudflare Cron enqueues due source scans. Queue consumers fetch public HTML
 * boards, parse normalized job cards, score them against source query/region,
 * dedupe into D1, and expose a small read/admin API.
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(enqueueDueSources(env));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        await scanSource(env, message.body);
        message.ack();
      } catch (error) {
        await recordSourceError(env, message.body?.id, error);
        message.retry();
      }
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/health") {
      return json({ ok: true, service: "jobs-wasfai-ingestion", at: new Date().toISOString() });
    }
    if (url.pathname === "/sources" && request.method === "GET") {
      const { results } = await env.JOBS_DB.prepare("SELECT * FROM sources ORDER BY label").all();
      return json({ ok: true, sources: results.map(withSourceQuality) });
    }
    if (url.pathname === "/jobs" && request.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
      const { results } = await env.JOBS_DB.prepare("SELECT * FROM jobs ORDER BY score DESC, discovered_at DESC LIMIT ?1").bind(limit).all();
      return json({ ok: true, jobs: results.filter(isLikelyStoredJob).map((job) => ({ ...job, data_quality: "live_verified", source_quality: "live_verified" })) });
    }
    if (url.pathname === "/match" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(Number(body.limit || 50), 100);
      const profile = normalizeProfile(body.profile || {});
      const { results } = await env.JOBS_DB.prepare("SELECT * FROM jobs ORDER BY discovered_at DESC LIMIT 200").all();
      const jobs = results
        .filter(isLikelyStoredJob)
        .map((job) => matchJob(job, profile))
        .filter((job) => job.score >= 58)
        .sort((a, b) => b.score - a.score || String(b.discovered_at).localeCompare(String(a.discovered_at)))
        .slice(0, limit);
      return json({ ok: true, jobs, matched: jobs.length, profile_terms: profile.terms.slice(0, 30) });
    }
    if (url.pathname === "/admin/scan-now" && request.method === "POST") {
      if (!isAdminRequest(request, env)) return forbidden();
      const body = await request.json().catch(() => ({}));
      const id = String(body.id || "");
      const source = id ? await sourceById(env, id) : null;
      if (!source) return json({ ok: false, error: "source not found" }, 404);
      if (url.searchParams.get("mode") === "direct") {
        try {
          const result = await scanSource(env, source);
          return json({ ok: true, mode: "direct", result });
        } catch (error) {
          await recordSourceError(env, source.id, error);
          return json({ ok: false, mode: "direct", error: errorMessage(error) }, 502);
        }
      }
      await env.JOBS_SCAN_QUEUE.send(source);
      return json({ ok: true, queued: source.id });
    }
    if (url.pathname === "/admin/enqueue-due" && request.method === "POST") {
      if (!isAdminRequest(request, env)) return forbidden();
      const count = await enqueueDueSources(env);
      return json({ ok: true, queued: count });
    }
    if (url.pathname === "/admin/sources" && request.method === "POST") {
      if (!isAdminRequest(request, env)) return forbidden();
      const body = await request.json().catch(() => ({}));
      const source = await upsertManagedSource(env, body);
      return json({ ok: true, source }, 201);
    }
    if (url.pathname.startsWith("/admin/sources/") && request.method === "PATCH") {
      if (!isAdminRequest(request, env)) return forbidden();
      const id = decodeURIComponent(url.pathname.slice("/admin/sources/".length));
      const body = await request.json().catch(() => ({}));
      const source = await updateManagedSource(env, id, body);
      return source ? json({ ok: true, source }) : json({ ok: false, error: "source not found" }, 404);
    }
    return json({ ok: false, error: "not found" }, 404);
  },
};

async function enqueueDueSources(env) {
  const now = new Date().toISOString();
  const { results } = await env.JOBS_DB.prepare(
    "SELECT * FROM sources WHERE enabled = 1 AND (next_scan_at = '' OR next_scan_at <= ?1) LIMIT 20",
  ).bind(now).all();
  for (const source of results) {
    await env.JOBS_SCAN_QUEUE.send(source);
  }
  return results.length;
}

async function scanSource(env, source) {
  if (!source || !["public_html", "public_json"].includes(source.connector_mode)) {
    throw new Error("Only approved public_html or public_json sources can be scanned.");
  }
  const payload = await fetchSourcePayload(env, source);
  const jobs = (source.connector_mode === "public_json" ? parseJsonFeed(payload, source) : parseJobs(payload, source)).slice(0, 25);
  const now = new Date().toISOString();
  let inserted = 0;
  for (const job of jobs) {
    const dedupe = dedupeKey(source.id, job.title, job.employer, job.location);
    const id = `${source.id}-${hash(dedupe).slice(0, 12)}`;
    const result = await env.JOBS_DB.prepare(
      `INSERT OR IGNORE INTO jobs
        (id, source_id, source_url, title, employer, location, description, score, status, discovered_at, updated_at, dedupe_key)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'discovered', ?9, ?9, ?10)`,
    )
      .bind(id, source.id, job.url || source.url, job.title, job.employer, job.location, job.description, job.score, now, dedupe)
      .run();
    inserted += result.meta?.changes || 0;
  }
  const next = new Date(Date.now() + Number(source.interval_minutes || 360) * 60_000).toISOString();
  await env.JOBS_DB.prepare(
    "UPDATE sources SET last_scanned_at = ?1, next_scan_at = ?2, last_error = '', updated_at = ?1 WHERE id = ?3",
  ).bind(now, next, source.id).run();
  return { scanned: source.id, parsed: jobs.length, inserted };
}

async function fetchSourcePayload(env, source) {
  const cacheKey = `source-html:${source.id}:${hash(source.url)}`;
  const cached = env.JOBS_CACHE ? await env.JOBS_CACHE.get(cacheKey) : "";
  if (cached) return cached;
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "JOBS.wasfai.com ingestion bot; contact=admin@wasfai.com",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`source returned ${response.status}`);
  const html = await response.text();
  if (env.JOBS_CACHE) {
    await env.JOBS_CACHE.put(cacheKey, html, { expirationTtl: 900 });
  }
  return html;
}

function parseJsonFeed(text, source) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("public JSON source returned invalid JSON"); }
  const rows = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : [];
  return uniqueJobs(rows.map((row) => ({
    title: clean(row.title || row.name || ""),
    employer: clean(row.company_name || row.company || source.label),
    location: clean(row.candidate_required_location || row.location || source.region || "Remote"),
    url: safeJobUrl(row.url || row.job_url || source.url, source.url),
    description: stripHtml(row.description || row.description_text || "").slice(0, 1200),
    score: scoreJob(`${row.title || ""} ${row.company_name || row.company || ""} ${row.candidate_required_location || row.location || ""} ${row.description || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function safeJobUrl(value, base) {
  try { return new URL(String(value), base).toString(); } catch { return base; }
}

function parseJobs(html, source) {
  const jsonLdJobs = parseJsonLdJobs(html, source);
  if (jsonLdJobs.length) return uniqueJobs(jsonLdJobs).filter(isLikelyParsedJob);

  const cards = [
    ...html.matchAll(/<(article|li|div)[^>]*(?:job|posting|card|result)[^>]*>([\s\S]*?)<\/\1>/gi),
  ].map((m) => m[2]);
  const candidates = cards.length ? cards : html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.split(/<\/a>/i) || [];
  return uniqueJobs(candidates
    .map((card) => normalizeCard(card, source))
    .filter((job) => job.title.length > 4))
    .filter(isLikelyParsedJob);
}

function normalizeCard(card, source) {
  const title = pick(card, [/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i, /title["'][^>]*>(.*?)</i, /aria-label=["']([^"']+)["']/i]);
  const employer = pick(card, [/(?:company|employer)["'][^>]*>(.*?)</i, /<strong[^>]*>(.*?)<\/strong>/i]) || source.label;
  const location = pick(card, [/(?:location|city)["'][^>]*>(.*?)</i]) || source.region || "";
  const href = pick(card, [/<a[^>]+href=["']([^"']+)["']/i]);
  const description = stripHtml(card).slice(0, 800);
  return {
    title: clean(title),
    employer: clean(employer),
    location: clean(location),
    url: href ? new URL(href, source.url).toString() : source.url,
    description,
    score: scoreJob(`${title} ${employer} ${location} ${description}`, source),
  };
}

function parseJsonLdJobs(html, source) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const jobs = [];
  for (const script of scripts) {
    const text = decodeHtml(script[1] || "").trim();
    if (!text) continue;
    try {
      collectJsonLdJobs(JSON.parse(text), source, jobs);
    } catch {
      // Many boards include invalid analytics JSON-LD. Ignore and keep parsing cards.
    }
  }
  return jobs;
}

function collectJsonLdJobs(node, source, jobs) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdJobs(item, source, jobs);
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node["@graph"])) collectJsonLdJobs(node["@graph"], source, jobs);
  const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : String(node["@type"] || "");
  if (!/JobPosting/i.test(type)) return;
  const employer = typeof node.hiringOrganization === "object" ? node.hiringOrganization.name : node.hiringOrganization;
  const location = normalizeJsonLocation(node.jobLocation);
  jobs.push({
    title: clean(node.title || ""),
    employer: clean(employer || source.label),
    location: clean(location || source.region || ""),
    url: node.url ? new URL(String(node.url), source.url).toString() : source.url,
    description: stripHtml(node.description || "").slice(0, 1200),
    score: scoreJob(`${node.title || ""} ${employer || ""} ${location || ""} ${node.description || ""}`, source),
  });
}

function normalizeJsonLocation(value) {
  if (Array.isArray(value)) return value.map(normalizeJsonLocation).filter(Boolean).join(", ");
  if (!value || typeof value !== "object") return "";
  const address = value.address || {};
  return [
    address.addressLocality,
    address.addressRegion,
    address.addressCountry?.name || address.addressCountry,
  ].filter(Boolean).join(", ");
}

function uniqueJobs(jobs) {
  return jobs.filter((job, index, all) =>
    all.findIndex((x) => dedupeKey("parsed", x.title, x.employer, x.location) === dedupeKey("parsed", job.title, job.employer, job.location)) === index,
  );
}

function isLikelyParsedJob(job) {
  if (!job || !job.title || job.title.length < 5) return false;
  if (isBlockedTitle(job.title)) return false;
  const text = `${job.title} ${job.description || ""}`.toLowerCase();
  const roleWords = [
    "manager", "engineer", "developer", "analyst", "consultant", "specialist", "director", "lead",
    "coordinator", "supervisor", "officer", "technician", "designer", "architect", "محاسب", "مهندس", "مدير",
  ];
  const hasRoleWord = roleWords.some((word) => text.includes(word));
  const hasDetailUrl = /\/job|jobs\/[^/?#]+[-_]\d+|\/careers\//i.test(job.url || "");
  return hasRoleWord || hasDetailUrl || String(job.description || "").length > 180;
}

function isLikelyStoredJob(job) {
  return isLikelyParsedJob({
    title: job.title,
    employer: job.employer,
    location: job.location,
    description: job.description,
    url: job.source_url,
  });
}

function isBlockedTitle(title) {
  return [
    /browse jobs/i,
    /top cities/i,
    /work your way/i,
    /jobs by department/i,
    /find jobs/i,
    /job search/i,
    /career advice/i,
    /companies hiring/i,
    /all jobs/i,
    /explore jobs/i,
    /popular job titles/i,
    /trending job titles/i,
    /job titles/i,
  ].some((pattern) => pattern.test(String(title || "")));
}

function normalizeProfile(profile) {
  const terms = [
    ...splitTerms(profile.target_roles),
    ...splitTerms(profile.resume_skills),
    ...splitTerms(profile.resume_seniority),
    ...splitTerms(profile.resume_regions),
    ...splitTerms(profile.target_locations),
    ...splitTerms(profile.resume_text).slice(0, 30),
  ].map((term) => term.toLowerCase()).filter((term, index, all) => term.length > 2 && all.indexOf(term) === index);
  const locations = splitTerms(`${profile.target_locations || ""},${profile.resume_regions || ""}`).map((term) => term.toLowerCase());
  return { terms, locations };
}

function matchJob(job, profile) {
  const haystack = `${job.title} ${job.employer} ${job.location} ${job.description}`.toLowerCase();
  const title = String(job.title || "").toLowerCase();
  let score = 45;
  const hits = [];
  for (const term of profile.terms) {
    if (title.includes(term)) {
      score += 12;
      hits.push(term);
    } else if (haystack.includes(term)) {
      score += 5;
      hits.push(term);
    }
  }
  for (const location of profile.locations) {
    if (location && String(job.location || "").toLowerCase().includes(location)) score += 6;
  }
  score = Math.max(45, Math.min(98, score));
  return {
    ...job,
    score,
    fit_explanation: hits.length
      ? `Matched approved resume terms: ${hits.slice(0, 8).join(", ")}.`
      : "Clean live job, but weak match to the approved resume terms.",
  };
}

function splitTerms(value) {
  const stopwords = new Set([
    "and", "for", "the", "with", "from", "into", "this", "that", "resume", "master", "approved",
    "job", "jobs", "role", "roles", "global", "text", "profile", "candidate",
  ]);
  return String(value || "")
    .split(/[^a-z0-9\u0600-\u06FF+#.]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stopwords.has(term.toLowerCase()))
    .slice(0, 80);
}

function scoreJob(text, source) {
  const haystack = text.toLowerCase();
  const queryTerms = String(source.query || "").toLowerCase().split(/[^a-z0-9\u0600-\u06FF]+/).filter(Boolean);
  const regionTerms = String(source.region || "").toLowerCase().split(/[^a-z0-9\u0600-\u06FF]+/).filter((x) => x.length > 2);
  let score = 50;
  for (const term of queryTerms) if (haystack.includes(term)) score += 8;
  for (const term of regionTerms) if (haystack.includes(term)) score += 4;
  return Math.max(40, Math.min(98, score));
}

async function sourceById(env, id) {
  return env.JOBS_DB.prepare("SELECT * FROM sources WHERE id = ?1").bind(id).first();
}

async function upsertManagedSource(env, input) {
  const id = String(input.id || "").trim();
  const label = clean(input.label).slice(0, 120);
  const url = safeHttpUrl(input.url);
  const owner = String(input.owner_user_id || "").trim().slice(0, 255);
  if (!id || !label || !url || !owner) throw new Error("id, label, https/http URL, and owner_user_id are required");
  const region = clean(input.region).slice(0, 160);
  const query = clean(input.query).slice(0, 300);
  const interval = safeInterval(input.interval_minutes);
  const enabled = input.scheduled === false || input.enabled === false ? 0 : 1;
  const now = new Date().toISOString();
  await env.JOBS_DB.prepare(
    `INSERT INTO sources (id, label, url, region, query, enabled, connector_mode, interval_minutes, next_scan_at, owner_user_id, visibility, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'public_html', ?7, ?8, ?9, 'private', ?10, ?10)
     ON CONFLICT(id) DO UPDATE SET label=excluded.label, url=excluded.url, region=excluded.region, query=excluded.query,
       enabled=excluded.enabled, interval_minutes=excluded.interval_minutes, next_scan_at=excluded.next_scan_at, updated_at=excluded.updated_at`,
  ).bind(id, label, url, region, query, enabled, interval, enabled ? now : "", owner, now).run();
  return sourceById(env, id);
}

async function updateManagedSource(env, id, input) {
  const existing = await sourceById(env, id);
  if (!existing) return null;
  const scheduled = input.scheduled !== undefined ? Boolean(input.scheduled) : Boolean(existing.enabled);
  const interval = safeInterval(input.interval_minutes || existing.interval_minutes);
  const next = scheduled ? new Date().toISOString() : "";
  await env.JOBS_DB.prepare(
    "UPDATE sources SET enabled=?1, interval_minutes=?2, next_scan_at=?3, updated_at=?4 WHERE id=?5",
  ).bind(scheduled ? 1 : 0, interval, next, new Date().toISOString(), id).run();
  return sourceById(env, id);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeInterval(value) {
  return Math.max(30, Math.min(10080, Number(value) || 360));
}

function isAdminRequest(request, env) {
  const expected = String(env.INGESTION_ADMIN_TOKEN || "");
  const actual = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(expected) && actual.length === expected.length && constantTimeEqual(actual, expected);
}

function constantTimeEqual(a, b) {
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function forbidden() {
  return json({ ok: false, error: "admin authorization required" }, 401);
}

async function recordSourceError(env, id, error) {
  if (!id) return;
  const now = new Date();
  // A failed/blocked board must not be retried on every cron tick. Retain the
  // source for operator review and retry after at least six hours.
  const next = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  await env.JOBS_DB.prepare("UPDATE sources SET last_error = ?1, next_scan_at = ?2, updated_at = ?3 WHERE id = ?4")
    .bind(errorMessage(error), next, now.toISOString(), id)
    .run();
}

function withSourceQuality(source) {
  return {
    ...source,
    source_quality: source.last_error
      ? "needs_attention"
      : source.last_scanned_at
        ? "live_verified"
        : "not_verified",
  };
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function pick(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return stripHtml(match[1] || "");
  }
  return "";
}

function stripHtml(value) {
  return clean(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupeKey(source, title, employer, location) {
  return `${source}|${clean(title).toLowerCase()}|${clean(employer).toLowerCase()}|${clean(location).toLowerCase()}`;
}

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
