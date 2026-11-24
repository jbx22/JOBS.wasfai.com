import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { onRequest as workspace } from "../functions/api/[[route]].js";
import { onRequestGet } from "../functions/api/jobs/detail.js";
import { SMARTRECRUITERS_BOARDS } from "../workers/ingestion/src/boards.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const schema = readFileSync(new URL("../workers/ingestion/schema.sql", import.meta.url), "utf8");
const origin = "https://jobs.wasfai.com";
const board = SMARTRECRUITERS_BOARDS[0];
const reference = "744000000000123";
const canonicalId = number => board.id + "-" + number;
const postingUrl = number => "https://jobs.smartrecruiters.com/" + board.slug + "/" + number + "-mechanical-engineer";
const upstreamUrl = number => "https://api.smartrecruiters.com/v1/companies/" + board.slug + "/postings/" + number;

function employerDetails(id) {
  return {
    id, name: "Mechanical Engineer", visibility: "PUBLIC", company: { identifier: board.slug, name: board.label },
    location: { city: "Riyadh", country: "sa" }, function: { label: "Engineering" },
    experienceLevel: { label: "Mid-Senior Level" }, typeOfEmployment: { label: "Full-time" },
    jobAd: { sections: {
      jobDescription: { text: "<p>Inspect rotating equipment and plan preventive maintenance.</p>" +
        "<script>private instrumentation label</script><p>" + "Follow the documented maintenance schedule. ".repeat(35) + "End-of-advert marker.</p>" },
      qualifications: { text: "<p>5 years of plant maintenance experience. PMP certification preferred.</p>" },
      companyDescription: { text: "<p>Corporate lobby wallpaper collection.</p>" },
      additionalInformation: { text: "<p>Employee parking access code.</p>" },
    } },
  };
}

function cacheFixture(t) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "caches");
  const entries = new Map();
  const storedTtls = [];
  const cacheUrl = request => typeof request === "string" ? request : request.url || request.href;
  const cache = {
    async match(request) { return entries.get(cacheUrl(request))?.clone(); },
    async put(request, response) {
      const header = response.headers.get("Cache-Control") || "";
      storedTtls.push(Number(/(?:s-maxage|max-age)=(\d+)/i.exec(header)?.[1]));
      entries.set(cacheUrl(request), response.clone());
    },
  };
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: cache } });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, "caches", saved);
    else delete globalThis.caches;
  });
  return storedTtls;
}

function setup(t, officialResponse) {
  const ttls = cacheFixture(t);
  const upstream = [];
  const { db } = gatewayFixture(t, { otherFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input.url || input.href;
    assert.equal(init.method || "GET", "GET");
    assert.equal(init.body, undefined);
    assert.deepEqual([...new Headers(init.headers).keys()].sort(), ["accept", "user-agent"]);
    upstream.push(url);
    return officialResponse(url);
  } });
  db.exec(schema);
  db.prepare("INSERT INTO sources(id,label,url,connector_mode) VALUES(?,?,?,?)")
    .run(board.id, board.label, board.url, board.mode);
  const now = new Date().toISOString();
  function add(number, sourceUrl = postingUrl(number)) {
    const id = canonicalId(number);
    db.prepare(`INSERT INTO jobs(id,source_id,source_url,title,employer,location,description,dedupe_key,verification_status,last_verified_at)
      VALUES (?,?,?,'Mechanical Engineer',?,'Riyadh, Saudi Arabia','المتطلبات والتقديم في الإعلان الرسمي.',?,'live',?)`)
      .run(id,board.id,sourceUrl,board.label,id,now);
    return id;
  }
  async function details(id) {
    const pending = [];
    const request = new Request(origin + "/api/jobs/detail?" + new URLSearchParams({ id: "i-" + id }), { headers: { Cookie: "session=synthetic-test-session" } });
    const response = await onRequestGet({ env: testEnv, request, waitUntil(task) { pending.push(task); } });
    await Promise.all(pending);
    return response;
  }
  return { db, add, details, upstream, ttls };
}

