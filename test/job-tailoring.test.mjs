import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as generate } from "../functions/api/ghostwriter.js";
import { onRequestPost as exportKit } from "../functions/api/export-package.js";
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
