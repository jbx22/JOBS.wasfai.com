import { matchJob, normalizeProfile } from "../../workers/ingestion/src/index.js";
import { getJobDb } from "./_db.js";
import { ensureRecruitmentSchema, invalid } from "./_recruitment.js";

export const PUBLIC_JOB_UNION = `
  SELECT j.id, 'ingested' AS kind, j.title, j.employer AS company_name, j.location AS city,
    '' AS country_code, j.role_family AS profession, NULL AS experience_min, NULL AS salary_min, NULL AS salary_max,
    '' AS employment_type, j.description, j.source_url, j.posted_at AS published_at, j.valid_through, j.updated_at,
    s.id AS source_id, j.discovered_at AS discovered_at, j.last_verified_at AS last_verified_at
  FROM jobs j JOIN sources s ON s.id=j.source_id
  WHERE s.visibility='central' AND s.owner_user_id='' AND s.enabled=1
    AND j.verification_status='live' AND j.closed_at='' AND j.last_verified_at>=?2
    AND (j.valid_through='' OR j.valid_through>=?1)
  UNION ALL
  SELECT j.id, 'employer' AS kind, j.title, p.company_name, j.city, j.country_code,
    j.profession, j.experience_min, j.salary_min, j.salary_max, j.employment_type,
    j.description, '' AS source_url, j.published_at, j.valid_through, j.updated_at,
    'verified-employers' AS source_id, j.published_at AS discovered_at, j.updated_at AS last_verified_at
  FROM recruitment_jobs j JOIN employer_profiles p ON p.user_id=j.employer_id JOIN users u ON u.id=p.user_id
  WHERE j.status='published' AND p.status='verified' AND u.account_status='active' AND j.valid_through>=?1
`;

function publicQuery(filters = {}) {
  const values = [new Date().toISOString(), new Date(Date.now() - 7 * 86400000).toISOString()];
  const conditions = [];
  const bind = (value) => { values.push(value); return "?" + values.length; };
  for (const [key, column] of [["q", "title"], ["city", "city"], ["profession", "profession"]]) {
    const value = String(filters[key] || "").trim().slice(0, 120).toLowerCase();
    if (value) {
      const placeholder = bind("%" + value + "%");
      conditions.push(key === "q" ? "(LOWER(title) LIKE " + placeholder + " OR LOWER(description) LIKE " + placeholder + ")" : "LOWER(" + column + ") LIKE " + placeholder);
    }
  }
  if (filters.min_salary !== undefined && filters.min_salary !== "") {
    const amount = Number(filters.min_salary);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw invalid("Salary filter is invalid.");
    const placeholder = bind(amount);
    conditions.push("(salary_max >= " + placeholder + " OR (salary_max IS NULL AND salary_min >= " + placeholder + "))");
  }
  if (filters.experience !== undefined && filters.experience !== "") {
    const experience = Number(filters.experience);
    if (!Number.isInteger(experience) || experience < 0 || experience > 50) throw invalid("Experience filter is invalid.");
    conditions.push("experience_min <= " + bind(experience));
  }
  if (filters.id) {
    conditions.push("id=" + bind(filters.id));
    conditions.push("kind=" + bind(filters.kind));
  }
  return { sql: "SELECT * FROM (" + PUBLIC_JOB_UNION + ") public_jobs" + (conditions.length ? " WHERE " + conditions.join(" AND ") : ""), values };
}

async function publicDb(env) {
  const db = getJobDb(env);
  if (!db) throw invalid("Job storage is unavailable.", 503, "STORAGE_NOT_CONFIGURED");
  await ensureRecruitmentSchema(db);
  return db;
}

export async function listPublicJobs(env, filters = {}, limit = 40, offset = 0) {
  const db = await publicDb(env);
  const query = publicQuery(filters);
  const max = Math.max(1, Math.min(Number.isInteger(limit) ? limit : 40, 1000));
  const start = Math.max(0, Math.min(Number.isInteger(offset) ? offset : 0, 1000000));
  query.values.push(max, start);
  const { results = [] } = await db.prepare(query.sql + " ORDER BY COALESCE(NULLIF(published_at,''),discovered_at) DESC, kind, id LIMIT ?" + (query.values.length - 1) + " OFFSET ?" + query.values.length).bind(...query.values).all();
  return results.map((row) => ({ ...row, public_id: (row.kind === "employer" ? "e-" : "i-") + row.id }));
}

export async function countPublicJobs(env) {
  const db = await publicDb(env);
  const query = publicQuery();
  const row = await db.prepare("SELECT COUNT(*) AS total FROM (" + query.sql + ") counted_jobs").bind(...query.values).first();
  return Number(row?.total || 0);
}

export async function getPublicJob(env, publicId) {
  if (typeof publicId !== "string" || !/^[ei]-.{1,180}$/.test(publicId)) return null;
  const jobs = await listPublicJobs(env, { id: publicId.slice(2), kind: publicId.startsWith("e-") ? "employer" : "ingested" }, 1);
  return jobs[0] || null;
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

export async function matchPublicJobs(env, inputProfile, inputLimit) {
  const profile = normalizeProfile(inputProfile || {});
  const limit = Math.max(1, Math.min(Math.floor(Number(inputLimit) || 40), 80));
  const records = await listPublicJobs(env, {}, 1000);
  const jobs = records.map((row) => matchJob({
    ...row, id: row.kind === "employer" ? row.public_id : row.id,
    employer: row.company_name, location: row.city, posted_at: row.published_at,
    role_family: row.profession, status: "discovered",
    source_url: row.kind === "employer" ? "https://jobs.wasfai.com/vacancies/" + encodeURIComponent(row.public_id) : sourceLink(row.source_url),
    data_quality: "live_verified", source_quality: "live_verified",
  }, profile)).filter((job) => job.match_eligible).sort((a, b) => b.score - a.score).slice(0, limit);
  return { ok: true, jobs, matched: jobs.length, profile_terms: profile.terms.slice(0, 30), source: "verified-public-jobs", scoring_method: "evidence-weighted" };
}
