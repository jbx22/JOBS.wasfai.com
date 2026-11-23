import { cityAliases, matchJob, normalizeProfile, roleSearchAliases } from "../../workers/ingestion/src/index.js";
import { GOVERNMENT_BOARDS } from "../../workers/ingestion/src/boards.js";
import { getJobDb } from "./_db.js";
import { ensureRecruitmentSchema, invalid } from "./_recruitment.js";

export const PUBLIC_JOB_UNION = `
  SELECT j.id, 'ingested' AS kind, j.title, j.employer AS company_name, j.location AS city,
    '' AS country_code, j.role_family AS profession, NULL AS experience_min, NULL AS salary_min, NULL AS salary_max,
    '' AS employment_type, j.description, j.source_url, j.posted_at AS published_at, j.valid_through, j.updated_at,
    s.id AS source_id, j.discovered_at AS discovered_at, j.last_verified_at AS last_verified_at,
    j.seniority, j.sector
  FROM jobs j JOIN sources s ON s.id=j.source_id
  WHERE s.visibility='central' AND s.owner_user_id='' AND s.enabled=1
    AND j.verification_status='live' AND j.closed_at='' AND j.last_verified_at>=?2
    AND (j.valid_through='' OR j.valid_through>=CASE WHEN LENGTH(j.valid_through)=10 THEN SUBSTR(?1,1,10) ELSE ?1 END)
    AND (j.posted_at='' OR j.posted_at<=?1)
  UNION ALL
  SELECT j.id, 'employer' AS kind, j.title, p.company_name, j.city, j.country_code,
    j.profession, j.experience_min, j.salary_min, j.salary_max, j.employment_type,
    j.description, '' AS source_url, j.published_at, j.valid_through, j.updated_at,
    'verified-employers' AS source_id, j.published_at AS discovered_at, j.updated_at AS last_verified_at,
    '' AS seniority, '' AS sector
  FROM recruitment_jobs j JOIN employer_profiles p ON p.user_id=j.employer_id JOIN users u ON u.id=p.user_id
  WHERE j.status='published' AND p.status='verified' AND u.account_status='active'
    AND j.published_at<>'' AND j.published_at<=?1
    AND j.valid_through>=CASE WHEN LENGTH(j.valid_through)=10 THEN SUBSTR(?1,1,10) ELSE ?1 END
`;

const PUBLIC_ORDER = "sort_date DESC, kind, id";
const GOVERNMENT_IDS = new Set(GOVERNMENT_BOARDS.map(board => board.id));

function titleClause(aliases, contains) {
  // These are specific English titles for the same technical discipline, without requiring the word Engineer.
  const titles = aliases.includes("mechanical engineer") ? [...aliases, "mechanical design lead"] : aliases;
  const alternatives = titles.map(title => "(" + title.split(/\s+/).map(word => "LOWER(title) LIKE " + contains(word)).join(" AND ") + ")");
  return "(" + alternatives.join(" OR ") + ")";
}

function keywordClauses(query, contains) {
  const words = query.split(/[\s,،]+/).filter(Boolean);
  const clauses = [];
  for (let index = 0; index < words.length;) {
    let clause;
    // Consume whole recognized titles/cities before individual terms. Each extra keyword stays mandatory.
    let length = Math.min(4, words.length - index);
    for (; length > 0; length--) {
      const phrase = words.slice(index, index + length).join(" ");
      const roles = roleSearchAliases(phrase);
      if (roles.length) { clause = titleClause(roles, contains); break; }
      const cities = cityAliases(phrase);
      if (cities.length > 1) {
        clause = "(" + cities.map(city => "LOWER(city) LIKE " + contains(city)).join(" OR ") + ")";
        break;
      }
    }
    if (!clause) {
      const pattern = contains(words[index]);
      clause = "(" + ["title", "company_name", "city", "profession", "description"].map(column => `LOWER(${column}) LIKE ${pattern}`).join(" OR ") + ")";
    }
    clauses.push(clause);
    index += Math.max(1, length);
  }
  return clauses;
}

