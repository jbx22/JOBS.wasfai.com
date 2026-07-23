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
        if (/timeout|\b5\d\d\b|network|temporar/i.test(errorMessage(error))) message.retry({ delaySeconds: 900 });
        else message.ack();
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
      const { results } = await env.JOBS_DB.prepare(
        "SELECT * FROM jobs WHERE verification_status = 'live' AND closed_at = '' AND (valid_through = '' OR valid_through >= ?1) ORDER BY score DESC, discovered_at DESC LIMIT ?2",
      ).bind(new Date().toISOString(), limit).all();
      return json({ ok: true, jobs: results.filter(isLikelyStoredJob).map((job) => ({ ...job, data_quality: "live_verified", source_quality: "live_verified" })) });
    }
    if (url.pathname === "/match" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const limit = Math.min(Number(body.limit || 50), 100);
      const profile = normalizeProfile(body.profile || {});
      const { results } = await env.JOBS_DB.prepare(
        "SELECT * FROM jobs WHERE verification_status = 'live' AND closed_at = '' AND (valid_through = '' OR valid_through >= ?1) ORDER BY discovered_at DESC LIMIT 300",
      ).bind(new Date().toISOString()).all();
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
      const { results } = await env.JOBS_DB.prepare(
        "SELECT metric_key, bucket, value, updated_at FROM ingestion_metrics ORDER BY bucket DESC, metric_key LIMIT 250",
      ).all();
      return json({ ok: true, metrics: results });
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
  if (!source || !["public_html", "public_json", "greenhouse", "lever", "ashby"].includes(source.connector_mode)) {
    throw new Error("Unsupported connector mode.");
  }
  const payload = await fetchSourcePayload(env, source);
  const jobs = parseSourcePayload(payload, source).slice(0, 100);
  const now = new Date().toISOString();
  let inserted = 0;
  for (const job of jobs) {
    const dedupe = dedupeKey(source.id, job.title, job.employer, job.location);
    const id = `${source.id}-${hash(dedupe).slice(0, 12)}`;
    const metadata = classifyJob(job);
    const result = await env.JOBS_DB.prepare(
      `INSERT INTO jobs
        (id, source_id, source_url, title, employer, location, description, score, status, discovered_at, updated_at, dedupe_key,
         posted_at, valid_through, last_verified_at, verification_status, closed_at, canonical_employer, role_family, seniority, sector)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'discovered', ?9, ?9, ?10, ?11, ?12, ?9, 'live', '', ?13, ?14, ?15, ?16)
       ON CONFLICT(dedupe_key) DO UPDATE SET source_url=excluded.source_url, description=excluded.description,
         updated_at=excluded.updated_at, last_verified_at=excluded.last_verified_at, verification_status='live', closed_at='',
         valid_through=excluded.valid_through, posted_at=excluded.posted_at, canonical_employer=excluded.canonical_employer,
         role_family=excluded.role_family, seniority=excluded.seniority, sector=excluded.sector`,
    )
      .bind(id, source.id, job.url || source.url, job.title, job.employer, job.location, job.description, job.score, now, dedupe,
        job.posted_at || "", job.valid_through || "", metadata.employer, metadata.role_family, metadata.seniority, metadata.sector)
      .run();
    inserted += result.meta?.changes || 0;
  }
  const next = new Date(Date.now() + Number(source.interval_minutes || 360) * 60_000).toISOString();
  await env.JOBS_DB.prepare(
    "UPDATE sources SET last_scanned_at = ?1, next_scan_at = ?2, last_error = '', updated_at = ?1 WHERE id = ?3",
  ).bind(now, next, source.id).run();
  await archiveStaleJobs(env, source.id, now);
  await incrementMetric(env, "scan_success", source.id);
  await incrementMetric(env, "jobs_parsed", source.id, jobs.length);
  return { scanned: source.id, parsed: jobs.length, inserted };
}

