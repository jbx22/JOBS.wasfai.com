const { test, expect } = require("@playwright/test");
const path = require("path");

test("current Pages app boots and the resume upload path works", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.locator("[data-resume-file][data-resume-kind=pdf]")).toHaveCount(1);
  await page.setInputFiles(
    "[data-resume-file][data-resume-kind=text]",
    path.join(__dirname, "test-resume.txt"),
  );
  await expect(page.locator("[data-original-resume]")).toContainText(/Industrial project manager/i, {
    timeout: 20_000,
  });
  await expect(page.locator("[data-action-error]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("bootstrap API returns the UI data contract", async ({ request }) => {
  const response = await request.get("/api/bootstrap");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toMatchObject({ profile: expect.any(Object), jobs: expect.any(Array), sources: expect.any(Array) });
  const sourceIds = body.sources.map((source) => source.id);
  for (const id of ["jadarat", "moh-careers", "dga-careers", "pep-careers", "naukrigulf-saudi", "gulftalent-saudi", "aramco-careers", "sabic-careers", "stc-careers", "pif-careers", "neom-careers", "maaden-careers", "sab-bank-careers"]) {
    expect(sourceIds).toContain(id);
  }
});

test("verified Saudi portals are displayed as direct, non-scraped sources", async ({ page }) => {
  await page.goto("/settings/sources", { waitUntil: "networkidle" });
  const jadarat = page.locator("a[href='https://jadarat.sa/']");
  await expect(jadarat).toBeVisible();
  await expect(jadarat).toHaveAttribute("target", "_blank");
  await expect(page.locator("body")).toContainText("وزارة الصحة السعودية");
  await expect(page.locator("body")).toContainText("GulfTalent");
  await expect(page.locator("body")).toContainText("أرامكو السعودية");
  await expect(page.locator("body")).toContainText("سابك");
  await expect(page.locator("body")).toContainText("stc");
});

test("guest users can track an application and schedule a follow-up", async ({ page }) => {
  await page.goto("/jobs/job-2", { waitUntil: "networkidle" });
  await page.locator('[data-tab="resume"]').click();
  await page.locator('[data-application-field="applied_at"][data-job-id="job-2"]').fill("2026-07-14");
  await page.locator('[data-application-field="follow_up_at"][data-job-id="job-2"]').fill("2026-07-21");
  await page.locator('[data-application-field="recruiter_name"][data-job-id="job-2"]').fill("Recruitment Team");
  await page.locator('[data-application-field="notes"][data-job-id="job-2"]').fill("Application submitted through the official careers portal.");
  await page.locator('[data-save-application="job-2"]').click();
  await expect(page.locator(".banner.ok")).toContainText("تم حفظ سجل التقديم والمتابعة");
  await page.goto("/results", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("قائمة المتابعة");
  await expect(page.locator("body")).toContainText("2026-07-21");
});