function publicQuery(filters = {}, asOf) {
  const now = new Date();
  const values = [now.toISOString(), new Date(now.getTime() - 7 * 86400000).toISOString()];
  const conditions = [];
  const bind = value => { values.push(value); return "?" + values.length; };
  // A keyword is literal text. Escape SQL LIKE metacharacters as well as the escape character.
  const contains = value => bind("%" + value.replace(/[!_%]/g, "!$&") + "%") + " ESCAPE '!'";
  const text = key => String(filters[key] || "").trim().slice(0, 120).toLowerCase();
  conditions.push(...keywordClauses(text("q"), contains));
  if (text("city")) {
    conditions.push("(" + cityAliases(text("city")).map(city => "LOWER(city) LIKE " + contains(city)).join(" OR ") + ")");
  }
  if (text("profession")) {
    const profession = text("profession");
    const aliases = roleSearchAliases(profession);
    if (aliases.length) conditions.push(titleClause(aliases, contains));
    else {
      const pattern = contains(profession);
      conditions.push(`(LOWER(profession) LIKE ${pattern} OR LOWER(title) LIKE ${pattern})`);
    }
  }
  if (filters.min_salary !== undefined && filters.min_salary !== "") {
    const amount = Number(filters.min_salary);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw invalid("Salary filter is invalid.");
    conditions.push("COALESCE(salary_max, salary_min) >= " + bind(amount));
  }
  if (filters.experience !== undefined && filters.experience !== "") {
    const experience = Number(filters.experience);
    if (!Number.isInteger(experience) || experience < 0 || experience > 50) throw invalid("Experience filter is invalid.");
    conditions.push("experience_min <= " + bind(experience));
  }
  if (text("sector") === "government") {
    conditions.push("source_id IN (" + [...GOVERNMENT_IDS].map(bind).join(",") + ")");
  } else if (text("sector")) {
    conditions.push("LOWER(sector) = " + bind(text("sector")));
  }
  if (asOf) conditions.push("REPLACE(discovered_at,' ','T') <= " + bind(asOf));
  if (filters.id) {
    conditions.push("id=" + bind(filters.id));
    conditions.push("kind=" + bind(filters.kind));
  }
  const filtered = "SELECT *, COALESCE(NULLIF(published_at,''),discovered_at) AS sort_date FROM (" + PUBLIC_JOB_UNION + ") public_jobs" + (conditions.length ? " WHERE " + conditions.join(" AND ") : "");
  // Syndicated listings can share a detail link. Do not merge different requisitions by title alone,
  // or distinct job/location combinations using a common application page. Empty URLs keep their ID.
  const sql = `SELECT * FROM (SELECT candidates.*, ROW_NUMBER() OVER (
    PARTITION BY kind, CASE WHEN TRIM(source_url)='' THEN 'id:' || id ELSE 'url:' || RTRIM(TRIM(source_url),'/') END,
      LOWER(TRIM(title)), LOWER(TRIM(company_name)), LOWER(TRIM(city))
    ORDER BY ${PUBLIC_ORDER}) AS duplicate_number FROM (${filtered}) candidates) numbered WHERE duplicate_number=1`;
  return { sql, values };
}

async function publicDb(env) {
  const db = getJobDb(env);
  if (!db) throw invalid("Job storage is unavailable.", 503, "STORAGE_NOT_CONFIGURED");
  await ensureRecruitmentSchema(db);
  return db;
}

function publicRow({ duplicate_number, sort_date, search_count, ...row }) {
  return { ...row, government: GOVERNMENT_IDS.has(row.source_id), public_id: (row.kind === "employer" ? "e-" : "i-") + row.id };
}

async function readPage(db, query, limit, offset) {
  const n = query.values.length;
  const { results = [] } = await db.prepare(`${query.sql} ORDER BY ${PUBLIC_ORDER} LIMIT ?${n + 1} OFFSET ?${n + 2}`).bind(...query.values, limit, offset).all();
  return results.map(publicRow);
}

async function countQuery(db, query) {
  const row = await db.prepare("SELECT COUNT(*) AS total FROM (" + query.sql + ") counted_jobs").bind(...query.values).first();
  return Number(row?.total || 0);
}

export async function listPublicJobs(env, filters = {}, limit = 40, offset = 0) {
  const db = await publicDb(env);
  const max = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 40, 1000));
  const start = Math.max(0, Number.isSafeInteger(offset) ? offset : 0);
  return readPage(db, publicQuery(filters), max, start);
}

export async function countPublicJobs(env) {
  return countQuery(await publicDb(env), publicQuery());
}

export async function getPublicJob(env, publicId) {
  if (typeof publicId !== "string" || !/^[ei]-.{1,180}$/.test(publicId)) return null;
  const jobs = await listPublicJobs(env, { id: publicId.slice(2), kind: publicId.startsWith("e-") ? "employer" : "ingested" }, 1);
  return jobs[0] || null;
}

function paging(inputLimit, inputOffset, inputDate) {
  const limit = Number(inputLimit ?? 40);
  const offset = Number(inputOffset ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) throw invalid("Pagination is invalid.");
  const now = Date.now();
  const stamp = inputDate ? Date.parse(inputDate) : now;
  if (!Number.isFinite(stamp) || stamp > now + 1000) throw invalid("Search timestamp is invalid.");
  return { limit: Math.min(limit, 80), offset, as_of: new Date(Math.min(now, stamp)).toISOString() };
}

function searchPage(jobs, total, page) {
  const next = page.offset + jobs.length;
  const hasMore = jobs.length > 0 && next < total;
  return { ok: true, jobs, total, ...page, has_more: hasMore, next_offset: hasMore ? next : null };
}

function workspaceJob(row) {
  const publicUrl = "/vacancies/" + encodeURIComponent(row.public_id);
  return {
    ...row, id: row.kind === "employer" ? row.public_id : row.id,
    employer: row.company_name, location: row.city, posted_at: row.published_at,
    role_family: row.profession, status: "discovered", public_url: publicUrl,
    source_url: row.kind === "employer" ? "https://jobs.wasfai.com" + publicUrl : sourceLink(row.source_url),
    data_quality: "live_verified", source_quality: "live_verified",
  };
}

