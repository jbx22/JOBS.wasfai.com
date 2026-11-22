import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { onRequest as workspace } from "../functions/api/[[route]].js";
import { listPublicJobs } from "../functions/api/_public_jobs.js";
import { SMARTRECRUITERS_BOARDS } from "../workers/ingestion/src/boards.js";
import ingestion from "../workers/ingestion/src/index.js";
import { fetchSmartRecruitersJobs, parseSmartRecruitersResponse } from "../workers/ingestion/src/smartrecruiters.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const schema = readFileSync(new URL("../workers/ingestion/schema.sql", import.meta.url), "utf8");
const board = SMARTRECRUITERS_BOARDS[0];
const posting = (id, visibility = "PUBLIC") => ({
  id: String(id),
  name: "Electrical Project Engineer",
  releasedDate: "2026-11-22T07:39:13.128Z",
  visibility,
  location: { city: "Riyadh", country: "sa" },
  ref: "https://example.com/untrusted-posting",
  description: "Full employer description",
});

test("Career-Ops adapter pages Saudi public postings and keeps partial successes", async () => {
  const page = Array.from({ length: 100 }, (_, i) => posting(744000000000000 + i));
  const scanned = await fetchSmartRecruitersJobs(board, async (url) => {
    const input = new URL(url);
    assert.equal(input.searchParams.get("country"), "sa");
    assert.equal(input.searchParams.get("destination"), "PUBLIC");
    assert.equal(input.searchParams.get("limit"), "100");
    return input.searchParams.get("offset") === "0" ? { totalFound: 103, content: page }
      : { totalFound: 103, content: [posting(744000000000001), posting(744000000000100), posting(744000000000101)] };
  });
  assert.equal(scanned.complete, true);
  assert.equal(scanned.jobs.length, 102);
  assert.equal(scanned.jobs[0].url, "https://jobs.smartrecruiters.com/AECOM2/744000000000000-electrical-project-engineer");
  assert.ok(!scanned.jobs[0].description.includes("Full employer description"));
  assert.equal(scanned.jobs[0].posted_at, "2026-11-22T07:39:13.128Z");
  assert.deepEqual(parseSmartRecruitersResponse({ content: [null, posting(1, "INTERNAL"), { ...posting(2), location: { country: "us" } }] }, board), []);
  assert.throws(() => parseSmartRecruitersResponse({ error: "unavailable" }, board), /postings list/);

  const partial = await fetchSmartRecruitersJobs(board, async (url) => {
    if (new URL(url).searchParams.get("offset") === "100") throw new Error("source returned 503");
    return { totalFound: 130, content: page };
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.jobs.length, 100);
  assert.match(partial.warning, /503/);
});

test("cron retires the legacy HiringCafe scan and publishes active employer postings by posting ID", async (t) => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const { db, calls } = gatewayFixture(t, { otherFetch(input) {
    assert.ok(String(input).startsWith(board.url));
    return Response.json({ totalFound: 3, content: [
      { ...posting(1), unpublishOn: past },
      { ...posting(2), unpublishOn: future },
      posting(3),
    ] });
  } });
  db.exec(schema);
  db.prepare("UPDATE sources SET enabled=1, connector_mode='public_html', last_error='source returned 403', url='https://hiring.cafe/' WHERE id='hiringcafe'").run();
  const messages = [];
  const env = { ...testEnv, INGESTION_ADMIN_TOKEN: "fixture-token", JOBS_SCAN_QUEUE: { send: async (body) => messages.push(body) } };
  let queued;
  await ingestion.scheduled({}, env, { waitUntil: (task) => { queued = task; } });
  await queued;
  assert.ok(!messages.some(({ id }) => id === "hiringcafe"));
  assert.equal(db.prepare("SELECT enabled FROM sources WHERE id='hiringcafe'").get().enabled, 0);
  const response = await workspace({ env, request: new Request("https://jobs.wasfai.com/api/sources") });
  const portal = (await response.json()).sources.find(({ id }) => id === "hiringcafe");
  assert.equal(portal.url, "https://hiringcafe.com/");
  assert.equal(portal.connector_mode, "portal_only");
  assert.equal(portal.scheduled, false);
  assert.equal(portal.last_error, "");
  const scan = await ingestion.fetch(new Request("https://worker.test/admin/scan-now", {
    method: "POST", headers: { Authorization: "Bearer fixture-token" }, body: '{"id":"hiringcafe"}',
  }), env);
  assert.equal(scan.status, 409);

  for (const body of [{ id: "hiringcafe", force: true }, messages.find(({ id }) => id === board.id)]) {
    await ingestion.queue({ messages: [{ body, ack() {} }] }, env);
  }
  assert.ok(calls.every(({ url }) => !url.includes("hiring.cafe") && !url.includes("hiringcafe.com")));
  const vacancies = await listPublicJobs(env, { city: "الرياض" });
  assert.deepEqual(vacancies.map(({ id }) => id), [`${board.id}-2`, `${board.id}-3`]);
  assert.equal(vacancies[0].valid_through, future);
});
