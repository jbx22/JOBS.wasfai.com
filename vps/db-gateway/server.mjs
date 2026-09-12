/**
 * server.mjs — jobs.wasfai.com PostgreSQL gateway.
 *
 * A small, token-authenticated, internal service that lets the Cloudflare edge
 * (Pages Functions and the ingestion Worker) run the application's existing
 * D1-shaped SQL against the dedicated VPS PostgreSQL database. The browser
 * never sees this service, never sees its token, and never talks to PostgreSQL.
 *
 * Security posture:
 *   - reachable only over HTTPS at the reverse proxy, or directly inside the
 *     private container network;
 *   - every request must carry `Authorization: Bearer <GATEWAY_TOKEN>`;
 *   - a single parameterised statement per call; no multi-statement payloads;
 *   - connects as the least-privilege role `jobs_app`, never as a superuser;
 *   - SQL text and bound values are never logged.
 */
import http from "node:http";
import pg from "pg";
import { translateSql, isSingleStatement, countPlaceholders } from "./sql.mjs";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.GATEWAY_TOKEN || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const MAX_SQL_BYTES = 32 * 1024;
const STATEMENT_TIMEOUT_MS = Number(process.env.STATEMENT_TIMEOUT_MS || 15000);

if (!TOKEN) {
  console.error("[gateway] refusing to start: GATEWAY_TOKEN is not set");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("[gateway] refusing to start: DATABASE_URL is not set");
  process.exit(1);
}

// The application expects JavaScript numbers (D1 returns SQLite integers as
// numbers). PostgreSQL hands back int8/numeric as strings by default; the
// migration's widest values are epoch-millisecond counters, far inside the
// exact-integer range, so parsing them as numbers preserves D1 behaviour.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 8),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: "jobs-db-gateway",
});

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_SQL_BYTES) {
        reject(Object.assign(new Error("payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authorized(req) {
  const header = req.headers.authorization || "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  if (bearer.length !== TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i += 1) diff |= bearer.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return diff === 0;
}

async function execute(client, statement) {
  const raw = statement?.sql;
  if (typeof raw !== "string" || !raw.trim()) {
    throw Object.assign(new Error("statement.sql must be a non-empty string"), { statusCode: 400 });
  }
  if (!isSingleStatement(raw)) {
    throw Object.assign(new Error("multi-statement payloads are not allowed"), { statusCode: 400 });
  }
  const sql = translateSql(raw);
  const params = Array.isArray(statement.params) ? statement.params : [];
  const expected = countPlaceholders(raw);
  if (params.length !== expected) {
    throw Object.assign(
      new Error(`parameter count mismatch: ${params.length} bound, ${expected} placeholders`),
      { statusCode: 400 },
    );
  }
  const mode = statement.mode === "run" || statement.mode === "first" ? statement.mode : "all";
  const started = Date.now();
  const result = await client.query({ text: sql, values: params });
  const meta = {
    changes: result.rowCount ?? 0,
    duration: Date.now() - started,
    last_row_id: null,
    rows_read: (result.rows || []).length,
  };
  if (mode === "run") return { results: [], success: true, meta };
  if (mode === "first") return { results: (result.rows || []).slice(0, 1), success: true, meta };
  return { results: result.rows || [], success: true, meta };
}

function sqlErrorStatus(error) {
  // Client-class SQL faults (syntax, constraint, undefined column) are 400;
  // anything else is a server-side fault.
  const code = String(error?.code || "");
  if (/^22|^23|^42|^08|^53/.test(code)) return 400;
  return error?.statusCode || 500;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/healthz" || url.pathname === "/") {
    try {
      await pool.query("SELECT 1");
      return json(res, 200, { ok: true, service: "jobs-db-gateway", database: "up" });
    } catch {
      return json(res, 503, { ok: false, service: "jobs-db-gateway", database: "down" });
    }
  }

  if (!authorized(req)) return json(res, 401, { ok: false, error: "unauthorized" });

  if (url.pathname === "/v1/query" && req.method === "POST") {
    let client;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      client = await pool.connect();
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const payload = await execute(client, body);
      return json(res, 200, { ok: true, ...payload });
    } catch (error) {
      return json(res, sqlErrorStatus(error), { ok: false, error: String(error?.message || error) });
    } finally {
      client?.release();
    }
  }

  if (url.pathname === "/v1/batch" && req.method === "POST") {
    let client;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const statements = Array.isArray(body.statements) ? body.statements : [];
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const results = [];
      for (const statement of statements) results.push(await execute(client, statement));
      await client.query("COMMIT");
      return json(res, 200, { ok: true, results });
    } catch (error) {
      try { await client?.query("ROLLBACK"); } catch { /* already aborted */ }
      return json(res, sqlErrorStatus(error), { ok: false, error: String(error?.message || error) });
    } finally {
      client?.release();
    }
  }

  return json(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway] listening on :${PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
