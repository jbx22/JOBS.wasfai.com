const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "authenticated-journey.spec.js",
  reporter: "line",
  timeout: 120_000,
  use: process.env.JOBS_AUTH_STORAGE_STATE ? { storageState: process.env.JOBS_AUTH_STORAGE_STATE } : {},
});