async function fetchSourcePayload(env, source) {
  assertPublicSourceUrl(source.url);
  const cacheKey = `source-html:${source.id}:${hash(source.url)}`;
  const cached = env.JOBS_CACHE ? await env.JOBS_CACHE.get(cacheKey) : "";
  if (cached) return cached;
  const response = await fetchWithSafeRedirects(source.url, {
    headers: {
      "User-Agent": "JOBS.wasfai.com ingestion bot; contact=admin@wasfai.com",
      "Accept": "text/html,application/xhtml+xml,application/json",
    },
  });
  if (!response.ok) throw new Error(`source returned ${response.status}`);
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (!/(?:text\/html|application\/(?:json|ld\+json)|text\/plain)/.test(type)) throw new Error(`unsupported source content type: ${type || "unknown"}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > 2_000_000) throw new Error("source response exceeds 2 MB limit");
  const html = await readLimitedText(response, 2_000_000);
  if (env.JOBS_CACHE) {
    await env.JOBS_CACHE.put(cacheKey, html, { expirationTtl: 900 });
  }
  return html;
}

function parseSourcePayload(payload, source) {
  if (source.connector_mode === "public_html") return parseJobs(payload, source);
  if (source.connector_mode === "greenhouse") return parseGreenhouse(payload, source);
  if (source.connector_mode === "lever") return parseLever(payload, source);
  if (source.connector_mode === "ashby") return parseAshby(payload, source);
  return parseJsonFeed(payload, source);
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
    posted_at: isoDate(row.publication_date || row.created_at || row.published_at),
    valid_through: isoDate(row.valid_through || row.expiration_date || row.deadline),
    score: scoreJob(`${row.title || ""} ${row.company_name || row.company || ""} ${row.candidate_required_location || row.location || ""} ${row.description || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseGreenhouse(text, source) {
  const data = JSON.parse(text);
  return uniqueJobs((data.jobs || []).map((row) => ({
    title: clean(row.title), employer: source.label, location: clean(row.location?.name || source.region),
    url: safeJobUrl(row.absolute_url, source.url), description: stripHtml(row.content || "").slice(0, 1200),
    posted_at: isoDate(row.updated_at), valid_through: "", score: scoreJob(`${row.title} ${row.content || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseLever(text, source) {
  const rows = JSON.parse(text);
  return uniqueJobs((Array.isArray(rows) ? rows : []).map((row) => ({
    title: clean(row.text), employer: source.label, location: clean(row.categories?.location || source.region),
    url: safeJobUrl(row.hostedUrl || row.applyUrl, source.url), description: stripHtml(row.descriptionPlain || row.description || "").slice(0, 1200),
    posted_at: row.createdAt ? new Date(Number(row.createdAt)).toISOString() : "", valid_through: "",
    score: scoreJob(`${row.text} ${row.categories?.team || ""} ${row.descriptionPlain || ""}`, source),
  }))).filter(isLikelyParsedJob);
}

function parseAshby(text, source) {
  const data = JSON.parse(text);
  return uniqueJobs((data.jobs || []).map((row) => ({
    title: clean(row.title), employer: source.label, location: clean(row.location || source.region),
    url: safeJobUrl(row.jobUrl || row.applyUrl, source.url), description: stripHtml(row.descriptionPlain || row.descriptionHtml || "").slice(0, 1200),
    posted_at: isoDate(row.publishedAt), valid_through: isoDate(row.validThrough),
    score: scoreJob(`${row.title} ${row.department || ""} ${row.descriptionPlain || ""}`, source),
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
  return {
    terms,
    roles: splitPhrases(profile.target_roles).map(lower),
    skills: splitPhrases(profile.resume_skills).map(lower),
    locations,
    seniority: splitPhrases(profile.resume_seniority).map(lower),
    sectors: splitPhrases(profile.target_sectors || profile.resume_sectors || profile.resume_work_examples).map(lower),
    allowRemote: /remote|عن بعد/i.test(`${profile.target_locations || ""} ${profile.resume_regions || ""}`),
  };
}

function matchJob(job, profile) {
  const haystack = `${job.title} ${job.employer} ${job.location} ${job.description}`.toLowerCase();
  const title = String(job.title || "").toLowerCase();
  const location = String(job.location || "").toLowerCase();
  const roleHits = profile.roles.filter((term) => phraseMatch(title, term));
  const skillHits = profile.skills.filter((term) => phraseMatch(haystack, term));
  const locationHits = profile.locations.filter((term) => phraseMatch(location, term));
  const seniorityHits = profile.seniority.filter((term) => phraseMatch(`${title} ${job.seniority || ""}`.toLowerCase(), term));
  const sectorHits = profile.sectors.filter((term) => phraseMatch(`${haystack} ${job.sector || ""}`.toLowerCase(), term));
  const remoteCompatible = profile.allowRemote && /remote|anywhere|global|عن بعد/i.test(location);
  const hasRole = roleHits.length > 0;
  const hasLocation = !profile.locations.length || locationHits.length > 0 || remoteCompatible;
  const seniorityConflict = hasSeniorityConflict(title, profile.seniority);
  let score = 0;
  score += hasRole ? 36 : 0;
  score += Math.min(25, skillHits.length * 5);
  score += hasLocation ? 18 : 0;
  score += seniorityHits.length || !profile.seniority.length ? 10 : 0;
  score += Math.min(11, sectorHits.length * 4);
  if (seniorityConflict) score -= 30;
  score = Math.max(0, Math.min(100, score));
  const missing = [!hasRole && "target role", !hasLocation && "target location", seniorityConflict && "compatible seniority"].filter(Boolean);
  const evidence = [...roleHits, ...skillHits, ...locationHits, ...sectorHits].filter((x, i, all) => all.indexOf(x) === i).slice(0, 10);
  const matchEligible = hasRole && hasLocation && !seniorityConflict && score >= 65;
  return {
    ...job,
    score,
    match_eligible: matchEligible,
    match_confidence: evidence.length >= 5 ? "high" : evidence.length >= 2 ? "medium" : "low",
    match_evidence: evidence,
    missing_requirements: missing,
    fit_explanation: matchEligible
      ? `Evidence-backed match: ${evidence.join(", ")}.`
      : `Not recommended${missing.length ? `: missing ${missing.join(", ")}` : ""}.`,
  };
}

function splitPhrases(value) {
  return String(value || "").split(/[,;\n|]+/).map((item) => item.trim()).filter((item) => item.length > 2).slice(0, 30);
}

function lower(value) { return String(value || "").toLowerCase(); }

function phraseMatch(text, phrase) {
  const terms = splitTerms(phrase);
  return terms.length > 0 && terms.every((term) => text.includes(term.toLowerCase()));
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
  const connector = ["public_html", "public_json", "greenhouse", "lever", "ashby"].includes(input.connector_mode)
    ? input.connector_mode : "public_html";
  const enabled = input.scheduled === false || input.enabled === false ? 0 : 1;
  const now = new Date().toISOString();
  await env.JOBS_DB.prepare(
    `INSERT INTO sources (id, label, url, region, query, enabled, connector_mode, interval_minutes, next_scan_at, owner_user_id, visibility, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?11, ?7, ?8, ?9, 'private', ?10, ?10)
     ON CONFLICT(id) DO UPDATE SET label=excluded.label, url=excluded.url, region=excluded.region, query=excluded.query,
       enabled=excluded.enabled, interval_minutes=excluded.interval_minutes, next_scan_at=excluded.next_scan_at, updated_at=excluded.updated_at`,
  ).bind(id, label, url, region, query, enabled, interval, enabled ? now : "", owner, now, connector).run();
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let response;
    try { response = await fetch(current, { ...options, redirect: "manual", signal: controller.signal }); }
    finally { clearTimeout(timer); }
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

async function archiveStaleJobs(env, sourceId, now) {
  const cutoff = new Date(Date.parse(now) - 14 * 86400_000).toISOString();
  await env.JOBS_DB.prepare(
    "UPDATE jobs SET verification_status='stale', closed_at=?1, updated_at=?1 WHERE source_id=?2 AND closed_at='' AND last_verified_at<>'' AND last_verified_at<?3",
  ).bind(now, sourceId, cutoff).run();
  await env.JOBS_DB.prepare(
    "UPDATE jobs SET verification_status='expired', closed_at=?1, updated_at=?1 WHERE closed_at='' AND valid_through<>'' AND valid_through<?1",
  ).bind(now).run();
}

async function incrementMetric(env, key, bucket = "global", amount = 1) {
  await env.JOBS_DB.prepare(
    `INSERT INTO ingestion_metrics(metric_key, bucket, value, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
     ON CONFLICT(metric_key, bucket) DO UPDATE SET value=value+excluded.value, updated_at=CURRENT_TIMESTAMP`,
  ).bind(key, bucket, Number(amount || 1)).run();
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
  // A failed/blocked board must not be retried on every cron tick. Retain the
  // source for operator review and retry after at least six hours.
  const next = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  await env.JOBS_DB.prepare("UPDATE sources SET last_error = ?1, next_scan_at = ?2, updated_at = ?3 WHERE id = ?4")
    .bind(errorMessage(error), next, now.toISOString(), id)
    .run();
  await incrementMetric(env, "scan_error", id);
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
