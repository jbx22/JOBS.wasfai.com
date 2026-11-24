const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { vacancyPage } = require("../functions/vacancies/[id].js");
const { onRequestGet: applicationsPage } = require("../functions/applications.js");

test.use({ viewport: { width: 360, height: 780 }, serviceWorkers: "block" });

const job = {
  id: "example", public_id: "e-example", kind: "employer", company_name: "Example Employer",
  title: "Project Engineer", city: "Riyadh", country_code: "SA", experience_min: 3,
  salary_min: 15000, salary_max: null, description: "Plan engineering projects and lead inspections.",
  published_at: "2025-01-01", valid_through: "2028-01-01",
};
async function openFlow(page, options = {}) {
  const calls = { uploads: 0, applications: [], withdrawals: [], auth: 0 };
  const submissions = (options.responses || []).slice();
  const records = options.records || [];
  const vacancy = options.vacancy || job;
  await page.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    const pathname = url.pathname;
    const send = (json, status = 200) => route.fulfill({ json, status });
    if (url.hostname !== "candidate.test") return route.abort();
    if (pathname.startsWith("/vacancies/") || pathname === "/applications") {
      const resp = pathname === "/applications" ? applicationsPage({ request: new Request(url) }) : vacancyPage(vacancy, url.searchParams.get("lang") || "ar");
      return route.fulfill({ status: resp.status, contentType: "text/html", body: await resp.text() });
    }
    if (["/recruitment.js", "/recruitment.css", "/styles.css"].includes(pathname)) {
      return route.fulfill({ path: path.join(__dirname, "../public", pathname.slice(1)) });
    }
    if (pathname === "/api/auth/session") { calls.auth++; return send({ authenticated: !!options.authenticated }); }
    if (pathname === "/api/resumes") {
      if (req.method() === "POST") {
        calls.uploads++;
        return send({ file: { id: "uploaded", name: "example.txt" } }, 201);
      }
      return send({ file: options.file || null });
    }
    if (pathname === "/api/recruitment/jobs/example/apply") {
      calls.applications.push(req.postDataJSON());
      if (options.holdSubmission) await options.holdSubmission;
      const [status, code] = submissions.shift() || [201, ""];
      return send(code ? { code } : { id: "application", status: "submitted" }, status);
    }
    if (pathname === "/api/recruitment/me") return send({ applications: records });
    if (pathname === "/api/recruitment/applications/application" && req.method() === "PATCH") {
      calls.withdrawals.push(req.postDataJSON());
      records[0].status = "withdrawn";
      return send({ ok: true });
    }
    return route.abort();
  });
  await page.goto("https://candidate.test" + (options.path || "/vacancies/e-example?lang=en#apply"));
  return calls;
}

test("external vacancy names its destination, keeps the save link secondary and fits mobile", async ({ page }) => {
  const calls = await openFlow(page, { vacancy: { ...job, kind: "ingested", public_id: "i-example", source_url: "https://careers.example.test/jobs/42" }, path: "/vacancies/i-example?lang=en" });
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  const apply = page.getByRole("link", { name: "Apply on careers.example.test" });
  await expect(apply).toHaveAttribute("href", "https://careers.example.test/jobs/42");
  await expect(apply).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: "Save and tailor my résumé" })).toHaveAttribute("href", "/jobs?view=browse&vacancy=i-example");
  await expect(page.getByText("From 15,000 SAR/month")).toBeVisible();
  await expect(page.locator("main .primary")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(calls.auth).toBe(0);
});

test("Arabic guest uses explicit terms and returns to the same open vacancy after login", async ({ page }) => {
  await openFlow(page, { path: "/vacancies/e-example#apply" });
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("details#apply")).toHaveAttribute("open", "");
  const login = page.locator("[data-portal-login]");
  await expect(login).toHaveAttribute("aria-disabled", "true");
  await expect(login).not.toHaveAttribute("href", /.+/);
  await page.getByRole("checkbox").check();
  await expect(login).toHaveAttribute("aria-disabled", "false");
  const start = new URL(await login.getAttribute("href"), page.url());
  expect(start.searchParams.get("terms")).toBe("1");
  expect(start.searchParams.get("next")).toBe("/vacancies/e-example#apply");
});

