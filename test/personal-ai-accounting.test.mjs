import test from "node:test";
import assert from "node:assert/strict";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { recordAiUsage } from "../functions/api/_ai_usage.js";
import { onRequest as admin } from "../functions/api/admin/[[route]].js";
import { onRequestGet, onRequestPut } from "../functions/api/me/state.js";

const owner = { sub: "jobs-owner", email: "jabosaag@gmail.com", provider: "google" };
const applicant = { sub: "applicant", email: "applicant@example.com", provider: "google" };

async function context(path, user, body) {
  const headers = { cookie: (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0] };
  if (body) headers["content-type"] = "application/json";
  return { env: testEnv, request: new Request("https://jobs.wasfai.com" + path, {
    method: body ? "PUT" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
  }) };
}

test("AI reporting separates personal tokens from Jobs spend and subscriber usage, including historic platform OpenRouter calls", async t => {
  const { addUser } = gatewayFixture(t);
  addUser("active", owner);
  addUser("active", applicant);
  const usage = { prompt_tokens: 10000, completion_tokens: 3000 };
  for (const provider of ["openrouter", "openrouter_personal"]) {
    await recordAiUsage({ env: testEnv }, applicant, { provider, model: "deepseek-flash", route: "resume-coach", usage });
  }
  await recordAiUsage({ env: testEnv }, applicant, { provider: "openrouter_personal", model: "deepseek-flash", route: "resume-coach", status: "provider_error" });
  const result = await admin(await context("/api/admin/ai", owner));
  assert.equal(result.status, 200);
  const report = await result.json();
  assert.equal(report.usage.requests, 3);
  assert.equal(report.usage.personal_metered_requests, 1);
  assert.equal(report.usage.cost_usd, 0.0066);
  assert.equal(report.usage.personal_comparison_usd, 0.0066);
  assert.equal(report.by_route.find(row => row.payer === "customer").cost_usd, 0);
  assert.equal(report.by_route.find(row => row.payer === "jobs").requests, 1);
  const subs = await (await admin(await context("/api/admin/subscribers", owner))).json();
  const sub = subs.subscribers.find(row => row.id === applicant.sub);
  assert.equal(sub.ai_tokens, 13000);
  assert.equal(sub.ai_cost_usd, 0.0066);
});

test("personal billing preferences are private, reject unknown values and survive saves from older clients", async t => {
  const { addUser } = gatewayFixture(t);
  for (const u of [owner, applicant]) addUser("active", u);
  const save = async body => onRequestPut(await context("/api/me/state", applicant, body));
  const read = async u => (await (await onRequestGet(await context("/api/me/state", u))).json()).state;
  assert.equal((await read(applicant)).aiBillingSource, "jobs");
  assert.equal((await save({ state: { aiBillingSource: "openrouter_personal", aiPersonalModel: "gpt-4.1-mini" } })).status, 200);
  assert.equal((await save({ state: { profile: { display_name: "Updated" } } })).status, 200);
  const stored = await read(applicant);
  assert.deepEqual([stored.aiBillingSource, stored.aiPersonalModel], ["openrouter_personal", "gpt-4.1-mini"]);
  assert.equal((await read(owner)).aiBillingSource, "jobs");
  for (const invalid of [{ aiBillingSource: "other" }, { aiPersonalModel: "some-secret" }]) {
    assert.equal((await save({ state: invalid })).status, 400);
  }
  assert.equal((await read(applicant)).aiBillingSource, "openrouter_personal");
});
