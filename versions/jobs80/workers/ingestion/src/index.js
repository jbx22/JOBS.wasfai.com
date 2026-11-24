import { isBroadRole, jobResponsibilities, normalizeMatchText, occupationalField, roleEvidence, skillFields } from "./occupations.js";
import { getJobDb } from "./_db.js";
import { ensureEmployerBoards, GOVERNMENT_BOARDS, GOVERNMENT_CONNECTOR, PORTAL_ONLY_BOARDS,
  presentCentralSource, SMARTRECRUITERS_BOARDS, SMARTRECRUITERS_CONNECTOR, SOURCE_CONNECTORS } from "./boards.js";
import { parseGovernmentPosting, parseGovernmentSitemap } from "./government.js";
import { fetchSmartRecruitersJobs } from "./smartrecruiters.js";

const GOV_JOBS_PER_SCAN = 24;
const DESCRIPTION_LIMIT = 6000;
const BATCH_BYTES = 30_000;
const encoder = new TextEncoder();
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
        const id = message.body?.id;
        const source = typeof id === "string" && id ? await sourceById(env, id) : null;
        const due = source?.enabled && (!source.next_scan_at || source.next_scan_at <= new Date().toISOString());
        if (source && !isPortalOnly(source) && (message.body.force === true || due)) await scanSource(env, source);
        message.ack();
      } catch (error) {
        await recordSourceError(env, message.body?.id, error);
        message.ack();
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
      const { results } = await getJobDb(env).prepare("SELECT id, label, url, region, connector_mode, last_scanned_at, next_scan_at, last_error FROM sources WHERE visibility = 'central' AND owner_user_id = '' AND (enabled = 1 OR connector_mode = 'portal_only') ORDER BY label").all();
      return json({ ok: true, sources: results.map(presentCentralSource) });
    }
    if (url.pathname === "/jobs" && request.method === "GET") {
      const limit = Math.max(1, Math.min(Math.floor(Number(url.searchParams.get("limit")) || 50), 100));
      const { results } = await getJobDb(env).prepare(
        "SELECT j.* FROM jobs j JOIN sources s ON s.id = j.source_id WHERE s.visibility = 'central' AND s.owner_user_id = '' AND s.enabled = 1 AND j.verification_status = 'live' AND j.closed_at = '' AND (j.valid_through = '' OR j.valid_through >= ?1) AND j.last_verified_at >= ?2 AND (?4='' OR j.sector=?4) ORDER BY score DESC, discovered_at DESC LIMIT ?3",
      ).bind(new Date().toISOString(), new Date(Date.now() - 7 * 86400000).toISOString(), limit, url.searchParams.get("sector") === "government" ? "government" : "").all();
      return json({ ok: true, jobs: results.filter(isLikelyStoredJob).map((job) => ({ ...job, data_quality: "live_verified", source_quality: "live_verified" })) });
    }
    if (url.pathname === "/match" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const limit = Math.max(1, Math.min(Math.floor(Number(body.limit) || 50), 100));
      const profile = normalizeProfile(body.profile || {});
      const { results } = await getJobDb(env).prepare(
        "SELECT j.* FROM jobs j JOIN sources s ON s.id = j.source_id WHERE s.visibility = 'central' AND s.owner_user_id = '' AND s.enabled = 1 AND j.verification_status = 'live' AND j.closed_at = '' AND (j.valid_through = '' OR j.valid_through >= ?1) AND j.last_verified_at >= ?2 ORDER BY discovered_at DESC LIMIT 300",
      ).bind(new Date().toISOString(), new Date(Date.now() - 7 * 86400000).toISOString()).all();
      const jobs = results
        .filter(isLikelyStoredJob)
        .map((job) => matchJob(job, profile))
        .filter((job) => job.match_eligible)
        .sort((a, b) => b.score - a.score || String(b.discovered_at).localeCompare(String(a.discovered_at)))
        .slice(0, limit);
      return json({ ok: true, jobs, matched: jobs.length, profile_terms: profile.terms.slice(0, 30) });
    }
    if (url.pathname === "/admin/metrics" && request.method === "GET") {
      if (!isAdminRequest(request, env)) return forbidden();
      const { results } = await getJobDb(env).prepare(
        "SELECT metric_key, bucket, value, updated_at FROM ingestion_metrics ORDER BY bucket DESC, metric_key LIMIT 250",
      ).all();
      return json({ ok: true, metrics: results });
    }
    if (url.pathname === "/admin/scan-now" && request.method === "POST") {
      if (!isAdminRequest(request, env)) return forbidden();
      const body = await request.json().catch(() => ({}));
      const id = String(body.id || "");
      const source = id ? await sourceById(env, id) : null;
      if (!source || (source.visibility === "private" && source.owner_user_id !== body.owner_user_id)) {
        return json({ ok: false, error: "source not found" }, 404);
      }
      if (isPortalOnly(source)) return json({ ok: false, error: "Open this source on its official portal." }, 409);
      if (url.searchParams.get("mode") === "direct") {
        try {
          const result = await scanSource(env, source);
          const { results: jobs = [] } = await getJobDb(env).prepare(
            "SELECT * FROM jobs WHERE source_id = ? AND last_verified_at = ? AND closed_at = '' ORDER BY score DESC, id LIMIT 100",
          ).bind(source.id, result.scanned_at).all();
          return json({ ok: true, mode: "direct", result, jobs });
        } catch (error) {
          await recordSourceError(env, source.id, error);
          return json({ ok: false, mode: "direct", error: errorMessage(error) }, 502);
        }
      }
      await env.JOBS_SCAN_QUEUE.send({ id: source.id, force: true });
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
  const db = getJobDb(env);
  await ensureEmployerBoards(db);
  const now = new Date().toISOString();
  const { results } = await db.prepare(
    "SELECT id FROM sources WHERE enabled = 1 AND (next_scan_at = '' OR next_scan_at <= ?1) ORDER BY next_scan_at, id LIMIT 20",
  ).bind(now).all();
  for (const source of results) {
    await env.JOBS_SCAN_QUEUE.send(source);
  }
  return results.length;
}

