import { assessResumeText } from "./resume-text-quality.js";

const fields = {
  display_name: /^(?:full name|name|الاسم(?: الكامل)?|الإسم(?: الكامل)?)$/iu,
  target_roles: /^(?:target (?:roles?|positions?)|(?:job|professional|desired|career) titles?|title|position|current (?:role|position)|desired (?:role|position)|occupation|profession|role|المسمى(?: الوظيفي)?|المهنة|الدور(?: المستهدف)?|الوظيفة المستهدفة|المسمى المهني|الوظيفة(?: الحالية)?)$/iu,
  target_locations: /^(?:preferred locations?|target locations?|locations?|city|home base|based in|place of residence|الموقع(?: الجغرافي)?|المدن(?: المستهدفة)?|مكان الإقامة|محل الإقامة|المدينة|مدينة الإقامة)$/iu,
  resume_skills: /^(?:(?:(?:core|key|technical|professional|soft|hard)\s+)?(?:skills|competencies)|areas of expertise|(?:skills|tools)\s*(?:&|and|\/)\s*(?:abilities|expertise|tools|technologies|software|skills)|(?:digital|computer|transferable|interpersonal|customer service) skills|مهارات(?: و?ال[\p{Script=Arabic}\p{M}]+){0,4}|(?:المهارات|الكفاءات)(?: و?ال[\p{Script=Arabic}\p{M}]+){0,4})$/iu,
  resume_languages: /^(?:(?:spoken |foreign )?languages?|اللغات(?: الأجنبية| التي أتحدثها)?)$/iu,
  resume_seniority: /^(?:seniority(?: level)?|level|المستوى(?: الوظيفي| المهني)?)$/iu,
  resume_regions: /^(?:regions?|markets?|المناطق|النطاق|الأسواق)$/iu,
  resume_work_examples: /^(?:(?:key |selected |notable )?(?:achievements|accomplishments|projects)|work examples|examples|volunteer projects|academic projects|coursework projects|(?:ال)?نتائج(?: تنفيذية| مهنية| رئيسية| بارزة| مختارة){0,3}|(?:(?:أبرز|أهم|اهم) )?(?:الإنجازات|الانجازات|المشاريع|المشروعات|الأمثلة)(?: و?ال[\p{Script=Arabic}\p{M}]+){0,4})$/iu,
};
const section = /^(?:(?:(?:professional|work|relevant|career|employment)\s+)?(?:experience|history)|employment|(?:professional |career |personal |executive )?(?:profile|summary|objective)|about me|(?:volunteer|volunteering|community service|internship)(?: experience| work| placements?)?|(?:academic|educational) (?:background|qualifications)|education(?: and training)?|(?:professional )?certifications?|qualifications|references|contact(?: information| details)?|personal (?:information|details)|awards|training|publications|interests|(?:core |leadership )?strengths|نقاط القوة(?: و?ال[\p{Script=Arabic}\p{M}]+){0,4}|curriculum vitae|résumé|resume|cv|الخبرات(?: المهنية| العملية| الوظيفية)?|الخبرة(?: المهنية| العملية)?|التعليم|التدريب التعاوني|التطوع|العمل التطوعي|الخبرات التطوعية|الملف الشخصي|المؤهلات(?: العلمية| الأكاديمية)?|نبذة(?: عني| مهنية)?|الملخص(?: المهني)?|الهدف الوظيفي|الشهادات(?: المهنية)?|الدورات(?: التدريبية)?|بيانات التواصل|البيانات الشخصية|المراجع|السيرة الذاتية)$/iu;
const roleWord = /\b(?:engineer|technician|director|manager|officer|lead|analyst|accountant|coordinator|consultant|designer|developer|specialist|supervisor|architect|nurse|teacher|scientist|researcher|founder|c[etf]o|attorney|lawyer|pharmacist|physician|surveyor|planner|administrator|assistant|associate|head of|representative|receptionist|cashier|agent|clerk|barista|chef|cook|driver|operator|electrician|mechanic|librarian|therapist|therapeutic practitioner|translator|interpreter|auditor|recruiter|journalist|editor|photographer|copywriter|tutor|student|graduate|intern|trainee|apprentice|volunteer|salesperson|bookkeeper|customer service|customer support)\b|(?:^|\s)(?:مهندس[ة]?|فني[ة]?|استشاري[ة]?|مستشار[ة]?|مدير[ة]?|رئيس[ة]?|محاسب[ة]?|معلم[ة]?|محلل[ة]?|أخصائي[ة]?|اخصائي[ة]?|منسق[ة]?|مصمم[ة]?|مطور[ة]?|طبيب[ة]?|ممرض[ة]?|صيدلاني[ة]?|صيدلي[ة]?|محام[يٍ]?|مشرف[ة]?|مسؤول[ة]?|مؤسس[ة]?|باحث[ة]?|ممثل[ة]?|موظف[ة]?|مندوب[ة]?|مساعد[ة]?|بائع[ة]?|أمين[ة]?|سائق[ة]?|مترجم[ة]?|محاضر[ة]?|متدرب[ة]?|متطوع[ة]?|طالب[ة]?|خريج[ة]?|كاتب[ة]?|محرر[ة]?|مصو[رّ]+[ة]?|طاه[ية]?|معالج[ة]?|خدمة العملاء)(?=\s|$)/iu;
const lists = new Set(["resume_skills", "resume_languages", "resume_regions", "resume_work_examples"]);
const experience = /^(?:(?:work|professional|relevant|employment)\s+)?(?:history|experience)$|^employment$|^الخبر(?:ات|ة)(?: المهنية| العملية| الوظيفية)?$/iu;

