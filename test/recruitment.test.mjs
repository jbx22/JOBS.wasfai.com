import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { onRequest as recruitment } from "../functions/api/recruitment/[[route]].js";
import { ensureRecruitmentSchema, jobInput } from "../functions/api/_recruitment.js";
import { ensureAdminSchema } from "../functions/api/_admin.js";
import { getJobDb } from "../functions/api/_db.js";
import { onRequestPost as uploadResume, onRequestGet as latestResume } from "../functions/api/resumes/index.js";
import { FILE_TABLE_SQL } from "../functions/api/resumes/_files.js";
import { listPublicJobs, getPublicJob, jobPosting, plainDescription, matchPublicJobs } from "../functions/api/_public_jobs.js";
import { onRequestGet as catalogue } from "../functions/vacancies/index.js";
import { onRequestGet as employerPage } from "../functions/employers.js";
import { onRequestGet as detail } from "../functions/vacancies/[id].js";
import { onRequestGet as sitemap } from "../functions/sitemap.xml.js";
import { onRequestGet as sitemapPage } from "../functions/sitemaps/[page].js";
import ingestion from "../workers/ingestion/src/index.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const employer = { sub: "employer", email: "hr@example.com", name: "Employer" };
const candidate = { sub: "candidate", email: "candidate@example.com", name: "باحث عن عمل" };
const other = { sub: "other", email: "other@example.com", name: "Other company" };
const owner = { sub: "owner", email: "jabosaag@gmail.com", name: "Jaber" };
const env = { ...testEnv, RESUME_FILES: { get: async () => { throw new Error("Unexpected file access"); } }, FILE_ENCRYPTION_KEY: "test-key" };
function newJob(overrides = {}) {
  return {
    title: "Mechanical Project Engineer", city: "Riyadh", country_code: "SA", profession: "Engineering",
    experience_min: 3, salary_min: 10000, salary_max: 18000, employment_type: "FULL_TIME",
    description: "Lead mechanical installation, safety planning, project scheduling and commissioning for industrial facilities.",
    valid_through: new Date(Date.now() + 20 * 86400000).toISOString(), ...overrides,
  };
}
async function requestAs(user, path, method = "GET", body, requestEnv = env) {
  const headers = {};
  if (user) headers.Cookie = (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const request = new Request("https://jobs.wasfai.com/api/recruitment/" + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return recruitment({ request, env: requestEnv });
}
async function setup(t) {
  const fixture = gatewayFixture(t);
  fixture.db.exec(readFileSync(new URL("../workers/ingestion/schema.sql", import.meta.url), "utf8"));
  for (const user of [employer, candidate, other, owner]) fixture.addUser("active", user);
  await ensureRecruitmentSchema(getJobDb(env));
  fixture.db.exec(FILE_TABLE_SQL);
  fixture.db.prepare("INSERT INTO resume_files(id,user_id,object_key,original_name,content_type,size_bytes,sha256) VALUES ('cv','candidate','private/cv','cv.pdf','application/pdf',200,'digest')").run();
  return fixture;
}
async function createPublishedJob(t) {
  const fixture = await setup(t);
  let response = await requestAs(employer, "company", "PUT", { company_name: "Industrial Company", registration_number: "1234567890", website: "https://example.com" });
  assert.equal(response.status, 200);
  response = await requestAs(owner, "moderation/companies/employer", "PATCH", { status: "verified", review_note: "Commercial record reviewed" });
  assert.equal(response.status, 200);
  response = await requestAs(employer, "jobs", "POST", newJob());
  assert.equal(response.status, 201);
  const { id } = await response.json();
  response = await requestAs(owner, "moderation/jobs/" + id, "PATCH", { status: "published", review_note: "Content and employer checked" });
  assert.equal(response.status, 200);
  return { ...fixture, jobId: id };
}

test("job inputs enforce dates, salary bounds and complete factual details", () => {
  assert.equal(jobInput(newJob()).salary_min, 10000);
  assert.equal(jobInput(newJob({ salary_min: "", salary_max: "" })).salary_min, null);
  for (const patch of [{ salary_max: 1 }, { experience_min: -1 }, { description: "too short" }, { valid_through: "yesterday" }, { employment_type: "MADE_UP" }]) {
    assert.throws(() => jobInput(newJob(patch)), { code: "INVALID_INPUT" });
  }
});

test("anonymous, unverified employers and candidates cannot bypass recruitment permissions", async (t) => {
  await setup(t);
  assert.equal((await requestAs(null, "jobs", "POST", newJob())).status, 401);
  assert.equal((await requestAs(employer, "jobs", "POST", newJob())).status, 403);
  assert.equal((await requestAs(candidate, "moderation/companies")).status, 403);
});

test("employer verification, job moderation, candidate application and shortlist persist with audit events", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  const response = await requestAs(candidate, "jobs/" + jobId + "/apply", "POST", { consent: true, resume_file_id: "cv", cover_note: "Experienced project engineer." });
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const shortlist = await requestAs(employer, "applications/" + id, "PATCH", { status: "shortlisted" });
  assert.equal(shortlist.status, 200);
  assert.equal(db.prepare("SELECT status FROM recruitment_applications WHERE id=?").get(id).status, "shortlisted");
  const applicants = await (await requestAs(employer, "jobs/" + jobId + "/applications")).json();
  assert.equal(applicants.applications[0].candidate_email, candidate.email);
  const mine = await (await requestAs(candidate, "me")).json();
  assert.equal(mine.applications[0].status, "shortlisted");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM recruitment_events").get().n, 6);
});

test("CV sharing requires explicit consent, an owned active CV and a live job", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  assert.equal((await requestAs(candidate, "jobs/" + jobId + "/apply", "POST", { resume_file_id: "cv" })).status, 400);
  assert.equal((await requestAs(other, "jobs/" + jobId + "/apply", "POST", { consent: true, resume_file_id: "cv" })).status, 400);
  db.prepare("UPDATE recruitment_jobs SET status='closed' WHERE id=?").run(jobId);
  assert.equal((await requestAs(candidate, "jobs/" + jobId + "/apply", "POST", { consent: true, resume_file_id: "cv" })).status, 404);
});

