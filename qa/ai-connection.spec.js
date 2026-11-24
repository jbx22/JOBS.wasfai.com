const { test, expect } = require("@playwright/test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { publicPlans } = require("../functions/api/_subscriptions.js");

test.use({ serviceWorkers: "block" });

const source = readFileSync(join(__dirname, "test-resume.txt"), "utf8");
const arabicResume = "مدير مشاريع صناعية. أشرف على تطوير المصانع وإدارة الميزانيات الرأسمالية والتشغيلية. قاد فرق العمل وتعاون مع المقاولين في مشروعات التصنيع بالمملكة العربية السعودية.";
const job = {
  id: "qa-industrial-role", title: "Industrial project manager", employer: "Example Industries", source: "manual",
  location: "Riyadh", status: "discovered", description: "Manage industrial infrastructure programs and coordinate project handovers between equipment suppliers and the plant operators.",
};
const personal = "openrouter_personal";
const model = "gpt-4.1-mini";

async function workspace(page, baseURL, { locale = "en", connected = false, signedIn = true, remote = {} } = {}) {
  const origin = new URL(baseURL).origin;
  const calls = remote.calls ||= { signedIn, signIns: [], guestPrivateRequests: [], starts: 0, disconnects: 0, generations: [], external: [], unexpectedWrites: [], errors: [], lowCredit: false, connected };
  remote.saved ||= { profile: { display_name: "Test Candidate", resume_text: source }, jobs: [job], sources: [], packages: [] };
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
      return route.fulfill({ contentType: "text/html", body: '<a href="' + origin + '/profile?openrouter=connected">Authorize test connection</a><a href="' + origin + '/profile?openrouter=cancelled">Cancel test connection</a>' });
    }
    if (url.origin !== origin) {
      calls.external.push(url.origin);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) {
      if (url.pathname === "/profile" && url.searchParams.get("openrouter") === "connected") calls.connected = true;
      return route.continue();
    }
    if (!calls.signedIn && (url.pathname === "/api/me/state" || url.pathname.startsWith("/api/openrouter/"))) {
      calls.guestPrivateRequests.push(url.pathname);
      return respond({ code: "AUTH_REQUIRED" }, 401);
    }
    switch (url.pathname) {
      case "/api/auth/session":
        return respond({ authenticated: calls.signedIn, user: calls.signedIn ? { sub: "qa-applicant", name: "Test Candidate", email: "applicant@example.test" } : null });
      case "/api/auth/google/start":
        calls.signIns.push(Object.fromEntries(url.searchParams));
        expect(url.searchParams.get("next")).toBe("/profile");
        calls.signedIn = true;
        return route.fulfill({ status: 302, headers: { location: origin + "/profile" } });
      case "/api/subscriptions":
        expect(request.method()).toBe("GET");
        return respond({ authenticated: calls.signedIn, plans: publicPlans(), current: calls.signedIn ? {
          effective_plan: "gold_monthly", plan: "gold_monthly", status: "active", paid_active: true, current_period_end: "2090-12-30",
        } : null, recent_payments: [] });
      case "/api/bootstrap": return respond({ profile: {}, jobs: [], sources: [], packages: [] });
      case "/api/sources": return respond({ sources: [] });
      case "/api/resumes": return respond({ file: null });
      case "/api/ai-health": return respond({ ready: true, provider: "deepseek" });
      case "/api/me/state":
        if (request.method() === "PUT") {
          const update = request.postDataJSON().state;
          if (calls.holdPersonalSave && update.aiBillingSource === personal) await calls.holdPersonalSave;
          remote.saved = update;
        }
        return respond({ authenticated: true, state: remote.saved, storage: "postgres-normalized" });
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
        if (body.billing_source !== (remote.saved.aiBillingSource || "jobs") ||
            (usesPersonal && body.ai_model !== remote.saved.aiPersonalModel)) {
          return respond({ code: "AI_PREFERENCE_CHANGED" }, 409);
        }
        if (usesPersonal && calls.lowCredit) return respond({ code: "OPENROUTER_CREDITS_REQUIRED" }, 402);
        let info = usesPersonal
          ? { billing_source: personal, provider: personal, model: "openai/gpt-4.1-mini", inference_provider: "OpenAI", writer_label: "OpenAI" }
          : { billing_source: "jobs", provider: "deepseek", model: "deepseek-flash", writer_label: "DeepSeek" };
        if (!usesPersonal && body.ai_model === "glm-5.2") {
          info = { billing_source: "jobs", provider: "openrouter", model: "z-ai/glm-5.2", writer_label: "GLM 5.2" };
        }
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

const payer = page => page.locator("[data-profile-ai] [data-ai-payer]");
const personalModel = page => page.locator("[data-profile-ai] [data-personal-model]");
const manager = page => page.locator("[data-ai-connections]");
const profileNav = page => page.locator('nav:visible [data-nav="/profile"]');

async function choosePersonal(page) {
  await payer(page).selectOption(personal);
  await personalModel(page).selectOption(model);
}

async function inspectDisclosedAction(page, task) {
  const funding = page.locator('[data-ai-funding="' + task + '"]');
  await expect(funding.locator("[data-open-ai-connections]")).toHaveAttribute("href", "/profile");
  await expect(page.locator("[data-ai-payer], [data-personal-model], [data-ai-writer-model], [data-connect-ai], [data-switch-ai-jobs]")).toHaveCount(0);
  return funding.locator("[data-ai-disclosure]");
}

async function assertFits(page, control) {
  await expect(control).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const [locale, width] of [["ar", 320], ["en", 390]]) {
  test("mobile applicant configures AI in Profile and explicitly recovers from low personal credit in " + locale, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 800 });
    const calls = await workspace(page, baseURL, { locale });
    await page.goto("/app");
    const profileLink = profileNav(page);
    await assertFits(page, profileLink);
    await profileLink.click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(profileLink).toHaveAttribute("aria-current", "page");
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expect(page.locator("[data-profile-account]")).toContainText("Test Candidate");
    await expect(page.locator("[data-profile-plan]")).toContainText(locale === "ar" ? /الذهب|ذهبي|Gold/i : /gold/i);
    await expect(payer(page)).toHaveValue("jobs");
    await assertFits(page, payer(page));
    await expect(payer(page)).toHaveAccessibleName(locale === "ar" ? /[\u0600-\u06ff]/ : /[A-Za-z]/);
    await assertFits(page, manager(page).locator("[data-connect-ai]"));
    await manager(page).locator("[data-connect-ai]").click();
    await page.getByRole("link", { name: "Authorize test connection" }).click();
    await expect(page.locator("[data-user-profile]")).toBeVisible();
    await expect(payer(page)).toHaveValue("jobs");
    expect(calls.starts).toBe(1);
    expect(calls.generations).toHaveLength(0);
    await payer(page).selectOption(personal);
    await personalModel(page).selectOption("deepseek-v4.1-flash");
    await expect(personalModel(page).locator("option:checked")).toContainText("DeepInfra");
    await personalModel(page).selectOption(model);
    await page.locator("[data-profile-resume]").click();
    const disclosure = await inspectDisclosedAction(page, "coach");
    await expect(disclosure).toContainText("OpenRouter");
    await expect(disclosure).toContainText("OpenAI");
    await expect(disclosure).toContainText(locale === "ar" ? /رصيدك|حسابك|رصيد حسابك/ : /your.*(?:credit|account)|charged to you/i);
    await assertFits(page, disclosure);
    calls.lowCredit = true;
    const generate = page.locator("[data-resume-coach]");
    await generate.click();
    await expect(page.locator(".banner.err")).toContainText(locale === "ar" ? /رصيد/ : /credit|balance/i);
    await expect(generate).toBeDisabled();
    expect(calls.generations).toEqual([{ route: "/api/resume-coach", payer: personal, model }]);

    await page.locator("[data-ai-funding=coach] [data-open-ai-connections]").click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(payer(page)).toHaveValue(personal);
    await payer(page).selectOption("jobs");
    expect(calls.generations).toHaveLength(1);
    await page.locator("[data-profile-resume]").click();
    await expect(disclosure).toContainText("Jobs");
    await generate.click();
    await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
    expect(calls.generations.map(call => call.payer)).toEqual([personal, "jobs"]);
    expect(calls.unexpectedWrites).toEqual([]);
    expect(calls.external).toEqual([]);
    expect(calls.errors).toEqual([]);
  });
}

