import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { onRequest } from '../functions/api/[[route]].js';
import { sessionCookie } from '../functions/api/auth/_auth.js';
import { gatewayFixture, testEnv } from './helpers/gateway.mjs';

const schema = readFileSync(new URL('../workers/ingestion/schema.sql', import.meta.url), 'utf8');
const origin = 'https://jobs.wasfai.com';

function catalog(t) {
  const fixture = gatewayFixture(t);
  fixture.db.exec(schema);
  fixture.db.exec("INSERT INTO sources(id,label,url) VALUES('a','First','https://one.test'),('b','Second','https://two.test')");
  const now = new Date().toISOString();
  const insert = fixture.db.prepare(`INSERT INTO jobs(id, source_id, source_url, title, employer, location, description, dedupe_key, verification_status, last_verified_at, discovered_at, posted_at)
    VALUES (?, ?, ?, ?, 'Test Company', 'Riyadh', ?, ?, 'live', ?, ?, ?)`);
  return { ...fixture, add(id, { source = 'a', url = 'https://one.test/jobs/'+id, title = 'Mechanical Engineer',
    description = 'Mechanical engineering, maintenance inspections and quality management.', date = now, discovered = now } = {}) {
    insert.run(id, source, url, title, description, id, now, discovered, date);
  }};
}

async function browse(query = {}) {
  return onRequest({ env: testEnv, request: new Request(origin + '/api/jobs/search?' + new URLSearchParams(query)) });
}

async function match(tester, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (tester) headers.Cookie = (await sessionCookie(tester, testEnv.AUTH_COOKIE_SECRET)).split(';')[0];
  return onRequest({ env: testEnv, request: new Request(origin + '/api/jobs/match', { method: 'POST', headers, body: JSON.stringify(body) }) });
}

test('anonymous browse has exact filtered totals, stable tie ordering, conservative URL deduplication and current vacancies', async t => {
  const { db, add } = catalog(t);
  const date = new Date(Date.now() - 3600000).toISOString();
  add('aa', { date, description: 'Designs 100% quality plans' });
  add('aa-other-board', { source: 'b', url: 'https://one.test/jobs/aa/', date, description: 'Designs 100% quality plans' });
  add('ab', { date });
  add('ac', { date });
  add('closed', { date }); db.prepare("UPDATE jobs SET closed_at=? WHERE id='closed'").run(date);
  add('not-published-yet', { date: '2099-01-01T00:00:00Z' });
  add('disabled-source', { source:'b', date }); db.prepare("UPDATE jobs SET verification_status='unverified' WHERE id='disabled-source'").run();
  const response = await browse({ limit: 2, city: 'الرياض', q: 'Test Mechanical' });
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.deepEqual(first.jobs.map(job => job.id), ['aa', 'ab']);
  assert.equal(first.jobs[0].public_url, '/vacancies/i-aa');
  assert.equal(first.total,3); assert.equal(first.has_more,true); assert.equal(first.next_offset,2);
  add('a-new', {date, discovered: new Date(Date.parse(first.as_of) + 30_000).toISOString()});
  const second = await (await browse({ limit:2, offset:first.next_offset, city:'الرياض', q:'Test Mechanical', as_of:first.as_of })).json();
  assert.deepEqual(second.jobs.map(job => job.id), ['ac']);
  assert.equal(second.total,3); assert.equal(second.has_more,false); assert.equal(second.next_offset,null);
  assert.deepEqual((await (await browse({q:'100%'})).json()).jobs.map(job => job.id),['aa']);
  const empty = await (await browse({q:'-', offset:900})).json();
  assert.deepEqual(empty.jobs,[]); assert.equal(empty.next_offset,null);
  assert.equal((await browse({ offset:-1 })).status,400);
  assert.equal((await browse({ experience:'n/a' })).status,400);
});

test('personalized pages score older vacancies beyond the former 1000-candidate cutoff and report all matches', async t => {
  const { add, addUser } = catalog(t);
  const tester = { sub:'test-candidate',email:'candidate@example.org',name:'Inventory Candidate' };
  addUser('active',tester);
  const date = new Date(Date.now() - 3600000).toISOString();
  const older = new Date(Date.now() - 86400000).toISOString();
  for (let n=0; n<1005; n++) add('filler-'+n, {title:'Network Administrator',description:'Maintain computer network equipment.',date});
  for (const id of ['older-b','older-a','older-c']) add(id,{date:older});
  const body = { profile: {target_roles:'Mechanical Engineer',target_locations:'Riyadh',resume_skills:'mechanical, maintenance'}, limit:2 };
  assert.equal((await match(null,body)).status,401);
  const response = await match(tester,body); assert.equal(response.status,200);
  const first = await response.json();
  assert.equal(first.total,3);assert.equal(first.matched,3);assert.equal(first.next_offset,2);
  assert.deepEqual(first.jobs.map(job => job.id), ['older-a','older-b']);
  assert.ok(first.jobs.every(job=>job.match_eligible));
  const second=await (await match(tester,{...body,offset:first.next_offset,as_of:first.as_of})).json();
  assert.deepEqual(second.jobs.map(job => job.id), ['older-c']); assert.equal(second.has_more,false);
  const filtered=await (await match(tester,{...body,filters:{city:'Jeddah'}})).json();
  assert.equal(filtered.total,0);assert.deepEqual(filtered.jobs,[]);
});

test('Arabic title queries find bilingual equivalents and keep additional terms mandatory', async t => {
  const { db, add } = catalog(t);
  add('mechanical', { title: 'Senior Mechanical Engineer' });
  add('design', { title: 'Lead - Mechanical Design' });
  add('other-city', { title: 'Mechanical Engineer' });
  db.prepare("UPDATE jobs SET location='Dammam' WHERE id='other-city'").run();
  add('factory', { title: 'Plant Production Manager' });
  add('unrelated-manager', { title: 'Marketing Manager', description: 'Reports to the plant manager' });
  add('unrelated-engineer', { title: 'Civil Engineer', description: 'Works with mechanical design leads.' });
  const ids = async params => (await (await browse(params)).json()).jobs.map(job => job.id).sort();
  assert.deepEqual(await ids({q:'مهندس ميكانيكي الرياض'}), ['design','mechanical']);
  assert.deepEqual(await ids({q:'مدير مصنع'}), ['factory']);
  assert.deepEqual(await ids({q:'مدير مصنع other-company'}), []);
  assert.deepEqual(await ids({profession:'مهندس ميكانيكي',city:'Dammam'}), ['other-city']);
});
