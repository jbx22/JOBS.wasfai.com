// Classify the work named in a title. Sales, teaching, recruitment, etc. describe the
// function even when the title also mentions a customer's industry or a subject taught.
const functions = [
  ["sales", /\b(?:sales|business development|account executive|account manager|customer success)\b|مبيعات|تطوير الاعمال|تطوير اعمال|نجاح العملاء/u],
  ["people", /\b(?:human resources|recruiter|recruitment|talent acquisition|hrbp|payroll|hr)\b|موارد بشرية|الموارد البشرية|توظيف/u],
  ["education", /\b(?:lecturer|professor|teacher|instructor)\b|معلم|محاضر|استاذ/u],
  ["marketing", /\b(?:marketing|advertising|social media|content creator|content production|media production|copywriter|brand manager)\b|تسويق|اعلان|انتاج المحتوى|انتاج اعلامي/u],
];
const disciplines = [
  ["software", /\b(?:software|programmer|programming|front[ -]?end|back[ -]?end|full[ -]?stack|web developer|mobile developer|javascript|python developer|ios|android|devops|site reliability|sre|test automation|cloud architect|erp implementation|it (?:project|program|operations|systems)|digital transformation|application(?:s)? developer|information technology)\b|برمج|مطور (?:ويب|تطبيقات|واجهات)|تطوير التطبيقات|حوسبة سحابية|تقنية المعلومات|تكنولوجيا المعلومات|التحول الرقمي/u],
  ["security", /\b(?:cyber\s?security|information security|security operations center|soc analyst|penetration tester)\b|امن (?:سيبراني|المعلومات)|الامن السيبراني/u],
  ["data", /\b(?:data (?:analyst|analytics|engineer|scientist)|business intelligence|machine learning|ai engineer)\b|(?:محلل|مهندس|عالم|تحليل) (?:ال)?بيانات|تعلم الالة|ذكاء اصطناعي/u],
  ["finance", /\b(?:finance|financial|accounting|accountant|controller finance|treasury|credit analyst|budget analyst|fp&a)\b|مالي|محاسب|خزينة|ائتمان/u],
  ["physical", /\b(?:industrial|manufacturing|mechanical|factory|plant|rotating equipment|equipment maintenance|maintenance (?:and |& )?equipment|process engineer|industrial automation|production engineer|oil and gas|petrochemical|epc|commissioning)\b|صناع|مصانع|مصنع|ميكانيك|ميكانيق|بتروكيم|معدات دوارة|محطة توليد|هندسة الانتاج|مهندس انتاج/u],
  ["civil", /\b(?:civil|structural|construction|quantity surveyor)\b|انشاء|مدني|مساح كميات/u],
  ["electrical", /\b(?:electrical|electronics|instrumentation)\b|كهربا|الكترون|اجهزة القياس/u],
  ["health", /\b(?:medical|nurse|nursing|physician|pharmacist|clinical|surgeon)\b|تمريض|ممرض|طبيب|صيدل|جراح/u],
  ["law", /\b(?:legal|lawyer|attorney|paralegal)\b|قانون|محام/u],
  ["logistics", /\b(?:logistics|supply chain|warehouse|procurement|inventory)\b|لوجست|سلاسل (?:ال)?امداد|مشتريات|مستودع|مخزون/u],
];
const specialties = [...functions, ...disciplines];
const broadTitleWords = new Set(("senior junior lead principal chief general assistant associate manager director head " +
  "engineer engineering consultant specialist advisor professional coordinator supervisor officer technician analyst designer planner controller project projects program production operations " +
  "مدير مديره مهندس مهندسه مستشار مستشاره استشاري استشاريه اخصائي اخصائيه تنفيذي تنفيذيـه " +
  "عام اول رئيس خبير فني منسق مشرف محلل مصمم مخطط انتاج مشروع مشاريع برامج عمليات اداره").split(/\s+/u));

export function normalizeMatchText(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/\p{M}|ـ/gu, "").replace(/ى/gu, "ي");
}

export function occupationalField(value) {
  const title = normalizeMatchText(value);
  const primary = title.split(/[,،;؛|]/u, 1)[0];
  return (specialties.find(([, pattern]) => pattern.test(primary)) ||
    specialties.find(([, pattern]) => pattern.test(title)))?.[0] || "";
}

