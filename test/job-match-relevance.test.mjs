import assert from "node:assert/strict";
import test from "node:test";
import { cityAliases, matchJob, normalizeProfile } from "../workers/ingestion/src/index.js";

const industrial = {
  target_roles: "مستشار صناعي، مهندس ميكانيكي، مهندس، مدير مشاريع",
  target_locations: "جازان",
  resume_skills: "مضخات، الصيانة، إدارة المشاريع، القيادة",
  resume_text: "Software reporting dashboard, industrial client, English, technology",
};
const job = { location: "Jizan, Saudi Arabia", employer: "Industrial Machinery", sector: "Manufacturing" };
const match = (title, description, profile = industrial, overrides = {}) =>
  matchJob({ ...job, title, description, ...overrides }, normalizeProfile(profile));
const dimension = (result, key) => result.match_breakdown.find(item => item.key === key);

test("a consultant's generic titles, city, sector and management skills cannot qualify an unrelated occupation", () => {
  for (const title of [
    "Software Engineer", "Site Reliability Engineer", "IT Project Manager",
    "Industrial Sales Engineer", "Sales Operations Manager", "Media Production Engineer",
    "مهندس برمجيات", "مدير مشاريع تقنية المعلومات", "مهندس مبيعات معدات صناعية",
  ]) {
    const result = match(title, "Leadership, project management, pumps and maintenance for industrial customers.");
    assert.equal(result.match_eligible, false, title);
    assert.equal(dimension(result, "role").points, 0, title);
    assert.equal(result.fit_grade, "F", title);
    assert.equal(result.match_confidence, "low", title);
  }
  assert.equal(match("Project Manager", "Own software delivery and maintenance of web applications.").match_eligible, false);
});

test("direct English/Arabic occupational equivalents and supported industrial responsibilities qualify", () => {
  const direct = match("Senior Mechanical Engineer", "Design industrial equipment and supervise pumps and maintenance.");
  const related = match("Reliability Engineer", "Lead inspection and maintenance of rotating equipment and pumps.");
  const alternative = match("Operations Manager", "Manage machinery maintenance and factory operations.");
  assert.equal(dimension(direct, "role").points, 36);
  assert.ok(direct.match_eligible && related.match_eligible && alternative.match_eligible);
  assert.ok(direct.score > related.score);
  assert.ok(dimension(related, "skills").evidence.includes("الصيانة"));
  assert.equal(match("Industrial Consultant", "", { target_roles: "مستشار صناعي معتمد", target_locations: "جازان" }).match_eligible, true);
  assert.equal(match("مهندس ميكانيكي", "فحص مضخات المعدات الدوارة", {
    target_roles: "Mechanical Engineer", target_locations: "Jazan", resume_skills: "pumps",
  }).match_eligible, true);
  assert.equal(match("Reliability Engineer", "Improve industrial equipment and leadership.", {
    ...industrial, target_roles: "Mechanical Engineer", resume_skills: "leadership, reporting",
  }).match_eligible, false);
});

test("specific alternative occupations stay valid while generic titles need independent field evidence", () => {
  assert.equal(match("Industrial Sales Engineer", "Sales for industrial customers and pumps.", {
    ...industrial, target_roles: "Industrial Sales Engineer", resume_skills: "sales",
  }).match_eligible, true);
  assert.equal(match("Senior Software Developer", "Build front-end applications for manufacturers.", {
    target_roles: "Mechanical Engineer, Software Engineer", target_locations: "جازان",
  }).match_eligible, true);
  assert.equal(match("Financial Analyst", "Manage financial budgets and reporting.", {
    target_roles: "محلل مالي", target_locations: "جازان",
  }).match_eligible, true);
  assert.equal(match("SOC Analyst", "Risk management and reporting.", {
    target_roles: "Financial Analyst, Analyst", resume_skills: "Risk Management", target_locations: "جازان",
  }).match_eligible, false);
  assert.equal(match("Software Engineer", "Lead risk management.", {
    target_roles: "Engineer", resume_skills: "risk management", target_locations: "جازان",
  }).match_eligible, false);
  assert.equal(match("Software Engineer", "Write TypeScript components.", {
    target_roles: "Engineer", resume_skills: "TypeScript", target_locations: "جازان",
  }).match_eligible, true);
});

test("employer, city and raw résumé vocabulary aren't evidence of skills or role", () => {
  const result = match("Registered Nurse", "Provide inpatient care.", { ...industrial, resume_skills: "industrial machinery, jizan" });
  assert.equal(dimension(result, "skills").points, 0);
  assert.equal(dimension(result, "role").points, 0);
  assert.equal(result.match_eligible, false);
});

test("Saudi city aliases work in both directions and distinguish city from region", () => {
  assert.ok(cityAliases("JIZAN").includes("جازان"));
  assert.ok(cityAliases("نجران").includes("najran"));
  assert.ok(cityAliases("عسير").includes("abha"));
  assert.ok(!cityAliases("أبها").includes("خميس مشيط"));
  assert.equal(match("Mechanical Engineer", "maintenance", { ...industrial, target_locations: "نجران" }).match_eligible, false);
  assert.equal(match("Mechanical Engineer", "maintenance", { ...industrial, target_locations: "عسير" }, { location: "Abha" }).match_eligible, true);
});

test("technical lead and equipment maintenance titles can fit executive engineers while specialist prerequisites stay visible", () => {
  const profile = {
    target_roles: "Mechanical Engineer, Industrial Consultant, Factory Design Consultant, General Manager, Plant Manager, Operations Director, Maintenance Manager, Project Manager, Engineering Director, Industrial Development Consultant",
    target_locations: "Saudi Arabia, MENA",
    resume_seniority: "Director / Executive",
    resume_skills: "project management, maintenance",
  };
  const design = match("Mechanical Design Lead", "Supervise design reviews.", profile, { location: "Jeddah" });
  const equipment = match("Maintenance & Equipment Engineer (Aviation Exp)", "Maintain airport equipment.", profile, { location: "Riyadh" });
  assert.equal(design.match_eligible, true);
  assert.equal(equipment.match_eligible, true);
  assert.deepEqual(equipment.requirements_to_verify, ["Aviation Exp"]);
  assert.ok(equipment.match_evidence.every(x => !/aviation/i.test(x)));
  assert.match(equipment.fit_explanation, /Verify with the employer: Aviation Exp/);
  for (const title of ["Senior Back-end Developer", "Tech Lead Full-stack", "IT Project Manager", "Junior Mechanical Engineer"]) {
    assert.equal(match(title, "Industrial project management with maintenance stakeholders.", profile, { location: "Riyadh" }).match_eligible, false, title);
  }
});