test("choosing a model in Profile applies to the résumé, cover letter and interview, and disconnecting pauses them", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { connected: true });
  await page.goto("/jobs/" + job.id + "?tab=resume");
  const disclosure = await inspectDisclosedAction(page, "writer");
  await expect(disclosure).toContainText("Jobs");
  await page.locator("[data-user-menu]").click();
  await page.locator('[data-user-menu-panel] [href="/profile"]').click();
  await expect(page).toHaveURL(/\/profile$/);
  await choosePersonal(page);
  await page.goBack();
  await expect(disclosure).toContainText("OpenAI");
  await page.locator("[data-ghostwriter]").click();
  await expect(page.locator('[data-kit-document="en_resume"]')).toHaveValue(source);
  await expect(page.locator('[data-kit-document="en_cover_letter"]')).toHaveValue("Dear Example Industries hiring team,");
  await expect(await inspectDisclosedAction(page, "interview")).toContainText("OpenAI");
  await page.locator("[data-interview-question]").fill("Can you help me prepare for my project handover interview?");
  await page.locator("[data-ask-interview]").click();
  await expect(page.locator(".chat-log")).toContainText("Describe how you planned the equipment handover.");
  expect(calls.generations).toEqual([
    { route: "/api/ghostwriter", payer: personal, model },
    { route: "/api/ai-writer-chat", payer: personal, model },
  ]);
  await profileNav(page).click();
  await manager(page).locator("[data-disconnect-ai]").click();
  expect(calls.disconnects).toBe(0);
  await manager(page).locator("[data-confirm-disconnect-ai]").click();
  await expect(manager(page).locator("[data-connect-ai]")).toBeVisible();
  await expect(payer(page)).toHaveValue(personal);
  await page.locator("[data-profile-resume]").click();
  await expect(page.locator("[data-resume-coach]")).toBeDisabled();
  await page.locator("[data-ai-funding=coach] [data-open-ai-connections]").click();
  await payer(page).selectOption("jobs");
  expect(calls.disconnects).toBe(1);
  expect(calls.generations).toHaveLength(2);
  await page.locator("[data-profile-resume]").click();
  await page.locator("[data-resume-coach]").click();
  await expect(page.locator('[data-master-resume="ar"]')).toHaveValue(arabicResume);
  expect(calls.generations.map(call => call.payer)).toEqual([personal, personal, "jobs"]);
  expect(calls.unexpectedWrites).toEqual([]);
  expect(calls.external).toEqual([]);
  expect(calls.errors).toEqual([]);
});

