const { test, expect } = require("@playwright/test");
const fs = require("fs");

test("mobile prototype supports search, detail, Gmail routing, and draft generation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/app");
  await expect(page.locator("body")).toContainText("مركز البحث");

  await page.locator("[data-search]").fill("الرياض");
  await expect(page.locator('[data-job="job-2"]')).toBeVisible();

  await page.locator('[data-job="job-2"]').click();
  await expect(page).toHaveURL(/\/jobs\/job-2$/);
  await expect(page.locator("body")).toContainText("مهندس برمجيات Rust");
  await expect(page.locator('[data-application-checklist="job-2"]')).toBeVisible();
  await expect(page.locator('[data-application-checklist="job-2"]')).toContainText("Gmail");
  await page.locator("[data-status-action]").click();
  await expect(page.locator("body")).toContainText("تم نقل الوظيفة إلى قيد المتابعة");
  await expect(page.locator('[data-timeline-category="حالة"]').first()).toBeVisible();
  await page.reload();
  await expect(page.locator("body")).toContainText("قيد المتابعة");
  await expect(page.locator("body")).toContainText("تم نقل الوظيفة إلى قيد المتابعة");
  await expect(page.locator('[data-timeline-category="حالة"]').first()).toBeVisible();

  await page.locator('.bottom-nav [data-nav="/analytics"]').click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.locator('[data-activity-feed]')).toContainText("مهندس برمجيات Rust");
  await expect(page.locator('[data-activity-feed]')).toContainText("حالة");
  await page.locator('[data-activity-filter="حالة"]').click();
  await expect(page.locator('[data-activity-filter="حالة"]')).toHaveClass(/active/);
  await expect(page.locator('[data-activity-feed]')).toContainText("حالة");
  await page.locator('[data-activity-filter="all"]').click();
  await expect(page.locator('[data-activity-filter="all"]')).toHaveClass(/active/);
  await expect(page.locator('[data-activity-feed]')).toContainText("مهندس برمجيات Rust");
  await page.locator('[data-link-message="msg-1"]').click();
  await expect(page).toHaveURL(/\/jobs\/job-2$/);
  await expect(page.locator("body")).toContainText("تم ربط رسالة");

  await page.locator('.bottom-nav [data-nav="/assistant"]').click();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.locator('[data-composer="job-2"]').fill("مسودة متابعة محفوظة من اختبار الجوال");
  await page.locator("[data-generate]").click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await page.reload();
  await expect(page.locator('[data-composer="job-2"]')).toHaveValue("مسودة متابعة محفوظة من اختبار الجوال");
  await page.goto("http://127.0.0.1:3030/jobs/job-2");
  await expect(page.locator("body")).toContainText("تم حفظ مسودة المساعد");
  await expect(page.locator('[data-timeline-category="مساعد"]').first()).toBeVisible();
  await expect(page.locator("body")).toContainText("الآن");

  await page.locator('.bottom-nav [data-nav="/documents"]').click();
  await expect(page).toHaveURL(/\/documents$/);
  await page.locator('[data-save-package="job-2"]').click();
  await page.reload();
  await expect(page.locator("body")).toContainText("PDF محفوظ");
  await page.goto("http://127.0.0.1:3030/jobs/job-2");
  await expect(page.locator("body")).toContainText("تم حفظ حزمة التقديم");
  await expect(page.locator('[data-timeline-category="مستندات"]').first()).toBeVisible();
  await page.locator('.bottom-nav [data-nav="/settings/sources"]').click();
  await expect(page).toHaveURL(/\/settings\/sources$/);
  await page.locator('[data-import-field="url"]').fill("https://wuzzuf.net/jobs/p/rust-backend-engineer-riyadh");
  await page.locator('[data-import-field="title"]').fill("Imported Rust Engineer");
  await page.locator('[data-import-field="employer"]').fill("Test Company");
  await page.locator('[data-import-field="location"]').fill("Riyadh, Saudi Arabia");
  await page.locator('[data-import-field="description"]').fill("Build Rust APIs for a MENA product team.");
  await page.locator("[data-import-job]").click();
  await expect(page.locator("[data-import-review]")).toContainText("Imported Rust Engineer");
  await expect(page.locator("[data-import-review]")).toContainText("Rust");
  await expect(page.locator("[data-import-review]")).toContainText("Riyadh");
  await expect(page.locator("[data-extraction-quality]")).toContainText("manual input");
  await page.locator("[data-confirm-import]").click();
  await expect(page).toHaveURL(/\/jobs\/manual-/);
  await expect(page.locator("body")).toContainText("Imported Rust Engineer");
  await expect(page.locator("body")).toContainText("WUZZUF");
  await expect(page.locator("[data-fit-explanation]")).toContainText("Rust");
  await expect(page.locator("body")).toContainText("manual input");
  await expect
    .poll(async () => Number((await page.locator(".score-ring").first().innerText()).replace("%", "")))
    .toBeGreaterThan(72);
  await page.reload();
  await expect(page.locator("body")).toContainText("Imported Rust Engineer");
  await expect(page.locator("body")).toContainText("manual input");
  await page.locator("[data-edit-job]").click();
  await page.locator('[data-edit-field="title"]').fill("Edited Rust Platform Engineer");
  await page.locator('[data-edit-field="employer"]').fill("Edited Test Company");
  await page.locator('[data-edit-field="location"]').fill("Jeddah, Saudi Arabia");
  await page.locator('[data-edit-field="description"]').fill("Edited role description for CRUD verification.");
  await page.locator("[data-save-job]").click();
  await expect(page.locator("body")).toContainText("Edited Rust Platform Engineer");
  await page.reload();
  await expect(page.locator("body")).toContainText("Edited Rust Platform Engineer");
  await page.locator("[data-delete-job]").click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator("body")).not.toContainText("Edited Rust Platform Engineer");
});

