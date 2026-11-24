/**
 * _db.js — Cloudflare D1-compatible adapter backed by the VPS PostgreSQL gateway.
 *
 * The application's Pages Functions and the ingestion Worker were written
 * against D1 (`prepare` / `bind` / `first` / `all` / `run` / `batch`). This
 * adapter keeps that exact call surface but issues parameterised statements to
 * the token-authenticated gateway that fronts the VPS PostgreSQL database.
 *
 * The browser never receives the gateway URL or token: both are server-side
 * bindings, and every request is made from the Cloudflare edge.
 */

const GATEWAY_TIMEOUT_MS = 15000;

function ensureConfigured(env) {
  const url = env?.JOBS_DB_GATEWAY_URL;
  const token = env?.JOBS_DB_GATEWAY_TOKEN;
  if (!url || !token) return null;
  return { url: String(url).replace(/\/+$/, ""), token: String(token) };
}

class GatewayStatement {
  constructor(client, sql, params = []) {
    this.client = client;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new GatewayStatement(this.client, this.sql, params);
  }

  async #send(mode) {
    const payload = await this.client.request("/v1/query", {
      sql: this.sql,
      params: this.params,
      mode,
    });
    return payload;
  }

  async first(column) {
    const payload = await this.#send("first");
    const row = payload.results?.[0] ?? null;
    if (row === null) return null;
    if (column) return row[column] ?? null;
    return row;
  }

  async all() {
    const payload = await this.#send("all");
    return { results: payload.results || [], success: true, meta: payload.meta || {} };
  }

  async run() {
    const payload = await this.#send("run");
    return { results: [], success: true, meta: payload.meta || {} };
  }

  raw() {
    throw new Error(".raw() is not used by jobs.wasfai.com and is not implemented");
  }
}

class GatewayDatabase {
  constructor(config) {
    this.config = config;
  }

  async request(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${this.config.url}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(`database gateway unreachable: ${error?.message || error}`);
    } finally {
      clearTimeout(timer);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || !payload?.ok) {
      const message = payload?.error || `database gateway error (HTTP ${response.status})`;
      const failure = new Error(message);
      failure.code = payload?.code || "DATABASE_ERROR";
      failure.status = response.status;
      throw failure;
    }
    return payload;
  }

  prepare(sql) {
    return new GatewayStatement(this, sql);
  }

  async batch(statements) {
    const list = Array.isArray(statements) ? statements : [];
    if (!list.length) return [];
    const payload = await this.request("/v1/batch", {
      statements: list.map((statement) => ({
        sql: statement.sql,
        params: statement.params || [],
        mode: statement.mode || "run",
      })),
    });
    return payload.results || [];
  }

  async exec(sql) {
    return this.request("/v1/query", { sql, params: [], mode: "run" });
  }
}

/** Returns a D1-compatible database, or null when the migration bindings are absent. */
export function getJobDb(env) {
  const config = ensureConfigured(env);
  if (!config) return null;
  return new GatewayDatabase(config);
}
