import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as coach } from "../functions/api/resume-coach.js";
import { onRequestGet as readiness, onRequestPost as probe } from "../functions/api/ai-health.js";
import { DEEPSEEK_MODEL, deepseekModel, resumeDeepseekKey } from "../functions/api/_deepseek.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const env = { ...testEnv, OPENAI_API_KEY: "openai-fixture", DEEPSEEK_API_KEY: "deepseek-fixture" };
const profile = { resume_text: "Warehouse coordinator in Riyadh. Managed stock counts, reconciled inventory discrepancies, recorded inbound shipments and trained new colleagues on safe handling." };
const drafts = {
  ar_master_resume: "الملخص المهني\nمنسق مستودع في الرياض. أدار عمليات جرد المخزون وتسوية الفروقات وتسجيل الشحنات الواردة. درّب الزملاء الجدد على إجراءات المناولة الآمنة.",
  en_master_resume: "Professional summary\nWarehouse coordinator in Riyadh with experience counting stock, reconciling inventory discrepancies, logging shipments and training new colleagues in safe handling.",
  search_profile: { target_titles: ["Warehouse coordinator"] },
};

function completion(content) {
  return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 200 } });
}

async function request(body = { profile }, signedIn = true) {
  const headers = { "Content-Type": "application/json" };
  if (signedIn) headers.Cookie = (await sessionCookie({ sub: "google-user" }, env.AUTH_COOKIE_SECRET)).split(";")[0];
  return new Request("https://jobs.wasfai.com/api/resume-coach", { method: "POST", headers, body: JSON.stringify(body) });
}

test("signed-in résumé coaching uses DeepSeek Flash even with OpenAI configured and retries blank JSON once", async (t) => {
  let attempts = 0;
  const { addUser, db } = gatewayFixture(t, { otherFetch: (url, init) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer deepseek-fixture");
    assert.equal(init.redirect, "manual");
    const settings = JSON.parse(init.body);
    assert.equal(settings.model, "deepseek-flash");
    assert.equal(settings.thinking.type, "disabled");
    assert.equal(settings.response_format.type, "json_object");
    assert.ok(settings.messages[1].content.includes(profile.resume_text));
    return completion(++attempts === 1 ? "   " : JSON.stringify(drafts));
  } });
  addUser();
  const result = await coach({ env: { ...env, DEEPSEEK_MODEL: "deepseek-v4-flash" }, request: await request() });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.equal(attempts, 2);
  assert.equal(data.provider, "deepseek");
  assert.equal(data.model, DEEPSEEK_MODEL);
  assert.equal(data.ar_master_resume, drafts.ar_master_resume);
  assert.equal(data.en_master_resume, drafts.en_master_resume);
  assert.equal(data.search_profile.seniority, "");
  assert.ok(db.prepare("SELECT cost_usd FROM ai_usage WHERE status='ok'").get().cost_usd > 0);
});

test("résumé coach requires a session and original text, and rejects incomplete bilingual drafts", async (t) => {
  let attempts = 0;
  const { addUser } = gatewayFixture(t, { otherFetch: () => {
    attempts++;
    return completion(JSON.stringify({ ar_master_resume: drafts.ar_master_resume }));
  } });
  addUser();
  const guest = await coach({ env, request: await request({ profile }, false) });
  assert.equal(guest.status, 401);
  const missing = await coach({ env, request: await request({ profile: { resume_skills: "Inventory, Logistics" } }) });
  assert.equal((await missing.json()).code, "RESUME_REQUIRED");
  assert.equal(attempts, 0);
  const incomplete = await coach({ env, request: await request() });
  assert.equal(incomplete.status, 503);
  const failure = await incomplete.json();
  assert.equal(failure.code, "AI_INVALID_DRAFT");
  assert.equal(failure.source_profile.target_roles, "Warehouse coordinator");
  assert.equal(failure.en_master_resume, undefined);
  assert.equal(attempts, 2);
});

test("the protected DeepSeek model probe returns the requested model and requires a completion", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(JSON.parse(init.body).model, DEEPSEEK_MODEL);
    return completion("READY");
  });
  const result = await probe({ env: { ...env, AI_HEALTH_TOKEN: "health-fixture" }, request: new Request("https://jobs.wasfai.com/api/ai-health?provider=deepseek", {
    method: "POST", headers: { Authorization: "Bearer health-fixture" },
  }) });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).ready, true);
  assert.equal(deepseekModel("deepseek-v4-flash"), "deepseek-flash");
  assert.equal(deepseekModel("deepseek-v4-pro"), "deepseek-v4-pro");
});

