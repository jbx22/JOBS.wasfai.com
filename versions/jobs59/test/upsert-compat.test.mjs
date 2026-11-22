/**
 * upsert-compat.test.mjs — regression tests for the D1 → PostgreSQL upsert defect.
 *
 * Root cause
 * ----------
 * `INSERT … ON CONFLICT(…) DO UPDATE SET col = col + excluded.col` is accepted
 * by SQLite/D1, but PostgreSQL resolves the bare `col` against both the target
 * row and the special `excluded` row and rejects the statement:
 *
 *     ERROR: column reference "col" is ambiguous
 *
 * The Jobs store moved from Cloudflare D1 to VPS PostgreSQL, so the two
 * statements that used the unqualified form broke in production:
 *   - workers/ingestion/src/index.js  incrementMetric()  → counters froze and
 *     every scanned source was pushed into a bogus `last_error` + 6 h backoff;
 *   - functions/api/_security.js      rate limiter        → protected AI routes
 *     failed on the counter upsert.
 *
 * These tests pin the fix:
 *   1. neither statement keeps an unqualified self-reference;
 *   2. both execute and increment correctly under SQLite (the preserved D1
 *      rollback dialect), exercised through node:sqlite;
 *   3. the gateway's SQLite → PostgreSQL translation keeps them single
 *      statement, fully bound and column-qualified;
 *   4. (opt-in) both increment correctly against a real PostgreSQL instance
 *      when JOBS_TEST_PG_URL is set.
 *
 * Run: node --test test/
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { translateSql, maxPlaceholderIndex, isSingleStatement, countPlaceholders } from "../vps/db-gateway/sql.mjs";
import { METRIC_UPSERT_SQL } from "../workers/ingestion/src/index.js";
import { RATE_LIMIT_UPSERT_SQL } from "../functions/api/_security.js";

const STATEMENTS = [
  ["ingestion_metrics", METRIC_UPSERT_SQL],
  ["api_rate_limits", RATE_LIMIT_UPSERT_SQL],
];

/** The exact defect shape: `SET col = col + …` with an unqualified column. */
const UNQUALIFIED_SELF_ADD = /DO\s+UPDATE\s+SET\s+(\w+)\s*=\s*\1\s*[+\-]/i;

test("upsert statements do not self-reference an unqualified column", () => {
  for (const [name, sql] of STATEMENTS) {
    assert.doesNotMatch(sql, UNQUALIFIED_SELF_ADD, `${name} still uses an unqualified self-reference`);
    assert.match(sql, /DO\s+UPDATE\s+SET\s+\w+\s*=\s*\w+\.\w+\s*\+/i, `${name} must qualify the target column`);
  }
});

test("diagnostic: the pre-fix shape is what PostgreSQL rejects", () => {
  const buggy = "INSERT INTO ingestion_metrics(metric_key, bucket, value, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)\n ON CONFLICT(metric_key, bucket) DO UPDATE SET value=value+excluded.value";
  assert.match(buggy, UNQUALIFIED_SELF_ADD);
  assert.doesNotMatch(METRIC_UPSERT_SQL, UNQUALIFIED_SELF_ADD);
});

test("gateway translation keeps both upserts single-statement, bound and qualified", () => {
  for (const [name, sql] of STATEMENTS) {
    assert.ok(isSingleStatement(sql), `${name} must translate to one statement`);
    assert.equal(countPlaceholders(sql), 3, `${name} binds three parameters`);
    const out = translateSql(sql);
    assert.ok(isSingleStatement(out), `${name} translation must stay a single statement`);
    assert.equal(maxPlaceholderIndex(out), 3, `${name} must expose $1..$3`);
    assert.doesNotMatch(out, /\?/, `${name} must not leak unbound placeholders`);
    assert.doesNotMatch(out, /CURRENT_TIMESTAMP/i, `${name} CURRENT_TIMESTAMP must be rewritten`);
    assert.match(out, /DO\s+UPDATE\s+SET\s+\w+\s*=\s*\w+\.\w+\s*\+/i, `${name} must stay qualified after translation`);
  }
});

