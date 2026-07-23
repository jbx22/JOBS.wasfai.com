const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.JOBS_WASFAI_URL || "https://jobs.wasfai.com";
const enabled = Boolean(process.env.JOBS_AUTH_STORAGE_STATE);

test("authenticated resume-to-export release gate", async ({ request }) => {
  test.skip(!enabled, "Set JOBS_AUTH_STORAGE_STATE to the dedicated QA account storage-state file.");

  const stateResponse = await request.get(`${BASE_URL}/api/me/state`);
  expect(stateResponse.ok()).toBeTruthy();
  const workspace = await stateResponse.json();
  expect(workspace.authenticated).toBeTruthy();

  const profile = {
    ...workspace.state.profile,
    display_name: "Production QA",
    target_roles: "Industrial Project Manager, Mechanical Engineer",
    target_locations: "Saudi Arabia, GCC",
    resume_skills: "Project management, mechanical engineering, operations, maintenance, CAPEX",
    resume_languages: "Arabic, English",
    resume_seniority: "Senior",
    resume_text: "Production QA resume. Senior industrial project and mechanical engineering professional experienced in operations, maintenance, CAPEX, risk, schedules, and stakeholder management.",
    resume_filename: "production-qa-resume.txt",
  };
  const savedState = { ...workspace.state, profile };
  delete savedState.__revisions;
  const saved = await request.put(`${BASE_URL}/api/me/state`, { data: { state: savedState } });
  expect(saved.ok()).toBeTruthy();
  const matchResponse = await request.post(`${BASE_URL}/api/jobs/match`, { data: { profile, limit: 5 } });
  expect(matchResponse.ok()).toBeTruthy();
  const match = await matchResponse.json();
  expect(Array.isArray(match.jobs)).toBeTruthy();
  const job = match.jobs[0] || workspace.state.jobs?.[0];
  expect(job).toBeTruthy();
  const generation = await request.post(`${BASE_URL}/api/ghostwriter`, {
    data: { job, profile, ai_model: "deepseek" }, timeout: 120_000,
  });
  if (!generation.ok()) throw new Error(`generation failed: ${generation.status()} ${await generation.text()}`);
  const kit = await generation.json();
  expect(kit.provider).not.toBe("template");
  expect(kit.quality_review).toBeTruthy();

  const pdf = await request.post(`${BASE_URL}/api/export-package`, {
    data: { format: "pdf", job, profile, kit }, timeout: 45_000,
  });
  if (!pdf.ok()) throw new Error(`PDF export failed: ${pdf.status()} ${await pdf.text()}`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const bytes = await pdf.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});

test("encrypted original resume lifecycle", async ({ request }) => {
  test.skip(!enabled, "Set JOBS_AUTH_STORAGE_STATE to the dedicated QA account storage-state file.");
  const source = Buffer.from("Production QA private resume storage lifecycle. Mechanical engineering and project management.");
  const uploaded = await request.post(`${BASE_URL}/api/resumes`, {
    multipart: {
      file: { name: "production-qa-resume.txt", mimeType: "text/plain", buffer: source },
    },
  });
  if (!uploaded.ok()) throw new Error(`upload failed: ${uploaded.status()} ${await uploaded.text()}`);
  const payload = await uploaded.json();
  expect(payload.storage).toBe("d1+r2-encrypted");
  expect(payload.file.name).toBe("production-qa-resume.txt");
  expect(payload.file.size_bytes).toBe(source.length);
  expect(payload.file.sha256).toMatch(/^[a-f0-9]{64}$/);

  const downloaded = await request.get(`${BASE_URL}${payload.file.download_url}`);
  expect(downloaded.ok()).toBeTruthy();
  expect(await downloaded.body()).toEqual(source);
  expect(downloaded.headers()["cache-control"]).toContain("no-store");

  const removed = await request.delete(`${BASE_URL}${payload.file.download_url}`);
  expect(removed.status()).toBe(204);
  const missing = await request.get(`${BASE_URL}${payload.file.download_url}`);
  expect(missing.status()).toBe(404);
  const listed = await request.get(`${BASE_URL}/api/resumes`);
  expect((await listed.json()).file).toBeNull();
});