test("the coach retries a generic summary and preserves the source chronology in both full drafts", async (t) => {
  const career = [
    "Synthetic Applicant — Instrumentation Engineer",
    "2021–2025 — Lead instrumentation engineer, River Manufacturing. Oversaw calibration planning, documented instrument performance and coordinated shutdown schedules.",
    "2015–2021 — Controls engineer, Southern Systems. Tested process interlocks, wrote validation procedures and verified loop diagrams against installed equipment.",
    "2012 — Electrical engineering degree, College of Engineering. Final project covered a temperature regulation system and laboratory measurement uncertainty.",
    "Projects — Developed an independent test fixture and trained maintenance technicians in documenting traceable calibration results and planning inspections.",
    "Earlier assignments — Prepared change requests for instrument replacements, assessed spares alternatives, communicated vendor requirements and updated engineering records.",
    "Delivered reconciled asset data and coordinated maintenance procedures with purchasing, field supervisors, design engineers, technicians and maintenance team leads.",
  ].join("\n");
  const ar = [
    "مهندس أجهزة القياس والتحكم", "الخبرة المهنية",
    "٢٠٢١–٢٠٢٥ — مهندس أجهزة قياس رئيسي. أشرف على تخطيط المعايرة ووثّق أداء الأجهزة ونسق مواعيد التوقف.",
    "٢٠١٥–٢٠٢١ — مهندس تحكم. اختبر دوائر الحماية وكتب إجراءات التحقق وراجع المخططات مع الأجهزة المركبة.",
    "التعليم", "٢٠١٢ — درجة في الهندسة الكهربائية. تناول مشروع التخرج تنظيم درجة الحرارة وعدم اليقين في القياسات المختبرية.",
    "المشروعات", "طوّر تجهيزات الاختبار ودرب فنيي الصيانة على توثيق المعايرة. نسق طلبات التغيير وراجع قطع الغيار مع فرق المشتريات والتصميم.",
  ].join("\n");
  let attempts = 0;
  const { addUser, db } = gatewayFixture(t, { otherFetch: (_url, init) => {
    const body = JSON.parse(init.body);
    const submitted = JSON.parse(body.messages[1].content);
    assert.ok(submitted.profile.resume_text.includes("maintenance team leads."));
    assert.doesNotMatch(submitted.profile.resume_text, /cid:54/);
    if (++attempts === 1) return completion(JSON.stringify(drafts));
    assert.equal(body.max_tokens, 16384);
    return completion(JSON.stringify({ ...drafts, ar_master_resume: ar, en_master_resume: career }));
  } });
  addUser();
  const res = await coach({ env, request: await request({ profile: { resume_text: career + " (cid:54)" } }) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).en_master_resume, career);
  assert.deepEqual(db.prepare("SELECT status FROM ai_usage ORDER BY id").all().map(x => x.status), ["invalid_output", "ok"]);
});

test("the coach rejects provider truncation and fabricated dates even in otherwise valid JSON", async (t) => {
  let attempts = 0;
  const { addUser } = gatewayFixture(t, { otherFetch: () => {
    const output = { ...drafts, en_master_resume: drafts.en_master_resume + " Awarded an advanced diploma in 2015." };
    return Response.json({ choices: [{ finish_reason: ++attempts === 1 ? "length" : "stop", message: { content: JSON.stringify(output) } }] });
  } });
  addUser();
  const res = await coach({ env, request: await request() });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "AI_INVALID_DRAFT");
  assert.equal(attempts, 2);
});

test("résumé provider key takes precedence and missing scoped credentials use existing bindings", async (t) => {
  assert.equal(resumeDeepseekKey({ JOBS_RESUME_DEEPSEEK_API_KEY: " ", DEEPSEEK_API_KEY: " global " }), "global");
  assert.equal(resumeDeepseekKey({ DEEPSEEK_API_KEY: " ", AI_API_KEY: " legacy " }), "legacy");
  const scoped = { ...testEnv, JOBS_RESUME_DEEPSEEK_API_KEY: " resume-fixture " };
  const { addUser } = gatewayFixture(t, { otherFetch: (url, init) => {
    assert.equal(url, "https://api.deepseek.com/v1/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer resume-fixture");
    const call = JSON.parse(init.body);
    return completion(call.max_tokens === 24 ? "READY" : JSON.stringify(drafts));
  } });
  addUser();
  const health = await readiness({ env: scoped, request: await request() });
  assert.equal((await health.json()).providers.deepseek, "configured");
  const disabled = await readiness({ env: { ...scoped, JOBS_RESUME_DEEPSEEK_API_KEY: " " }, request: await request() });
  assert.equal((await disabled.json()).providers.deepseek, "missing");
  const both = { ...scoped, DEEPSEEK_API_KEY: "global-fixture", AI_API_KEY: "legacy-fixture" };
  assert.equal((await coach({ env: both, request: await request() })).status, 200);
  const result = await probe({ env: { ...both, AI_HEALTH_TOKEN: "health-fixture" }, request: new Request("https://jobs.wasfai.com/api/ai-health?provider=deepseek", {
    method: "POST", headers: { Authorization: "Bearer health-fixture" },
  }) });
  assert.equal((await result.json()).ready, true);
});