test("SQLite/D1: metric upsert inserts then increments", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ingestion_metrics (
    metric_key TEXT NOT NULL,
    bucket TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (metric_key, bucket))`);
  const stmt = db.prepare(METRIC_UPSERT_SQL);
  stmt.run("scan_success", "remotive", 1);
  stmt.run("scan_success", "remotive", 1);
  stmt.run("scan_success", "remotive", 3);
  const row = db.prepare("SELECT value FROM ingestion_metrics WHERE metric_key = 'scan_success' AND bucket = 'remotive'").get();
  assert.equal(row.value, 5, "1 + 1 + 3 must accumulate to 5");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ingestion_metrics").get().n, 1, "the upsert must not create duplicate rows");
});

test("SQLite/D1: rate-limit upsert inserts then increments", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE api_rate_limits (
    user_id TEXT NOT NULL,
    route TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, route, window_start))`);
  const stmt = db.prepare(RATE_LIMIT_UPSERT_SQL);
  stmt.run("u1", "ghostwriter", 1000);
  stmt.run("u1", "ghostwriter", 1000);
  stmt.run("u1", "ghostwriter", 1000);
  assert.equal(db.prepare("SELECT requests FROM api_rate_limits").get().requests, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM api_rate_limits").get().n, 1);
});

/** Resolve `pg` from a local install or from the gateway's own dependency tree. */
async function loadPg() {
  const candidates = ["pg", new URL("../vps/db-gateway/node_modules/pg/lib/index.js", import.meta.url).href];
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      return mod.default ?? mod;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const PG_URL = process.env.JOBS_TEST_PG_URL || "";

test(
  "PostgreSQL: translated upserts increment and roll back cleanly",
  { skip: PG_URL ? false : "set JOBS_TEST_PG_URL to run the PostgreSQL-path test" },
  async () => {
    const pg = await loadPg();
    assert.ok(pg, "the `pg` module must be resolvable to run the PostgreSQL-path test");
    const client = new pg.Client({ connectionString: PG_URL });
    await client.connect();
    const stamp = Date.now();
    const bucket = `__compat_${stamp}`;
    const user = `__compat_${stamp}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TABLE IF NOT EXISTS ingestion_metrics (
        metric_key text NOT NULL, bucket text NOT NULL,
        value bigint NOT NULL DEFAULT 0, updated_at text NOT NULL DEFAULT '',
        PRIMARY KEY (metric_key, bucket))`);
      await client.query(`CREATE TABLE IF NOT EXISTS api_rate_limits (
        user_id text NOT NULL, route text NOT NULL, window_start bigint NOT NULL,
        requests bigint NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, route, window_start))`);

      const metricSql = translateSql(METRIC_UPSERT_SQL);
      await client.query(metricSql, ["scan_success", bucket, 1]);
      await client.query(metricSql, ["scan_success", bucket, 1]);
      await client.query(metricSql, ["scan_success", bucket, 3]);
      const metric = await client.query("SELECT value FROM ingestion_metrics WHERE metric_key = $1 AND bucket = $2", ["scan_success", bucket]);
      assert.equal(metric.rows.length, 1, "upsert must not duplicate the metric row");
      assert.equal(Number(metric.rows[0].value), 5, "1 + 1 + 3 must accumulate to 5 on PostgreSQL");

      const rateSql = translateSql(RATE_LIMIT_UPSERT_SQL);
      await client.query(rateSql, [user, "ghostwriter", 1000]);
      await client.query(rateSql, [user, "ghostwriter", 1000]);
      await client.query(rateSql, [user, "ghostwriter", 1000]);
      const rate = await client.query("SELECT requests FROM api_rate_limits WHERE user_id = $1", [user]);
      assert.equal(rate.rows.length, 1);
      assert.equal(Number(rate.rows[0].requests), 3);

      await client.query("ROLLBACK");

      const residue = await client.query("SELECT COUNT(*)::int AS n FROM ingestion_metrics WHERE bucket = $1", [bucket]);
      assert.equal(residue.rows[0].n, 0, "the rolled-back probe must leave no rows behind");
    } finally {
      await client.end().catch(() => {});
    }
  },
);
