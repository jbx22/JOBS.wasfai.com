import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as coach } from "../functions/api/resume-coach.js";
import { onRequestPost as chat } from "../functions/api/ai-writer-chat.js";
import { encryptCredential, getUserOpenRouterKey } from "../functions/api/openrouter/_shared.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const providerUrl = "https://openrouter.ai/api/v1/chat/completions";
const bindings = {
  ...testEnv, OPENROUTER_API_KEY: "platform-router-fixture", OPENAI_API_KEY: "platform-openai-fixture",
  DEEPSEEK_API_KEY: "platform-deepseek-fixture", OPENROUTER_BASE_URL: "https://configured-platform-proxy.test",
};
const personalKey = "personal-owner-fixture";
const selected = { billing_source: "openrouter_personal", ai_model: "gpt-4.1-mini" };
const profile = { resume_text: "Retail assistant in Doha. Processed cash payments, checked stock counts and greeted customers. Completed workplace safety training." };

async function send(handler, payload, owner = "google-user") {
  const headers = { "Content-Type": "application/json" };
  if (owner) headers.Cookie = (await sessionCookie({ sub: owner }, bindings.AUTH_COOKIE_SECRET)).split(";")[0];
  return handler({ env: bindings, request: new Request("https://jobs.wasfai.com/api/fixture", {
    method: "POST", headers, body: JSON.stringify(payload),
  }) });
}

async function connect(db, owner = "google-user") {
  await getUserOpenRouterKey(bindings, owner); // initializes the production connection schema
  db.prepare("INSERT INTO user_openrouter_connections (user_id,credential) VALUES (?,?)")
    .run(owner, await encryptCredential(bindings, owner, personalKey));
}

function completion(text) {
  return Response.json({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 40, completion_tokens: 20 } });
}

test("personal coaching pins DeepInfra and offers an explicit retry after a paid, unusable answer", async t => {
  const calls = [];
  const { db, addUser } = gatewayFixture(t, { otherFetch(url, options) {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return completion(calls.length === 1 ? "{}" : JSON.stringify({
      ar_master_resume: "مساعدة مبيعات في الدوحة. عالجت المدفوعات النقدية، وراجعت كميات المخزون ورحبت بالعملاء. أكملت تدريب السلامة في مكان العمل.",
      en_master_resume: "Retail assistant in Doha. Processed cash payments, checked stock counts and greeted customers. Completed workplace safety training.",
    }));
  } });
  addUser();
  await connect(db);
  const input = {
    ...selected, ai_model: "deepseek-v4.1-flash", profile,
    provider: { only: ["other"] }, key: "untrusted-client-key", url: "https://client-input.test",
  };
  const incomplete = await send(coach, input);
  assert.equal(incomplete.status, 503);
  assert.equal((await incomplete.json()).code, "AI_INVALID_DRAFT");
  assert.equal(calls.length, 1);
  const response = await send(coach, input);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.provider, "openrouter_personal");
  assert.equal(body.billing_source, "openrouter_personal");
  assert.equal(body.model, "deepseek/deepseek-v4.1-flash");
  assert.equal(body.inference_provider, "DeepInfra");
  assert.ok(body.source_profile);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, providerUrl);
    assert.equal(call.options.redirect, "manual");
    assert.equal(call.options.headers.Authorization, "Bearer " + personalKey);
    assert.deepEqual(call.body.provider, { only: ["deepinfra"], allow_fallbacks: false });
    assert.equal(call.body.model, "deepseek/deepseek-v4.1-flash");
    assert.equal(call.body.thinking, undefined);
  }
  const rows = db.prepare("SELECT * FROM ai_usage ORDER BY id").all();
  assert.deepEqual(rows.map(row => row.status), ["invalid_output", "ok"]);
  for (const row of rows) {
    assert.equal(row.provider, "openrouter_personal");
    assert.equal(row.cost_usd, 0);
    assert.equal(row.input_tokens, 40);
  }
  assert.ok(!JSON.stringify([rows,body]).includes(personalKey));
});

