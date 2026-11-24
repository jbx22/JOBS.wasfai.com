const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "block" });

const viewports = [[320, 640], [390, 844], [768, 1024], [1440, 900]];
const records = Array.from({ length: 24 }, (_, i) => {
  const id = "customer-" + (i + 1);
  return { id, public_id: "i-" + id, public_url: "/vacancies/i-" + id,
    title: "Customer Relations and Guest Services Representative " + (i + 1),
    employer: "Example Service Centre", location: "Riyadh", source_id: "synthetic-board",
    source_url: "https://example.invalid/jobs/" + id, description: "Help customers resolve account queries and coordinate service requests.",
    source_quality: "live_verified", data_quality: "live_verified", status: "discovered" };
});

async function startWorkspace(page, locale) {
  let state = { profile: { display_name: "Sample Candidate", target_roles: "Customer Service Representative",
    resume_text: "Customer service representative with a background in reception, visitor assistance, complaint resolution and scheduling." },
    jobs: [{ ...records[0], imported: true, source: "manual" }], sources: [], packages: [] };
  await page.addInitScript(language => {
    localStorage.setItem("jobs.wasfai.preferences", JSON.stringify({ version: 2, locale: language, theme: "light" }));
  }, locale);
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    switch (url.pathname) {
      case "/api/bootstrap": return route.fulfill({ json: { profile: {}, jobs: [], sources: [] } });
      case "/api/auth/session": return route.fulfill({ json: { authenticated: true, user: { sub: "mobile-example", name: "Sample Candidate" } } });
      case "/api/me/state":
        if (request.method() === "PUT") state = request.postDataJSON().state;
        return route.fulfill({ json: { authenticated: true, state, storage: "postgres-normalized" } });
      case "/api/ai-health": return route.fulfill({ json: { ready: true } });
      case "/api/openrouter/status": return route.fulfill({ json: { connected: false, connected_at: null } });
      case "/api/subscriptions": return route.fulfill({ json: { authenticated: true, current: { plan: "free", effective_plan: "free", status: "active", paid_active: false } } });
      case "/api/resumes": return route.fulfill({ json: { file: null } });
      case "/api/sources": return route.fulfill({ json: { sources: [] } });
      case "/api/jobs/search":
      case "/api/jobs/match": {
        const isMatch = url.pathname.endsWith("/match");
        const offset = Number(isMatch ? request.postDataJSON().offset : url.searchParams.get("offset")) || 0;
        const catalog = isMatch
          ? records.map(job => ({ ...job, match_eligible: true, score: 85, match_evidence: ["Customer service"] })) : records;
        const jobs = catalog.slice(offset, offset + 20);
        return route.fulfill({ json: { ok: true, jobs, total: catalog.length, offset, limit: 20, next_offset: offset + jobs.length < catalog.length ? offset + jobs.length : null, as_of: new Date().toISOString() } });
      }
      case "/api/jobs/detail": return route.fulfill({ json: { ok: true, job: records.find(row => row.public_id === url.searchParams.get("id")) } });
      default: return route.fulfill({ status: 404, json: {} });
    }
  });
}

function navTo(page, pathname) {
  return page.locator('nav:visible .nav-link[data-nav="' + pathname + '"]');
}

async function assertUsableNavigation(page, pathname) {
  const current = navTo(page, pathname);
  await expect(current).toHaveAttribute("aria-current", "page");
  const targets = ["/app", "/jobs", "/account", "/results", "/profile"].map(href => navTo(page, href));
  for (const target of targets) {
    await expect(target).toHaveCount(1);
    const accessible = await target.evaluate(element => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      return box.left >= -1 && box.right <= innerWidth + 1 && y > 0 && y < innerHeight &&
        element.contains(document.elementFromPoint(x, y));
    });
    expect(accessible, "Primary navigation must be reachable without scrolling to the page footer").toBe(true);
  }
}

async function assertInputsFit(page) {
  const clipped = await page.locator("main input:visible, main textarea:visible, main select:visible").evaluateAll(elements =>
    elements.filter(el => {
      const bounds = el.getBoundingClientRect();
      return !el.closest('[hidden], details:not([open])') && bounds.width > 1 && (bounds.left < -1 || bounds.right > innerWidth + 1);
    }).map(el => el.name || el.getAttribute("aria-label") || el.dataset.profileField || el.tagName));
  expect(clipped, "Form controls must fit inside the viewport in either writing direction").toEqual([]);
}

for (const [width, height] of viewports) {
  for (const language of ["ar", "en"]) {
    test(`jobseeker can navigate, use the menu, and return to a vacancy at ${width}px in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await startWorkspace(page, language);
      await page.goto("/app");
      await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
      await assertUsableNavigation(page, "/app");
      const primaryLabel = await navTo(page, "/account").innerText();
      expect(primaryLabel).toMatch(language === "ar" ? /\p{Script=Arabic}/u : /[a-z]/i);
      await assertInputsFit(page);

      const trigger = page.locator("[data-user-menu]");
      const panel = page.locator("[data-user-menu-panel]");
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      const menuBox = await panel.boundingBox();
      expect(menuBox.x).toBeGreaterThanOrEqual(-1);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
      await page.keyboard.press("Tab");
      expect(await panel.evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.locator("main").click({ position: { x: 4, y: 4 } });
      await expect(panel).toBeHidden();

      await trigger.click();
      await panel.locator('[data-nav="/settings"]').click();
      await expect(page).toHaveURL(/\/settings$/);
      await assertInputsFit(page);
      await page.goBack();
      await expect(page).toHaveURL(/\/app$/);
      await navTo(page, "/profile").click();
      await assertUsableNavigation(page, "/profile");
      await expect(page.locator("[data-user-profile]")).toBeVisible();
      await assertInputsFit(page);
      await navTo(page, "/account").click();
      await assertUsableNavigation(page, "/account");
      await assertInputsFit(page);
      await expect(page.getByRole("main")).toBeFocused();
      await navTo(page, "/jobs").click();
      const target = page.locator('[data-open-search-job="' + records[13].public_id + '"]');
      await expect(target).toBeVisible();
      await assertUsableNavigation(page, "/jobs");
      await assertInputsFit(page);
      await expect(page.locator("#workspace-content"), "Loading results should keep the new route focused").toBeFocused();
      await target.evaluate(el => el.scrollIntoView({ block: "center" }));
      await expect(target).toBeInViewport();
      const listUrl = page.url();
      await target.click();
      await expect(page).toHaveURL(/\/jobs\/live-customer-14$/);
      await assertUsableNavigation(page, "/jobs");
      await page.goBack();
      await expect(page).toHaveURL(listUrl);
      await expect(target, "Back should return to the vacancy the applicant opened").toBeInViewport();

      await navTo(page, "/results").click();
      await assertUsableNavigation(page, "/results");
      await expect(page.getByRole("main")).toBeFocused();
    });
  }
}


test("browser Back restores the result the applicant was reading when a search page is fetched again", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startWorkspace(page, "en");
  await page.goto("/jobs?view=browse");
  const next = page.locator(".vacancy-paging [data-nav*='offset=20']");
  await expect(next).toBeVisible();
  await next.evaluate(button => button.scrollIntoView({ block: "center" }));
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.locator(".job-search-card")).toHaveCount(4);
  await page.goBack();
  await expect(page.locator(".job-search-card")).toHaveCount(20);
  await expect(next, "The applicant should be returned to the end of the first page").toBeInViewport();
});