test("new résumé, consent and a retry send one upload and confirm the employer application", async ({ page }) => {
  const calls = await openFlow(page, { authenticated: true, responses: [[503, "RECRUITMENT_UNAVAILABLE"], [201, ""]] });
  const send = page.getByRole("button", { name: "Send application" });
  const file = page.getByLabel("Choose a résumé (required)");
  await expect(file).toHaveAttribute("required", "");
  await send.click();
  expect(calls.applications).toHaveLength(0);
  await file.setInputFiles({ name: "example.txt", mimeType: "text/plain", buffer: Buffer.from("Example candidate résumé") });
  await page.getByLabel("Note to the employer").fill("  Industrial projects  ");
  await send.click();
  expect(calls.uploads).toBe(0);
  await page.getByRole("checkbox").check();
  await send.click();
  await expect(page.getByText("We couldn’t complete this request. Please try again.")).toBeVisible();
  await expect(page.getByRole("link", { name: "example.txt" })).toHaveAttribute("href", "/api/resumes/uploaded");
  await send.click();
  await expect(page.getByRole("heading", { name: "Application sent" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View my applications" })).toHaveAttribute("href", "/applications?lang=en");
  expect(calls.uploads).toBe(1);
  expect(calls.applications).toEqual(Array(2).fill({ resume_file_id: "uploaded", consent: true, cover_note: "Industrial projects" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("saved résumé can be reused and duplicate sends lead to application tracking", async ({ page }) => {
  const calls = await openFlow(page, { authenticated: true, file: { id: "saved", name: "Saved.pdf" }, responses: [[409, "ALREADY_APPLIED"]] });
  await expect(page.getByRole("link", { name: "Saved.pdf" })).toHaveAttribute("href", "/api/resumes/saved");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByRole("heading", { name: "You already applied to this vacancy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send application" })).toHaveCount(0);
  expect(calls.uploads).toBe(0);
  expect(calls.applications[0].resume_file_id).toBe("saved");
});

test("candidate history distinguishes withdrawal from employer-site applications", async ({ page }) => {
  const calls = await openFlow(page, { authenticated: true, path: "/applications?lang=en", records: [{ id: "application", job_id: "example", title: job.title, company_name: job.company_name, created_at: "2026-01-01", status: "interviewing" }] });
  await expect(page.getByText("Interviewing", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Project Engineer" })).toHaveAttribute("href", "/vacancies/e-example?lang=en");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Withdraw application" }).click();
  expect(calls.withdrawals).toHaveLength(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Withdraw application" }).click();
  await expect(page.getByText("Application withdrawn. Résumé sharing has stopped.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Withdraw application" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Browse jobs" })).toHaveAttribute("href", "/vacancies?lang=en");
  expect(calls.withdrawals).toEqual([{ status: "withdrawn" }]);
});


test("sending state blocks repeat clicks and an invalid saved résumé requires a new file", async ({ page }) => {
  let release;
  const holdSubmission = new Promise(resolve => { release = resolve; });
  const calls = await openFlow(page, { authenticated: true, file: { id: "obsolete", name: "Old.pdf" }, holdSubmission, responses: [[400, "CV_REQUIRED"]] });
  const send = page.getByRole("button", { name: "Send application" });
  await page.getByRole("checkbox").check();
  await send.click();
  await expect(send).toBeDisabled();
  await expect(page.getByText("Sending your application…")).toBeVisible();
  release();
  await expect(send).toBeEnabled();
  await expect(page.getByText("Choose a résumé file to attach to this application.")).toBeVisible();
  await expect(page.getByLabel("Choose a résumé (required)")).toHaveAttribute("required", "");
  await expect(page.getByRole("link", { name: "Old.pdf" })).toHaveCount(0);
  expect(calls.applications).toHaveLength(1);
});

test("English application history preserves login locale and offers browsing when empty", async ({ page }) => {
  await openFlow(page, { path: "/applications?lang=en" });
  await page.getByLabel("I agree to the terms and privacy policy.").check();
  const login = page.getByRole("link", { name: "Continue with Google" });
  expect(new URL(await login.getAttribute("href"), page.url()).searchParams.get("next")).toBe("/applications?lang=en");
  await page.unrouteAll();
  await openFlow(page, { authenticated: true, path: "/applications?lang=en" });
  await expect(page.getByText("You haven’t sent any applications through Jobs Wasfai yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse open jobs" })).toHaveAttribute("href", "/vacancies?lang=en");
});