test("cancelling provider consent returns to Profile and leaves the Jobs coach usable", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL);
  await page.goto("/profile");
  await manager(page).locator("[data-connect-ai]").click();
  await page.getByRole("link", { name: "Cancel test connection" }).click();
  await expect(payer(page)).toHaveValue("jobs");
  await expect(manager(page).locator("[data-ai-connection-status]")).toContainText("Not connected");
  await expect(manager(page).getByRole("status").filter({ hasText: /Connection was cancelled/i })).toBeVisible();
  await page.locator("[data-profile-resume]").click();
  await expect(page.locator("[data-resume-coach]")).toBeEnabled();
  expect(calls.connected).toBe(false);
  expect(calls.generations).toHaveLength(0);
  expect(calls.errors).toEqual([]);
});

test("a second device reads the saved payer, model and approved bilingual résumé from the same account", async ({ browser, page, baseURL }) => {
  const remote = {};
  const calls = await workspace(page, baseURL, { connected: true, remote });
  await page.goto("/profile");
  await choosePersonal(page);
  await page.locator("[data-profile-resume]").click();
  await page.locator("[data-resume-coach]").click();
  await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
  await expect(page.locator('[data-master-resume="ar"]')).toHaveValue(arabicResume);
  const savedApproval = page.waitForResponse(response => response.url().endsWith("/api/me/state") &&
    response.request().method() === "PUT" && response.request().postDataJSON().state.approvedMasterResume === true);
  await page.locator("[data-approve-master-resume]").click();
  await savedApproval;

  const second = await browser.newContext({ baseURL, viewport: { width: 320, height: 740 }, serviceWorkers: "block" });
  try {
    const mobile = await second.newPage();
    await workspace(mobile, baseURL, { locale: "ar", remote });
    await mobile.goto("/profile");
    await expect(payer(mobile)).toHaveValue(personal);
    await expect(personalModel(mobile)).toHaveValue(model);
    await expect(manager(mobile).locator("[data-disconnect-ai]")).toBeVisible();
    await mobile.locator("[data-profile-resume]").click();
    await expect(mobile.locator("[data-coach-approval]")).toContainText("OpenRouter");
    await expect(mobile.locator("[data-coach-approval]")).toContainText("معتمدة");
    await expect(mobile.locator('[data-master-resume="en"]')).toHaveValue(source);
    await expect(await inspectDisclosedAction(mobile, "coach")).toContainText("OpenAI");
  } finally {
    await second.close();
  }
  expect(calls.generations).toEqual([{ route: "/api/resume-coach", payer: personal, model }]);
  expect(calls.errors).toEqual([]);
});

