import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { USERS_SCHEMA, sessionCookie } from "../functions/api/auth/_auth.js";
import { translateSql } from "../vps/db-gateway/sql.mjs";
import { onRequest as recruitment } from "../functions/api/recruitment/[[route]].js";
import { onRequestGet as callback } from "../functions/api/auth/google/callback.js";
import { listPublicJobs } from "../functions/api/_public_jobs.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../functions/api/_subscriptions.js";
import { getJobDb } from "../functions/api/_db.js";
import { testEnv } from "./helpers/gateway.mjs";

test("PostgreSQL: OAuth, employer moderation, public filters and invoice replay execute through translated SQL", {
  skip: process.env.JOBS_TEST_PG_URL ? false : "set JOBS_TEST_PG_URL to test the full PostgreSQL release flow",
}, async (t) => {
  const pgModule = await import(new URL("../vps/db-gateway/node_modules/pg/lib/index.js", import.meta.url));
  const pg = pgModule.default || pgModule;
  const client = new pg.Client({ connectionString: process.env.JOBS_TEST_PG_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    // All tables live in this connection's temporary schema and roll back.
    await client.query("CREATE TEMP TABLE release_probe_seed(id integer)");
    await client.query("SET LOCAL search_path TO pg_temp");
    const execute = async ({ sql, params = [], mode }) => {
      const result = await client.query(translateSql(sql), params);
      return { results: mode === "run" ? [] : mode === "first" ? result.rows.slice(0, 1) : result.rows, meta: { changes: result.rowCount } };
    };
    t.mock.method(globalThis, "fetch", async (url, init = {}) => {
      if (String(url).endsWith("googleapis.com/token")) return Response.json({ access_token: "test-token" });
      if (String(url).includes("openidconnect.googleapis.com")) return Response.json({ sub: "pg-user", email: "pg@example.com", name: "جابر", email_verified: true });
      assert.ok(String(url).startsWith("https://gateway.test/"));
      const body = JSON.parse(init.body);
      if (body.statements) {
        await client.query("SAVEPOINT release_batch");
        try {
          const results = [];
          for (const statement of body.statements) results.push(await execute(statement));
          await client.query("RELEASE SAVEPOINT release_batch");
          return Response.json({ ok: true, results });
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT release_batch");
          throw error;
        }
      }
      return Response.json({ ok: true, ...await execute(body) });
    });
    const db = getJobDb(testEnv);
    await db.prepare(USERS_SCHEMA).run();
    const schema = readFileSync(new URL("../workers/ingestion/schema.sql", import.meta.url), "utf8");
    for (const sql of schema.split(";").map((item) => item.trim()).filter(Boolean)) await db.prepare(sql).run();
    const oauth = await callback({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/auth/google/callback?code=test&state=state", {
      headers: { Cookie: "jobs_oauth_state=state; jobs_oauth_pkce=" + "a".repeat(64) },
    }) });
    assert.equal(oauth.status, 302, await oauth.clone().text());
    const owner = { sub: "pg-owner", email: "jabosaag@gmail.com", name: "Owner" };
    const employer = { sub: "pg-user", email: "pg@example.com", name: "جابر" };
    await db.prepare("INSERT INTO users(id,email,display_name)VALUES(?,?,?)").bind(owner.sub, owner.email, owner.name).run();
    const call = async (user, path, method = "GET", body) => {
      const cookie = (await sessionCookie(user, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
      return recruitment({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/recruitment/" + path, {
        method, headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }) });
    };
    assert.equal((await call(employer, "company", "PUT", { company_name: "PG Company", registration_number: "12345" })).status, 200);
    assert.equal((await call(owner, "moderation/companies/pg-user", "PATCH", { status: "verified", review_note: "Verified for release test" })).status, 200);
    const create = await call(employer, "jobs", "POST", {
      title: "Mechanical Engineer", city: "Riyadh", profession: "Engineering", experience_min: 3, salary_min: 10000, salary_max: 15000,
      description: "Lead engineering design, industrial installation and commissioning with project management and safety responsibilities.",
      valid_through: new Date(Date.now() + 86400000).toISOString(),
    });
    assert.equal(create.status, 201, await create.clone().text());
    const jobId = (await create.json()).id;
    assert.equal((await call(owner, "moderation/jobs/" + jobId, "PATCH", { status: "published", review_note: "Approved for release test" })).status, 200);
    assert.equal((await listPublicJobs(testEnv, { city: "riyadh", min_salary: "12000", experience: "5" })).length, 1);
    const plan = planById("gold_monthly");
    const invoice = { id: "pg-invoice", status: "paid", amount: 5000, currency: "SAR", metadata: { user_id: employer.sub, plan: plan.id } };
    await ensureSubscriptionSchema(db);
    await activatePaidSubscription(db, employer.sub, plan, invoice);
    const replay = await activatePaidSubscription(db, employer.sub, plan, invoice);
    assert.equal(replay.already_activated, true);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