test("sources screen shows import loading and error feedback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/settings/sources");

  await page.locator('[data-import-field="url"]').fill("https://example.com/");
  await page.locator('[data-import-field="employer"]').fill("Test Company");
  await page.locator('[data-import-field="location"]').fill("Riyadh, Saudi Arabia");
  await page.locator('[data-import-field="description"]').fill("Missing title should show feedback.");
  await page.locator("[data-import-job]").click();
  await expect(page.locator("[data-action-error]")).toContainText("تعذر");

  await page.route("**/api/jobs/import/preview", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.locator('[data-import-field="title"]').fill("Loading Feedback Engineer");
  await page.locator("[data-import-job]").click();
  await expect(page.locator("[data-action-status]")).toContainText("جاري");
  await expect(page.locator("[data-import-review]")).toContainText("Loading Feedback Engineer");
  await page.locator("[data-confirm-import]").click();
  await expect(page).toHaveURL(/\/jobs\/manual-/);
});

test("sources screen imports a job from a MENA URL with extracted fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/settings/sources");

  await page
    .locator('[data-import-field="url"]')
    .fill("https://www.bayt.com/en/saudi-arabia/jobs/senior-rust-engineer-riyadh-12345/");
  await page.locator("[data-import-job]").click();

  await expect(page).toHaveURL(/\/settings\/sources$/);
  await expect(page.locator("[data-import-review]")).toContainText("Senior Rust Engineer");
  await expect(page.locator("[data-import-review]")).toContainText("Bayt");
  await expect(page.locator("[data-extraction-quality]")).toContainText("URL slug");
  await page.locator("[data-confirm-import]").click();

  await expect(page).toHaveURL(/\/jobs\/manual-/);
  await expect(page.locator("body")).toContainText("Senior Rust Engineer");
  await expect(page.locator("body")).toContainText("Bayt");
  await expect(page.locator("body")).toContainText("URL slug");
  await page.reload();
  await expect(page.locator("body")).toContainText("Senior Rust Engineer");
  await expect(page.locator("body")).toContainText("URL slug");
});

test("sources screen applies source import presets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/settings/sources");

  await page.locator('[data-source-preset="bayt"]').click();

  await expect(page.locator('[data-import-field="url"]')).toHaveValue("https://www.bayt.com/en/jobs/");
  await expect(page.locator("[data-import-preset-note]")).toContainText("Bayt");
});