test("chat pins OpenAI for every writing intent, and a connection alone never changes legacy Jobs billing", async t => {
  const calls = [];
  const { db, addUser } = gatewayFixture(t, { otherFetch(url, options) {
    calls.push({ url, header: options.headers.Authorization, body: JSON.parse(options.body) });
    return completion("Synthetic user-reviewable answer.");
  } });
  addUser();
  await connect(db);
  const input = { question: "Draft a short reply.", profile };
  for (const intent of ["interview", "application_answer", "recruiter_reply", "followup_email"]) {
    const response = await send(chat, { ...selected, ...input, intent });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).inference_provider, "OpenAI");
    const last = calls.at(-1);
    assert.equal(last.url, providerUrl);
    assert.equal(last.header, "Bearer " + personalKey);
    assert.equal(last.body.model, "openai/gpt-4.1-mini");
    assert.deepEqual(last.body.provider, { only: ["openai"], allow_fallbacks: false });
  }
  const legacy = await send(chat, input);
  assert.equal((await legacy.json()).billing_source, "jobs");
  assert.equal(calls.at(-1).url, "https://api.openai.com/v1/chat/completions");
  assert.equal(calls.at(-1).header, "Bearer platform-openai-fixture");
  const explicit = await send(chat, { ...input, billing_source: "jobs", ai_model: "minimax-m3" });
  assert.equal((await explicit.json()).billing_source, "jobs");
  assert.equal(calls.at(-1).url, "https://configured-platform-proxy.test/chat/completions");
  assert.equal(calls.at(-1).header, "Bearer platform-router-fixture");
});

test("missing, other-owner, corrupt and unrecognized personal selections fail before inference", async t => {
  let calls = 0;
  const { addUser, db } = gatewayFixture(t, { otherFetch() { calls++; return completion("Unexpected"); } });
  addUser();
  addUser("active", { sub: "other-user", email: "other@example.test" });
  await connect(db, "other-user");
  const input = { ...selected, question: "Reply.", owner: "other-user", user_id: "other-user", api_key: personalKey };
  assert.equal((await send(chat, input, "")).status, 401);
  for (const [payload, code] of [
    [input, "OPENROUTER_NOT_CONNECTED"],
    [{ ...input, ai_model: "vendor/unlisted" }, "PERSONAL_MODEL_REQUIRED"],
    [{ ...input, ai_model: null }, "PERSONAL_MODEL_REQUIRED"],
    [{ ...input, billing_source: "unknown" }, "INVALID_BILLING_SOURCE"],
    [{ ...input, billing_source: null }, "INVALID_BILLING_SOURCE"],
  ]) {
    assert.equal((await (await send(chat, payload)).json()).code, code);
  }
  db.prepare("INSERT INTO user_openrouter_connections(user_id, credential) VALUES (?, ?)").run("google-user", "unreadable-ciphertext-fixture");
  const unusable = await send(chat, input);
  assert.equal(unusable.status, 409);
  assert.equal((await unusable.json()).code, "OPENROUTER_RECONNECT_REQUIRED");
  assert.equal(calls, 0);
});

test("personal provider failures preserve the payer, never follow redirects, and suppress private upstream messages", async t => {
  const calls = [];
  let status = 401;
  const { addUser, db } = gatewayFixture(t, { otherFetch(url, options) {
    calls.push({ url, options });
    return Response.json({ error: { code: status === 200 ? 402 : status, message: "sensitive-upstream-details" } }, {
      status, headers: { Location: "https://redirected.test" },
    });
  } });
  addUser();
  await connect(db);
  for (const [upstream, http, code] of [
    [401, 403, "OPENROUTER_RECONNECT_REQUIRED"], [403, 403, "OPENROUTER_REQUEST_DENIED"],
    [402, 402, "OPENROUTER_CREDITS_REQUIRED"], [200, 402, "OPENROUTER_CREDITS_REQUIRED"], [429, 429, "AI_BUSY"],
    [302, 503, "AI_UNAVAILABLE"], [502, 503, "AI_UNAVAILABLE"],
  ]) {
    status = upstream;
    const previous = calls.length;
    const response = await send(chat, { question: "Prepare a response.", ...selected });
    assert.equal(response.status, http);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.ok(!JSON.stringify(body).includes("sensitive-upstream-details"));
    assert.equal(calls.length, previous + 1);
    assert.equal(calls.at(-1).url, providerUrl);
    assert.equal(calls.at(-1).options.redirect, "manual");
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE provider='openrouter_personal' AND status='provider_error' AND cost_usd=0").get().n, calls.length);
  assert.ok(!JSON.stringify(db.prepare("SELECT * FROM ai_usage").all()).includes("sensitive-upstream-details"));
});
