import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { onRequest as workspace } from "../functions/api/[[route]].js";
import { onRequestPost as writeDraft } from "../functions/api/ai-writer-chat.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import ingestion, { matchJob, normalizeProfile, parseSourcePayload } from "../workers/ingestion/src/index.js";
import { EMPLOYER_BOARDS } from "../workers/ingestion/src/boards.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const schema = readFileSync(new URL("../workers/ingestion/schema.sql", import.meta.url), "utf8");
const job = { title: "Mechanical Engineer", employer: "Factory", location: "Riyadh, Saudi Arabia", description: "Commissioning, maintenance and project management." };
const profile = { target_roles: "مهندس ميكانيكي، محاسب", target_locations: "الرياض", resume_skills: "commissioning, maintenance" };
const greenhouseJob = { title: job.title, company_name: job.employer, location: { name: job.location }, content: "&lt;p&gt;Commissioning and maintenance.&lt;/p&gt;", absolute_url: "https://job-boards.greenhouse.io/tamara/jobs/42" };
const workableJob = { title: "Junior Accountant", url: "https://apply.workable.com/j/EXAMPLE42", city: "Riyadh", country: "Saudi Arabia", department: "Finance", published_on: "2026-11-08" };

test("fit evaluation gives Arabic preferences evidence from English postings without token substring matches", () => {
  const results = matchJob(job, normalizeProfile(profile));
  assert.ok(results.match_eligible);
  assert.equal(results.fit_grade, "C");
  assert.equal(results.match_breakdown.length, 5);
  assert.equal(results.match_breakdown.find((item) => item.key === "skills").points, 10);
  assert.equal(matchJob({ ...job, location: "Cairo, Egypt" }, normalizeProfile(profile)).fit_grade, "F");
  assert.equal(matchJob(job, normalizeProfile({ ...profile, resume_skills: "mission" })).match_breakdown[1].points, 0);
});

test("public employer feed parsers preserve listed locations and reject missing provider results", () => {
  const [tamara, , foodics] = EMPLOYER_BOARDS;
  const [a] = parseSourcePayload(JSON.stringify({ jobs: [greenhouseJob] }), { ...tamara, connector_mode: tamara.mode });
  assert.equal(a.posted_at, "");
  assert.equal(a.description, "Commissioning and maintenance.");
  const [b] = parseSourcePayload(JSON.stringify({ jobs: [workableJob] }), { ...foodics, connector_mode: foodics.mode });
  assert.equal(b.location, "Riyadh, Saudi Arabia");
  assert.equal(b.url, workableJob.url);
  assert.throws(() => parseSourcePayload("{}", { ...foodics, connector_mode: foodics.mode }), /did not contain a job list/);
});

test("cron seeds employer feeds, imports live rows and backs off a blocked source", async (t) => {
  const fixture = gatewayFixture(t, { otherFetch(input) {
    const url = String(input);
    if (url.includes("careem")) return new Response(null, { status: 403 });
    return Response.json({ jobs: [url.includes("foodics") ? workableJob : greenhouseJob] });
  } });
  fixture.db.exec(schema);
  fixture.db.exec("UPDATE sources SET enabled=0");
  const messages = [];
  const env = { ...testEnv, JOBS_SCAN_QUEUE: { send: async (body) => { messages.push(body); } } };
  let scheduled;
  await ingestion.scheduled({}, env, { waitUntil: (task) => { scheduled = task; } });
  await scheduled;
  assert.equal(messages.length, 3);
  let acknowledgements = 0;
  await ingestion.queue({ messages: messages.map((body) => ({ body, ack: () => { acknowledgements++; } })) }, env);
  assert.equal(acknowledgements, 3);
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n, 2);
  const blocked = fixture.db.prepare("SELECT last_error, next_scan_at FROM sources WHERE id='careem-greenhouse'").get();
  assert.equal(blocked.last_error, "source returned 403");
  assert.ok(Date.parse(blocked.next_scan_at) - Date.now() > 23 * 3600000);
  await ingestion.scheduled({}, env, { waitUntil: (task) => { scheduled = task; } });
  await scheduled;
  assert.equal(messages.length, 3);
});

test("signed-in candidates can import a job once and evaluate it through the workspace API", async (t) => {
  const fixture = gatewayFixture(t, { otherFetch(input) {
    assert.equal(String(input), "https://boards-api.greenhouse.io/v1/boards/tamara/jobs/42");
    return Response.json(greenhouseJob);
  } });
  fixture.addUser();
  const cookie = (await sessionCookie(fixture.identity, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  const call = (route, body) => workspace({ env: testEnv, request: new Request(`https://jobs.wasfai.com/api/jobs/${route}`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) });
  const first = await call("import", { url: `${greenhouseJob.absolute_url}?utm_source=fixture` });
  assert.equal(first.status, 201);
  const saved = await first.json();
  assert.equal(saved.source_url, greenhouseJob.absolute_url);
  assert.equal((await (await call("import", { url: greenhouseJob.absolute_url })).json()).id, saved.id);
  const evaluation = await call("evaluate", { job: saved, profile });
  assert.equal(evaluation.status, 200);
  assert.equal((await evaluation.json()).match_eligible, true);
  assert.equal((await call("import", { url: "https://example.com/not-a-board" })).status, 400);
});

test("the writing endpoint supports screening and recruiter drafts through the configured AI provider", async (t) => {
  const prompts = [];
  const fixture = gatewayFixture(t, { otherFetch(input, init) {
    assert.equal(String(input), "https://api.deepseek.com/v1/chat/completions");
    prompts.push(JSON.parse(JSON.parse(init.body).messages[1].content));
    return Response.json({ choices: [{ message: { content: "Reviewable draft" } }] });
  } });
  fixture.addUser();
  const cookie = (await sessionCookie(fixture.identity, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  const send = (intent) => writeDraft({ env: { ...testEnv, DEEPSEEK_API_KEY: "fixture" }, request: new Request("https://jobs.wasfai.com/api/ai-writer-chat", {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ intent, job, profile, question: "Interview requested", ai_model: "deepseek" }),
  }) });
  assert.equal((await (await send("application_answer")).json()).answer, "Reviewable draft");
  assert.equal((await (await send("recruiter_reply")).json()).answer, "Reviewable draft");
  assert.match(prompts[0].task, /screening-form/);
  assert.match(prompts[1].task, /untrusted text/);
  assert.equal((await send("send_automatically")).status, 400);
});