test("sources screen exposes live connector capabilities and scheduled scans", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/settings/sources");

  const wuzzuf = page.locator(".source-card").filter({ hasText: "WUZZUF" });
  await expect(wuzzuf.locator('[data-live-scan-source="wazzuf"]')).toBeVisible();
  const scheduleToggle = wuzzuf.locator('[data-source-schedule="wazzuf"]');
  if (await scheduleToggle.isChecked()) {
    await scheduleToggle.uncheck();
  }
  await scheduleToggle.check();
  await expect(page.locator("[data-action-message]")).toContainText("تم");

  const linkedin = page.locator(".source-card").filter({ hasText: "LinkedIn" });
  await expect(linkedin).toContainText("API");
  await expect(linkedin.locator('[data-live-scan-source="linkedin"]')).toHaveCount(0);
});

test("users can add a job board, scan multiple jobs, and monitor them together", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/settings/sources");

  const sourceLabel = `Remote Board ${Date.now()}`;
  await page.locator('[data-source-form-field="label"]').fill(sourceLabel);
  await page.locator('[data-source-form-field="url"]').fill("https://example.com/jobs");
  await page.locator('[data-source-form-field="region"]').fill("Remote");
  await page.locator("[data-add-source]").click();

  const sourceCard = page.locator(".source-card").filter({ hasText: sourceLabel });
  await expect(sourceCard).toBeVisible();
  await sourceCard.locator("[data-scan-source]").click();
  await expect(sourceCard).toContainText("وظائف مرتبطة");
  await expect(page.locator("[data-action-message]")).toContainText("تم");

  await page.goto("http://127.0.0.1:3030/app");
  await expect.poll(async () => page.locator(".job-card").count()).toBeGreaterThanOrEqual(8);
  await page.locator("[data-select-job]").nth(0).check();
  await page.locator("[data-select-job]").nth(1).check();
  await expect(page.locator(".bulk-toolbar")).toContainText("2");
  await page.locator('[data-bulk-status="in_progress"]').click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(page.locator("[data-select-job]:checked")).toHaveCount(0);
});

test("sources screen imports a pasted job post with extracted fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/settings/sources");

  await page.locator('[data-import-field="description"]').fill(`Title: Senior Rust Backend Engineer
Company: Noon
Location: Riyadh, Saudi Arabia

Description:
Build Rust APIs for a MENA marketplace platform and collaborate with product teams.`);
  await page.locator("[data-import-job]").click();

  await expect(page).toHaveURL(/\/settings\/sources$/);
  await expect(page.locator("[data-import-review]")).toContainText("Senior Rust Backend Engineer");
  await expect(page.locator("[data-import-review]")).toContainText("Noon");
  await expect(page.locator("[data-extraction-quality]")).toContainText("pasted labels");
  await page.locator("[data-confirm-import]").click();

  await expect(page).toHaveURL(/\/jobs\/manual-/);
  await expect(page.locator("body")).toContainText("Senior Rust Backend Engineer");
  await expect(page.locator("body")).toContainText("Noon");
  await expect(page.locator("body")).toContainText("pasted labels");
  await page.reload();
  await expect(page.locator("body")).toContainText("Senior Rust Backend Engineer");
  await expect(page.locator("body")).toContainText("pasted labels");
});