test("writing waits for the account to confirm a change of payer", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { connected: true });
  await page.goto("/profile");
  await expect(manager(page).locator("[data-disconnect-ai]")).toBeVisible();
  let release;
  calls.holdPersonalSave = new Promise(resolve => { release = resolve; });
  const save = page.waitForRequest(request => request.url().endsWith("/api/me/state") &&
    request.method() === "PUT" && request.postDataJSON().state.aiBillingSource === personal);
  try {
    await payer(page).selectOption(personal);
    await save;
    await page.locator("[data-profile-resume]").click();
    await expect(page.locator("[data-resume-coach]")).toBeDisabled();
    expect(calls.generations).toHaveLength(0);
  } finally {
    release();
  }
  await expect(page.locator("[data-resume-coach]")).toBeEnabled();
  await page.reload();
  await expect(await inspectDisclosedAction(page, "coach")).toContainText("OpenRouter");
  expect(calls.generations).toHaveLength(0);
});

test("a guest signs in with consent and returns to the private Profile", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { signedIn: false });
  await page.goto("/app");
  await page.locator("[data-user-menu]").click();
  await expect(page.locator('[data-user-menu-panel] a[href^="/login"]')).toHaveAttribute("href", "/login?next=%2Fprofile");
  await page.keyboard.press("Escape");
  await profileNav(page).click();
  const login = page.locator("[data-profile-signin]");
  await expect(login).toHaveAttribute("href", "/login?next=%2Fprofile");
  await expect(payer(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("applicant@example.test");
  await login.click();
  await expect(page.locator("[data-google-login]")).toHaveAttribute("aria-disabled", "true");
  await page.locator("[data-terms-consent]").check();
  await page.locator("[data-google-login]").click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator("[data-profile-account]")).toContainText("applicant@example.test");
  await expect(payer(page)).toHaveValue("jobs");
  expect(calls.signIns).toEqual([{ terms: "1", next: "/profile" }]);
  expect(calls.guestPrivateRequests).toEqual([]);
  expect(calls.starts).toBe(0);
  expect(calls.generations).toHaveLength(0);
});

