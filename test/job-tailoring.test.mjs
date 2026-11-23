import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as generate } from "../functions/api/ghostwriter.js";
import { onRequestPost as exportKit } from "../functions/api/export-package.js";
import { onRequest as workspaceRoute } from "../functions/api/[[route]].js";
import { readUserState, writeUserState } from "../functions/api/_state.js";
import { getJobDb } from "../functions/api/_db.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const job = { id: "one", title: "Inventory Coordinator", employer: "Riyadh Logistics",
  description: "At least two years of inventory coordination are required. Forklift certification is preferred. The role reconciles physical inventory with stock records." };
const evidence = "Four years coordinating inventory and reconciling physical stock with purchase and dispatch records.";
const profile = { display_name: "Test Applicant", resume_text: `${evidence} Prepared weekly stock reports and trained colleagues to document discrepancies accurately.` };
const draft = {
  ar_resume: `منسق مخزون\nملخص مهني\n${("نسقت عمليات الجرد وراجعت سجلات الاستلام والمخزون مع فريق المستودع. ").repeat(3)}\n- خبرة أربع سنوات في تنسيق المخزون وتسوية الفروقات.\n- إعداد تقارير المخزون الأسبوعية وتدريب الزملاء على توثيق الفروقات.\nالخبرات\n${("راجعت سجلات الشراء والتسليم ونسقت إجراءات الجرد اليومية. ").repeat(3)}`,
  en_resume: `Inventory Coordinator\nProfessional Summary\n${("Experienced in inventory coordination and reconciliation with purchase and dispatch records. ").repeat(3)}\n- Four years of stock coordination and reconciliation.\n- Prepared weekly reports and trained colleagues on recording discrepancies.\nExperience\n${("Reviewed the inventory records with the warehouse team and documented stock discrepancies. ").repeat(3)}`,
  ar_cover_letter: "فريق التوظيف في الرياض للخدمات اللوجستية، أتقدم لدور منسق المخزون بخبرة أربع سنوات في تنسيق المخزون وتسوية الفروقات مع سجلات الشراء والتسليم.",
  en_cover_letter: "Dear Riyadh Logistics hiring team, I offer four years of inventory coordination, including reconciliation against purchasing and dispatch records to support accurate stock reporting.",
  ar_interview_prep: ["اشرح أسلوب الجرد", "اذكر خطوات المطابقة", "صف إعداد التقارير"],
  en_interview_prep: ["Explain your reconciliation process.", "Describe preparation for the count.", "Explain how you report discrepancies."],
};
const rows = [
  { requirement: "Inventory coordination experience", posting_quote: "At least two years of inventory coordination are required", priority: "required",
    status: "exceeds", evidence_quote: evidence, resume_covered: true, cover_letter_covered: true },
  { requirement: "Forklift certification", posting_quote: "Forklift certification is preferred", priority: "preferred",
    status: "gap", evidence_quote: "", resume_covered: false, cover_letter_covered: false },
  { requirement: "Stock reconciliation", posting_quote: "reconciles physical inventory with stock records", priority: "required",
    status: "meets", evidence_quote: evidence, resume_covered: true, cover_letter_covered: true },
];
const review = { approved: true, requirements_complete: true, factual_risks: [], missing_evidence: [], ats_checks: [], reviewer_summary: "Four years against a two-year requirement.", requirements: rows };
const env = { ...testEnv, DEEPSEEK_API_KEY: "test-provider-key" };

async function call(handler, payload) {
  const cookie = (await sessionCookie({ sub: "google-user" }, env.AUTH_COOKIE_SECRET)).split(";")[0];
  return handler({ env, request: new Request("https://jobs.wasfai.com/api/ghostwriter", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(payload) }) });
}

function providerReply(value) {
  return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
}

test("legacy package route uses the reviewed saved application and never writes a placeholder", async (t) => {
  const { addUser, identity } = gatewayFixture(t);
  addUser();
  const db = getJobDb(testEnv);
  const cookie = (await sessionCookie(identity, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  const request = () => workspaceRoute({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/packages/one/generate", {
    method: "POST", headers: { Cookie: cookie },
  }) });
  const savedKit = { ...draft, job_id: job.id, quality_review: review };
  const state = { jobs: [job], packages: [], package_history: [], profile,
    ghostwriter: { [job.id]: savedKit }, approvedKits: { [job.id]: false } };
  await writeUserState(db, identity, state);
  assert.equal((await request()).status, 409);
  state.approvedKits[job.id] = true;
  await writeUserState(db, identity, { ...state, ghostwriter: { [job.id]: { ...savedKit, en_resume: "A short preview" } } });
  assert.equal((await (await request()).json()).code, "KIT_INCOMPLETE");
  assert.equal((await readUserState(db, identity)).packages.length, 0);
  await writeUserState(db, identity, state);
  const response = await request();
  assert.equal(response.status, 201);
  const document = await response.json();
  assert.equal(document.resume_body, `${draft.ar_resume.trim()}\n\n${draft.en_resume.trim()}`);
  assert.equal(document.cover_letter_body, `${draft.ar_cover_letter}\n\n${draft.en_cover_letter}`);
  assert.equal((await request()).status, 200);
  assert.equal((await readUserState(db, identity)).package_history.length, 1);
});