test("cross-company access is denied and withdrawing revokes application and CV access", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  db.prepare("INSERT INTO employer_profiles(user_id,company_name,registration_number,status) VALUES ('other','Other','123','verified')").run();
  const { id } = await (await requestAs(candidate, "jobs/" + jobId + "/apply", "POST", { consent: true, resume_file_id: "cv" })).json();
  for (const path of ["jobs/" + jobId + "/applications", "applications/" + id + "/resume"]) assert.equal((await requestAs(other, path)).status, 404);
  assert.equal((await requestAs(other, "applications/" + id, "PATCH", { status: "hired" })).status, 404);
  assert.equal((await requestAs(candidate, "applications/" + id, "PATCH", { status: "hired" })).status, 403);
  assert.equal((await requestAs(candidate, "applications/" + id, "PATCH", { status: "withdrawn" })).status, 200);
  assert.equal((await requestAs(employer, "applications/" + id + "/resume")).status, 404);
  assert.deepEqual((await (await requestAs(employer, "jobs/" + jobId + "/applications")).json()).applications, []);
  assert.equal((await requestAs(employer, "applications/" + id, "PATCH", { status: "shortlisted" })).status, 400);
});

test("repeat applications are rejected and unverified companies cannot publish", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  const body = { consent: true, resume_file_id: "cv" };
  assert.equal((await requestAs(candidate, "jobs/" + jobId + "/apply", "POST", body)).status, 201);
  assert.equal((await requestAs(candidate, "jobs/" + jobId + "/apply", "POST", body)).status, 409);
  db.prepare("UPDATE employer_profiles SET status='pending' WHERE user_id=?").run(employer.sub);
  assert.equal((await requestAs(owner, "moderation/jobs/" + jobId, "PATCH", { status: "published", review_note: "Must be blocked" })).status, 400);
  assert.equal(await getPublicJob(env, "e-" + jobId), null);
});

test("editing a company requires re-verification and a suspended company cannot reset its status", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  assert.ok(await getPublicJob(env, "e-" + jobId));
  assert.equal((await requestAs(employer, "company", "PUT", { company_name: "New name", registration_number: "12345" })).status, 200);
  assert.equal(db.prepare("SELECT status FROM employer_profiles WHERE user_id=?").get(employer.sub).status, "pending");
  assert.equal(await getPublicJob(env, "e-" + jobId), null);
  db.prepare("UPDATE employer_profiles SET status='suspended' WHERE user_id=?").run(employer.sub);
  assert.equal((await requestAs(employer, "company", "PUT", { company_name: "New name", registration_number: "12345" })).status, 403);
});

