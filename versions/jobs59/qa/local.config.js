const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "app-smoke.spec.js",
  reporter: "line",
  use: {
    baseURL: process.env.JOBS_WASFAI_LOCAL_URL || "http://127.0.0.1:8788",
  },
  webServer: {
    command: "npx wrangler pages dev public --port 8788 --compatibility-date 2026-07-11",
    url: "http://127.0.0.1:8788/app",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
