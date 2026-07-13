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
    if (url.pathname === "/health") {
      return json({ ok: true, service: "jobs-wasfai-ingestion", at: new Date().toISOString() });
    }
    if (url.pathname === "/sources" && request.method === "GET") {
      const { results } = await env.JOBS_DB.prepare("SELECT * FROM sources ORDER BY label").all();
      return json({ ok: true, sources: results });
    }
    if (url.pathname === "/jobs" && request.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
      const { results } = await env.JOBS_DB.prepare("SELECT * FROM jobs ORDER BY score DESC, discovered_at DESC LIMIT ?1").bind(limit).all();
      return json({ ok: true, jobs: results });
    }
    if (url.pathname === "/admin/scan-now" && request.method === "POST") {
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
      const count = await enqueueDueSources(env);
      return json({ ok: true, queued: count });
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
  if (!source || source.connector_mode !== "public_html") {
    throw new Error("Only public_html sources can be scanned without approved APIs.");
  }
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "JOBS.wasfai.com ingestion bot; contact=admin@wasfai.com",
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`source returned ${response.status}`);
  const html = await response.text();
  const jobs = parseJobs(html, source).slice(0, 25);
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

function parseJobs(html, source) {
  const cards = [
    ...html.matchAll(/<(article|li|div)[^>]*(?:job|posting|card|result)[^>]*>([\s\S]*?)<\/\1>/gi),
  ].map((m) => m[2]);
  const candidates = cards.length ? cards : html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.split(/<\/a>/i) || [];
  return candidates
    .map((card) => normalizeCard(card, source))
    .filter((job) => job.title.length > 4)
    .filter((job, index, all) => all.findIndex((x) => dedupeKey(source.id, x.title, x.employer, x.location) === dedupeKey(source.id, job.title, job.employer, job.location)) === index);
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

async function recordSourceError(env, id, error) {
  if (!id) return;
  await env.JOBS_DB.prepare("UPDATE sources SET last_error = ?1, updated_at = ?2 WHERE id = ?3")
    .bind(errorMessage(error), new Date().toISOString(), id)
    .run();
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
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