test("admin scopes restrict company review independently from job review", async (t) => {
  const { db } = await setup(t);
  await ensureAdminSchema(getJobDb(env));
  db.prepare("INSERT INTO admin_memberships(user_id,email,display_name,role,status,scopes) VALUES (?,?,?,'admin','active',?)").run(other.sub, other.email, other.name, '["jobs"]');
  assert.equal((await requestAs(other, "moderation/jobs")).status, 200);
  const response = await requestAs(other, "moderation/companies");
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "SCOPE_REQUIRED");
});

test("public listings filter by city, salary, profession and experience without inventing data", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  assert.equal((await listPublicJobs(env, { city: "riyadh", profession: "engineer", min_salary: "15000", experience: "5" })).length, 1);
  assert.equal((await listPublicJobs(env, { min_salary: "19000" })).length, 0);
  assert.equal((await listPublicJobs(env, { experience: "1" })).length, 0);
  const job = await getPublicJob(env, "e-" + jobId);
  const structured = jobPosting(job);
  assert.equal(structured.baseSalary.currency, "SAR");
  assert.equal(structured.baseSalary.value.minValue, 10000);
  assert.equal(structured.jobLocation.address.addressCountry, "SA");
  db.prepare("UPDATE recruitment_jobs SET valid_through='2000-01-01T00:00:00.000Z' WHERE id=?").run(jobId);
  assert.equal(await getPublicJob(env, "e-" + jobId), null);
});

