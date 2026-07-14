/**
 * Cloudflare Pages Function — GET /api/bootstrap
 *
 * Returns the full Bootstrap payload matching the Rust/Axum seed-data shape.
 * The JSON keys follow the Rust serde `rename_all = "snake_case"` convention
 * (fields are already snake_case in the Rust structs, so this is a straight
 * 1:1 mapping).
 *
 * This function is the SINGLE source of truth for the Pages static-deploy
 * bootstrap. The Rust backend in src/lib.rs remains the canonical
 * implementation; this file mirrors its `bootstrap_data()` output.
 */

export async function onRequest(context) {
  const data = buildBootstrap();
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Data builders — keep in sync with src/lib.rs seed_* functions     */
/* ------------------------------------------------------------------ */

export function buildBootstrap() {
  const jobs = seedJobs().map((job) => ({ ...job, data_quality: "example", source_quality: "example" }));
  const packages = seedPackages();
  const messages = seedMessages();
  const drafts = [];
  return {
    profile: seedProfile(),
    jobs,
    messages,
    packages,
    package_history: [],
    sources: seedSources().map((source) => ({ ...source, source_quality: source.connector_mode === "portal_only" ? "manual_review" : "example" })),
    drafts,
    draft_history: [],
    activity_feed: activityFeedFromJobs(jobs),
    application_checklists: applicationChecklists(jobs, packages, drafts, messages),
  };
}

/* ---- profile ---- */

function seedProfile() {
  return {
    id: "user-demo",
    display_name: "",
    preferred_language: "ar",
    target_roles: "",
    target_locations: "السعودية، الخليج",
    resume_filename: "",
    resume_skills: "",
    resume_languages: "Arabic, English",
    resume_seniority: "",
    resume_regions: "Saudi Arabia, GCC",
    resume_work_examples: "",
  };
}

/* ---- jobs ---- */

function seedJobs() {
  return [
    {
      id: "job-1",
      title: "مدير مشاريع صناعية",
      employer: "شركة صناعية",
      source: "linkedin",
      location: "الرياض، السعودية",
      score: 91,
      status: "ready",
      deadline: "2026-07-24",
      description:
        "قيادة مشاريع صناعية ورأسمالية، متابعة الجدول والتكلفة والمخاطر، والتنسيق مع أصحاب المصلحة.",
      tailored_resume:
        "سيرة مركزة على إدارة المشاريع الصناعية، CAPEX، التشغيل، والنتائج القابلة للقياس.",
      cover_letter:
        "خطاب يربط الخبرة الصناعية بتنفيذ مشاريع آمنة ومنضبطة.",
      fit_explanation: "مطابقة مبدئية مع إدارة المشاريع والعمليات الصناعية.",
      timeline: [
        ev("تم اكتشاف الوظيفة", "09 يوليو", "neutral"),
        ev("تم إنشاء السيرة المخصصة", "09 يوليو", "ready"),
      ],
    },
    {
      id: "job-2",
      title: "مهندس ميكانيكي أول",
      employer: "مصنع إقليمي",
      source: "wazzuf",
      location: "الدمام، السعودية",
      score: 87,
      status: "applied",
      deadline: "2026-07-18",
      description:
        "تحسين الاعتمادية والصيانة والتشغيل للمعدات وخطوط الإنتاج داخل بيئة صناعية.",
      tailored_resume:
        "سيرة تبرز الهندسة الميكانيكية، الصيانة، الاعتمادية، وتحسين الأداء.",
      cover_letter:
        "خطاب متابعة مهني يوضح أثر الخبرة الهندسية على جاهزية التشغيل.",
      fit_explanation: "مطابقة مع الهندسة الميكانيكية والصيانة الصناعية.",
      timeline: [
        ev("تم التقديم", "08 يوليو", "ready"),
        ev("وصلت رسالة مقابلة من Gmail", "09 يوليو", "gold"),
      ],
    },
    {
      id: "job-3",
      title: "استشاري تطوير مصانع",
      employer: "مكتب استشارات صناعية",
      source: "fiveamsat",
      location: "جدة، السعودية",
      score: 79,
      status: "discovered",
      deadline: "2026-08-02",
      description: "إعداد دراسات وتطوير مصانع وتحسين جاهزية التشغيل والامتثال.",
      tailored_resume: "مسودة أولية تحتاج إلى إبراز المشاريع الصناعية والاستشارات.",
      cover_letter: "لم يتم توليد الخطاب بعد.",
      fit_explanation: "مطابقة مع الاستشارات الصناعية وتطوير المصانع.",
      timeline: [ev("تمت الإضافة من Khamsat", "09 يوليو", "neutral")],
    },
    {
      id: "job-4",
      title: "مدير تشغيل وصيانة",
      employer: "مجموعة مرافق",
      source: "indeed",
      location: "الجبيل، السعودية",
      score: 84,
      status: "ready",
      deadline: "2026-07-21",
      description:
        "إدارة فرق التشغيل والصيانة، تحسين الاعتمادية، وخفض التوقفات في مرافق صناعية.",
      tailored_resume:
        "سيرة تركز على O&M، الاعتمادية، قيادة الفرق، ومؤشرات الأداء.",
      cover_letter:
        "خطاب عربي مختصر يوضح أثر التشغيل المنضبط على الأداء والتكلفة.",
      fit_explanation: "مطابقة مع التشغيل والصيانة وقيادة الفرق.",
      timeline: [
        ev("تمت المطابقة مع السيرة", "09 يوليو", "neutral"),
        ev("جاهزة للتقديم", "09 يوليو", "ready"),
      ],
    },
    {
      id: "job-5",
      title: "مدير سلامة وامتثال صناعي",
      employer: "شركة تصنيع",
      source: "startupjobs",
      location: "عن بعد",
      score: 66,
      status: "expired",
      deadline: "2026-07-01",
      description:
        "متابعة متطلبات السلامة والامتثال وتحسين إجراءات التشغيل في بيئات صناعية.",
      tailored_resume: "انتهت المهلة قبل توليد الحزمة.",
      cover_letter: "انتهت المهلة قبل توليد الخطاب.",
      fit_explanation: "مطابقة أقل لأن الفرصة منتهية وتحتاج مراجعة قبل الإحياء.",
      timeline: [ev("انتهت المهلة", "01 يوليو", "danger")],
    },
  ];
}

/* ---- messages ---- */

function seedMessages() {
  return [
    {
      id: "msg-1",
      provider: "gmail",
      subject: "دعوة لمقابلة أولية",
      sender: "recruiting@careem.com",
      matched_job_id: "job-2",
      message_type: "interview",
      timeline_action: "schedule_interview",
    },
    {
      id: "msg-2",
      provider: "gmail",
      subject: "تحديث على طلب التقديم",
      sender: "talent@noon.com",
      matched_job_id: "job-1",
      message_type: "update",
      timeline_action: "add_note",
    },
  ];
}

/* ---- packages ---- */

function seedPackages() {
  return [
    {
      job_id: "job-1",
      resume_title: "سيرة إدارة مشاريع صناعية",
      resume_body:
        "سيرة ذاتية مركزة على إدارة المشاريع الصناعية، CAPEX، التشغيل، وقيادة أصحاب المصلحة.",
      cover_letter_title: "خطاب مشروع صناعي",
      cover_letter_body:
        "خطاب يربط الخبرة الصناعية بتنفيذ مشاريع آمنة ومنضبطة.",
      pdf_status: "PDF جاهز",
      generated_at: "2026-07-09T10:00:00+03:00",
    },
    {
      job_id: "job-2",
      resume_title: "سيرة مهندس ميكانيكي",
      resume_body:
        "سيرة تبرز الهندسة الميكانيكية، الصيانة، الاعتمادية، وتحسين الأداء.",
      cover_letter_title: "متابعة مصنع إقليمي",
      cover_letter_body:
        "خطاب متابعة مهني يوضح أثر الخبرة الهندسية على جاهزية التشغيل.",
      pdf_status: "PDF محدث",
      generated_at: "2026-07-09T10:00:00+03:00",
    },
    {
      job_id: "job-4",
      resume_title: "سيرة تشغيل وصيانة",
      resume_body:
        "سيرة تركز على O&M، الاعتمادية، قيادة الفرق، ومؤشرات الأداء.",
      cover_letter_title: "خطاب تشغيل وصيانة",
      cover_letter_body:
        "خطاب عربي مختصر يوضح أثر التشغيل المنضبط على الأداء والتكلفة.",
      pdf_status: "PDF جاهز",
      generated_at: "2026-07-09T10:00:00+03:00",
    },
  ];
}

/* ---- sources ---- */

function seedSources() {
  return [
    src("linkedin", "LinkedIn", "Global", true, "approved_api"),
    src("indeed", "Indeed", "Global", true, "approved_api"),
    src("glassdoor", "Glassdoor", "Global", true, "public_html"),
    src("adzuna", "Adzuna", "Global", false, "public_html"),
    src("hiringcafe", "Hiring Cafe", "Global", true, "public_html"),
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
    job_count: id === "wazzuf" ? 14 : id === "linkedin" ? 0 : id === "indeed" ? 0 : 0,
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
    hiringcafe: "https://hiring.cafe/",
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

/* ---- activity feed ---- */

function activityFeedFromJobs(jobs) {
  const items = [];
  for (const job of jobs) {
    for (const evt of job.timeline) {
      items.push({
        job_id: job.id,
        job_title: job.title,
        employer: job.employer,
        label: evt.label,
        timestamp: evt.timestamp,
        tone: evt.tone,
        category: evt.category || "نشاط",
      });
    }
  }
  // Sort newest-first by timestamp rank
  items.sort((a, b) => {
    const ra = activityRank(b.timestamp) - activityRank(a.timestamp);
    if (ra !== 0) return ra;
    return (a.job_id || "").localeCompare(b.job_id || "");
  });
  return items;
}

function activityRank(ts) {
  // Simple heuristic: later dates rank higher
  const m = ts.match(/(\d+)\s+(\S+)/);
  if (!m) return 0;
  const months = {
    "يناير": 1, "فبراير": 2, "مارس": 3,
    "أبريل": 4, "مايو": 5, "يونيو": 6,
    "يوليو": 7, "أغسطس": 8, "سبتمبر": 9,
    "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
  };
  return (months[m[2]] || 0) * 100 + parseInt(m[1], 10);
}

/* ---- application checklists ---- */

function applicationChecklists(jobs, packages, drafts, messages) {
  return jobs.map((job) => checklistForJob(job, packages, drafts, messages));
}

function checklistForJob(job, packages, drafts, messages) {
  const pkg = packages.find((p) => p.job_id === job.id);
  const draft = drafts.find((d) => d.job_id === job.id);

  const fitReviewed = job.score > 0 && (job.fit_explanation || "").trim().length > 0;
  const draftSaved =
    draft && (draft.content || "").trim().length > 0;
  const packageReady =
    pkg &&
    (pkg.resume_body || "").trim().length > 0 &&
    (pkg.cover_letter_body || "").trim().length > 0;
  const gmailLinked =
    messages.some((m) => m.matched_job_id === job.id) ||
    job.timeline.some(
      (evt) => (evt.category || "") === "Gmail" || evt.label.includes("Gmail"),
    );
  const statusReady = ["ready", "applied", "in_progress"].includes(job.status);

  const items = [
    ci("fit_review", "مراجعة المطابقة", fitReviewed,
      fitReviewed
        ? "تمت قراءة الملاءمة والكلمات المفتاحية"
        : "راجع درجة الملاءمة قبل التقديم"),
    ci("assistant_draft", "مسودة المساعد", draftSaved,
      draftSaved ? "مسودة محفوظة" : "احفظ مسودة خطاب أو متابعة"),
    ci("application_package", "حزمة التقديم", packageReady,
      packageReady ? "السيرة والخطاب جاهزان" : "ولّد أو احفظ السيرة والخطاب"),
    ci("gmail_followup", "متابعة Gmail", gmailLinked,
      gmailLinked ? "تم ربط البريد بالمتابعة" : "اربط بريد Gmail للمتابعة"),
    ci(
      "application_status",
      "حالة التقديم",
      statusReady,
      statusReady ? "الحالة محدثة" : "حدّث حالة التقديم",
    ),
  ];

  return {
    job_id: job.id,
    completed_count: items.filter((i) => i.completed).length,
    total_count: items.length,
    items,
  };
}

function ci(key, label, completed, detail) {
  return { key, label, completed, detail };
}

/* ---- helpers ---- */

function ev(label, timestamp, tone) {
  return { label, timestamp, tone, category: "نشاط" };
}