function heading(line) {
  const match = line.match(/^(.+?)(?:\s*[:：\t]\s*|\s+[-–—]\s+)(.*)$/u);
  const label = (match ? match[1] : line).replace(/^(?:#+|[\p{Nd}]+[.)-])\s*|\s*[:：]+$/gu, "").trim();
  if (/^(?:curriculum vitae|résumé|resume|cv|السيرة الذاتية)$/iu.test(label)) return { key: "document", value: "" };
  for (const [key, pattern] of Object.entries(fields)) {
    if (pattern.test(label)) return { key, value: match?.[2]?.trim() || "" };
  }
  if (section.test(label)) return { key: experience.test(label) ? "experience" : "section", value: match?.[2]?.trim() || "" };
  return null;
}

function roleLine(line) {
  const firstClause = line.split(/[.!?؟](?:\s|$)/u)[0].replace(/^(?:I(?: am|'m) (?:an? )?|أنا (?:أعمل |اعمل )?(?:ك(?=موظف|مندوب|ممثل|مساعد)|بصفة )?)/iu, "");
  const title = firstClause.split(/\s+[-–—]\s+|\s+(?:at|based in|in|لدى|في)\s+/iu)[0]
    .replace(/\s*[（(][^()（）]*[\p{Nd}][^()（）]*[)）]\s*$/u, "").trim();
  if (!title || title.length > 100 || title.split(/\s+/u).length > 12 || /[@:：.!?\d]/u.test(title)) return "";
  if (/\b(?:bachelor|degree|master of|diploma|university|college|certification|worked|reported|collaborated|responsible|supported|handled|answered|assisted|processed|trained|prepared|greeted|resolved|responded)\b|جامعة|بكالوريوس|شهادة|دبلوم|ماجستير|عملت|مسؤول عن|توليت|ساعدت|استقبلت|شاركت/iu.test(title)) return "";
  return roleWord.test(title) ? title : "";
}

function nameLine(line) {
  const name = line.split(/\s*[|,،\t]\s*/u)[0].replace(/^(?:Engr?\.|Dr\.|Mr\.|Mrs\.|Ms\.|[مد]\s*[./])\s*/iu, "").trim();
  const words = name.split(/\s+/u);
  if (words.length < 2 || words.length > 6 || name.length > 75 || heading(name) || roleWord.test(name)) return "";
  if (/\b(?:career|professional|summary|experience|resume|vitae|street|city|university|kingdom|saudi|skills|contact|degree)\b|المملكة|السعودية|جامعة|نبذة|خبرة|سنوات|السيرة|الخبرات|العنوان/iu.test(name)) return "";
  return words.every(word => /^[\p{L}\p{M}][\p{L}\p{M}'’.\-]*$/u.test(word) && (!/\p{Script=Latin}/u.test(word) || /^[\p{Lu}]|^(?:al|bin|ibn|de|del|van|von)$/u.test(word))) ? name : "";
}

function resumeLines(text) {
  // PDF table exports often keep several labelled fields on one line.
  return String(text || "").split(/\r?\n/u).flatMap(line => {
    const cells = line.split(/\s*\|\s*/u);
    return cells.length > 1 && cells.every(cell => heading(cell)?.value) ? cells : [line];
  }).map(line => line.replace(/^\s*[-*•▪●]\s*/u, "").trim()).filter(Boolean);
}

function roleInLines(lines) {
  for (const line of lines.slice(0, 10)) {
    if (heading(line)) continue;
    for (const segment of line.split(/\s*[|•\t]\s*/u)) {
      const role = roleLine(segment);
      if (role) return role;
    }
  }
  return "";
}

export function inferRoleFromResume(text) {
  return inferResumeSignals(text).target_roles;
}

export function inferResumeSignals(text) {
  const lines = resumeLines(text);
  const values = Object.fromEntries(Object.keys(fields).map(key => [key, []]));
  const header = [];
  const positions = [];
  let active = "";
  let seenSection = false;
  for (const line of lines) {
    const h = heading(line);
    if (h) {
      active = h.key;
      if (active === "experience" || active === "section" || lists.has(active)) seenSection = true;
      if (h.value && values[active]) values[active].push(h.value);
      if (h.value && active === "experience") positions.push(h.value);
      if (h.value && values[active] && !lists.has(active)) active = "";
      continue;
    }
    if (!seenSection && !values[active]) header.push(line);
    if (active === "experience") positions.push(line);
    if (values[active]) {
      if (lists.has(active) && /(?:^\p{Nd}+\s*\/\s*\p{Nd}+$|@|https?:\/\/|(?:^|\s)(?:page|صفحة)\s*[\d٠-٩]|السيرة الذاتية|curriculum vitae)/iu.test(line)) {
        active = "";
        continue;
      }
      if (active === "resume_skills" && /^(?:skills?|category|categories|competency|details|المهارة|المجال|الفئة|التفاصيل|الوصف|المحور|المهارات التفصيلية|(?:الأدوات|المهارات)\s*[/|]\s*(?:الأدوات|المهارات))$/iu.test(line)) continue;
      values[active].push(line);
      if (!lists.has(active)) active = "";
    }
  }
  const result = Object.fromEntries(Object.entries(values).map(([key, items]) => [key,
    [...new Set(items)].join(key === "resume_work_examples" ? "\n" : ", ")]));
  if (!result.display_name) result.display_name = header.slice(0, 4).map(nameLine).find(Boolean) || "";
  result.target_roles ||= roleInLines(header) || roleInLines(positions);
  if (!result.target_locations) {
    const residence = header.map(line => line.match(/(?:\bbased in|(?:^|[|•])\s*location\s*[:：]|(?:^|\s)(?:أقيم في|مقيم[ة]? في))\s+([^|•.!?؟\n]{2,65})(?:[|•.!?؟]|$)/iu)?.[1]?.trim()).find(Boolean);
    if (residence) result.target_locations = residence;
  }
  if (!result.resume_skills) {
    const namedSkills = lines.join(" ").match(/\b(?:SQL|Python|AutoCAD|SolidWorks|Excel|Power BI|JavaScript|SAP|Primavera P6|mechanical engineering|project management|risk management|industrial operations|factory design|customer service|complaint resolution|cash handling|inventory control|food safety|data entry|bookkeeping|lesson planning|copywriting|graphic design|social media management|patient care|first aid|Microsoft Office|Microsoft Word|Google Workspace|Zendesk|Salesforce|Canva)\b|إدارة المشاريع|إدارة المخاطر|الهندسة الميكانيكية|تصميم المصانع|خدمة العملاء|خدمة الزبائن|إدخال البيانات|إدارة المخزون|حل الشكاوى|معالجة الشكاوى|مسك الدفاتر|الإسعافات الأولية|رعاية المرضى|تصميم الجرافيك|إدارة المحتوى/giu) || [];
    result.resume_skills = [...new Set(namedSkills)].join(", ");
  }
  if (!result.resume_languages) {
    const statements = lines.filter(line => /^(?:(?:fluent|conversational|proficient|bilingual) in |(?:native|mother) (?:language|tongue)[:： ]|أتحدث |أجيد (?:اللغة |اللغتين )?|طليق في )/iu.test(line) && line.length < 120);
    const languageName = /\b(?:Arabic|English|French|Spanish|German|Mandarin|Chinese|Italian|Portuguese|Russian|Hindi|Urdu|Japanese|Korean|Turkish|Persian|Bengali|Malayalam|Tamil|Tagalog|Filipino|Dutch|Swahili)\b|العربية|(?:ال)?[إا]نجليزي[ةه]?|الفرنسية|الألمانية|الإسبانية|التركية|الأردية|الهندية|الصينية|الروسية|الفارسية/iu;
    result.resume_languages = statements.filter(line => languageName.test(line) || /^(?:native|mother) (?:language|tongue)[:：]/iu.test(line)).join(", ");
  }
  result.resume_work_examples ||= lines.filter(line => line.length > 35 &&
    /^(?:managed|led|delivered|built|improved|reduced|increased|implemented|coordinated|assisted|answered|resolved|served|handled|supported|taught|organized|volunteered|prepared|استقبلت|ساعدت|نظمت|تطوعت|عالجت|أجبت|قاد|أدار|نفذ|طور|حسن|خفض|رفع|أنجز|أدرت|نفذت|طورت|قدت)/iu.test(line)).slice(0, 4).join("\n");
  if (!result.resume_seniority) {
    result.resume_seniority = result.target_roles.match(/\b(?:executive|director|senior|junior|lead|manager|intern|entry[- ]level|graduate|apprentice|trainee|student)\b|(?:^|\s)(?:تنفيذي[ة]?|مدير[ة]?|رئيس[ة]?|أول|كبير[ة]?|متدرب[ة]?|خريج[ة]?|طالب[ة]?)(?=\s|$)/iu)?.[0].trim() || "";
  }
  return result;
}

export function readableResumeText(text) {
  return assessResumeText(text).readable;
}
