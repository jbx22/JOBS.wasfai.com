const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "block" });

const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const closingProject = "Final appendix — Optical inspection of legacy instrumentation panels.";
const source = [
  "Sam Example | Instrumentation Engineer",
  "Training and experience in industrial inspection, equipment commissioning and reliability analysis.",
  ...Array.from({ length: 36 }, (_, i) => [
    `Project ${i + 1}: Managed a scheduled instrument calibration and inspection assignment for a synthetic manufacturing site.`,
    "Reviewed the equipment register with maintenance technicians, verified measurement tolerances and recorded the observations against the original commissioning specifications.",
    "Issued the signed acceptance records after resolving discrepancies and trained incoming engineers on the equipment handover sequence.",
  ].join("\n")),
  closingProject,
].join("\n");
const job = {
  id: "synthetic-controls", title: "Instrumentation Reliability Engineer", employer: "Example Instruments",
  source: "manual", location: "Riyadh", status: "discovered", score: 80,
  description: "Investigate sensor faults, reconcile instrumentation registers and train technicians in maintenance handover procedures.",
};
const master = {
  provider: "deepseek", model: "deepseek-flash", en_master_resume: source,
  ar_master_resume: "مهندس أجهزة قياس\nالخبرة المهنية\nأشرف على مهام المعايرة والتفتيش، وراجع سجل المعدات، ودرب المهندسين على تسليم الأجهزة.\nالمشروعات\nالفحص البصري للوحات أجهزة القياس القديمة.",
  improvements: [], search_profile: { target_titles: [job.title], keywords: ["instrumentation"], locations: ["Riyadh"] },
};
const kit = {
  provider: "deepseek", model: "deepseek-flash", writer_label: "DeepSeek", job_id: job.id,
  ar_resume: master.ar_master_resume, en_resume: job.title + "\n" + source,
  ar_cover_letter: "إلى فريق التوظيف", en_cover_letter: "Dear Example Instruments hiring team,",
  ar_interview_prep: [], en_interview_prep: [], keyword_gaps: [], next_actions: [],
  quality_review: { approved: false, requirements: [], factual_risks: [], missing_evidence: [], ats_checks: [] },
};

async function mockWorkspace(page, authenticated) {
  const { buildDocx } = await import("../public/resume-docx.mjs");
  const file = { name: "synthetic-engineering.docx", mimeType: docxType, buffer: Buffer.from(buildDocx(source)) };
  const metadata = { id: "synthetic-file", name: file.name, content_type: docxType, download_url: "/api/resumes/synthetic-file" };
  const trace = { uploads: 0, downloads: 0, coach: [], tailoring: [], stored: {}, unexpected: [], errors: [] };
  page.on("pageerror", error => trace.errors.push(error.message));
  await page.route("**/*", async route => {
    const req = route.request();
    const { hostname, pathname } = new URL(req.url());
    if (!["localhost", "127.0.0.1"].includes(hostname)) return route.abort();
    if (!pathname.startsWith("/api/")) return route.continue();
    const fulfill = (json, status = 200) => route.fulfill({ status, json });
    switch (pathname) {
      case "/api/bootstrap": return fulfill({ profile: { display_name: "Sam Example", resume_text: "" }, jobs: [job], sources: [] });
      case "/api/auth/session": return fulfill({ authenticated, user: authenticated ? { sub: "synthetic-user", name: "Sam Example", email: "sam@example.invalid" } : null });
      case "/api/ai-health": return fulfill({ ready: true, provider: "deepseek" });
      case "/api/jobs/match": return fulfill({ ok: true, jobs: [], total: 0, next_offset: null, as_of: new Date().toISOString() });
      case "/api/sources": return fulfill({ sources: [] });
      case "/api/me/state":
        if (req.method() === "PUT") trace.stored = req.postDataJSON().state;
        return fulfill({ authenticated, state: trace.stored, storage: "postgres-normalized" });
      case "/api/resumes":
        if (req.method() === "POST") {
          trace.uploads++;
          expect(req.postDataBuffer().includes(file.buffer)).toBe(true);
        }
        return fulfill({ file: trace.uploads ? metadata : null });
      case "/api/resumes/synthetic-file":
        trace.downloads++;
        return route.fulfill({ body: file.buffer, contentType: docxType });
      case "/api/resume-coach":
        trace.coach.push(req.postDataJSON());
        return trace.coach.length === 1 ? fulfill({ code: "AI_BUSY" }, 503) : fulfill(master);
      case "/api/ghostwriter":
        trace.tailoring.push(req.postDataJSON());
        return fulfill(kit);
      default:
        trace.unexpected.push(pathname);
        return fulfill({ error: "Unexpected API route" }, 404);
    }
  });
  return { file, trace };
}

