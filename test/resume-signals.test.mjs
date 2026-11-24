import test from "node:test";
import assert from "node:assert/strict";
import { inferResumeSignals, readableResumeText } from "../public/resume-signals.js";

test("unlabelled English header and standalone sections retain the actual job title and lines", () => {
  const text = ["Curriculum Vitae", "Mary Lawson", "Inventory Coordinator | Warehouse Operations",
    "Professional Summary", "Supports a mechanical engineering team. Works on an English-language system.",
    "Skills", "Stock reconciliation", "SAP", "Professional Experience", "Maintenance Manager",
    "Achievements", "Reduced counting errors through routine reconciliation.", "Education", "Bachelor of Science"].join("\n");
  const r = inferResumeSignals(text);
  assert.equal(r.display_name, "Mary Lawson");
  assert.equal(r.target_roles, "Inventory Coordinator");
  assert.equal(r.resume_skills, "Stock reconciliation, SAP");
  assert.equal(r.resume_languages, "");
  assert.equal(r.resume_seniority, "");
  assert.match(r.resume_work_examples, /^Reduced counting errors/);
});

test("Arabic plain names, role headlines, compound skills headings and explicit languages survive", () => {
  const text = ["السيرة الذاتية", "م/ ريم ناصر يوسف", "مهندسة مدنية | إشراف ميداني", "الملخص المهني",
    "متابعة عقود المشاريع الهندسية", "المهارات الفنية والإدارية", "تقييم العطاءات", "تخطيط الموارد",
    "اللغات", "العربية – اللغة الأم", "الفرنسية – متوسط", "التعليم", "بكالوريوس الهندسة"].join("\n");
  const r = inferResumeSignals(text);
  assert.equal(r.display_name, "ريم ناصر يوسف");
  assert.equal(r.target_roles, "مهندسة مدنية");
  assert.equal(r.resume_skills, "تقييم العطاءات, تخطيط الموارد");
  assert.equal(r.resume_languages, "العربية – اللغة الأم, الفرنسية – متوسط");
});

test("chooses an evidenced role inside experience and a plain-text language declaration", () => {
  const r = inferResumeSignals("Name: Taylor Quinn\nProfessional Profile\nProject management experience in manufacturing\nWork Experience\nData Analyst at Example\nFluent in French and Spanish");
  assert.equal(r.display_name, "Taylor Quinn");
  assert.equal(r.target_roles, "Data Analyst");
  assert.equal(r.resume_languages, "Fluent in French and Spanish");
  assert.equal(inferResumeSignals("Proficient in SAP and Excel").resume_languages, "");
  assert.equal(inferResumeSignals("Skills\nProject management\nEducation\nMaster of Engineering").target_roles, "");
});

test("compound headlines preserve the occupation and table cells exclude headings and pagination", () => {
  const r = inferResumeSignals(["م. سارة صالح ناصر", "مهندسة مدنية (رقم الاعتماد: 1234) | PMP | مدير مشروعات",
    "الخبرات المهنية", "أعمال متعددة", "نتائج تنفيذية بارزة", "إتمام مشروع التصميم ضمن الميزانية",
    "نقاط القوة القيادية الأساسية", "التخطيط", "المهارات والأدوات المختارة", "المجال", "الأدوات/المهارات", "التصميم", "AutoCAD", "١ / ٢"].join("\n"));
  assert.equal(r.target_roles, "مهندسة مدنية");
  assert.equal(r.resume_skills, "التصميم, AutoCAD");
  assert.equal(r.resume_work_examples, "إتمام مشروع التصميم ضمن الميزانية");
});

test("a small amount of extraction noise does not hide a readable document", () => {
  const valid = "Coordinated purchase orders and reconciled monthly inventory values. ".repeat(4);
  assert.ok(readableResumeText(valid + "(cid:34)���"));
  assert.equal(readableResumeText("(cid:34)���".repeat(90)), false);
  assert.equal(readableResumeText("%%%%%%% ".repeat(110) + valid), false);
});

test("service, retail, academic and volunteer applicants keep the evidence actually present", () => {
  const customer = inferResumeSignals([
    "Name: Sol Brooks | Occupation: Guest Relations Representative",
    "City: Doha", "Skills & Tools", "Complaint resolution", "Zendesk",
    "Volunteer experience", "Answered visitor questions at the community reception desk.",
  ].join("\n"));
  assert.equal(customer.display_name, "Sol Brooks");
  assert.equal(customer.target_roles, "Guest Relations Representative");
  assert.equal(customer.target_locations, "Doha");
  assert.equal(customer.resume_skills, "Complaint resolution, Zendesk");
  assert.equal(customer.resume_seniority, "");
  assert.match(customer.resume_work_examples, /^Answered visitor questions/);

  const student = inferResumeSignals("Amber Fox\nCommunication Design Student\nAcademic Background\nStudied visual storytelling and typography.\nDigital skills: Adobe Illustrator, Figma");
  assert.equal(student.target_roles, "Communication Design Student");
  assert.equal(student.resume_seniority, "Student");
  assert.equal(student.resume_skills, "Adobe Illustrator, Figma");

  const arabic = inferResumeSignals("ندى صالح\nخريجة نظم معلومات\nالمدينة: حائل\nمهارات التواصل\nمتابعة استفسارات المستفيدين\nالعمل التطوعي\nساعدت الزوار في تسجيل طلباتهم ومتابعة المواعيد");
  assert.equal(arabic.display_name, "ندى صالح");
  assert.equal(arabic.target_roles, "خريجة نظم معلومات");
  assert.equal(arabic.resume_skills, "متابعة استفسارات المستفيدين");
  assert.equal(arabic.target_locations, "حائل");
  assert.equal(arabic.resume_languages, "");
});
