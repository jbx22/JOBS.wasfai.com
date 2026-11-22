import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GOVERNMENT_BOARDS, SOURCE_CONNECTORS } from "../workers/ingestion/src/boards.js";
import { GOVERNMENT_DESCRIPTION, parseGovernmentPosting, parseGovernmentSitemap } from "../workers/ingestion/src/government.js";
import ingestion, { parseSourcePayload } from "../workers/ingestion/src/index.js";
import { listPublicJobs } from "../functions/api/_public_jobs.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const schema = readFileSync(new URL("../workers/ingestion/schema.sql", import.meta.url), "utf8");
const board = GOVERNMENT_BOARDS[0];
const posting = new URL("/job/Riyadh-Inventory-Coordinator/100001/", board.portal).href;
const duplicateTitle = new URL("/job/Riyadh-Inventory-Coordinator/100002/", board.portal).href;
const expired = new URL("/job/Riyadh-Inventory-Coordinator/100003/", board.portal).href;
const unavailable = new URL("/job/Riyadh-Inventory-Coordinator/100004/", board.portal).href;
const sitemap = (...links) => `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${links.map((link) => `<url><loc>${link}</loc></url>`).join("")}</urlset>`;
const page = (validThrough = "") => `<div itemscope="itemscope" itemtype="https://schema.org/JobPosting"><h1 itemprop="title">منسق المخزون &amp; الإمداد</h1>
  <meta content="Riyadh, SA" itemprop="streetAddress"><meta itemprop="datePosted" content="Sun Nov 22 00:00:00 UTC 2026">
  ${validThrough ? `<meta itemprop="validThrough" content="${validThrough}">` : ""}<span itemprop="description">Full original posting text</span></div>`;

test("official sitemaps accept canonical job pages only, dedupe requisitions and distinguish unavailable feeds", () => {
  const urls = parseGovernmentSitemap(sitemap(posting, duplicateTitle, `${posting}?locale=ar_SA`, "https://example.com/job/Riyadh/100001/", `${board.portal}talentcommunity/apply/100001/`), board);
  assert.deepEqual(urls.map((job) => job.url), [posting, duplicateTitle]);
  assert.deepEqual(parseGovernmentSitemap(sitemap(), board), []);
  assert.throws(() => parseGovernmentSitemap("<html>Unavailable</html>", board), /invalid XML/);
  assert.equal(SOURCE_CONNECTORS.includes(board.mode), false);
  const first = parseGovernmentPosting(page("Fri Nov 27 21:00:00 UTC 2026"), urls[0], board);
  assert.equal(first.title, "منسق المخزون & الإمداد");
  assert.equal(first.location, "Riyadh, Saudi Arabia");
  assert.equal(first.valid_through, "2026-11-27T21:00:00.000Z");
  assert.equal(first.description, GOVERNMENT_DESCRIPTION);
  assert.equal(parseGovernmentPosting("<p>This position has been filled</p>", urls[0], board), null);
  assert.throws(() => parseGovernmentPosting("<p>Unexpected server maintenance</p>", urls[0], board), /missing its job metadata/);
});

test("production-style scan publishes active official jobs with distinct IDs and supports government filtering", async (t) => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const past = new Date(Date.now() - 86400_000).toISOString();
  const requested = [];
  const { db, calls } = gatewayFixture(t, { otherFetch(url) {
    requested.push(url);
    if (url === board.url) return new Response(sitemap(posting, duplicateTitle, expired, unavailable, "https://example.com/job/Riyadh/100004/"), { headers: { "Content-Type": "text/xml" } });
    if (url === unavailable) return new Response("Temporarily unavailable", { status: 503 });
    assert.ok([posting, duplicateTitle, expired].includes(url));
    return new Response(page(url === expired ? past : future), { headers: { "Content-Type": "text/html" } });
  } });
  db.exec(schema);
  db.prepare("INSERT INTO sources(id,label,url,region,connector_mode) VALUES(?,?,?,?,?)").run(board.id, board.label, board.url, board.region, board.mode);
  let ack = false;
  await ingestion.queue({ messages: [{ body: { id: board.id }, ack: () => { ack = true; } }] }, testEnv);
  assert.ok(ack);
  assert.equal(requested.length, 5);
  assert.match(db.prepare("SELECT last_error FROM sources WHERE id=?").get(board.id).last_error, /1 of 4 details/);
  const jobs = await listPublicJobs(testEnv, { sector: "government", city: "الرياض" });
  assert.deepEqual(jobs.map((job) => job.id), [`${board.id}-100001`, `${board.id}-100002`]);
  assert.ok(jobs.every((job) => job.government && job.valid_through === future));
  assert.equal(calls.filter((x) => x.url.endsWith("/v1/batch") && x.init.body.includes("INSERT INTO jobs")).length, 1);
});

test("general feeds retain later requirements and reject malformed response shapes", () => {
  const source = { connector_mode: "public_json", label: "Board", url: "https://jobs.example.com/feed" };
  const description = `<p>${"Experience with project schedules and budgeting. ".repeat(44)}</p><h2>Requirements</h2><ul><li>Relevant professional certification</li></ul>`;
  const jobs = parseSourcePayload(JSON.stringify({ jobs: [{ title: "Project Manager", url: "https://jobs.example.com/job/1", description }, { title: "Project Manager", url: "https://jobs.example.com/job/2" }] }), source);
  assert.equal(jobs.length, 1);
  assert.ok(jobs[0].description.includes("\nRequirements\n- Relevant professional certification"));
  assert.throws(() => parseSourcePayload("{}", source), /did not contain a job list/);
  assert.deepEqual(parseSourcePayload("{\"jobs\":[]}", source), []);
});
