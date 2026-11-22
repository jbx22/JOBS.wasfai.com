import assert from "node:assert/strict";
import { assertAllowedStatement, countPlaceholders, isSingleStatement, maxPlaceholderIndex, translateSql } from "../../vps/db-gateway/sql.mjs";
import { DatabaseSync } from "node:sqlite";
import { USERS_SCHEMA } from "../../functions/api/auth/_auth.js";

export const testEnv = {
  ENVIRONMENT: "production", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-client-secret",
  AUTH_COOKIE_SECRET: "test-cookie-secret-with-at-least-32-characters",
  JOBS_DB_GATEWAY_URL: "https://gateway.test", JOBS_DB_GATEWAY_TOKEN: "test-gateway",
};

export function gatewayFixture(t, options = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(USERS_SCHEMA);
  const calls = [];
  const identity = options.identity || { sub: "google-user", email: "user@example.com", email_verified: true, name: "جابر حسن" };
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      if (options.providerError) throw new Error("network down");
      return Response.json(options.tokenData || { access_token: "google-access" }, { status: options.tokenStatus || 200 });
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") return Response.json(identity);
    if (url.startsWith("https://gateway.test/")) {
      if (options.storageError) throw new Error("database unavailable");
      const payload = JSON.parse(init.body);
      if (options.beforeQuery) options.beforeQuery(payload, db);
      const execute = ({ sql, params = [], mode }) => {
        assert.ok(isSingleStatement(sql));
        assertAllowedStatement(sql);
        assert.equal(countPlaceholders(sql), params.length);
        assert.equal(maxPlaceholderIndex(translateSql(sql)), params.length);
        const stmt = db.prepare(sql);
        const returnsRows = mode === "all" || mode === "first";
        const results = returnsRows ? (mode === "first" ? [stmt.get(...params)].filter(Boolean) : stmt.all(...params)) : [];
        const changes = returnsRows ? 0 : Number(stmt.run(...params).changes);
        return { results, meta: { changes } };
      };
      try {
        if (url.endsWith("/v1/batch")) {
          db.exec("BEGIN");
          try {
            const results = payload.statements.map(execute);
            db.exec("COMMIT");
            return Response.json({ ok: true, results });
          } catch (error) { db.exec("ROLLBACK"); throw error; }
        }
        return Response.json({ ok: true, ...execute(payload) });
      } catch (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
    if (options.otherFetch) return options.otherFetch(input, init);
    throw new Error("Unexpected external request: " + url);
  });
  t.after(() => { globalThis.fetch = originalFetch; db.close(); });
  const addUser = (status = "active", user = identity) => db.prepare(
    "INSERT INTO users (id, email, display_name, account_status) VALUES (?, ?, ?, ?)",
  ).run(user.sub, user.email, user.name || "", status);
  return { db, calls, identity, addUser };
}
