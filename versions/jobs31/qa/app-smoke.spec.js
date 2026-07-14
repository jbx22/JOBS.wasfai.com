const { test, expect } = require("@playwright/test");
const path = require("path");

test("current Pages app boots and the bilingual resume PDF text path works", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.locator("[data-resume-file][data-resume-kind=pdf]")).toHaveCount(1);
  await page.setInputFiles(
    "[data-resume-file][data-resume-kind=pdf]",
    path.join(__dirname, "mechanical-resume-upload.pdf"),
  );
  await expect(page.locator("[data-original-resume]")).toContainText(/Mechanical Engineer|مهندس/i, {
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
});
