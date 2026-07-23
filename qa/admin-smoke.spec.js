const { expect, test } = require("@playwright/test");

test("admin and super admin surfaces are gated and usable on desktop/mobile", async ({ page, baseURL }) => {
  await page.goto(`${baseURL.replace(/\/app$/, "")}/admin/`);
  await expect(page.getByRole("heading", { name: "Admin access" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toHaveAttribute("href", /next=%2Fadmin%2F/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL.replace(/\/app$/, "")}/super-admin/`);
  await expect(page.getByRole("heading", { name: "Super Admin access" })).toBeVisible();
  await expect(page.locator(".login-box")).toBeVisible();
});

test("admin API requires authentication", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL.replace(/\/app$/, "")}/api/admin/overview`);
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual(expect.objectContaining({ code: "AUTH_REQUIRED" }));
});
