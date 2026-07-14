const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.JOBS_WASFAI_URL || "https://jobs.wasfai.com";

test("production auth redirect is wired to Google callback", async ({ page }) => {
  const response = await page.goto(`${BASE_URL}/api/auth/google/start`, { waitUntil: "commit" });
  expect([200, 302]).toContain(response.status());
  const url = new URL(page.url());
  expect(url.hostname).toContain("google.com");
  expect(url.href).toContain("client_id=");
  expect(url.href).toContain(encodeURIComponent(`${BASE_URL}/api/auth/google/callback`));
});

test("production bootstrap exposes expected command-center schema", async ({ request }) => {
  const response = await request.get(`${BASE_URL}/api/bootstrap`);
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  for (const key of ["profile", "jobs", "sources", "packages", "messages", "activity_feed", "application_checklists"]) {
    expect(data).toHaveProperty(key);
  }
  expect(Array.isArray(data.jobs)).toBeTruthy();
  expect(Array.isArray(data.sources)).toBeTruthy();
  expect(data.sources.length).toBeGreaterThan(0);
});

test("production PWA manifest and service worker are installable basics", async ({ request }) => {
  const manifestResponse = await request.get(`${BASE_URL}/manifest.webmanifest`);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/app");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  const swResponse = await request.get(`${BASE_URL}/sw.js`);
  expect(swResponse.ok()).toBeTruthy();
  const sw = await swResponse.text();
  expect(sw).toContain("caches.match");
  expect(sw).toContain("/app");
});

test("production export rejects empty application packages", async ({ request }) => {
  const response = await request.post(`${BASE_URL}/api/export-package`, {
    data: {},
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe("BAD_REQUEST");
});

test("production mobile and desktop screenshots render without console errors", async ({ page }, testInfo) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/app`, { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("body")).toContainText("أكمل الملف");
  await page.locator("[data-toggle-locale]").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("body")).toContainText("Complete Profile");
  await page.locator("[data-toggle-theme]").click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".bottom-nav")).toBeVisible();
  await testInfo.attach("mobile-home", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/app`, { waitUntil: "networkidle" });
  await expect(page.locator("body")).toContainText("Four steps");
  await testInfo.attach("desktop-home", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  expect(errors).toEqual([]);
});
