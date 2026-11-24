const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test.use({ serviceWorkers: "block" });

const source = readFileSync(join(__dirname, "test-resume.txt"), "utf8");
const arabicResume = "مدير مشاريع صناعية. أشرف على تطوير المصانع وإدارة الميزانيات الرأسمالية والتشغيلية. قاد فرق العمل وتعاون مع المقاولين في مشروعات التصنيع بالمملكة العربية السعودية.";
const job = {
  id: "qa-industrial-role", title: "Industrial project manager", employer: "Example Industries", source: "manual",
  location: "Riyadh", status: "discovered", description: "Manage industrial infrastructure programs and coordinate project handovers between equipment suppliers and the plant operators.",
};
const personal = "openrouter_personal";
const model = "gpt-4.1-mini";

async function workspace(page, baseURL, { locale = "en", connected = false } = {}) {
  const origin = new URL(baseURL).origin;
  const calls = { starts: 0, disconnects: 0, generations: [], external: [], unexpectedWrites: [], errors: [], lowCredit: false, connected };
  let saved = { profile: { display_name: "Test Candidate", resume_text: source }, jobs: [job], sources: [], packages: [] };
  page.on("pageerror", error => calls.errors.push(error.message));
  await page.addInitScript(language => {
    localStorage.setItem("jobs.wasfai.preferences", JSON.stringify({ version: 2, locale: language, theme: "light" }));
  }, locale);
  await page.context().route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (json, status = 200) => route.fulfill({ status, json });
    if (url.origin === "https://openrouter.ai" && url.pathname === "/auth" && request.method() === "GET") {
      // A local provider simulation gives the test the same explicit consent and cancellation choices.
      return route.fulfill({ contentType: "text/html", body: '<a href="' + origin + '/account?openrouter=connected">Authorize test connection</a><a href="' + origin + '/account?openrouter=cancelled">Cancel test connection</a>' });
    }
    if (url.origin !== origin) {
      calls.external.push(url.origin);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname === "/account" && url.searchParams.get("openrouter") === "connected") calls.connected = true;
      return route.continue();
    }
    switch (url.pathname) {
      case "/api/auth/session": return respond({ authenticated: true, user: { sub: "qa-applicant", name: "Test Candidate" } });
      case "/api/bootstrap": return respond({ profile: {}, jobs: [], sources: [], packages: [] });
      case "/api/sources": return respond({ sources: [] });
      case "/api/resumes": return respond({ file: null });
      case "/api/ai-health": return respond({ ready: true, provider: "deepseek" });
      case "/api/me/state":
        if (request.method() === "PUT") {
          const update = request.postDataJSON().state;
          if (calls.holdPersonalSave && update.aiBillingSource === personal) await calls.holdPersonalSave;
          saved = update;
        }
        return respond({ authenticated: true, state: saved, storage: "postgres-normalized" });
      case "/api/openrouter/status":
        return respond({ connected: calls.connected, connected_at: calls.connected ? "2026-01-01T12:00:00Z" : null });
      case "/api/openrouter/connect":
        expect(request.method()).toBe("POST");
        expect(request.postDataJSON() || {}).toEqual({});
        calls.starts++;
        return respond({ authorization_url: "https://openrouter.ai/auth?code_challenge=qa" });
      case "/api/openrouter/disconnect":
        expect(request.method()).toBe("POST");
        expect(request.postDataJSON() || {}).toEqual({});
        calls.disconnects++;
        calls.connected = false;
        return respond({ connected: false, connected_at: null });
      case "/api/ai-writer-chat":
      case "/api/ghostwriter":
      case "/api/resume-coach": {
        expect(request.method()).toBe("POST");
        const body = request.postDataJSON();
        const usesPersonal = body.billing_source === personal;
        calls.generations.push({ route: url.pathname, payer: body.billing_source, model: body.ai_model });
        if (usesPersonal && calls.lowCredit) return respond({ code: "OPENROUTER_CREDITS_REQUIRED" }, 402);
        const info = usesPersonal
          ? { billing_source: personal, provider: personal, model: "openai/gpt-4.1-mini", inference_provider: "OpenAI", writer_label: "OpenAI" }
          : { billing_source: "jobs", provider: "deepseek", model: "deepseek-flash", writer_label: "DeepSeek" };
        if (url.pathname === "/api/ai-writer-chat") return respond({ ...info, answer: "Describe how you planned the equipment handover." });
        if (url.pathname === "/api/resume-coach") {
          return respond({ ...info, en_master_resume: source, ar_master_resume: arabicResume, improvements: [], search_profile: {} });
        }
        return respond({ ...info, job_id: job.id, en_resume: source, ar_resume: arabicResume, en_cover_letter: "Dear Example Industries hiring team,", ar_cover_letter: "إلى فريق التوظيف", en_interview_prep: [], ar_interview_prep: [], keyword_gaps: [], next_actions: [] });
      }
      default:
        if (request.method() !== "GET") calls.unexpectedWrites.push(url.pathname);
        return respond({ error: "Unexpected route" }, 404);
    }
  });
  return calls;
}