test("unreadable OCR with contact details never reaches the provider", async (t) => {
  let attempts = 0;
  const { addUser } = gatewayFixture(t, { otherFetch: () => { attempts++; return completion(JSON.stringify(drafts)); } });
  addUser();
  const text = "test@example.invalid\n+1 202 555 0190\n" + "عbغHص qXجP c A ش R ل \uFFFD (cid:142) ".repeat(14);
  const response = await coach({ env, request: await request({ profile: { resume_text: text, target_roles: "Customer service" } }) });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "RESUME_UNREADABLE");
  assert.equal(attempts, 0);
});

test("a short entry-level résumé yields grounded profile fields and concise bilingual drafts without dates", async (t) => {
  const original = "Alex Ray\nRetail Trainee\nCity: Doha\nSkills: cash handling, stock counts";
  const english = "Alex Ray\nRetail Trainee\nDoha | Skills\nCash handling and stock counts.";
  const arabic = "أليكس راي\nمتدرب في قطاع التجزئة\nالدوحة\nالمهارات: التعامل مع النقد وجرد المخزون.";
  let attempts = 0;
  const { addUser } = gatewayFixture(t, { otherFetch: (_url, init) => {
    attempts++;
    const prompt = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.equal(prompt.profile.display_name, "Alex Ray");
    assert.equal(prompt.profile.resume_skills, "cash handling, stock counts");
    assert.equal(prompt.profile.resume_text, original);
    assert.doesNotMatch(JSON.stringify(prompt), /Stale Name|Wrong Skills/);
    return completion(JSON.stringify({ ar_master_resume: arabic, en_master_resume: english,
      search_profile: { target_titles: ["Operations Director"], keywords: ["Machine learning"], locations: ["London"], seniority: "Executive" } }));
  } });
  addUser();
  const result = await coach({ env, request: await request({ profile: { display_name: "Stale Name", resume_skills: "Wrong Skills", resume_text: original } }) });
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(attempts, 1);
  assert.equal(body.en_master_resume, english);
  assert.equal(body.source_profile.resume_seniority, "Trainee");
  assert.deepEqual(body.search_profile, { target_titles: ["Retail Trainee"], locations: ["Doha"], keywords: ["cash handling", "stock counts"], seniority: "Trainee" });
});

test("Arabic year affixes preserve actual dates and an incidental P.O. box is optional", async (t) => {
  const original = "موظفة استقبال\nدربت المتطوعين لعام٢٠٢١م واستقبلت الزوار وتابعت حجوزاتهم.\nصندوق البريد: 2017";
  const en = "Receptionist\nTrained volunteers in 2021, welcomed visitors and followed up on their reservations.";
  const ar = "موظفة استقبال\nدربت المتطوعين في عام ٢٠٢١، واستقبلت الزوار وتابعت حجوزاتهم.";
  const { addUser } = gatewayFixture(t, { otherFetch: () => completion(JSON.stringify({ ar_master_resume: ar, en_master_resume: en })) });
  addUser();
  const result = await coach({ env, request: await request({ profile: { resume_text: original } }) });
  assert.equal(result.status, 200);
});

test("timeout and rate-limited coaching retain only grounded source fields for recovery", async (t) => {
  const { addUser } = gatewayFixture(t, { otherFetch: () => {
    if (timeout) throw new DOMException("Simulated upstream timeout", "AbortError");
    return Response.json({}, { status: 429 });
  } });
  addUser();
  let timeout = false;
  for (const code of ["AI_BUSY", "AI_TIMEOUT"]) {
    const response = await coach({ env, request: await request() });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.equal(body.source_profile.target_roles, "Warehouse coordinator");
    assert.equal(body.en_master_resume, undefined);
    assert.equal(body.provider, undefined);
    timeout = true;
  }
});
