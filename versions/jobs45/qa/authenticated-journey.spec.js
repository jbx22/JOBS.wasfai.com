const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.JOBS_WASFAI_URL || "https://jobs.wasfai.com";
const enabled = Boolean(process.env.JOBS_AUTH_STORAGE_STATE);

test("authenticated resume-to-export release gate", async ({ request }) => {
  test.skip(!enabled, "Set JOBS_AUTH_STORAGE_STATE to the dedicated QA account storage-state file.");

  const stateResponse = await request.get(`${BASE_URL}/api/me/state`);
  expect(stateResponse.ok()).toBeTruthy();
  const workspace = await stateResponse.json();
  expect(workspace.authenticated).toBeTruthy();

  const profile = workspace.state.profile;
  const matchResponse = await request.post(`${BASE_URL}/api/jobs/match`, { data: { profile, limit: 5 } });
  expect(matchResponse.ok()).toBeTruthy();
  const match = await matchResponse.json();
  expect(Array.isArray(match.jobs)).toBeTruthy();
  test.skip(match.jobs.length === 0, "No eligible live job is currently available for the QA profile.");

  const job = match.jobs[0];
  const generation = await request.post(`${BASE_URL}/api/ghostwriter`, {
    data: { job, profile, ai_model: "deepseek" }, timeout: 45_000,
  });
  expect(generation.ok()).toBeTruthy();
  const kit = await generation.json();
  expect(kit.provider).not.toBe("template");
  expect(kit.quality_review?.approved).toBeTruthy();

  const pdf = await request.post(`${BASE_URL}/api/export-package`, {
    data: { format: "pdf", job, profile, kit }, timeout: 45_000,
  });
  expect(pdf.ok()).toBeTruthy();
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const bytes = await pdf.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