test("the Jobs-funded profile model applies to job-specific writing while the full résumé coach keeps DeepSeek", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL);
  await page.goto("/profile");
  await expect(payer(page)).toHaveValue("jobs");
  await page.locator("[data-profile-ai] [data-ai-writer-model]").selectOption("glm-5.2");
  await page.locator("[data-profile-resume]").click();
  await expect(await inspectDisclosedAction(page, "coach")).toContainText("DeepSeek");
  await page.locator("[data-resume-coach]").click();
  await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
  await page.goto("/jobs/" + job.id + "?tab=resume");
  await expect(await inspectDisclosedAction(page, "writer")).toContainText(/GLM 5\.2/i);
  await page.locator("[data-ghostwriter]").click();
  await expect(page.locator('[data-kit-document="en_resume"]')).toHaveValue(source);
  expect(calls.generations).toEqual([
    { route: "/api/resume-coach", payer: "jobs", model: "deepseek" },
    { route: "/api/ghostwriter", payer: "jobs", model: "glm-5.2" },
  ]);
  expect(calls.starts).toBe(0);
  expect(calls.external).toEqual([]);
});

test("a stale device refreshes the saved payer in Profile before writing again", async ({ page, baseURL }) => {
  const remote = {};
  const calls = await workspace(page, baseURL, { connected: true, remote });
  await page.goto("/account");
  const disclosure = await inspectDisclosedAction(page, "coach");
  await expect(disclosure).toContainText("Jobs");

  // Model an account setting already changed by its owner on a second device.
  remote.saved.aiBillingSource = personal;
  remote.saved.aiPersonalModel = model;
  const generate = page.locator("[data-resume-coach]");
  await generate.click();
  await expect(generate).toBeDisabled();
  await expect(page.locator("[data-ai-funding=coach]")).toContainText(/settings changed|refresh/i);
  expect(calls.generations).toHaveLength(1);
  await page.locator("[data-ai-funding=coach] [data-open-ai-connections]").click();
  await page.locator("[data-reload-ai-settings]").click();
  await expect(payer(page)).toHaveValue(personal);
  await expect(personalModel(page)).toHaveValue(model);
  expect(calls.generations).toHaveLength(1);
  await page.locator("[data-profile-resume]").click();
  await expect(disclosure).toContainText("OpenAI");
  await generate.click();
  await expect(page.locator('[data-master-resume="en"]')).toHaveValue(source);
  expect(calls.generations.map(call => call.payer)).toEqual(["jobs", personal]);
  expect(calls.external).toEqual([]);
});

test("an older OpenRouter return link opens the current Profile without spending", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL);
  await page.goto("/account?openrouter=cancelled");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(manager(page).getByRole("status").filter({ hasText: /Connection was cancelled/i })).toBeVisible();
  await expect(payer(page)).toHaveValue("jobs");
  expect(calls.generations).toHaveLength(0);
});

test("a signed-out applicant with an expired legacy return link can sign back into Profile", async ({ page, baseURL }) => {
  const calls = await workspace(page, baseURL, { signedIn: false });
  await page.goto("/account?openrouter=expired");
  await expect(page).toHaveURL(/\/profile$/);
  const login = page.locator("[data-profile-signin]");
  await expect(login).toHaveAttribute("href", "/login?next=%2Fprofile");
  await login.click();
  await page.locator("[data-terms-consent]").check();
  await page.locator("[data-google-login]").click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(payer(page)).toHaveValue("jobs");
  expect(calls.signIns).toEqual([{ terms: "1", next: "/profile" }]);
  expect(calls.guestPrivateRequests).toEqual([]);
  expect(calls.generations).toHaveLength(0);
});