async function scanSource(env, source) {
  const government = source?.connector_mode === GOVERNMENT_CONNECTOR;
  const smartRecruiters = source?.connector_mode === SMARTRECRUITERS_CONNECTOR;
  if (!source || isPortalOnly(source) || (!government && !smartRecruiters && !SOURCE_CONNECTORS.includes(source.connector_mode))) {
    throw new Error("Unsupported connector mode.");
  }
  let result;
  if (government) {
    result = await fetchGovernmentJobs(source);
  } else if (smartRecruiters) {
    const board = SMARTRECRUITERS_BOARDS.find((item) => item.id === source.id && item.url === source.url);
    if (!board || source.visibility !== "central" || source.owner_user_id) throw new Error("Unregistered SmartRecruiters source");
    result = await fetchSmartRecruitersJobs(board, async (url) =>
      JSON.parse(await fetchPublicPayload(url, /application\/json/, { official: true })));
  } else {
    result = { jobs: parseSourcePayload(await fetchSourcePayload(env, source), source).slice(0, 100) };
  }
  const now = new Date().toISOString();
  const jobs = result.jobs.filter((job) => !job.valid_through || job.valid_through >= now);
  const db = getJobDb(env);
  const writes = jobs.map((job) => {
    const dedupe = job.requisition ? `${source.id}|${job.requisition}` : dedupeKey(source.id, job.title, job.employer, job.location);
    const id = `${source.id}-${job.requisition || hash(dedupe).slice(0, 12)}`;
    const metadata = classifyJob(job);
    return db.prepare(`INSERT INTO jobs
        (id, source_id, source_url, title, employer, location, description, score, status, discovered_at, updated_at, dedupe_key,
         posted_at, valid_through, last_verified_at, verification_status, closed_at, canonical_employer, role_family, seniority, sector)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'discovered', ?9, ?9, ?10, ?11, ?12, ?9, 'live', '', ?13, ?14, ?15, ?16)
       ON CONFLICT(dedupe_key) DO UPDATE SET source_url=excluded.source_url, title=excluded.title,
         employer=excluded.employer, location=excluded.location, description=excluded.description, score=excluded.score,
         updated_at=excluded.updated_at, last_verified_at=excluded.last_verified_at, verification_status='live', closed_at='',
         valid_through=excluded.valid_through, posted_at=excluded.posted_at, canonical_employer=excluded.canonical_employer,
         role_family=excluded.role_family, seniority=excluded.seniority, sector=excluded.sector`,
    ).bind(id, source.id, job.url || source.url, job.title, job.employer, job.location, job.description, job.score, now, dedupe,
      job.posted_at || "", job.valid_through || "", metadata.employer, metadata.role_family, metadata.seniority, government ? "government" : metadata.sector);
  });
  const inserted = await writeJobBatches(db, writes);
  const next = new Date(Date.now() + Number(source.interval_minutes || 360) * 60_000).toISOString();
  await db.prepare(
    "UPDATE sources SET last_scanned_at = ?1, next_scan_at = ?2, last_error = ?3, updated_at = ?1 WHERE id = ?4",
  ).bind(now, next, result.warning || "", source.id).run();
  const grace = result.complete ? 2 * Number(source.interval_minutes || 360) * 60_000 : 14 * 86400_000;
  await archiveStaleJobs(env, source.id, now, grace);
  await incrementMetric(env, "scan_success", source.id);
  await incrementMetric(env, "jobs_parsed", source.id, jobs.length);
  return { scanned: source.id, scanned_at: now, parsed: jobs.length, inserted };
}