test("browsing makes no employer calls; selecting a vacancy fetches and caches its own factual job details", async t => {
  const { add, details, upstream, ttls } = setup(t, url => Response.json(employerDetails(url.split("/").at(-1))));
  const other = "744000000000124";
  const id = add(reference);
  const otherId = add(other);
  const browse = await workspace({ env: testEnv, request: new Request(origin + "/api/jobs/search") });
  assert.equal(browse.status, 200);
  assert.equal((await browse.json()).total, 2);
  assert.deepEqual(upstream, []);

  const first = await details(id);
  assert.equal(first.status, 200);
  const enriched = (await first.json()).description;
  assert.match(enriched, /rotating equipment/i);
  assert.match(enriched, /5 years/i);
  assert.match(enriched, /PMP/i);
  assert.match(enriched, /Engineering/);
  assert.doesNotMatch(enriched, /wallpaper|parking access|instrumentation label|End-of-advert marker|<\/?p>/i);
  assert.equal((await (await details(id)).json()).description, enriched);
  assert.deepEqual(upstream, [upstreamUrl(reference)]);
  assert.equal((await details(otherId)).status, 200);
  assert.deepEqual(upstream, [upstreamUrl(reference), upstreamUrl(other)]);
  assert.ok(ttls.length >= 2 && ttls.every(ttl => ttl > 0), "success cache entries must expire");
});

test("an upstream outage is cached for less time than a successful vacancy detail", async t => {
  const unavailable = "744000000000125";
  const { add, details, upstream, ttls } = setup(t, url => url === upstreamUrl(reference)
    ? Response.json(employerDetails(reference)) : new Response(null, { status: 503 }));
  const valid = add(reference);
  const failed = add(unavailable);
  await details(valid);
  const successTtl = ttls.at(-1);
  const first = await details(failed);
  const second = await details(failed);
  assert.equal(first.status, second.status);
  assert.deepEqual(upstream, [upstreamUrl(reference), upstreamUrl(unavailable)]);
  assert.ok(ttls.at(-1) > 0 && ttls.at(-1) < successTtl, "temporary failure must recover earlier than a valid cached posting");
});

test("a previously cached posting cannot disclose details after closure or transfer to a private source", async t => {
  const { db, add, details, upstream } = setup(t, () => Response.json(employerDetails(reference)));
  const id = add(reference);
  assert.equal((await details(id)).status, 200);
  db.prepare("UPDATE jobs SET closed_at=? WHERE id=?").run(new Date().toISOString(),id);
  assert.equal((await details(id)).status, 404);
  db.prepare("UPDATE jobs SET closed_at='' WHERE id=?").run(id);
  db.prepare("UPDATE sources SET visibility='private', owner_user_id='private-owner' WHERE id=?").run(board.id);
  assert.equal((await details(id)).status, 404);
  assert.deepEqual(upstream, [upstreamUrl(reference)]);
});

test("untrusted hosts, swapped requisition numbers, and unknown numeric IDs never cause employer requests", async t => {
  const { add, details, upstream } = setup(t, () => { throw new Error("untrusted request"); });
  const swapped = "744000000000223";
  const untrusted = add(reference, "https://unrelated.example/" + board.slug + "/" + reference);
  const wrongNumber = add(swapped, postingUrl("744000000000224"));
  const wrongTenant = add("744000000000225", postingUrl("744000000000225").replace("/" + board.slug + "/", "/OtherEmployer/"));
  for (const id of [untrusted, wrongNumber, wrongTenant, canonicalId("744000000000226"), reference]) await details(id);
  assert.deepEqual(upstream, []);
});

test("an official response for a different, nonpublic or overseas posting never provides selected vacancy requirements", async t => {
  const ids = ["744000000000330", "744000000000331", "744000000000332"];
  const overrides = [{ id: reference }, { visibility: "INTERNAL" }, { location: { country: "us" } }];
  const { add, details, upstream } = setup(t, url => {
    const number = url.split("/").at(-1);
    return Response.json({ ...employerDetails(number), ...overrides[ids.indexOf(number)] });
  });
  for (const number of ids) {
    const result = await details(add(number));
    assert.doesNotMatch(await result.text(), /rotating equipment|certification preferred/i);
  }
  assert.deepEqual(upstream, ids.map(upstreamUrl));
});
