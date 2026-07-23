import { request } from "@playwright/test";
import fs from "node:fs";

const tokenPath = process.env.JOBS_QA_TOKEN_FILE;
const output = process.env.JOBS_AUTH_STORAGE_STATE;
if (!tokenPath || !output) throw new Error("JOBS_QA_TOKEN_FILE and JOBS_AUTH_STORAGE_STATE are required.");
const token = fs.readFileSync(tokenPath, "utf8").trim();
const context = await request.newContext({ baseURL: process.env.JOBS_WASFAI_URL || "https://jobs.wasfai.com" });
const response = await context.post("/api/auth/qa", { headers: { "X-QA-Auth-Token": token } });
if (!response.ok()) throw new Error(`QA authentication failed: ${response.status()} ${await response.text()}`);
await context.storageState({ path: output });
await context.dispose();
console.log(`Authenticated QA storage created at ${output}`);