async function writeJobBatches(db, statements) {
  let jobs = [];
  let bytes = 32;
  let written = 0;
  for (const statement of statements) {
    const size = encoder.encode(JSON.stringify({ sql: statement.sql, params: statement.params, mode: "run" })).length + 1;
    if (jobs.length && bytes + size > BATCH_BYTES) {
      const results = await db.batch(jobs);
      written += results.reduce((count, row) => count + Number(row.meta?.changes || 0), 0);
      jobs = [];
      bytes = 32;
    }
    jobs.push(statement);
    bytes += size;
  }
  if (jobs.length) {
    const results = await db.batch(jobs);
    written += results.reduce((count, row) => count + Number(row.meta?.changes || 0), 0);
  }
  return written;
}

async function fetchGovernmentJobs(source) {
  const board = GOVERNMENT_BOARDS.find((item) => item.id === source.id && item.url === source.url);
  if (!board || source.visibility !== "central" || source.owner_user_id) throw new Error("Unregistered government source");
  const xml = await fetchPublicPayload(board.url, /(?:application|text)\/xml/, { official: true });
  const links = parseGovernmentSitemap(xml, board);
  const blocks = Math.ceil(links.length / GOV_JOBS_PER_SCAN) || 1;
  const block = Math.floor(Date.now() / (Number(source.interval_minutes || 360) * 60_000)) % blocks;
  const start = block * GOV_JOBS_PER_SCAN;
  const batch = links.slice(start, start + GOV_JOBS_PER_SCAN);
  const jobs = [];
  const errors = [];
  for (const link of batch) {
    try {
      const html = await fetchPublicPayload(link.url, /text\/html/, { official: true, missingOk: true });
      if (!html) continue;
      const job = parseGovernmentPosting(html, link, board);
      if (job) jobs.push(job);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length && errors.length === batch.length) throw errors[0];
  const warning = errors.length ? `Official board: ${errors.length} of ${batch.length} details could not be verified` : "";
  return { jobs, warning, complete: blocks === 1 && !errors.length };
}

async function fetchSourcePayload(env, source) {
  assertPublicSourceUrl(source.url);
  const cacheKey = `source-html:${source.id}:${hash(source.url)}`;
  const cached = env.JOBS_CACHE ? await env.JOBS_CACHE.get(cacheKey) : "";
  if (cached) return cached;
  const html = await fetchPublicPayload(source.url, /(?:text\/html|application\/(?:json|ld\+json)|text\/plain)/);
  if (env.JOBS_CACHE) {
    await env.JOBS_CACHE.put(cacheKey, html, { expirationTtl: 900 });
  }
  return html;
}

export async function fetchPublicPayload(url, contentType, { official = false, missingOk = false, timeoutMs = 12_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const options = { signal: controller.signal, headers: {
      "User-Agent": "JOBS.wasfai.com ingestion bot; contact=admin@wasfai.com",
      Accept: "text/html,application/xhtml+xml,application/json,application/xml,text/xml",
    } };
    const response = official ? await fetch(url, { ...options, redirect: "manual" }) : await fetchWithSafeRedirects(url, options);
    if (missingOk && [404, 410].includes(response.status)) return "";
    if (!response.ok) throw new Error(`source returned ${response.status}`);
    const type = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.test(type)) throw new Error(`unsupported source content type: ${type || "unknown"}`);
    if (Number(response.headers.get("content-length")) > 2_000_000) throw new Error("source response exceeds 2 MB limit");
    return await readLimitedText(response, 2_000_000);
  } finally { clearTimeout(timer); }
}

export function parseSourcePayload(payload, source) {
  const parsers = { public_html: parseJobs, public_json: parseJsonFeed, greenhouse: parseGreenhouse,
    lever: parseLever, ashby: parseAshby, workable: parseWorkable };
  return (parsers[source.connector_mode] || parseJsonFeed)(payload, source)
    .filter((job) => job.url.length <= 2048 && safeHttpUrl(job.url))
    .map((job) => ({
      ...job,
      title: job.title.slice(0, 240),
      employer: clean(job.employer).slice(0, 200),
      location: job.location.slice(0, 240),
    }));
}