export function skillFields(skills) {
  const text = normalizeMatchText(skills.join(" "));
  const fields = new Set(specialties.filter(([, pattern]) => pattern.test(text)).map(([field]) => field));
  if (/\b(?:javascript|typescript|react|django|kubernetes|golang|spring boot)\b/u.test(text)) fields.add("software");
  if (/\b(?:hvac|solidworks|cnc|turbines?|pumps?)\b|مضخات|توربين/u.test(text)) fields.add("physical");
  return fields;
}

export function isBroadRole(value) {
  const words = normalizeMatchText(value).match(/\p{L}+/gu) || [];
  return words.length > 0 && words.every(word => broadTitleWords.has(word.replace(/^ال/u, "").replace(/ة$/u, "ه")));
}

const technicalOrOperational = /\b(?:engineer|consultant|advisor|maintenance|reliability|operations|manufacturing|commissioning|design lead|project controls|project manager|plant manager|factory manager)\b|مهندس|استشاري|مستشار|صيان|اعتمادي|انتاج|تشغيل|مدير (?:ال)?(?:مصنع|مشروع|مشاريع|عمليات)/u;
const industrialEquipment = /\b(?:rotating equipment|industrial maintenance|industrial equipment|machinery|mechanical equipment|manufacturing operations|factory operations|turbines?|pumps?|mechanical commissioning|process plant)\b|معدات (?:دوارة|صناعية|ميكانيكية)|خطوط الانتاج|تشغيل المصانع|مضخات|توربين/u;
function responsibilityField(description) {
  if (/\b(?:software delivery|software development|web applications?|kubernetes clusters?|cloud infrastructure|write code|salesforce implementation)\b|تطوير البرمجيات|تطوير تطبيقات الويب|البنية السحابية/u.test(description)) return "software";
  if (/\b(?:sales pipeline|sales quotas?|sales forecasting|lead generation)\b|اهداف المبيعات|فريق المبيعات/u.test(description)) return "sales";
  return industrialEquipment.test(description) ? "physical" : "";
}

const generalTransferSkill = /^(?:office|microsoft office|excel|communication|teamwork|management|english|arabic|leadership|presentation|stakeholder management|project management|pmp|reporting|التواصل|التعاون|القيادة|ادارة المشاريع|العربية|الانجليزية)$/u;

// A shared sector or a general office skill is weak evidence for changing occupations.
// Accept an adjacent industrial responsibility only when the posting and résumé also
// share a concrete skill. Other professions use directly named titles and bilingual aliases.
export function jobResponsibilities(title, description, skillHits) {
  const technical = technicalOrOperational.test(title);
  return {
    technical,
    field: occupationalField(title) || (technical ? responsibilityField(description) : ""),
    concreteSkills: skillHits.some(skill => !generalTransferSkill.test(normalizeMatchText(skill))),
  };
}

export function roleEvidence(role, { title, field, technical, concreteSkills, targetFields }, direct) {
  const relevant = role.field ? role.field === field : role.broad && targetFields.has(field);
  if (field && !relevant && (role.field || (role.broad && targetFields.size))) return "";
  if (direct && !role.broad) return "direct";
  if (direct && role.broad) {
    if (field && relevant) return "direct";
    return concreteSkills && !field ? "transfer" : "";
  }
  // These titles name the actual technical work even when the employer uses a different rank.
  if (field === "physical" && technical) {
    if (/mechanical engineer|مهندس(?:ة)? ميكاني/u.test(role.term) &&
        /\bmechanical design (?:lead|manager|specialist)\b|(?:رئيس|مدير|اخصائي) (?:قسم )?(?:ال)?تصميم (?:ال)?ميكانيكي/u.test(title)) return "adjacent";
    if (/maintenance (?:manager|engineer)|(?:مدير|مهندس) (?:ال)?صيانة/u.test(role.term) &&
        /\bmaintenance\b.*\b(?:engineer|manager|lead)\b|(?:مهندس|مدير) (?:ال)?صيانة/u.test(title)) return "adjacent";
    if (concreteSkills && relevant) return "transfer";
  }
  return "";
}