async function openManager(page) {
  const manager = page.locator("details[data-ai-connections]");
  if (await manager.getAttribute("open") === null) await manager.locator(":scope > summary").click();
  return manager;
}

async function assertFits(page, control) {
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const [locale, width] of [["ar", 320], ["en", 390]]) {
  test('mobile user explicitly selects who pays and recovers from low personal credit in ' + locale, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 800 });
    const calls = await workspace(page, baseURL, { locale });
    await page.goto("/account");
    const coach = page.locator(".resume-coach");
    const payer = coach.locator("[data-ai-payer]");
    const disclosure = coach.locator("[data-ai-funding=coach] [data-ai-disclosure]");
    const generate = coach.locator("[data-resume-coach]");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(payer).toHaveValue("jobs");
    await assertFits(page, payer);
    await expect(payer).toHaveAccessibleName(locale === "ar" ? /[\u0600-\u06ff]/ : /[A-Za-z]/);
    await expect(disclosure).toContainText(locale === "ar" ? /وصفاي|Jobs/i : /Jobs/i);
    const manager = await openManager(page);
    await assertFits(page, manager.locator("[data-connect-ai]"));
    await manager.locator("[data-connect-ai]").click();
    await page.getByRole("link", { name: "Authorize test connection" }).click();
    await expect(payer).toHaveValue("jobs");
    expect(calls.starts).toBe(1);
    expect(calls.generations).toHaveLength(0);

    await payer.selectOption(personal);
    const picker = coach.locator("[data-personal-model]");
    await picker.selectOption("deepseek-v4.1-flash");
    await expect(disclosure).toContainText("DeepInfra");
    await picker.selectOption(model);
    await expect(disclosure).toContainText("OpenRouter");
    await expect(disclosure).toContainText("OpenAI");
    await expect(disclosure).toContainText(locale === "ar" ? /رصيدك|حسابك|رصيد حسابك/ : /your.*(?:credit|account)|charged to you/i);
    await assertFits(page, disclosure);
    calls.lowCredit = true;
    await generate.click();
    await expect(page.locator(".banner.err")).toContainText(locale === "ar" ? /رصيد/ : /credit|balance/i);
    await expect(payer).toHaveValue(personal);
    expect(calls.generations).toEqual([{ route: "/api/resume-coach", payer: personal, model }]);

    await page.locator("[data-switch-ai-jobs]").click();
    await expect(payer).toHaveValue("jobs");
    expect(calls.generations).toHaveLength(1);
    await generate.click();
    await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
    expect(calls.generations.map(call => call.payer)).toEqual([personal, "jobs"]);
    expect(calls.unexpectedWrites).toEqual([]);
    expect(calls.external).toEqual([]);
    expect(calls.errors).toEqual([]);
  });
}