test("signed-in applicant uploads, tailors, retries the coach and recovers a saved full résumé", async ({ page }) => {
  const { file, trace } = await mockWorkspace(page, true);
  await page.goto("/account");
  const original = page.locator("[data-original-resume]");
  const upload = page.locator('[data-resume-kind="pdf"]');
  await upload.setInputFiles(file);
  await expect(original).toHaveValue(source);
  expect(trace.uploads).toBe(1);

  // Tailoring must work immediately, before either kind of master approval.
  await page.locator("#coach-target-job").selectOption(job.id);
  await page.locator("[data-coach-target] button[type=submit]").click();
  await expect(page).toHaveURL(new RegExp("/jobs/" + job.id + "$"));
  const document = page.locator('[data-kit-document="en_resume"]');
  await expect(document).toHaveValue(kit.en_resume);
  expect(trace.tailoring).toHaveLength(1);
  expect(trace.tailoring[0]).toMatchObject({ ai_model: "deepseek", job, profile: { resume_text: source } });
  await expect.poll(() => trace.stored.ghostwriter?.[job.id]?.en_resume).toBe(kit.en_resume);

  await page.goto("/account");
  await page.locator("[data-approve-uploaded-resume]").click();
  await expect(page).toHaveURL(/\/jobs\?view=matches$/);
  await expect(page.getByRole("status").filter({ hasText: /لا توجد شواغر موثقة|No verified vacancies/ })).toBeVisible();
  await expect.poll(() => trace.stored.approvedMasterResume).toBe(true);
  expect(trace.stored.masterResume.en).toBe("");
  expect(trace.stored.masterResume.source).toBe("original");
  expect(trace.stored.masterResume.ar).toBe("");
  await page.goto("/account");
  const approval = page.locator("[data-coach-approval]");
  await expect(approval).toHaveText("السيرة الأصلية معتمدة للمطابقة");
  await upload.setInputFiles({ name: "damaged.docx", mimeType: docxType, buffer: Buffer.from("invalid Word archive") });
  await expect(page.locator(".banner.err")).toContainText("Word");
  await expect(original).toHaveValue(source);
  await expect(approval).toHaveText("السيرة الأصلية معتمدة للمطابقة");
  expect(trace.uploads).toBe(1);
  await page.locator("[data-reextract-resume]").click();
  await expect(page.locator(".banner.ok")).toContainText("تم استخراج نص السيرة");
  await expect(original).toHaveValue(source);
  await expect(approval).toHaveText("السيرة الأصلية معتمدة للمطابقة");
  expect(trace.downloads).toBe(1);
  expect(trace.uploads).toBe(1);

  const coach = page.locator("[data-resume-coach]");
  await coach.click();
  await expect(page.locator(".banner.err")).toContainText("مشغول");
  await expect(coach).toBeEnabled();
  await expect(original).toHaveValue(source);
  await coach.click();
  await expect(page.locator('[data-master-resume="en"]')).toHaveValue(master.en_master_resume);
  await expect(page.locator('[data-master-resume="ar"]')).toHaveValue(master.ar_master_resume);
  expect(trace.coach).toHaveLength(2);
  for (const body of trace.coach) expect(body.profile.resume_text).toBe(source);
  await page.locator("[data-approve-master-resume]").click();
  await expect.poll(() => trace.stored.masterResume?.en).toBe(master.en_master_resume);
  await expect(page.locator("[data-coach-approval]")).toHaveText("نسخة DeepSeek معتمدة");
  expect(trace.stored.approvedMasterResume).toBe(true);
  expect(trace.errors).toEqual([]);
  expect(trace.unexpected).toEqual([]);
});

test("guest can extract the original locally and both AI actions require a signed-in account", async ({ page }) => {
  const { file, trace } = await mockWorkspace(page, false);
  await page.goto("/account");
  await page.locator('[data-resume-kind="pdf"]').setInputFiles(file);
  await expect(page.locator("[data-original-resume]")).toHaveValue(source);
  await expect(page.locator("[data-resume-coach]")).toBeDisabled();
  await expect(page.locator("[data-coach-target] button[type=submit]")).toBeDisabled();
  expect(trace.uploads).toBe(0);
  expect(trace.coach).toHaveLength(0);
  expect(trace.tailoring).toHaveLength(0);
  expect(trace.errors).toEqual([]);
});

