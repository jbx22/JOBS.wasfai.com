import { requireProtectedRequest } from "../_security.js";
import { AuthError } from "../auth/_auth.js";
import { json } from "../_state.js";
import { requireAdmin } from "../_admin.js";
import { decryptFile, FILE_TABLE_SQL } from "../resumes/_files.js";
import { ensureRecruitmentSchema, invalid, jobInput, publicWebsite, recruitmentAccess, recruitmentEvent, textField, verifiedEmployer } from "../_recruitment.js";

export async function onRequest(context) {
  try {
    const parts = new URL(context.request.url).pathname.replace(/^\/api\/recruitment\/?/, "").split("/").filter(Boolean);
    const method = context.request.method;
    const body = ["POST", "PUT", "PATCH"].includes(method) ? await context.request.json() : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("A JSON object is required.");
    if (parts[0] === "moderation") return await moderation(context, parts.slice(1), method, body);
    const access = await recruitmentAccess(context);
    const { db, user } = access;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const rate = await requireProtectedRequest(context, "recruitment:" + method, 20);
      if (rate.error) return rate.error;
    }
    if (method === "GET" && parts[0] === "me") {
      const company = await db.prepare("SELECT * FROM employer_profiles WHERE user_id = ?").bind(user.sub).first();
      const jobs = await db.prepare("SELECT * FROM recruitment_jobs WHERE employer_id = ? ORDER BY created_at DESC LIMIT 100").bind(user.sub).all();
      const applications = await db.prepare(`SELECT a.id, a.job_id, a.status, a.created_at, j.title, p.company_name
        FROM recruitment_applications a JOIN recruitment_jobs j ON j.id=a.job_id
        JOIN employer_profiles p ON p.user_id=j.employer_id WHERE a.candidate_id=? ORDER BY a.created_at DESC LIMIT 100`).bind(user.sub).all();
      return json({ company, jobs: jobs.results, applications: applications.results });
    }
    if (method === "PUT" && parts[0] === "company") {
      const companyName = textField(body.company_name, 2, 180, "Company name");
      const registration = textField(body.registration_number, 3, 80, "Commercial registration");
      const website = publicWebsite(body.website);
      const existing = await db.prepare("SELECT status FROM employer_profiles WHERE user_id = ?").bind(user.sub).first();
      if (existing?.status === "suspended") throw invalid("This company is suspended. Contact support.", 403, "EMPLOYER_SUSPENDED");
      await db.batch([
        db.prepare(`INSERT INTO employer_profiles(user_id, company_name, registration_number, website)
          VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET company_name=excluded.company_name,
          registration_number=excluded.registration_number, website=excluded.website, status='pending',
          review_note='', updated_at=CURRENT_TIMESTAMP`).bind(user.sub, companyName, registration, website),
        recruitmentEvent(db, user.sub, "company.submitted", user.sub),
      ]);
      return json({ ok: true, status: "pending" });
    }
    if (method === "POST" && parts[0] === "jobs" && !parts[1]) {
      await verifiedEmployer(access);
      const job = jobInput(body);
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare(`INSERT INTO recruitment_jobs(id, employer_id, title, city, country_code, profession, experience_min,
          salary_min, salary_max, employment_type, description, valid_through) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(id, user.sub, job.title, job.city, job.country_code, job.profession, job.experience_min,
            job.salary_min, job.salary_max, job.employment_type, job.description, job.valid_through),
        recruitmentEvent(db, user.sub, "job.submitted", id),
      ]);
      return json({ ok: true, id, status: "pending" }, 201);
    }
    if (parts[0] === "jobs" && parts[1] && method === "PATCH" && !parts[2]) {
      await verifiedEmployer(access);
      const job = await ownedJob(access, parts[1]);
      if (body.status !== "closed") throw invalid("Only closing is available here. Submit a new posting for revised details.");
      await db.batch([
        db.prepare("UPDATE recruitment_jobs SET status='closed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND employer_id=?").bind(job.id, user.sub),
        recruitmentEvent(db, user.sub, "job.closed", job.id),
      ]);
      return json({ ok: true });
    }
    if (parts[0] === "jobs" && parts[2] === "applications" && method === "GET") {
      await verifiedEmployer(access);
      const job = await ownedJob(access, parts[1]);
      const { results } = await db.prepare(`SELECT a.id, a.status, a.cover_note, a.created_at, a.consented_at,
        u.display_name AS candidate_name, u.email AS candidate_email
        FROM recruitment_applications a JOIN users u ON u.id=a.candidate_id
        WHERE a.job_id=? AND a.status<>'withdrawn' AND u.account_status='active' ORDER BY a.created_at DESC LIMIT 200`).bind(job.id).all();
      return json({ applications: results });
    }
    if (parts[0] === "jobs" && parts[2] === "apply" && method === "POST") {
      if (body.consent !== true) throw invalid("Consent to share your CV and contact details with this employer is required.");
      const job = await db.prepare(`SELECT j.* FROM recruitment_jobs j JOIN employer_profiles p ON p.user_id=j.employer_id
        JOIN users u ON u.id=j.employer_id
        WHERE j.id=? AND j.status='published' AND p.status='verified' AND u.account_status='active' AND j.valid_through>?`)
        .bind(parts[1], new Date().toISOString()).first();
      if (!job) throw invalid("This job is no longer available.", 404, "JOB_NOT_FOUND");
      if (job.employer_id === user.sub) throw invalid("You cannot apply to your own posting.");
      if (!context.env?.RESUME_FILES || !context.env?.FILE_ENCRYPTION_KEY) throw invalid("Private CV storage is unavailable.", 503, "STORAGE_NOT_CONFIGURED");
      await db.prepare(FILE_TABLE_SQL).run();
      const resumeId = textField(body.resume_file_id, 1, 100, "CV");
      const resume = await db.prepare("SELECT id FROM resume_files WHERE id=? AND user_id=? AND status='active'").bind(resumeId, user.sub).first();
      if (!resume) throw invalid("Upload and select your own active CV.", 400, "CV_REQUIRED");
      const existing = await db.prepare("SELECT id, status FROM recruitment_applications WHERE job_id=? AND candidate_id=?").bind(job.id, user.sub).first();
      if (existing) throw invalid("You have already applied to this job.", 409, "ALREADY_APPLIED");
      const id = crypto.randomUUID();
      const note = body.cover_note ? textField(body.cover_note, 0, 4000, "Cover note") : "";
      await db.batch([
        db.prepare("INSERT INTO recruitment_applications(id, job_id, candidate_id, resume_file_id, cover_note, consented_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, job.id, user.sub, resumeId, note, new Date().toISOString()),
        recruitmentEvent(db, user.sub, "application.submitted", id, { job_id: job.id }),
      ]);
      return json({ ok: true, id, status: "submitted" }, 201);
    }
    if (parts[0] === "applications" && parts[1]) {
      const app = await db.prepare(`SELECT a.*, j.employer_id FROM recruitment_applications a
        JOIN recruitment_jobs j ON j.id=a.job_id WHERE a.id=?`).bind(parts[1]).first();
      if (!app) throw invalid("Application not found.", 404, "NOT_FOUND");
      if (method === "PATCH" && !parts[2]) {
        if (app.candidate_id === user.sub) {
          if (body.status !== "withdrawn") throw invalid("Candidates may only withdraw applications.", 403);
        } else {
          if (app.employer_id !== user.sub) throw invalid("Application not found.", 404, "NOT_FOUND");
          await verifiedEmployer(access);
          if (!["shortlisted", "interviewing", "rejected", "hired"].includes(body.status) || app.status === "withdrawn") throw invalid("Application status cannot be changed.");
        }
        await db.batch([
          db.prepare("UPDATE recruitment_applications SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?").bind(body.status, app.id, app.status),
          recruitmentEvent(db, user.sub, "application.status_changed", app.id, { status: body.status }),
        ]);
        return json({ ok: true, status: body.status });
      }
      if (method === "GET" && parts[2] === "resume") {
        if (app.employer_id !== user.sub || app.status === "withdrawn") throw invalid("CV not found.", 404, "NOT_FOUND");
        await verifiedEmployer(access);
        if (!context.env?.RESUME_FILES || !context.env?.FILE_ENCRYPTION_KEY) throw invalid("CV storage is unavailable.", 503);
        const file = await db.prepare(`SELECT f.* FROM resume_files f JOIN users u ON u.id=f.user_id
          WHERE f.id=? AND f.user_id=? AND f.status='active' AND u.account_status='active'`).bind(app.resume_file_id, app.candidate_id).first();
        if (!file) throw invalid("CV not found.", 404, "NOT_FOUND");
        const object = await context.env.RESUME_FILES.get(file.object_key);
        if (!object) throw invalid("CV not found.", 404, "NOT_FOUND");
        const plaintext = await decryptFile(await object.arrayBuffer(), context.env.FILE_ENCRYPTION_KEY);
        await recruitmentEvent(db, user.sub, "application.cv_downloaded", app.id).run();
        return new Response(plaintext, { headers: {
          "Content-Type": file.content_type, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.original_name),
        } });
      }
    }
    throw invalid("Route not found.", 404, "NOT_FOUND");
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof SyntaxError) return json({ error: "A valid JSON body is required.", code: "INVALID_JSON" }, 400);
    console.error(JSON.stringify({ event: "recruitment.failed", name: error?.name, code: error?.code }));
    return json({ error: "Recruitment service is temporarily unavailable.", code: "RECRUITMENT_UNAVAILABLE" }, 503);
  }
}

async function ownedJob(access, id) {
  const job = await access.db.prepare("SELECT * FROM recruitment_jobs WHERE id=? AND employer_id=?").bind(id, access.user.sub).first();
  if (!job) throw invalid("Job not found.", 404, "JOB_NOT_FOUND");
  return job;
}

async function moderation(context, parts, method, body) {
  const scope = parts[0] === "companies" ? "employers" : parts[0] === "events" ? "audit" : "jobs";
  const access = await requireAdmin(context, { scope });
  if (access.error) return access.error;
  await ensureRecruitmentSchema(access.db);
  const { db } = access;
  const actor = access.admin.user_id;
  if (method === "GET" && parts[0] === "companies") {
    const { results } = await db.prepare("SELECT * FROM employer_profiles ORDER BY updated_at DESC LIMIT 200").all();
    return json({ companies: results });
  }
  if (method === "GET" && parts[0] === "jobs") {
    const { results } = await db.prepare(`SELECT j.*, p.company_name FROM recruitment_jobs j
      JOIN employer_profiles p ON p.user_id=j.employer_id ORDER BY j.updated_at DESC LIMIT 200`).all();
    return json({ jobs: results });
  }
  if (method === "GET" && parts[0] === "events") {
    const { results } = await db.prepare("SELECT * FROM recruitment_events ORDER BY id DESC LIMIT 200").all();
    return json({ events: results });
  }
  const note = textField(body.review_note || "", 3, 1000, "Review reason");
  if (method === "PATCH" && parts[0] === "companies" && parts[1]) {
    if (!["verified", "rejected", "suspended"].includes(body.status)) throw invalid("Invalid company status.");
    const company = await db.prepare("SELECT user_id FROM employer_profiles WHERE user_id=?").bind(parts[1]).first();
    if (!company) throw invalid("Company not found.", 404, "NOT_FOUND");
    await db.batch([
      db.prepare("UPDATE employer_profiles SET status=?, review_note=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(body.status, note, parts[1]),
      recruitmentEvent(db, actor, "company." + body.status, parts[1], { reason: note }),
    ]);
    return json({ ok: true });
  }
  if (method === "PATCH" && parts[0] === "jobs" && parts[1]) {
    if (!["published", "rejected", "closed"].includes(body.status)) throw invalid("Invalid job status.");
    const job = await db.prepare(`SELECT j.*, p.status AS company_status, u.account_status FROM recruitment_jobs j
      JOIN employer_profiles p ON p.user_id=j.employer_id JOIN users u ON u.id=j.employer_id WHERE j.id=?`).bind(parts[1]).first();
    if (!job) throw invalid("Job not found.", 404, "NOT_FOUND");
    if (body.status === "published" && (job.company_status !== "verified" || job.account_status !== "active" || new Date(job.valid_through).getTime() <= Date.now())) throw invalid("Only current jobs from verified, active employers can be published.");
    const publishedAt = body.status === "published" ? (job.published_at || new Date().toISOString()) : job.published_at;
    await db.batch([
      db.prepare("UPDATE recruitment_jobs SET status=?, review_note=?, published_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status, note, publishedAt, job.id),
      recruitmentEvent(db, actor, "job." + body.status, job.id, { reason: note }),
    ]);
    return json({ ok: true });
  }
  throw invalid("Moderation route not found.", 404, "NOT_FOUND");
}