test("an account can generate with its selected model, disconnect, and use the Jobs plan again", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { connected: true });
  await page.goto("/jobs/" + job.id + "?tab=resume");
  const payer = page.locator("[data-ai-payer]");
  await payer.selectOption(personal);
  await page.locator("[data-personal-model]").selectOption(model);
  await expect(page.locator("[data-ai-funding=writer] [data-ai-disclosure]")).toContainText("OpenAI");
  await page.locator("[data-ghostwriter]").click();
  await expect(page.locator('[data-kit-document="en_resume"]')).toHaveValue(source);
  await expect(page.locator('[data-kit-document="en_cover_letter"]')).toHaveValue("Dear Example Industries hiring team,");
  await page.locator("[data-interview-question]").fill("Can you help me prepare for my project handover interview?");
  await page.locator("[data-ask-interview]").click();
  await expect(page.locator(".chat-log")).toContainText("Describe how you planned the equipment handover.");
  expect(calls.generations).toEqual([
    { route: "/api/ghostwriter", payer: personal, model },
    { route: "/api/ai-writer-chat", payer: personal, model },
  ]);

  await page.locator('nav:visible [data-nav="/account"]').click();
  const manager = await openManager(page);
  await manager.locator("[data-disconnect-ai]").click();
  expect(calls.disconnects).toBe(0);
  await manager.locator("[data-confirm-disconnect-ai]").click();
  await expect(manager.locator("[data-connect-ai]")).toBeVisible();
  await expect(page.locator(".resume-coach [data-ai-payer]")).toHaveValue(personal);
  await expect(page.locator("[data-resume-coach]")).toBeDisabled();
  await page.locator("[data-switch-ai-jobs]").click();
  await expect(page.locator(".resume-coach [data-ai-payer]")).toHaveValue("jobs");
  expect(calls.disconnects).toBe(1);
  expect(calls.generations).toHaveLength(2);
  await page.locator("[data-resume-coach]").click();
  await expect(page.locator('[data-master-resume="ar"]')).toHaveValue(arabicResume);
  expect(calls.generations.map(call => call.payer)).toEqual([personal, personal, "jobs"]);
  expect(calls.unexpectedWrites).toEqual([]);
  expect(calls.external).toEqual([]);
  expect(calls.errors).toEqual([]);
});

test("cancelling provider consent leaves the Jobs coach usable without connecting or spending", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL);
  await page.goto("/account");
  const manager = await openManager(page);
  await manager.locator("[data-connect-ai]").click();
  await page.getByRole("link", { name: "Cancel test connection" }).click();
  await expect(page.locator(".resume-coach [data-ai-payer]")).toHaveValue("jobs");
  await expect(page.locator("[data-resume-coach]")).toBeEnabled();
  expect(calls.connected).toBe(false);
  expect(calls.generations).toHaveLength(0);
  expect(calls.errors).toEqual([]);
});

test("the applicant can approve, reload, and reopen an OpenRouter-funded bilingual résumé", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { connected: true });
  await page.goto("/account");
  const payer = page.locator(".resume-coach [data-ai-payer]");
  await payer.selectOption(personal);
  await page.locator(".resume-coach [data-personal-model]").selectOption(model);
  await page.locator("[data-resume-coach]").click();
  await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
  await expect(page.locator('[data-master-resume="ar"]')).toHaveValue(arabicResume);
  const savedApproval = page.waitForResponse(response => response.url().endsWith("/api/me/state") &&
    response.request().method() === "PUT" && response.request().postDataJSON().state.approvedMasterResume === true);
  await page.locator("[data-approve-master-resume]").click();
  await savedApproval;
  await page.reload();
  await expect(page.locator("[data-coach-approval]")).toContainText("OpenRouter");
  await expect(page.locator("[data-coach-approval]")).toContainText(/approved/i);
  await expect(payer).toHaveValue(personal);
  await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
  expect(calls.generations).toEqual([{ route: "/api/resume-coach", payer: personal, model }]);
  expect(calls.errors).toEqual([]);
});

test("writing waits for the account to confirm a change of payer", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { connected: true });
  await page.goto("/account");
  // Verify the connection first so the only outstanding dependency is saving the new payer.
  const manager = await openManager(page);
  await expect(manager.locator("[data-disconnect-ai]")).toBeVisible();
  let release;
  calls.holdPersonalSave = new Promise(resolve => { release = resolve; });
  const save = page.waitForRequest(request => request.url().endsWith("/api/me/state") &&
    request.method() === "PUT" && request.postDataJSON().state.aiBillingSource === personal);
  try {
    await page.locator(".resume-coach [data-ai-payer]").selectOption(personal);
    await save;
    await expect(page.locator("[data-resume-coach]")).toBeDisabled();
    expect(calls.generations).toHaveLength(0);
  } finally {
    release();
  }
  await expect(page.locator("[data-resume-coach]")).toBeEnabled();
  await page.reload();
  await expect(page.locator(".resume-coach [data-ai-payer]")).toHaveValue(personal);
  expect(calls.generations).toHaveLength(0);
});
