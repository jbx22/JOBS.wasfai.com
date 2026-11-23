import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { USERS_SCHEMA, sessionCookie } from "../functions/api/auth/_auth.js";
import { translateSql } from "../vps/db-gateway/sql.mjs";
import { onRequest as recruitment } from "../functions/api/recruitment/[[route]].js";
import { onRequest as admin } from "../functions/api/admin/[[route]].js";
import { onRequestGet as callback } from "../functions/api/auth/google/callback.js";
import { onRequestPost as selectPlan } from "../functions/api/subscriptions/index.js";
import { listPublicJobs } from "../functions/api/_public_jobs.js";
import { activatePaidSubscription, ensureSubscriptionSchema, planById } from "../functions/api/_subscriptions.js";
import { getJobDb } from "../functions/api/_db.js";
import { readUserState, writeUserState } from "../functions/api/_state.js";
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
      if (String(url) === "https://api.moyasar.com/v1/invoices") {
        const order = JSON.parse(init.body);
        return Response.json({ id: "pg-checkout", status: "initiated", amount: order.amount, currency: order.currency,
          metadata: order.metadata, url: "https://checkout.moyasar.com/invoices/pg-checkout" });
      }
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
    await ensureSubscriptionSchema(db);
    const plan = planById("gold_monthly");
    const legacyEnd = "2026-12-01";
    await db.prepare("INSERT INTO subscriptions(user_id,plan,status,current_period_end) VALUES(?,?,?,?)")
      .bind("legacy-user", plan.id, "active", legacyEnd).run();
    await db.prepare("INSERT INTO subscription_payments(user_id,plan,provider_invoice_id,status) VALUES(?,?,?,?)")
      .bind("legacy-user", plan.id, "legacy-invoice", "paid").run();
    const migrationScript = fileURLToPath(new URL("../tools/migration/jobs59-postgres.mjs", import.meta.url));
    const migrationSql = execFileSync(process.execPath, [migrationScript], { encoding: "utf8" });
    await client.query(migrationSql);
    await client.query(migrationSql);
    const legacyInvoice = { id: "legacy-invoice", status: "paid", amount: 5000, currency: "SAR", metadata: { user_id: "legacy-user", plan: plan.id } };
    assert.equal((await activatePaidSubscription(db, "legacy-user", plan, legacyInvoice)).already_activated, true);
    assert.equal((await db.prepare("SELECT current_period_end FROM subscriptions WHERE user_id=?").bind("legacy-user").first()).current_period_end, legacyEnd);
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
    const invoice = { id: "pg-invoice", status: "paid", amount: 5000, currency: "SAR", metadata: { user_id: employer.sub, plan: plan.id } };
    await activatePaidSubscription(db, employer.sub, plan, invoice);
    const replay = await activatePaidSubscription(db, employer.sub, plan, invoice);
    assert.equal(replay.already_activated, true);
    const cookie = (await sessionCookie(employer, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
    const checkout = () => selectPlan({ env: { ...testEnv, MOYASAR_SECRET_KEY: "sk_live_fixture" }, request: new Request("https://jobs.wasfai.com/api/subscriptions", {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ plan: plan.id }),
    }) });
    const created = await checkout();
    assert.equal(created.status, 201, await created.clone().text());
    const order = await created.json();
    const reopened = await checkout();
    assert.equal(reopened.status, 201, await reopened.clone().text());
    assert.equal((await reopened.json()).order_id, order.order_id);
    const adminCookie = (await sessionCookie(owner, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
    const operate = (path, method = "GET", body) => admin({ env: testEnv,
      request: new Request("https://jobs.wasfai.com/api/admin/" + path, {
        method, headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      }),
    });
    const ticket = await operate("support", "POST", {
      subject: "Invoice query", requester_email: employer.email, priority: "normal", summary: "Asked about an invoice.",
    });
    assert.equal(ticket.status, 201, await ticket.clone().text());
    const { id: caseId } = await ticket.json();
    const resolve = await operate("support/" + caseId, "PATCH", {
      status: "resolved", note: "Reviewed", version: 1, assign_to_me: true,
    });
    assert.equal(resolve.status, 200, await resolve.clone().text());
    const marketing = await operate("marketing", "POST", {
      name: "Recruiter pilot", source: "newsletter", medium: "email", slug: "pg-pilot", landing: "/employers",
    });
    assert.equal(marketing.status, 201, await marketing.clone().text());
    const register = await operate("accounting");
    assert.equal(register.status, 200, await register.clone().text());
    const { rows } = await register.json();
    const payment = rows.find(row => row.provider_invoice_id === "pg-checkout");
    assert.ok(payment);
    const review = await operate("accounting/" + payment.id, "POST", {
      status: payment.status, amount_halalas: Number(payment.amount_halalas), reference: "PG statement 01",
    });
    assert.equal(review.status, 200, await review.clone().text());
    const initialState = await readUserState(db, owner);
    const stored = await writeUserState(db, owner, { ...initialState, jobs: [{ id: "pg-workspace-job", status: "applied" }] },
      { expectedRevisions: initialState.__revisions });
    assert.equal(stored.__revisions.jobs, 1);
    assert.equal((await db.prepare("SELECT status FROM applications WHERE user_id=? AND job_id=?")
      .bind(owner.sub, "pg-workspace-job").first()).status, "applied");
    const budgetEdit = await operate("subscribers/" + employer.sub, "PATCH", { ai_monthly_limit_usd: 22 });
    assert.equal(budgetEdit.status, 200, await budgetEdit.clone().text());
    const edited = await budgetEdit.json();
    assert.equal(edited.plan, "gold_monthly");
    assert.equal(edited.status, "active");
    assert.ok(edited.current_period_end);
    const { rows: audits } = await client.query("SELECT action FROM audit_logs WHERE resource_type IN ('support_case','campaign','subscription_payment') ORDER BY id");
    assert.deepEqual(audits.map(row => row.action), ["support.create", "support.update", "marketing.create", "accounting.review"]);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
