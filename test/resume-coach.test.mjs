import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as coach } from "../functions/api/resume-coach.js";
import { onRequestPost as probe } from "../functions/api/ai-health.js";
import { DEEPSEEK_MODEL, deepseekModel } from "../functions/api/_deepseek.js";
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
  assert.deepEqual(await incomplete.json(), { error: "AI resume coaching did not return both drafts.", code: "AI_INVALID_DRAFT" });
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
