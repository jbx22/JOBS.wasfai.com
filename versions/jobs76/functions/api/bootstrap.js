/** Initial workspace for the Pages app. Live vacancies load through the search API. */
export async function onRequest() {
  return new Response(JSON.stringify(buildBootstrap()), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
  });
}

export function buildBootstrap() {
  return {
    profile: seedProfile(),
    jobs: [],
    messages: [],
    packages: [],
    package_history: [],
    sources: seedSources().map((source) => ({ ...source, source_quality: source.connector_mode === "portal_only" ? "manual_review" : "example" })),
    drafts: [],
    draft_history: [],
    activity_feed: [],
    application_checklists: [],
  };
}

function seedProfile() {
  return {
    id: "user-demo",
    display_name: "",
    preferred_language: "ar",
    target_roles: "",
    target_locations: "السعودية، الخليج",
    resume_filename: "",
    resume_skills: "",
    resume_languages: "",
    resume_seniority: "",
    resume_regions: "Saudi Arabia, GCC",
    resume_work_examples: "",
  };
}

function seedSources() {
  return [
    src("linkedin", "LinkedIn", "Global", true, "approved_api"),
    src("indeed", "Indeed", "Global", true, "approved_api"),
    src("glassdoor", "Glassdoor", "Global", true, "public_html"),
    src("adzuna", "Adzuna", "Global", false, "public_html"),
    src("hiringcafe", "HiringCafe", "Global", true, "portal_only", "ابحث وقدّم عبر بوابة HiringCafe الرسمية."),
    src("remotive", "Remotive", "Remote, Global", true, "public_json", "Approved public API; listings are delayed by the provider and link back to Remotive."),
    src("startupjobs", "startup.jobs", "Remote", true, "public_html"),
    src("workingnomads", "Working Nomads", "Remote", true, "public_html"),
    src("bayt", "Bayt", "MENA", true, "public_html"),
    src("wazzuf", "WUZZUF", "MENA", true, "public_html"),
    src("fiveamsat", "Khamsat", "MENA", true, "public_html"),
    src("jadarat", "جدارات — المنصة الوطنية الموحدة للتوظيف", "Saudi Arabia", true, "portal_only", "بوابة حكومية موثقة؛ التقديم والمتابعة يتمان مباشرة داخل جدارات."),
    src("moh-careers", "وزارة الصحة السعودية — خدمات التوظيف", "Saudi Arabia", true, "portal_only", "بوابة توظيف رسمية لوزارة الصحة؛ لا يتم سحب البيانات منها آلياً."),
    src("dga-careers", "هيئة الحكومة الرقمية — التوظيف", "Riyadh, Saudi Arabia", true, "portal_only", "بوابة توظيف رسمية للهيئة؛ افتحها لإنشاء ملف والتقديم."),
    src("pep-careers", "برنامج خدمة ضيوف الرحمن — التوظيف", "Saudi Arabia", true, "portal_only", "بوابة توظيف رسمية لبرنامج رؤية 2030؛ التقديم يتم في البوابة."),
    src("naukrigulf-saudi", "Naukrigulf — Saudi Arabia", "Saudi Arabia", true, "portal_only", "بوابة خليجية موثقة للبحث والتقديم؛ لا يتم تجاوز ضوابط الموقع بالسحب الآلي."),
    src("gulftalent-saudi", "GulfTalent — Saudi Arabia", "Saudi Arabia", true, "portal_only", "بوابة خليجية موثقة للبحث والتقديم؛ افتحها مباشرة للوظائف السعودية."),
    src("aramco-careers", "أرامكو السعودية — التوظيف", "Saudi Arabia", true, "portal_only", "بوابة أرامكو الرسمية للفرص داخل المملكة وللمتقدمين السعوديين وغير السعوديين."),
    src("sabic-careers", "سابك — الوظائف", "Saudi Arabia", true, "portal_only", "بوابة سابك الرسمية للوظائف والبرامج المهنية."),
    src("stc-careers", "stc — الوظائف", "Saudi Arabia", true, "portal_only", "بوابة stc الرسمية للبحث والتقديم على الوظائف."),
    src("pif-careers", "صندوق الاستثمارات العامة — الوظائف", "Riyadh, Saudi Arabia", true, "portal_only", "بوابة صندوق الاستثمارات العامة الرسمية للفرص المهنية."),
    src("neom-careers", "نيوم — الوظائف", "NEOM, Saudi Arabia", true, "portal_only", "بوابة نيوم الرسمية للوظائف؛ استخدم القنوات الرسمية فقط."),
    src("maaden-careers", "معادن — انضم لفريقنا", "Saudi Arabia", true, "portal_only", "بوابة معادن الرسمية للفرص في التعدين والصناعات المرتبطة."),
    src("sab-bank-careers", "ساب — الوظائف", "Saudi Arabia", true, "portal_only", "بوابة البنك السعودي الأول الرسمية للمسارات والفرص المهنية."),
    src("manual", "إضافة يدوية", "Manual", true, "unsupported"),
  ];
}

function src(id, label, region, enabled, connectorMode, connectorNote = "") {
  return {
    id,
    label,
    region,
    enabled,
    import_url_template: "",
    import_hint: "",
    url: srcUrl(id),
    custom: id === "manual",
    last_scanned_at: "",
    job_count: 0,
    connector: "",
    connector_mode: connectorMode,
    connector_note: connectorNote,
    last_error: "",
    scheduled: false,
    interval_minutes: 360,
    next_scan_at: "",
  };
}

function srcUrl(id) {
  const urls = {
    linkedin: "https://www.linkedin.com/jobs/",
    indeed: "https://www.indeed.com/jobs",
    glassdoor: "https://www.glassdoor.com/Job/",
    adzuna: "https://www.adzuna.com/",
    hiringcafe: "https://hiringcafe.com/",
    remotive: "https://remotive.com/remote-jobs",
    startupjobs: "https://startup.jobs/",
    workingnomads: "https://www.workingnomads.com/jobs",
    bayt: "https://www.bayt.com/en/jobs/",
    wazzuf: "https://wuzzuf.net/jobs/",
    fiveamsat: "https://khamsat.com/",
    jadarat: "https://jadarat.sa/",
    "moh-careers": "https://www.moh.gov.sa/eservices/employment/pages/alljobs.aspx",
    "dga-careers": "https://career.dga.gov.sa/en/",
    "pep-careers": "https://careers.pep.gov.sa/ar/",
    "naukrigulf-saudi": "https://www.naukrigulf.com/jobs-in-saudi-arabia",
    "gulftalent-saudi": "https://www.gulftalent.com/saudi-arabia/jobs",
    "aramco-careers": "https://www.aramco.com/ar/careers",
    "sabic-careers": "https://www.sabic.com/ar/careers",
    "stc-careers": "https://careers.stc.com.sa/en?locale=en_US",
    "pif-careers": "https://www.pif.gov.sa/en/careers/",
    "neom-careers": "https://careers.neom.com/careers",
    "maaden-careers": "https://www.maaden.com/en/join-our-team",
    "sab-bank-careers": "https://www.sab.com/en/about-us/careers/",
    manual: "",
  };
  return urls[id] || "";
}