test("a kit highlights evidence exceeding this job's criteria and surfaces a real gap for private review", async (t) => {
  const calls = [];
  const { addUser } = gatewayFixture(t, { otherFetch: (_url, init) => {
    const prompt = JSON.parse(JSON.parse(init.body).messages[1].content);
    calls.push(prompt);
    return providerReply(calls.length === 1 ? draft : review);
  } });
  addUser();
  const response = await call(generate, { job, profile, ai_model: "deepseek" });
  assert.equal(response.status, 200);
  const kit = await response.json();
  assert.equal(kit.quality_review.approved, true);
  assert.deepEqual(kit.quality_review.requirements, rows);
  assert.equal(calls[0].job.description, job.description);
  assert.equal(calls[1].source_resume, profile.resume_text);
  assert.equal(calls[1].draft.en_cover_letter, draft.en_cover_letter);
  const docx = await call(exportKit, { job, profile, kit, format: "docx" });
  assert.equal(docx.status, 200);
  const document = Buffer.from(await docx.arrayBuffer()).toString("utf8");
  assert.ok(!document.includes("Forklift certification"));
  assert.ok(document.includes("Riyadh Logistics hiring team"));
});

test("an edited package is reviewable but unsupported evidence or missing letter coverage prevents approval", async (t) => {
  let calls = 0;
  const { addUser } = gatewayFixture(t, { otherFetch: () => {
    const change = calls++ === 0 ? { evidence_quote: "Unsupported six years of inventory coordination." } : { cover_letter_covered: false };
    const requirements = [{ ...rows[0], ...change }, ...rows.slice(1)];
    return providerReply({ ...review, requirements });
  } });
  addUser();
  for (let i = 0; i < 2; i++) {
    const response = await call(generate, { job, profile, review_kit: draft, ai_model: "deepseek" });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.quality_review.approved, false);
    assert.equal((await call(exportKit, { job, profile, kit: { ...draft, ...result } })).status, 409);
  }
  assert.equal(calls, 2);
});

test("the generator asks for a posting when there are only job title and employer fields", async (t) => {
  const { addUser } = gatewayFixture(t, { otherFetch: () => assert.fail("Do not guess the missing requirements") });
  addUser();
  const response = await call(generate, { job: { ...job, description: "" }, profile, ai_model: "deepseek" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "JOB_DETAILS_REQUIRED");
});

test("the original CV is the review evidence and an approved master cannot prove a new certification", async (t) => {
  const claimed = "Obtained forklift certification from a licensed trainer.";
  const merged = { ...profile, approved_master_resume: profile.resume_text + " " + claimed };
  let attempts = 0;
  const { addUser } = gatewayFixture(t, { otherFetch: (url, init) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    const request = JSON.parse(init.body);
    assert.equal(request.model, "deepseek-flash");
    const prompt = JSON.parse(request.messages[1].content);
    assert.equal(prompt.source_resume, profile.resume_text);
    if (++attempts === 1) {
      assert.equal(prompt.approved_master, merged.approved_master_resume);
      return providerReply(draft);
    }
    return providerReply({ ...review, requirements: [rows[0], { ...rows[1], status: "meets", evidence_quote: claimed, resume_covered: true }, rows[2]] });
  } });
  addUser();
  const response = await call(generate, { job, profile: merged });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).quality_review.approved, false);
  assert.equal(attempts, 2);
});

test("a truncated generation is retried and invalid model output is never logged as a completed résumé", async (t) => {
  let attempts = 0;
  const { addUser, db } = gatewayFixture(t, { otherFetch: (_url, init) => {
    const body = JSON.parse(init.body);
    if (++attempts === 1) return Response.json({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(draft) } }] });
    assert.equal(body.max_tokens, 16384);
    return Response.json({ choices: [{ message: { content: "Invalid JSON" } }] });
  } });
  addUser();
  const response = await call(generate, { job, profile, ai_model: "deepseek" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AI_INVALID_DRAFT");
  assert.equal(attempts, 2);
  assert.deepEqual(db.prepare("SELECT status FROM ai_usage WHERE route='ghostwriter.generate' ORDER BY id").all().map(x => x.status), ["invalid_output", "invalid_output"]);
});
