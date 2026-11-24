const { test, expect } = require("@playwright/test");

test.use({ serviceWorkers: "block" });

const source = "Synthetic mechanical engineer managing pump reliability, preventive maintenance and plant commissioning in Jubail, Saudi Arabia.";
const profile = { display_name: "Example Candidate", target_roles: "Mechanical Engineer", target_locations: "Jubail", resume_text: source };
const snapshot = "2026-01-12T12:00:00.000Z";
const records = Array.from({ length: 21 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  const id = "fixture-mechanical-" + number;
  return { id, public_id: "i-" + id, public_url: "/vacancies/i-" + id, title: "Mechanical Project Engineer " + number,
    employer: "Example Engineering", location: "Jubail, Saudi Arabia", source_id: "fixture-board",
    source_url: "https://example.invalid/jobs/" + id, description: "Oversee rotating equipment inspections and industrial plant maintenance.",
    data_quality: "live_verified", source_quality: "live_verified" };
});
const software = { ...records[0], id: "fixture-software", public_id: "i-fixture-software",
  title: "Platform Software Engineer", public_url: "/vacancies/i-fixture-software" };
const stale = { id: "demo-old", title: "Legacy Rust Example", employer: "Legacy Example", source: "resume-match", score: 99, match_eligible: true, status: "ready" };
const saved = { id: "kept-by-applicant", title: "Previously saved logistics role", employer: "Example Logistics", source: "manual", imported: true, status: "discovered" };

async function workspace(page, authenticated = true, initialProfile = profile, catalogRows = records) {
  const trace = { browse: [], match: [], details: [], saves: [], errors: [], unexpected: [], failNextMatch: false };
  let state = { jobs: [stale, saved], profile: initialProfile, packages: [], approvedMasterResume: false };
  page.on("pageerror", error => trace.errors.push(error.message));
  await page.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const send = (json, status = 200) => route.fulfill({ json, status });
    switch (url.pathname) {
      case "/api/bootstrap": return send({ profile: authenticated ? initialProfile : {}, jobs: [stale], packages: [], sources: [] });
      case "/api/auth/session": return send({ authenticated, user: authenticated ? { sub: "example", name: profile.display_name } : null });
      case "/api/ai-health": return send({ ready: true });
      case "/api/resumes": return send({ file: null });
      case "/api/sources": return send({ sources: [] });
      case "/api/me/state":
        if (req.method() === "PUT") {
          state = req.postDataJSON().state;
          trace.saves.push(state);
        }
        return send({ authenticated, state, storage: "postgres-normalized" });
      case "/api/jobs/detail":
        trace.details.push({ query: Object.fromEntries(url.searchParams), method: req.method(), body: req.postData() });
        return send({ description: "Inspect rotating equipment and supervise mechanical commissioning." });
      case "/api/jobs/search":
      case "/api/jobs/match": {
        const matching = url.pathname.endsWith("/match");
        const input = matching ? req.postDataJSON() : Object.fromEntries(url.searchParams);
        const filters = matching ? input.filters : input;
        (matching ? trace.match : trace.browse).push(input);
        if (matching && !input.profile.target_roles) return send({ ok: false, code: "TARGET_ROLE_REQUIRED" }, 422);
        if (matching && trace.failNextMatch) {
          trace.failNextMatch = false;
          return send({ ok: false, code: "MATCH_UNAVAILABLE" }, 503);
        }
        const catalog = matching ? catalogRows.map(row => ({ ...row, match_eligible: true, score: 87, match_evidence: ["Preventive maintenance"] })) : [...catalogRows, software];
        const filtered = catalog.filter(row => row.title.toLowerCase().includes((filters.q || "").toLowerCase()) && row.location.includes(filters.city || ""));
        const offset = Number(input.offset);
        const limit = Number(input.limit);
        const jobs = filtered.slice(offset, offset + limit);
        const next = offset + jobs.length;
        return send({ ok: true, jobs, total: filtered.length, matched: matching ? filtered.length : undefined,
          limit, offset, as_of: input.as_of || snapshot, has_more: next < filtered.length, next_offset: next < filtered.length ? next : null });
      }
      default:
        trace.unexpected.push(url.pathname);
        return send({ error: "Unexpected fixture request" }, 404);
    }
  });
  return trace;
}