function parseJsonFeed(text, source) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("public JSON source returned invalid JSON"); }
  const rows = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : [];
  if (!Array.isArray(data) && !Array.isArray(data?.jobs)) throw new Error("Public JSON response did not contain a job list");
  return uniqueJobs(rows.filter((row) => row && typeof row === "object").map((row) => ({
    title: clean(row.title || row.name || ""),
    employer: clean(row.company_name || row.company || source.label),
    location: clean(row.candidate_required_location || row.location || source.region || "Remote"),
    url: safeJobUrl(row.url || row.job_url, source.url),
    description: jobDescription(row.description || row.description_text),
    posted_at: isoDate(row.publication_date || row.created_at || row.published_at),
    valid_through: isoDate(row.valid_through || row.expiration_date || row.deadline),
    score: scoreJob(`${row.title || ""} ${row.company_name || row.company || ""} ${row.candidate_required_location || row.location || ""} ${row.description || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseGreenhouse(text, source) {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.jobs)) throw new Error("Greenhouse response did not contain a job list");
  return uniqueJobs(data.jobs.filter((row) => row && typeof row === "object").map((row) => ({
    title: clean(row.title), employer: source.label, location: clean(row.location?.name || source.region),
    url: safeJobUrl(row.absolute_url, source.url), description: jobDescription(decodeHtml(row.content || "")),
    posted_at: isoDate(row.first_published), valid_through: "", score: scoreJob(`${row.title} ${row.content || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseLever(text, source) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error("Lever response did not contain a job list");
  return uniqueJobs(rows.filter((row) => row && typeof row === "object").map((row) => ({
    title: clean(row.text), employer: source.label, location: clean(row.categories?.location || source.region),
    url: safeJobUrl(row.hostedUrl || row.applyUrl, source.url), description: jobDescription(row.descriptionPlain || row.description),
    posted_at: isoDate(Number(row.createdAt)), valid_through: "",
    score: scoreJob(`${row.text} ${row.categories?.team || ""} ${row.descriptionPlain || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseAshby(text, source) {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.jobs)) throw new Error("Ashby response did not contain a job list");
  return uniqueJobs(data.jobs.filter((row) => row && row.isListed !== false).map((row) => ({
    title: clean(row.title), employer: source.label, location: clean(row.location || source.region),
    url: safeJobUrl(row.jobUrl || row.applyUrl, source.url), description: jobDescription(row.descriptionPlain || row.descriptionHtml),
    posted_at: isoDate(row.publishedAt), valid_through: isoDate(row.validThrough),
    score: scoreJob(`${row.title} ${row.department || ""} ${row.descriptionPlain || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseWorkable(text, source) {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.jobs)) throw new Error("Workable response did not contain a job list");
  return uniqueJobs(data.jobs.filter((row) => row && typeof row === "object").map((row) => {
    const publishedLocations = Array.isArray(row.locations) ? row.locations.filter((item) => item && !item.hidden) : [];
    const locations = publishedLocations.map(({ city, country }) => [city, country].filter(Boolean).join(", "));
    const location = Array.isArray(row.locations) && row.locations.length
      ? [...new Set(locations.filter(Boolean))].join("; ") : [row.city, row.country].filter(Boolean).join(", ");
    return {
      title: clean(row.title), employer: source.label, location: clean(location),
      url: safeJobUrl(row.url || row.shortlink, source.url),
      description: jobDescription(row.description || [row.department, row.employment_type, row.experience].filter(Boolean).join(" · ")),
      posted_at: isoDate(row.published_on), valid_through: "", score: scoreJob(`${row.title} ${location}`, source),
    };
  })).filter(isLikelyParsedJob);
}

function safeJobUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return "";
  try { return safeHttpUrl(new URL(value, base).toString()); } catch { return ""; }
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
  const description = jobDescription(card);
  return {
    title: clean(title),
    employer: clean(employer),
    location: clean(location),
    url: safeJobUrl(href, source.url),
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
  const employer = typeof node.hiringOrganization === "object" ? node.hiringOrganization?.name : node.hiringOrganization;
  const location = normalizeJsonLocation(node.jobLocation);
  jobs.push({
    title: clean(node.title || ""),
    employer: clean(employer || source.label),
    location: clean(location || source.region || ""),
    url: safeJobUrl(node.url || node.mainEntityOfPage?.["@id"] || source.url, source.url),
    description: jobDescription(node.description),
    posted_at: isoDate(node.datePosted),
    valid_through: isoDate(node.validThrough),
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
  const seen = new Set();
  return jobs.filter((job) => {
    if (!job.url) return false;
    const key = dedupeKey("parsed", job.title, job.employer, job.location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyParsedJob(job) {
  if (!job || !job.title || job.title.length < 3) return false;
  if (isBlockedTitle(job.title)) return false;
  const text = `${job.title} ${job.description || ""}`.toLowerCase();
  const roleWords = [
    "manager", "engineer", "developer", "analyst", "consultant", "specialist", "director", "lead",
    "coordinator", "supervisor", "officer", "technician", "designer", "architect", "محاسب", "مهندس", "مدير",
  ];
  const hasRoleWord = roleWords.some((word) => text.includes(word));
  const hasDetailUrl = /\/job|jobs\/[^/?#]+[-_]\d+|\/careers\/|^https:\/\/apply\.workable\.com\/j\/[a-z0-9]+/i.test(job.url || "");
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

const CITY_ALIASES = [
  ["riyadh", "الرياض"], ["jeddah", "جدة", "جده"], ["makkah", "mecca", "مكة"],
  ["madinah", "medina", "المدينة"], ["dammam", "الدمام"], ["khobar", "الخبر"],
  ["jazan", "jizan", "جازان", "جيزان"], ["najran", "نجران"], ["hail", "ha’il", "ha'il", "حائل"],
  ["tabuk", "تبوك"], ["yanbu", "ينبع"], ["jubail", "الجبيل"], ["abha", "أبها", "ابها"], ["taif", "الطائف"],
  ["khamis mushait", "خميس مشيط"],
];

const ASIR_CITIES = ["asir", "aseer", "عسير", "abha", "أبها", "ابها", "khamis mushait", "خميس مشيط"];
export function cityAliases(value) {
  const input = normalizeMatchText(value).trim();
  return [...CITY_ALIASES, ASIR_CITIES].find(group => group.some(name => normalizeMatchText(name) === input)) || [value];
}

const LOCATION_ALIASES = [
  ...CITY_ALIASES, ASIR_CITIES,
  ["saudi arabia", "ksa", "السعودية", "المملكة العربية السعودية", ...ASIR_CITIES, ...CITY_ALIASES.flat()],
  ["gcc", "gulf", "الخليج", "saudi arabia", "السعودية", ...CITY_ALIASES.flat(), "united arab emirates", "qatar", "kuwait", "bahrain", "oman", "الإمارات", "قطر", "الكويت", "البحرين", "عمان"],
];

const ROLE_ALIASES = [
  ["mechanical engineer", "مهندس ميكانيكي", "مهندس ميكانيكا", "مهندسة ميكانيكية"],
  ["project manager", "مدير مشروع", "مدير مشاريع", "مدير المشاريع"],
  ["maintenance engineer", "مهندس صيانة"], ["accountant", "محاسب", "محاسبة"],
  ["industrial engineer", "مهندس صناعي", "مهندسة صناعية"], ["industrial consultant", "مستشار صناعي", "استشاري صناعي"],
  ["plant manager", "factory manager", "مدير مصنع", "مدير المصنع"],
  ["project controls engineer", "مهندس ضبط المشاريع", "مهندس مراقبة المشاريع"],
  ["financial analyst", "محلل مالي", "محللة مالية"], ["registered nurse", "ممرض مسجل", "ممرضة مسجلة"],
  ["procurement specialist", "أخصائي مشتريات", "أخصائية مشتريات"], ["human resources specialist", "HR specialist", "أخصائي موارد بشرية", "أخصائية موارد بشرية"],
  ["operations manager", "مدير عمليات", "مدير العمليات"],
  ["administrative assistant", "admin assistant", "مساعد إداري", "مساعدة إدارية"],
  ["receptionist", "front desk receptionist", "موظف استقبال", "موظفة استقبال"],
  ["front desk agent", "front office agent", "موظف استقبال فندقي", "موظفة استقبال فندقي"],
  ["customer service representative", "customer service agent", "customer support representative", "ممثل خدمة العملاء", "ممثلة خدمة العملاء", "موظف خدمة عملاء", "موظفة خدمة عملاء", "خدمة العملاء"],
  ["sales associate", "retail sales associate", "بائع تجزئة", "بائعة تجزئة"],
  ["data entry clerk", "مدخل بيانات", "مدخلة بيانات"],
  ["data analyst", "محلل بيانات"], ["software engineer", "software developer", "مهندس برمجيات", "مطور برمجيات"],
];

const SKILL_ALIASES = [
  ["maintenance", "الصيانة", "صيانة"], ["commissioning", "التشغيل التجريبي", "تشغيل تجريبي"],
  ["rotating equipment", "معدات دوارة", "المعدات الدوارة"], ["pumps", "مضخات", "المضخات"],
  ["project controls", "ضبط المشاريع", "مراقبة المشاريع"], ["cost control", "ضبط التكاليف", "مراقبة التكاليف"],
  ["risk management", "إدارة المخاطر"], ["project management", "إدارة المشاريع"],
  ["quality control", "مراقبة الجودة", "ضبط الجودة"], ["budgeting", "إعداد الميزانية"],
  ["customer service", "خدمة العملاء", "خدمة الزبائن"], ["data entry", "إدخال البيانات"],
  ["complaint resolution", "معالجة الشكاوى", "حل الشكاوى"], ["bookkeeping", "مسك الدفاتر"],
];

function aliasLookup(groups) {
  const aliases = new Map();
  for (const group of groups) {
    for (const term of group) {
      const key = normalizeMatchText(term);
      if (!aliases.has(key)) aliases.set(key, group);
    }
  }
  return aliases;
}

const locationLookup = aliasLookup(LOCATION_ALIASES);
const skillLookup = aliasLookup(SKILL_ALIASES);
const roleLookup = aliasLookup(ROLE_ALIASES);

export function roleSearchAliases(value) {
  return [...(roleLookup.get(normalizeMatchText(value).trim()) || [])];
}

const roleModifiers = new Set(["senior", "principal", "certified", "expert", "اول", "اولي", "معتمد", "معتمدة", "خبير", "خبيرة"]);
function prepareRole(term) {
  const normalized = normalizeMatchText(term);
  const spellings = [...(roleLookup.get(normalized) || [term])];
  const core = normalized.split(/\s+/u).filter(word => !roleModifiers.has(word)).join(" ");
  if (core !== normalized && occupationalField(core)) spellings.push(...(roleLookup.get(core) || [core]));
  return { term, field: occupationalField(term), broad: isBroadRole(term), words: spellings.map(phraseWords) };
}

function phraseWords(term) {
  return splitTerms(normalizeMatchText(term));
}

function preparePhrases(terms, lookup) {
  return terms.map(term => ({ term, words: (lookup?.get(normalizeMatchText(term)) || [term]).map(phraseWords) }));
}


export function normalizeProfile(profile) {
  const terms = [
    ...splitTerms(profile.target_roles),
    ...splitTerms(profile.resume_skills),
    ...splitTerms(profile.resume_seniority),
    ...splitTerms(profile.resume_regions),
    ...splitTerms(profile.target_locations),
    ...splitTerms(profile.resume_text).slice(0, 30),
  ].map((term) => term.toLowerCase()).filter((term, index, all) => term.length > 2 && all.indexOf(term) === index);
  const locations = splitPhrases(profile.target_locations || profile.resume_regions).map(lower);
  const roles = splitPhrases(profile.target_roles).map(lower);
  const skills = splitPhrases(profile.resume_skills).map(lower);
  const roleCriteria = roles.map(prepareRole);
  const targetFields = new Set(roleCriteria.map(role => role.field).filter(Boolean));
  const seniority = splitPhrases(profile.resume_seniority).map(lower);
  const sectors = splitPhrases(profile.target_sectors || profile.resume_sectors || profile.resume_work_examples).map(lower);
  return {
    terms,
    roles, skills, roleCriteria,
    skillCriteria: preparePhrases(skills, skillLookup),
    locationCriteria: preparePhrases(locations, locationLookup),
    seniorityCriteria: preparePhrases(seniority),
    sectorCriteria: preparePhrases(sectors),
    targetFields: targetFields.size ? targetFields : skillFields(skills),
    locations,
    seniority, sectors,
    allowRemote: /remote|عن بعد/i.test(`${profile.target_locations || ""} ${profile.resume_regions || ""}`),
  };
}

export function matchJob(job, profile) {
  const title = normalizeMatchText(job.title);
  const description = normalizeMatchText(job.description);
  const location = String(job.location || "").toLowerCase();
  const titleWords = matchWords(title);
  const descriptionWords = matchWords(title + " " + description);
  const locationWords = matchWords(location);
  const seniorityWords = matchWords(`${title} ${job.seniority || ""}`);
  const sectorWords = new Set([...descriptionWords, ...matchWords(job.sector)]);
  const skillHits = matchedPhrases(descriptionWords, profile.skillCriteria || preparePhrases(profile.skills, skillLookup));
  const criteria = profile.roleCriteria || profile.roles.map(prepareRole);
  const context = {
    title, ...jobResponsibilities(title, description, skillHits),
    targetFields: profile.targetFields || new Set(criteria.map(role => role.field).filter(Boolean)),
  };
  const roles = criteria.map(role => ({ term: role.term, match: roleEvidence(role, context, matchesWords(titleWords, role.words)) }))
    .filter(role => role.match);
  const roleHits = roles.map(role => role.term);
  const directRole = roles.some(role => role.match === "direct");
  const adjacentTitle = roles.some(role => role.match === "adjacent");
  const locationHits = matchedPhrases(locationWords, profile.locationCriteria || preparePhrases(profile.locations, locationLookup));
  const seniorityHits = matchedPhrases(seniorityWords, profile.seniorityCriteria || preparePhrases(profile.seniority));
  const sectorHits = matchedPhrases(sectorWords, profile.sectorCriteria || preparePhrases(profile.sectors));
  const remoteCompatible = profile.allowRemote && /remote|anywhere|global|عن بعد/i.test(location);
  const hasRole = roleHits.length > 0;
  const hasLocation = !profile.locations.length || locationHits.length > 0 || remoteCompatible;
  const seniorityConflict = hasSeniorityConflict(title, profile.seniority);
  const dimensions = [
    { key: "role", points: directRole ? 36 : hasRole ? 32 : 0, maximum: 36, evidence: roleHits },
    { key: "skills", points: Math.min(25, skillHits.length * 5), maximum: 25, evidence: skillHits },
    { key: "location", points: hasLocation ? 18 : 0, maximum: 18, evidence: remoteCompatible && !locationHits.length ? ["remote"] : locationHits },
    { key: "seniority", points: seniorityHits.length || !profile.seniority.length ? 10 : 0, maximum: 10, evidence: seniorityHits },
    { key: "sector", points: Math.min(11, sectorHits.length * 4), maximum: 11, evidence: sectorHits },
  ];
  let score = dimensions.reduce((total, dimension) => total + dimension.points, 0);
  if (seniorityConflict) score -= 30;
  score = Math.max(0, Math.min(100, score));
  const missing = [!hasRole && "target role", !hasLocation && "target location", seniorityConflict && "compatible seniority"].filter(Boolean);
  const evidence = [...roleHits, ...skillHits, ...locationHits, ...sectorHits].filter((x, i, all) => all.indexOf(x) === i).slice(0, 10);
  // Title, location and a concrete transfer are already independent evidence. An unlisted
  // seniority or industry requirement should lower the score while keeping that fit visible.
  const matchEligible = hasRole && hasLocation && !seniorityConflict &&
    (directRole || adjacentTitle || skillHits.length > 0);
  const requirementsToVerify = [...String(job.title || "").matchAll(/\(([^()]{1,80}?(?:\bexp(?:erience)?\.?|خبرة)[^()]{0,40})\)/giu)].map(item => item[1].trim());
  return {
    ...job,
    score,
    match_breakdown: dimensions,
    fit_grade: !hasRole || !hasLocation || seniorityConflict ? "F" : score >= 85 ? "A" : score >= 75 ? "B" : score >= 64 ? "C" : score >= 50 ? "D" : "F",
    match_eligible: matchEligible,
    match_confidence: !matchEligible ? "low" : evidence.length >= 5 ? "high" : evidence.length >= 2 ? "medium" : "low",
    match_evidence: evidence,
    missing_requirements: missing,
    requirements_to_verify: requirementsToVerify,
    fit_explanation: matchEligible
      ? `Evidence-backed match: ${evidence.join(", ")}.${requirementsToVerify.length ? " Verify with the employer: " + requirementsToVerify.join(", ") + "." : ""}`
      : `Not recommended${missing.length ? `: missing ${missing.join(", ")}` : ""}.`,
  };
}

function splitPhrases(value) {
  return String(value || "").split(/[,،;؛\n|]+/).map((item) => item.trim()).filter((item) => item.length > 2).slice(0, 30);
}

function lower(value) { return String(value || "").toLowerCase(); }

function matchWords(text) {
  return new Set(normalizeMatchText(text).match(/[a-z0-9\u0600-\u06ff+#]+(?:\.[a-z0-9]+)*/g) || []);
}

function matchesWords(words, spellings) {
  return spellings.some(tokens => tokens.length > 0 && tokens.every(term => words.has(term)));
}

function matchedPhrases(words, criteria) {
  return criteria.filter(item => matchesWords(words, item.words)).map(item => item.term);
}

function hasSeniorityConflict(title, desired) {
  if (!desired.length) return false;
  const wantsSenior = desired.some((x) => /senior|lead|manager|director|head|principal|خبير|مدير/.test(x));
  const juniorJob = /\b(?:intern|internship|junior|graduate|entry.level|trainee)\b|متدرب|حديث التخرج/i.test(title);
  return wantsSenior && juniorJob;
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
  return getJobDb(env).prepare("SELECT * FROM sources WHERE id = ?1").bind(id).first();
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
  const connector = SOURCE_CONNECTORS.includes(input.connector_mode)
    ? input.connector_mode : "public_html";
  const enabled = input.scheduled === false || input.enabled === false ? 0 : 1;
  const now = new Date().toISOString();
  await getJobDb(env).prepare(
    `INSERT INTO sources (id, label, url, region, query, enabled, connector_mode, interval_minutes, next_scan_at, owner_user_id, visibility, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?11, ?7, ?8, ?9, 'private', ?10, ?10)
     ON CONFLICT(id) DO UPDATE SET label=excluded.label, url=excluded.url, region=excluded.region, query=excluded.query,
       enabled=excluded.enabled, connector_mode=excluded.connector_mode, interval_minutes=excluded.interval_minutes, next_scan_at=excluded.next_scan_at, updated_at=excluded.updated_at
     WHERE sources.visibility='private' AND sources.owner_user_id=excluded.owner_user_id`,
  ).bind(id, label, url, region, query, enabled, interval, enabled ? now : "", owner, now, connector).run();
  const saved = await sourceById(env, id);
  if (saved?.visibility !== "private" || saved.owner_user_id !== owner) throw new Error("Source identifier is already in use.");
  return saved;
}

async function updateManagedSource(env, id, input) {
  const existing = await sourceById(env, id);
  if (existing?.visibility !== "private" || existing.owner_user_id !== input.owner_user_id) return null;
  const scheduled = input.scheduled !== undefined ? Boolean(input.scheduled) : Boolean(existing.enabled);
  const interval = safeInterval(input.interval_minutes || existing.interval_minutes);
  const next = scheduled ? new Date().toISOString() : "";
  await getJobDb(env).prepare(
    "UPDATE sources SET enabled=?1, interval_minutes=?2, next_scan_at=?3, updated_at=?4 WHERE id=?5 AND owner_user_id=?6 AND visibility='private'",
  ).bind(scheduled ? 1 : 0, interval, next, new Date().toISOString(), id, existing.owner_user_id).run();
  return sourceById(env, id);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    assertPublicSourceUrl(url.toString());
    return url.toString();
  } catch {
    return "";
  }
}

function assertPublicSourceUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("Sources must use HTTPS.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private source hosts are not allowed.");
  }
  if (/^(?:0|10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)(?:\.|$)/.test(host) || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    throw new Error("Private source addresses are not allowed.");
  }
  if (url.username || url.password) throw new Error("Credentialed source URLs are not allowed.");
  return url;
}

async function fetchWithSafeRedirects(initialUrl, options = {}) {
  let current = assertPublicSourceUrl(initialUrl).toString();
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("source redirect missing location");
    current = assertPublicSourceUrl(new URL(location, current).toString()).toString();
  }
  throw new Error("source exceeded redirect limit");
}

async function readLimitedText(response, limit) {
  if (!response.body?.getReader) return (await response.text()).slice(0, limit);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("source response exceeds 2 MB limit"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function archiveStaleJobs(env, sourceId, now, grace) {
  const cutoff = new Date(Date.parse(now) - grace).toISOString();
  await getJobDb(env).prepare(
    "UPDATE jobs SET verification_status='stale', closed_at=?1, updated_at=?1 WHERE source_id=?2 AND closed_at='' AND last_verified_at<>'' AND last_verified_at<?3",
  ).bind(now, sourceId, cutoff).run();
  await getJobDb(env).prepare(
    "UPDATE jobs SET verification_status='expired', closed_at=?1, updated_at=?1 WHERE closed_at='' AND valid_through<>'' AND valid_through<?1",
  ).bind(now).run();
}

/**
 * Metric upsert. The `value` reference in the `DO UPDATE SET` clause MUST be
 * table-qualified: PostgreSQL resolves a bare `value` against both the target
 * row and the special `excluded` row and rejects the statement with
 * `column reference "value" is ambiguous`. SQLite/D1 accept either form, so
 * qualifying keeps the preserved D1 rollback path valid while making the
 * statement portable to the VPS PostgreSQL store. See
 * test/upsert-compat.test.mjs.
 */
export const METRIC_UPSERT_SQL = `INSERT INTO ingestion_metrics(metric_key, bucket, value, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
     ON CONFLICT(metric_key, bucket) DO UPDATE SET value=ingestion_metrics.value+excluded.value, updated_at=CURRENT_TIMESTAMP`;

async function incrementMetric(env, key, bucket = "global", amount = 1) {
  await getJobDb(env).prepare(METRIC_UPSERT_SQL).bind(key, bucket, Number(amount)).run();
}

function classifyJob(job) {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const roleFamilies = [["engineering", /engineer|engineering|مهندس/], ["operations", /operations|maintenance|reliability|تشغيل|صيانة/], ["project-management", /project|program|pmo|مشروع/], ["leadership", /director|head|general manager|مدير/]];
  const sectors = [["industrial", /factory|manufactur|industrial|plant|مصنع|صناع/], ["energy", /energy|oil|gas|power|طاقة|نفط/], ["construction", /construction|contractor|epc|إنشاء/], ["technology", /software|developer|saas|cloud/]];
  return {
    employer: canonicalEmployer(job.employer),
    role_family: roleFamilies.find(([, pattern]) => pattern.test(text))?.[0] || "other",
    seniority: /director|head|vp|general manager|مدير عام/i.test(text) ? "executive" : /senior|lead|manager|principal|مدير|خبير/i.test(text) ? "senior" : /intern|junior|graduate|متدرب/i.test(text) ? "entry" : "professional",
    sector: sectors.find(([, pattern]) => pattern.test(text))?.[0] || "other",
  };
}

function canonicalEmployer(value) {
  return clean(value).toLowerCase().replace(/\b(?:inc|llc|ltd|limited|company|co)\.?\b/g, "").replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ").trim();
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
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
  const message = errorMessage(error);
  const retryMinutes = /source returned (401|403)\b/.test(message) ? 1440
    : /timeout|abort|network|temporar|source returned (429|5\d\d)\b/i.test(message) ? 60 : 360;
  const next = new Date(now.getTime() + retryMinutes * 60_000).toISOString();
  await getJobDb(env).prepare("UPDATE sources SET last_error = ?1, next_scan_at = ?2, updated_at = ?3 WHERE id = ?4")
    .bind(message, next, now.toISOString(), id)
    .run();
  await incrementMetric(env, "scan_error", id);
}

function isPortalOnly(source) {
  return source.connector_mode === "portal_only" || PORTAL_ONLY_BOARDS.some(({ id }) => source.id === id);
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

export function jobDescription(value) {
  const text = String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\b[^>]*>|<\/(?:p|li|h[1-6]|div|section|tr)\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ");
  return decodeHtml(text).split(/\r?\n/).map(clean).filter(Boolean).join("\n").slice(0, DESCRIPTION_LIMIT).trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'");
}

function clean(value) {
  return String(value || "").replace(/[\u0000-\u001f\s]+/g, " ").trim();
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