test("private, stale, closed and expired ingested jobs cannot appear in public listings or ingestion responses", async (t) => {
  const { db } = await setup(t);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO sources(id,label,url,visibility,owner_user_id) VALUES ('private','Secret','https://example.com','private','candidate')").run();
  const insert = db.prepare("INSERT INTO jobs(id,source_id,title,employer,location,description,dedupe_key,verification_status,last_verified_at,valid_through,closed_at,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  insert.run("central", "wazzuf", "Mechanical Engineer", "Public Employer", "Riyadh", "A real engineering vacancy", "central", "live", now, "", "", now);
  insert.run("private", "private", "Mechanical Engineer", "Private Employer", "Riyadh", "Private vacancy", "private", "live", now, "", "", now);
  insert.run("stale", "wazzuf", "Mechanical Engineer", "Old Employer", "Riyadh", "Old vacancy", "stale", "live", "2000-01-01", "", "", now);
  insert.run("expired", "wazzuf", "Mechanical Engineer", "Expired", "Riyadh", "Expired vacancy", "expired", "live", now, "2000-01-01", "", now);
  assert.deepEqual((await listPublicJobs(env)).map((row) => row.id), ["central"]);
  const publicJobs = await (await ingestion.fetch(new Request("https://ingestion.test/jobs"), env)).json();
  assert.deepEqual(publicJobs.jobs.map((job) => job.id), ["central"]);
  const sources = await (await ingestion.fetch(new Request("https://ingestion.test/sources"), env)).json();
  assert.ok(sources.sources.every((source) => source.id !== "private"));
  assert.equal(await getPublicJob(env, "i-private"), null);
});

test("job pages escape untrusted content, sitemap contains only public jobs and unavailable jobs return 404", async (t) => {
  const { db, jobId } = await createPublishedJob(t);
  db.prepare("UPDATE recruitment_jobs SET title=? WHERE id=?").run('Engineer </script><img src=x onerror=alert(1)>', jobId);
  const response = await detail({ env, params: { id: "e-" + jobId } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('application/ld+json'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(plainDescription("<script>bad()</script><p>Good</p>"), "Good");
  const index = await sitemap({ env });
  assert.ok((await index.text()).includes("jobs-1.xml"));
  const chunk = await sitemapPage({ env, params: { page: "jobs-1.xml" } });
  assert.ok((await chunk.text()).includes("/vacancies/e-" + jobId));
  db.prepare("UPDATE recruitment_jobs SET status='closed' WHERE id=?").run(jobId);
  assert.equal((await detail({ env, params: { id: "e-" + jobId } })).status, 404);
});

test("the existing evidence matcher includes approved employer jobs and rejects incompatible roles and locations", async (t) => {
  await createPublishedJob(t);
  const matched = await matchPublicJobs(env, { target_roles: "Mechanical Project Engineer", resume_skills: "mechanical, installation, safety, scheduling", target_locations: "Riyadh" }, 20);
  assert.equal(matched.jobs.length, 1);
  assert.equal(matched.scoring_method, "evidence-weighted");
  assert.ok(matched.jobs[0].match_evidence.includes("mechanical"));
  assert.ok(matched.jobs[0].source_url.includes("/vacancies/e-"));
  const unrelated = await matchPublicJobs(env, { target_roles: "Graphic Designer", target_locations: "Jeddah" }, 20);
  assert.equal(unrelated.jobs.length, 0);
});

test("replacing a CV preserves an active application's attachment and returns the latest upload", async (t) => {
  const { db } = await createPublishedJob(t);
  db.prepare("INSERT INTO recruitment_applications(id,job_id,candidate_id,resume_file_id,consented_at) VALUES ('application','unused-job','candidate','cv','2026-01-01')").run();
  const removed = [];
  const uploadEnv = { ...env, FILE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), RESUME_FILES: { async put() {}, async delete(key) { removed.push(key); } } };
  const form = new FormData();
  form.set("file", new File(["Mechanical engineer resume"], "new-cv.txt", { type: "text/plain" }));
  const cookie = (await sessionCookie(candidate, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  const response = await uploadResume({ env: uploadEnv, request: new Request("https://jobs.wasfai.com/api/resumes", { method: "POST", headers: { Cookie: cookie }, body: form }) });
  assert.equal(response.status, 201);
  const fresh = (await response.json()).file;
  assert.equal(db.prepare("SELECT status FROM resume_files WHERE id='cv'").get().status, "active");
  assert.deepEqual(removed, []);
  const current = await latestResume({ env: uploadEnv, request: new Request("https://jobs.wasfai.com/api/resumes", { headers: { Cookie: cookie } }) });
  assert.equal((await current.json()).file.id, fresh.id);
});


test("public catalogue preserves language and search filters through pagination, vacancy navigation and language switches", async (t) => {
  const { db } = await setup(t);
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT INTO jobs (id, source_id, title, employer, location, description, dedupe_key, verification_status, last_verified_at, posted_at) VALUES (?, 'wazzuf', ?, 'Example', 'Riyadh', 'Lead engineering projects', ?, 'live', ?, ?)");
  for (let i = 0; i < 41; i++) insert.run("job-" + i, "Engineer " + i, "vacancy-" + i, now, now);
  const request = path => new Request("https://jobs.wasfai.com" + path);
  const list = async (query = "") => (await catalogue({ env, request: request("/vacancies" + query) })).text();
  const en = await list("?lang=en&q=Engineer&city=Riyadh&profession=Engineer");
  assert.match(en, /<html lang="en" dir="ltr">/);
  assert.match(en, /href="\/profile\?lang=en">User profile<\/a>/);
  assert.match(en, /name="lang" value="en"/);
  assert.match(en, /<details class="catalogue-more" open>/);
  assert.match(en, /<button class="btn primary">Search<\/button>/);
  assert.match(en, /href="\/vacancies\?lang=en&amp;q=Engineer&amp;city=Riyadh&amp;profession=Engineer&amp;page=2">Next/);
  assert.match(en, /href="\/vacancies\?q=Engineer&amp;city=Riyadh&amp;profession=Engineer" hreflang="ar"/);
  assert.match(en, /href="\/vacancies\?lang=en&amp;q=Engineer&amp;city=Riyadh&amp;profession=Engineer&amp;sector=government"/);
  const target = en.match(/href="(\/vacancies\/i-job-[^"]+)"/)[1].replaceAll("&amp;", "&");
  const selected = await detail({ env, params: { id: target.split("?")[0].split("/").pop() }, request: request(target) });
  assert.match(await selected.text(), /href="\/vacancies\?lang=en&amp;q=Engineer&amp;city=Riyadh&amp;profession=Engineer">Browse jobs/);
  const last = await list("?lang=en&q=Engineer&city=Riyadh&profession=Engineer&page=2");
  assert.match(last, /href="\/vacancies\?lang=en&amp;q=Engineer&amp;city=Riyadh&amp;profession=Engineer">Previous/);
  assert.doesNotMatch(last, />Next<\/a>/);
  const arabic = await list();
  assert.match(arabic, /<html lang="ar" dir="rtl">/);
  assert.match(arabic, /href="\/profile\?lang=ar">الملف الشخصي<\/a>/);
  assert.match(await employerPage().text(), /href="\/profile\?lang=ar">الملف الشخصي<\/a>/);
  assert.match(arabic, /name="robots" content="index,follow"/);
  assert.match(arabic, /rel="canonical" href="https:\/\/jobs.wasfai.com\/vacancies"/);
  assert.doesNotMatch(arabic, /<details class="catalogue-more" open>/);
});