test("guest browses and pages live vacancies from the search home without a résumé", async ({ page }) => {
  const trace = await workspace(page, false);
  await page.goto("/app");
  const form = page.locator("[data-vacancy-filters=browse]");
  await form.locator("[name=q]").fill("Mechanical");
  await form.locator("[name=city]").fill("Jubail");
  await form.getByRole("button", { name: /بحث|Search/ }).click();
  const cards = page.locator(".job-search-card");
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toContainText(records[0].title);
  await expect(cards.locator(".tag")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(stale.title);
  await expect(page.locator(".vacancy-paging button")).toHaveCount(1);
  await page.locator(".vacancy-paging button").click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(records[20].title);
  await expect(page.getByRole("status")).toContainText("21–21");
  expect(trace.browse.at(-1)).toMatchObject({ q: "Mechanical", city: "Jubail", offset: "20", limit: "20", as_of: snapshot });
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(form.locator("[name=q]")).toHaveValue("Mechanical");
  await expect(form.locator("[name=city]")).toHaveValue("Jubail");
  await page.locator(".vacancy-paging button").click();
  await expect(cards).toHaveCount(20);
  await form.locator("[name=q]").fill("unlisted role");
  await form.locator("[type=submit]").click();
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(/لا توجد|No vacancies/);
  await page.locator("button[data-nav='/jobs?view=matches']").first().click();
  await expect(page.locator("body")).toContainText(/سجّل الدخول للبحث|Sign in to search/);
  expect(trace.match).toEqual([]);
  expect(trace.saves).toEqual([]);
  expect(trace.errors).toEqual([]);
  expect(trace.unexpected).toEqual([]);
});

test("résumé matches retry and page separately from the public catalog and saved work", async ({ page }) => {
  const trace = await workspace(page);
  trace.failNextMatch = true;
  await page.goto("/app");
  await page.locator("[data-search-approved-jobs]").first().click();
  await expect(page).toHaveURL(/view=matches/);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".job-search-card")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(stale.title);
  await page.locator("[data-retry-job-search]").click();
  const cards = page.locator(".job-search-card");
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toContainText("87%");
  await expect(cards.first()).toContainText("Preventive maintenance");
  await expect(page.locator("body")).not.toContainText(software.title);
  expect(trace.match.at(-1)).toMatchObject({ profile: { resume_text: source, target_roles: profile.target_roles }, limit: 20, offset: 0 });
  await page.locator(".vacancy-paging button").click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(records[20].title);
  expect(trace.match.at(-1)).toMatchObject({ as_of: snapshot, offset: 20 });
  await page.goto("/account");
  const targets = page.locator("#coach-target-job");
  await expect(targets).toContainText(records[20].title);
  await expect(targets).toContainText(saved.title);
  await expect(targets).not.toContainText(stale.title);
  await expect(targets).not.toContainText(records[0].title);
  await page.goto("/jobs?view=saved");
  await expect(page.locator("body")).toContainText(saved.title);
  await expect(page.locator("body")).not.toContainText(records[20].title);
  await expect(page.locator("body")).not.toContainText(stale.title);
  await page.getByRole("button", { name: /^(كل الوظائف|All vacancies)$/ }).click();
  await expect(cards).toHaveCount(20);
  await page.locator(".vacancy-paging button").click();
  await expect(cards).toHaveCount(2);
  await expect(cards.last()).toContainText(software.title);
  await expect(cards.locator(".tag")).toHaveCount(0);
  expect(trace.saves).toEqual([]);

  // Saving one result must survive a fresh session without saving the whole page.
  await cards.last().locator("[data-open-search-job]").click();
  await expect(page).toHaveURL(/\/jobs\/live-fixture-software$/);
  await expect.poll(() => trace.saves.at(-1)?.jobs.filter(job => job.public_id).map(job => job.public_id)).toEqual([software.public_id]);
  await page.goto("/jobs?view=saved");
  await expect(page.locator("body")).toContainText(software.title);
  await expect(page.locator("body")).toContainText(saved.title);
  await expect(page.locator("body")).not.toContainText(records[20].title);
  expect(trace.errors).toEqual([]);
  expect(trace.unexpected).toEqual([]);
});

