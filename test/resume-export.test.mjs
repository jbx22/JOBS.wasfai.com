import test from "node:test";
import assert from "node:assert/strict";
import { buildDocx } from "../public/resume-docx.mjs";
import { onRequestPost as exportKit } from "../functions/api/export-package.js";
import { sessionCookie } from "../functions/api/auth/_auth.js";
import { gatewayFixture, testEnv } from "./helpers/gateway.mjs";

const experience = Array.from({ length: 100 }, (_, i) =>
  `Role ${i + 1} – operated the measurement equipment & documented <observations>.`);
const englishResume = ["Applicant", ...experience, "Final publication"].join("\n");
const arabicResume = ["المرشح", "الخبرة العملية", "فحص المعدات وراجع النتائج", "آخر شهادة"].join("\n");
const kit = {
  job_id: "inventory", ar_resume: arabicResume, en_resume: englishResume,
  ar_cover_letter: "تحية لفريق التوظيف", en_cover_letter: "Dear hiring team",
  en_interview_prep: ["PRIVATE INTERVIEW NOTES"], quality_review: { approved: true },
};

test("the Word builder preserves long multilingual text, final sections and paragraph direction", () => {
  const english = Buffer.from(buildDocx(englishResume, "en")).toString("utf8");
  assert.ok(english.includes("Role 100 – operated the measurement equipment &amp; documented &lt;observations&gt;."));
  assert.ok(english.includes("Final publication"));
  assert.equal((english.match(/<w:p>/g) || []).length, experience.length + 2);
  assert.ok(!english.includes("<w:bidi/>"));
  const arabic = Buffer.from(buildDocx(arabicResume, "ar")).toString("utf8");
  assert.ok(arabic.includes("<w:bidi/>"));
  assert.ok(arabic.includes("آخر شهادة"));
});

test("a reviewed job résumé downloads independently in the selected language, without cover letters or interview notes", async (t) => {
  const { addUser } = gatewayFixture(t);
  addUser();
  const cookie = (await sessionCookie({ sub: "google-user" }, testEnv.AUTH_COOKIE_SECRET)).split(";")[0];
  async function request(document, currentKit = kit) {
    return exportKit({ env: testEnv, request: new Request("https://jobs.wasfai.com/api/export-package", {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ format: "docx", document, kit: currentKit,
        job: { id: "inventory", title: "Coordinator", employer: "Example Co" },
        profile: { display_name: "Test Applicant", resume_text: englishResume },
      }),
    }) });
  }
  for (const [document, lastSection, excluded] of [
    ["en_resume", "Final publication", "آخر شهادة"],
    ["ar_resume", "آخر شهادة", "Final publication"],
  ]) {
    const response = await request(document);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Disposition"), new RegExp(`-cv-${document.slice(0, 2)}\\.docx`));
    const bytes = Buffer.from(await response.arrayBuffer()).toString("utf8");
    assert.ok(bytes.includes(lastSection));
    for (const other of [excluded, kit.en_cover_letter, kit.ar_cover_letter, ...kit.en_interview_prep]) {
      assert.ok(!bytes.includes(other));
    }
  }
  assert.equal((await request("en_resume", { ...kit, quality_review: null })).status, 409);
  assert.equal((await request("unknown")).status, 400);
});
