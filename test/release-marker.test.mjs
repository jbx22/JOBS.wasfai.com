/**
 * release-marker.test.mjs — regression tests for the public release marker.
 *
 * The Pages deploy previously had no first-class release identity: the only
 * deployed constant was the service worker's CACHE_NAME, a cache key that is
 * neither a release constant nor a readable API contract. `GET /api/version`
 * now publishes `JOBS_RELEASE`, and these tests pin two properties:
 *
 *   1. the constant tracks `VERSION.json` (`current`), so the live marker and
 *      the repo's release source of truth cannot drift;
 *   2. the endpoint stays unauthenticated, uncached and read-only, and exposes
 *      nothing beyond the version string.
 *
 * Run: node --test test/
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { JOBS_RELEASE, onRequest } from "../functions/api/version.js";

const VERSION = JSON.parse(readFileSync(new URL("../VERSION.json", import.meta.url), "utf8"));

const call = (method = "GET") =>
  onRequest({ request: new Request("https://jobs.wasfai.com/api/version", { method }) });

test("the release constant tracks VERSION.json", () => {
  assert.match(JOBS_RELEASE, /^jobs\d+$/);
  assert.equal(JOBS_RELEASE, "jobs" + VERSION.current);
  assert.equal(VERSION.history.at(-1).n, VERSION.current);
});

test("GET /api/version publishes the release without credentials", async () => {
  const res = await call("GET");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-jobs-release"), JOBS_RELEASE);
  assert.match(res.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await res.json(), { status: "ok", release: JOBS_RELEASE });
});

test("the marker stays secret-free and minimal", async () => {
  const body = JSON.stringify(await (await call("GET")).json());
  assert.equal(body, `{"status":"ok","release":"${JOBS_RELEASE}"}`);
  assert.doesNotMatch(body, /token|secret|password|\/api\/admin|user|email/i);
});

test("unsupported methods are rejected without touching the app", async () => {
  const res = await call("POST");
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET, HEAD");
  assert.equal((await res.json()).code, "METHOD_NOT_ALLOWED");
});