test("the jobs entry starts with résumé matches and remembers a deliberate switch to browsing", async ({ page }) => {
  const trace = await workspace(page);
  await page.goto("/jobs");
  const cards = page.locator(".job-search-card");
  await expect(cards).toHaveCount(20);
  await expect(cards.first()).toContainText("87%");
  expect(trace.match).toHaveLength(1);
  expect(trace.browse).toHaveLength(0);

  await page.getByRole("button", { name: /^(كل الوظائف|All vacancies)$/ }).click();
  await expect(cards).toHaveCount(20);
  await expect(cards.locator(".tag")).toHaveCount(0);
  await page.goto("/jobs");
  await expect(cards).toHaveCount(20);
  await expect(cards.locator(".tag")).toHaveCount(0);
  expect(trace.browse.length).toBeGreaterThanOrEqual(2);
  expect(trace.match).toHaveLength(1);
});

test("a selected SmartRecruiters vacancy loads official requirements by public ID once", async ({ page }) => {
  const id = "ksa-aecom2-smartrecruiters-1234";
  const selected = { ...records[0], id, public_id: "i-" + id, source_id: "ksa-aecom2-smartrecruiters",
    source_url: "https://jobs.smartrecruiters.com/AECOM2/1234-mechanical-project-engineer",
    description: "المتطلبات والتقديم في الإعلان الرسمي." };
  const trace = await workspace(page, true, profile, [selected]);
  await page.goto("/jobs?view=matches");
  const card = page.locator(".job-search-card").first();
  await expect(card).toContainText(selected.title);
  expect(trace.details).toEqual([]);
  await card.locator("[data-open-search-job]").click();
  await page.locator('[data-tab="overview"]').click();
  await expect(page.locator("[data-official-job-description]")).toHaveText(/rotating equipment.*mechanical commissioning/);
  await page.locator('[data-tab="resume"]').click();
  await page.locator('[data-tab="overview"]').click();
  expect(trace.details).toEqual([{ query: { id: selected.public_id }, method: "GET", body: null }]);
  expect(trace.errors).toEqual([]);
  expect(trace.unexpected).toEqual([]);
});

test("missing role opens the editable target, and damaged source still allows public browsing", async ({ page }) => {
  const trace = await workspace(page, true, {
    resume_text: "I enjoy working with my team and have completed several courses over the last year.",
  });
  await page.goto("/jobs?view=matches");
  await page.locator("[data-edit-match-role]").click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator('[data-profile-field="target_roles"]')).toBeFocused();
  expect(trace.match.at(-1)?.profile.target_roles).toBe("");
  expect(trace.errors).toEqual([]);

  await page.unroute("**/*");
  const corrupted = await workspace(page, true, { resume_text: "x Q . x C x , % x zz) contact@example.invalid", resume_filename: "scan.pdf" });
  await page.goto("/jobs?view=matches");
  await expect(page.locator(".empty").first()).toContainText(/نحتاج نصاً أوضح|clearer résumé text/);
  await page.locator(".empty [data-nav='/jobs?view=browse']").click();
  await expect(page.locator(".job-search-card")).toHaveCount(20);
  expect(corrupted.match).toEqual([]);
});