test("onboarding profile saves and reloads", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/login");

  await page.locator("[data-resume-text]").fill(`Name: Jaber Product Builder
Role: Rust backend, Product operations
Location: Riyadh, Dubai, Cairo
Skills: Rust, SQL, dashboards
Languages: Arabic, English
Seniority: Senior
Regions: Saudi Arabia, UAE
Examples: Built Arabic job-search workflows and analytics dashboards.`);
  await page.locator("[data-preview-resume]").click();
  await expect(page.locator("[data-resume-preview]")).toContainText("Rust, SQL, dashboards");
  await page.locator("[data-apply-resume-preview]").click();

  await page.locator('[data-profile-field="display_name"]').fill("Jaber Product Builder");
  await page.locator('[data-profile-field="target_roles"]').fill("Rust backend, Product operations");
  await page.locator('[data-profile-field="target_locations"]').fill("Riyadh, Dubai, Cairo");
  await page.locator('[data-profile-field="resume_filename"]').fill("jaber-rust-cv.pdf");
  await page.locator('[data-profile-field="resume_skills"]').fill("Rust, SQL, dashboards");
  await page.locator('[data-profile-field="resume_languages"]').fill("Arabic, English");
  await page.locator('[data-profile-field="resume_seniority"]').fill("Senior");
  await page.locator('[data-profile-field="resume_regions"]').fill("Saudi Arabia, UAE");
  await page
    .locator('[data-profile-field="resume_work_examples"]')
    .fill("Built Arabic job-search workflows and analytics dashboards.");
  await page.locator('[data-save-profile]').click();

  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(page.locator("[data-profile-summary]")).toContainText("Jaber Product Builder");
  await expect(page.locator("[data-profile-summary]")).toContainText("Rust, SQL, dashboards");
  await page.reload();
  await expect(page.locator('[data-profile-field="display_name"]')).toHaveValue("Jaber Product Builder");
  await expect(page.locator('[data-profile-field="resume_filename"]')).toHaveValue("jaber-rust-cv.pdf");
  await expect(page.locator('[data-profile-field="resume_skills"]')).toHaveValue("Rust, SQL, dashboards");
  await expect(page.locator('[data-profile-field="resume_languages"]')).toHaveValue("Arabic, English");

  await page.goto("http://127.0.0.1:3030/settings/sources");
  await page.locator('[data-import-field="url"]').fill("https://wuzzuf.net/jobs/p/rust-backend-engineer-riyadh");
  await page.locator('[data-import-field="title"]').fill("Rust Backend Engineer");
  await page.locator('[data-import-field="employer"]').fill("Profile Match Company");
  await page.locator('[data-import-field="location"]').fill("Riyadh, Saudi Arabia");
  await page.locator('[data-import-field="description"]').fill("Build Rust backend APIs for product operations.");
  await page.locator("[data-import-job]").click();
  await expect(page.locator("[data-import-review]")).toContainText("resume signals");
  await expect(page.locator("[data-import-review]")).toContainText("Rust");
});

test("documents screen saves editable package draft bodies", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/documents");
  const firstPackageBody = `Editable resume body saved from Playwright ${Date.now()}`;
  const secondPackageBody = `Second package history version from Playwright ${Date.now()}`;

  await expect(page.locator("[data-docs-summary]")).toContainText("حزم جاهزة");

  await page
    .locator('[data-package-field="resume_body"][data-job-id="job-2"]')
    .fill(firstPackageBody);
  await page
    .locator('[data-package-field="cover_letter_body"][data-job-id="job-2"]')
    .fill("Editable cover letter body saved from Playwright");
  await page.locator('[data-save-package-draft="job-2"]').click();

  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(page.locator('[data-package-workflow="job-2"]')).toContainText("قابلة للتصدير");
  await page.reload();
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toHaveValue(firstPackageBody);
  await expect(
    page.locator('[data-package-field="cover_letter_body"][data-job-id="job-2"]'),
  ).toHaveValue("Editable cover letter body saved from Playwright");

  await page
    .locator('[data-package-field="resume_body"][data-job-id="job-2"]')
    .fill(secondPackageBody);
  await page
    .locator('[data-package-field="cover_letter_body"][data-job-id="job-2"]')
    .fill("Second cover letter history version from Playwright");
  await page.locator('[data-save-package-draft="job-2"]').click();

  await expect(page.locator('[data-package-history="job-2"]')).toContainText(secondPackageBody);
  await expect(page.locator('[data-package-history="job-2"]')).toContainText("نسخة");
  await page
    .locator('[data-package-history="job-2"] .history-item')
    .filter({ hasText: firstPackageBody })
    .locator("[data-restore-package-version]")
    .click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toHaveValue(firstPackageBody);
  await page.reload();
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toHaveValue(firstPackageBody);
  await expect(page.locator('[data-package-history="job-2"]')).toContainText(secondPackageBody);
});