test("a signed-in account opens only its own profile and recovers damaged legacy text without granting AI approval", async ({ page }) => {
  const { trace } = await mockWorkspace(page, true);
  const corrupted = "cid:351 � � @   ".repeat(42) + "inbox@example.invalid";
  const prior = "Previous unrelated account résumé";
  await page.addInitScript(({ prior }) => {
    localStorage.setItem("jobs.wasfai.profile", JSON.stringify({ display_name: prior, resume_text: prior }));
    localStorage.setItem("jobs.wasfai.aiWriter", JSON.stringify({ resumeCoach: { provider: "deepseek", ar_master_resume: prior, en_master_resume: prior } }));
    sessionStorage.setItem("jobs.guest.v2.profile", JSON.stringify({ display_name: prior, resume_text: prior }));
  }, { prior });
  trace.stored = {
    profile: { display_name: "Synthetic Applicant", resume_text: corrupted, resume_languages: "inbox@example.invalid" },
    approvedMasterResume: true, masterResume: { ar: "", en: "" },
  };
  await page.route("**/api/resumes", route => route.fulfill({ json: { file: {
    id: "synthetic-file", name: "test.docx", content_type: docxType, download_url: "/api/resumes/synthetic-file",
  } } }));
  await page.goto("/account");
  await expect(page.locator("[data-source-recovery]")).toBeVisible();
  await expect(page.locator("[data-profile-field=resume_languages]")).toHaveValue("");
  await expect(page.locator("[data-original-resume]")).toHaveValue(corrupted);
  await expect(page.locator("[data-coach-approval]")).toContainText("إعادة استخراج");
  await expect(page.locator("[data-resume-coach]")).toBeDisabled();
  await expect(page.locator("[data-approve-uploaded-resume]")).toBeDisabled();
  await expect(page.locator("[data-coach-draft]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(prior);

  await page.locator("[data-reextract-resume]").click();
  await expect(page.locator("[data-original-resume]")).toHaveValue(source);
  await expect(page.locator("[data-source-recovery]")).toBeHidden();
  await expect(page.locator("[data-coach-approval]")).toHaveText("لم تُنشأ نسخة محسّنة");
  await expect(page.locator("[data-resume-coach]")).toBeEnabled();
  await expect.poll(() => trace.stored.approvedMasterResume).toBe(false);
  expect(trace.coach).toHaveLength(0);
  expect(trace.uploads).toBe(0);
  const privateCache = await page.evaluate(() => [localStorage.getItem("jobs.wasfai.profile"), sessionStorage.getItem("jobs.guest.v2.profile")]);
  expect(privateCache.every(value => !value.includes("instrument calibration"))).toBe(true);
});

test("unavailable account storage never falls back to another account or saves an empty workspace", async ({ page }) => {
  await mockWorkspace(page, true);
  let writes = 0;
  await page.route("**/api/me/state", route => {
    if (route.request().method() === "PUT") writes++;
    return route.fulfill({ status: 503, json: { error: "Workspace unavailable" } });
  });
  await page.addInitScript(() => {
    const profile = JSON.stringify({ display_name: "Unrelated User", resume_text: "Private source from another session" });
    localStorage.setItem("jobs.wasfai.profile", profile);
    sessionStorage.setItem("jobs.guest.v2.profile", profile);
  });
  await page.goto("/account");
  await expect(page.locator("[data-original-resume]")).toHaveValue("");
  await expect(page.locator(".banner.err")).toContainText("تحميل بيانات");
  await page.locator("[data-search-preferences] > summary").click();
  await page.locator("[data-save-profile]").click();
  await expect(page.locator(".banner.err")).toContainText("قبل الحفظ");
  expect(writes).toBe(0);
});

test("mobile applicant pastes the original, reviews extracted preferences and revises an approved source", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.addInitScript(() => localStorage.setItem("jobs.wasfai.preferences", JSON.stringify({ version: 2, locale: "en" })));
  const { trace } = await mockWorkspace(page, true);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "My résumé", exact: true })).toBeVisible();
  const sourceEditor = page.getByLabel("Full résumé text");
  await expect(sourceEditor).toBeHidden();
  const paste = page.getByText("Paste or review the original text", { exact: true });
  await paste.focus();
  await page.keyboard.press("Enter");
  await expect(sourceEditor).toBeFocused();
  await sourceEditor.fill(source);
  await expect(page.locator("[data-resume-coach]")).toBeEnabled();
  const preferences = page.locator("[data-search-preferences] > summary");
  await preferences.click();
  await page.getByRole("button", { name: "Extract profile details" }).click();
  await expect(page.getByLabel("Target job titles")).toBeFocused();
  await page.getByLabel("Target job titles").fill("Reliability engineer");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect.poll(() => trace.stored.profile?.target_roles).toBe("Reliability engineer");
  await page.getByRole("button", { name: "Use my original résumé and find matches" }).click();
  await expect(page).toHaveURL(/\/jobs\?view=matches$/);
  await expect.poll(() => trace.stored.approvedMasterResume).toBe(true);
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "View matching jobs" })).toBeVisible();
  await paste.click();
  await sourceEditor.fill("?");
  await expect(page.locator("[data-source-recovery]")).toBeVisible();
  await expect(page.getByRole("button", { name: "View matching jobs" })).toBeHidden();
  await expect(page.locator("[data-approve-uploaded-resume]")).toBeDisabled();
  await expect(page.locator("[data-resume-coach]")).toBeDisabled();
  expect(trace.errors).toEqual([]);
});
