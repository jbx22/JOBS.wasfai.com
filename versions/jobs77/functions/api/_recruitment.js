import { AuthError, readActiveSession } from "./auth/_auth.js";
import { getJobDb } from "./_db.js";

export const RECRUITMENT_SCHEMA = ["CREATE TABLE IF NOT EXISTS employer_profiles (\n  user_id TEXT PRIMARY KEY, company_name TEXT NOT NULL, registration_number TEXT NOT NULL,\n  website TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',\n  review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)","CREATE TABLE IF NOT EXISTS recruitment_jobs (\n  id TEXT PRIMARY KEY, employer_id TEXT NOT NULL, title TEXT NOT NULL, city TEXT NOT NULL,\n  country_code TEXT NOT NULL DEFAULT 'SA', profession TEXT NOT NULL DEFAULT '',\n  experience_min INTEGER NOT NULL DEFAULT 0, salary_min INTEGER, salary_max INTEGER,\n  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME', description TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending', published_at TEXT NOT NULL DEFAULT '',\n  valid_through TEXT NOT NULL, review_note TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)","CREATE TABLE IF NOT EXISTS recruitment_applications (\n  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, candidate_id TEXT NOT NULL,\n  resume_file_id TEXT NOT NULL, cover_note TEXT NOT NULL DEFAULT '',\n  status TEXT NOT NULL DEFAULT 'submitted', consented_at TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(job_id, candidate_id)\n)","CREATE TABLE IF NOT EXISTS recruitment_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL,\n  resource_id TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n)","CREATE INDEX IF NOT EXISTS idx_employer_profiles_status ON employer_profiles(status, updated_at)","CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_public ON recruitment_jobs(status, valid_through, published_at)","CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_employer ON recruitment_jobs(employer_id, updated_at)","CREATE INDEX IF NOT EXISTS idx_recruitment_applications_candidate ON recruitment_applications(candidate_id, created_at)","CREATE INDEX IF NOT EXISTS idx_recruitment_applications_job ON recruitment_applications(job_id, status, created_at)","CREATE INDEX IF NOT EXISTS idx_recruitment_events_resource ON recruitment_events(resource_id, created_at)"];

export async function ensureRecruitmentSchema(db) {
  for (const sql of RECRUITMENT_SCHEMA) await db.prepare(sql).run();
}

export async function recruitmentAccess(context) {
  const active = await readActiveSession(context.request, context.env || {});
  if (!active) throw new AuthError("AUTH_REQUIRED", 401, "Sign in with Google to continue.");
  const db = getJobDb(context.env);
  await ensureRecruitmentSchema(db);
  return { db, user: active.session };
}

export function invalid(message, status = 400, code = "INVALID_INPUT") {
  return new AuthError(code, status, message);
}

export function textField(value, min, max, name) {
  if (typeof value !== "string") throw invalid(name + " is required.");
  const text = value.trim();
  if (text.length < min || text.length > max) throw invalid(name + " has an invalid length.");
  return text;
}

export function publicWebsite(value) {
  if (!value) return "";
  let url;
  try { url = new URL(value); } catch { throw invalid("A valid HTTPS company website is required."); }
  if (url.protocol !== "https:" || url.username || url.password) throw invalid("A valid HTTPS company website is required.");
  return url.toString().slice(0, 500);
}

export function jobInput(body, now = Date.now()) {
  const number = (value, min, max, name, optional = false) => {
    if (optional && (value === "" || value === null || value === undefined)) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw invalid(name + " is invalid.");
    return parsed;
  };
  const salaryMin = number(body.salary_min, 0, 1000000, "Minimum salary", true);
  const salaryMax = number(body.salary_max, 0, 1000000, "Maximum salary", true);
  if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) throw invalid("Maximum salary must be at least the minimum.");
  const country = String(body.country_code || "SA").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw invalid("A two-letter country code is required.");
  const expiry = new Date(String(body.valid_through || ""));
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now || expiry.getTime() > now + 180 * 86400000) throw invalid("Expiry must be within the next 180 days.");
  const employment = String(body.employment_type || "FULL_TIME");
  if (!["FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "OTHER"].includes(employment)) throw invalid("Employment type is invalid.");
  return {
    title: textField(body.title, 3, 180, "Job title"),
    city: textField(body.city, 2, 120, "City"), country_code: country,
    profession: textField(body.profession, 2, 120, "Profession"),
    experience_min: number(body.experience_min ?? 0, 0, 50, "Experience"),
    salary_min: salaryMin, salary_max: salaryMax, employment_type: employment,
    description: textField(body.description, 80, 8000, "Job description"),
    valid_through: expiry.toISOString(),
  };
}

export function recruitmentEvent(db, userId, action, resourceId, metadata = {}) {
  return db.prepare("INSERT INTO recruitment_events(actor_id, action, resource_id, metadata) VALUES (?, ?, ?, ?)")
    .bind(userId, action, resourceId, JSON.stringify(metadata));
}

export async function verifiedEmployer(access) {
  const company = await access.db.prepare("SELECT * FROM employer_profiles WHERE user_id = ?").bind(access.user.sub).first();
  if (!company || company.status !== "verified") throw invalid("Company verification is required.", 403, "EMPLOYER_NOT_VERIFIED");
  return company;
}