test("assistant generates package drafts into the documents workspace", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/assistant");

  await expect(page.locator("[data-assistant-context]")).toContainText("مهندس برمجيات Rust");
  await expect(page.locator("[data-assistant-context]")).toContainText("Careem");
  await expect(page.locator("[data-prompt-chip]").first()).toContainText("خطاب تقديم");
  await page.locator("[data-prompt-chip]").first().click();
  await expect(page.locator('[data-composer="job-2"]')).toHaveValue(/خطاب تقديم/);
  await expect(page.locator('[data-composer="job-2"]')).toHaveValue(/Careem/);
  await expect(page.locator('[data-composer="job-2"]')).toHaveValue(/مهندس برمجيات Rust/);
  const unsavedDraft = `مسودة غير محفوظة لوظيفة مهندس برمجيات Rust لدى Careem ${Date.now()}`;
  await page.locator('[data-composer="job-2"]').fill(unsavedDraft);
  await expect(page.locator('[data-draft-save-state="job-2"]')).toContainText("تعديلات غير محفوظة");
  await page.locator("[data-generate]").click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(page.locator('[data-draft-save-state="job-2"]')).toContainText("آخر حفظ");
  await expect(page.locator('[data-draft-history="job-2"]')).toContainText(unsavedDraft);
  await expect(page.locator('[data-draft-history="job-2"]')).toContainText("نسخة");
  const secondDraft = `مسودة ثانية لاختبار الاستعادة ${Date.now()}`;
  await page.locator('[data-composer="job-2"]').fill(secondDraft);
  await page.locator("[data-generate]").click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(page.locator('[data-draft-history="job-2"]')).toContainText(secondDraft);
  await page
    .locator('[data-draft-history="job-2"] .history-item')
    .filter({ hasText: unsavedDraft })
    .locator("[data-restore-draft-version]")
    .click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");
  await expect(page.locator('[data-composer="job-2"]')).toHaveValue(unsavedDraft);
  await page.reload();
  await expect(page.locator('[data-composer="job-2"]')).toHaveValue(unsavedDraft);
  await expect(page.locator('[data-draft-history="job-2"]')).toContainText(unsavedDraft);
  await expect(page.locator('[data-draft-save-state="job-2"]')).toContainText("آخر حفظ");

  await page.locator("[data-generate-package]").click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");

  await page.locator('.bottom-nav [data-nav="/documents"]').click();
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toContainText("Jaber Product Builder");
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toContainText("English CV Summary");
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toContainText("CV Section: Match Evidence");
  await expect(
    page.locator('[data-package-field="cover_letter_body"][data-job-id="job-2"]'),
  ).toContainText("Careem");
  await expect(
    page.locator('[data-package-field="cover_letter_body"][data-job-id="job-2"]'),
  ).toContainText("Cover Letter Section: Value Match");

  await page.reload();
  await expect(
    page.locator('[data-package-field="resume_body"][data-job-id="job-2"]'),
  ).toContainText("Jaber Product Builder");
});

test("documents screen opens printable package preview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/assistant");
  await page.locator("[data-generate-package]").click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");

  await page.locator('.bottom-nav [data-nav="/documents"]').click();
  await page.locator('[data-package-preview="job-2"]').click();

  await expect(page).toHaveURL(/\/packages\/job-2\/preview$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("body")).toContainText("معاينة PDF");
  await expect(page.locator("body")).toContainText("Jaber Product Builder");
  await expect(page.locator("body")).toContainText("CV Section: Skills");
  await expect(page.locator(".doc-section").first()).toBeVisible();
  await expect(page.locator(".doc-section li").first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Careem");
  await expect(page.locator("body")).toContainText("Cover Letter Section: Close");
});

test("documents screen downloads generated PDF package", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3030/assistant");
  await page.locator("[data-generate-package]").click();
  await expect(page.locator("[data-action-message]")).toContainText("تم");

  await page.locator('.bottom-nav [data-nav="/documents"]').click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-package-pdf="job-2"]').click();
  const download = await downloadPromise;
  const pdfPath = await download.path();
  const pdfBytes = fs.readFileSync(pdfPath);

  expect(download.suggestedFilename()).toBe("job-2-application-package.pdf");
  expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfBytes.toString("latin1")).toContain("%%EOF");
});