export async function searchPublicJobs(env, filters = {}, options = {}) {
  const page = paging(options.limit, options.offset, options.as_of);
  const db = await publicDb(env);
  const query = publicQuery(filters, page.as_of);
  // A window count keeps rows and total in the same database snapshot, even during ingestion.
  const n = query.values.length;
  const { results = [] } = await db.prepare(`SELECT hits.*, COUNT(*) OVER () AS search_count FROM (${query.sql}) hits
    ORDER BY ${PUBLIC_ORDER} LIMIT ?${n + 1} OFFSET ?${n + 2}`).bind(...query.values, page.limit, page.offset).all();
  const total = results.length ? Number(results[0].search_count) : page.offset ? await countQuery(db, query) : 0;
  return searchPage(results.map(row => workspaceJob(publicRow(row))), total, page);
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

export function plainDescription(value) {
  return String(value || "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ").trim();
}

export function sourceLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return "";
    return url.toString();
  } catch { return ""; }
}

export function jobPosting(job) {
  if (!job.title || !job.company_name || !job.city || !job.description || !job.published_at) return null;
  const posted = new Date(job.published_at);
  if (!Number.isFinite(posted.getTime()) || posted.getTime() > Date.now()) return null;
  // Publish rich results only when the employer supplied a country explicitly.
  if (job.kind !== "employer" || /remote|عن بعد|anywhere/i.test(job.city) || !/^[A-Z]{2}$/.test(job.country_code)) return null;
  const data = {
    "@context": "https://schema.org", "@type": "JobPosting", title: job.title,
    description: "<p>" + escapeHtml(plainDescription(job.description)) + "</p>",
    identifier: { "@type": "PropertyValue", name: job.company_name, value: job.public_id },
    datePosted: posted.toISOString(), validThrough: job.valid_through,
    hiringOrganization: { "@type": "Organization", name: job.company_name },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.city, addressCountry: job.country_code } },
    employmentType: job.employment_type,
    url: "https://jobs.wasfai.com/vacancies/" + encodeURIComponent(job.public_id),
  };
  if (job.salary_min !== null || job.salary_max !== null) {
    const value = { "@type": "QuantitativeValue", unitText: "MONTH" };
    if (job.salary_min !== null) value.minValue = Number(job.salary_min);
    if (job.salary_max !== null) value.maxValue = Number(job.salary_max);
    data.baseSalary = { "@type": "MonetaryAmount", currency: "SAR", value };
  }
  return data;
}

export async function matchPublicJobs(env, inputProfile, inputLimit, options = {}) {
  const profile = normalizeProfile(inputProfile || {});
  const page = paging(inputLimit, options.offset, options.as_of);
  const db = await publicDb(env);
  const query = publicQuery(options.filters, page.as_of);
  // Keep the large descriptions in one batch at a time. Only ranked IDs survive the scan.
  const ranked = [];
  const batchSize = 400;
  let cursor = null;
  while (true) {
    const values = [...query.values];
    let after = "";
    if (cursor) {
      const date = "?" + values.push(cursor.sort_date);
      const kind = "?" + values.push(cursor.kind);
      const id = "?" + values.push(cursor.id);
      after = ` AND (sort_date<${date} OR (sort_date=${date} AND (kind>${kind} OR (kind=${kind} AND id>${id}))))`;
    }
    const { results = [] } = await db.prepare(`${query.sql}${after} ORDER BY ${PUBLIC_ORDER} LIMIT ${batchSize}`).bind(...values).all();
    for (const row of results) {
      const job = matchJob(workspaceJob(publicRow(row)), profile);
      if (job.match_eligible) ranked.push({ id: row.id, kind: row.kind, score: job.score });
    }
    if (results.length < batchSize) break;
    cursor = results[results.length - 1];
  }
  // Stable sort retains the database's publication-date, kind and ID ordering for equal scores.
  ranked.sort((a, b) => b.score - a.score);
  const selected = ranked.slice(page.offset, page.offset + page.limit);
  let jobs = [];
  if (selected.length) {
    const values = [...query.values];
    const keys = selected.map(row => `(kind=?${values.push(row.kind)} AND id=?${values.push(row.id)})`);
    const { results = [] } = await db.prepare(`${query.sql} AND (${keys.join(" OR ")})`).bind(...values).all();
    const byId = new Map(results.map(raw => {
      const row = publicRow(raw);
      return [row.public_id, matchJob(workspaceJob(row), profile)];
    }));
    jobs = selected.map(row => byId.get((row.kind === "employer" ? "e-" : "i-") + row.id)).filter(job => job?.match_eligible);
  }
  return { ...searchPage(jobs, ranked.length, page), matched: ranked.length, profile_terms: profile.terms.slice(0, 30), source: "verified-public-jobs", scoring_method: "evidence-weighted" };
}
