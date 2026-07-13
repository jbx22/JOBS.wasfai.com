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
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Data builders — keep in sync with src/lib.rs seed_* functions     */
/* ------------------------------------------------------------------ */

function buildBootstrap() {
  const jobs = seedJobs();
  const packages = seedPackages();
  const messages = seedMessages();
  const drafts = [];
  return {
    profile: seedProfile(),
    jobs,
    messages,
    packages,
    package_history: [],
    sources: seedSources(),
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
    display_name: "جابر",
    preferred_language: "ar",
    target_roles: "Rust / Product / UX",
    target_locations: "الرياض، دبي، القاهرة",
    resume_filename: "resume.pdf",
    resume_skills: "Rust, Product operations, UX, Arabic SaaS",
    resume_languages: "Arabic, English",
    resume_seniority: "Senior",
    resume_regions: "MENA, Saudi Arabia, UAE, Egypt",
    resume_work_examples:
      "Built Arabic-first product workflows, job search automation, and document generation prototypes.",
  };
}

/* ---- jobs ---- */

function seedJobs() {
  return [
    {
      id: "job-1",
      title: "مصمم تجربة مستخدم أول",
      employer: "Noon",
      source: "linkedin",
      location: "دبي، الإمارات",
      score: 91,
      status: "ready",
      deadline: "2026-07-24",
      description:
        "قيادة تصميم تجربة شراء عربية، بناء نماذج أولية، وتحسين رحلة المستخدم عبر الهاتف.",
      tailored_resume:
        "سيرة مركزة على تصميم المنتجات، الاختبارات السريعة، وقيادة فرق متعددة التخصصات.",
      cover_letter:
        "خطاب يربط خبرتك في التجارة الإلكترونية بتحسين تجربة المستخدم العربية في Noon.",
      fit_explanation: "Matched profile signals from the seeded demo workflow.",
      timeline: [
        ev("تم اكتشاف الوظيفة", "09 يوليو", "neutral"),
        ev("تم إنشاء السيرة المخصصة", "09 يوليو", "ready"),
      ],
    },
    {
      id: "job-2",
      title: "مهندس برمجيات Rust",
      employer: "Careem",
      source: "wazzuf",
      location: "الرياض، السعودية",
      score: 87,
      status: "applied",
      deadline: "2026-07-18",
      description:
        "بناء خدمات خلفية عالية الاعتمادية باستخدام Rust وواجهات API لمنصة تنقل إقليمية.",
      tailored_resume:
        "سيرة تبرز Rust، تصميم الأنظمة، وقابلية التوسع في منتجات المستهلك.",
      cover_letter:
        "خطاب متابعة مهني يوضح الحماس للعمل على بنية تحتية تخدم مستخدمي المنطقة.",
      fit_explanation: "Matched Rust, regional backend work, and WUZZUF source.",
      timeline: [
        ev("تم التقديم", "08 يوليو", "ready"),
        ev("وصلت رسالة مقابلة من Gmail", "09 يوليو", "gold"),
      ],
    },
    {
      id: "job-3",
      title: "مدير نمو المنتجات",
      employer: "Halan",
      source: "fiveamsat",
      location: "القاهرة، مصر",
      score: 79,
      status: "discovered",
      deadline: "2026-08-02",
      description: "تحليل قنوات النمو، بناء تجارب اكتساب مستخدمين، وقياس التحويلات.",
      tailored_resume: "مسودة أولية تحتاج إلى إبراز تجارب النمو والقياس.",
      cover_letter: "لم يتم توليد الخطاب بعد.",
      fit_explanation: "Matched growth and MENA marketplace signals.",
      timeline: [ev("تمت الإضافة من Khamsat", "09 يوليو", "neutral")],
    },
    {
      id: "job-4",
      title: "محلل بيانات التوظيف",
      employer: "Bayt",
      source: "indeed",
      location: "عمّان، الأردن",
      score: 84,
      status: "ready",
      deadline: "2026-07-21",
      description:
        "تحليل بيانات التوظيف، بناء لوحات قياس، وتقديم توصيات لفريق العمليات.",
      tailored_resume:
        "سيرة تركز على SQL، لوحات القياس، وقراءة مؤشرات رحلة التوظيف.",
      cover_letter:
        "خطاب عربي مختصر يوضح أثر التحليلات في تحسين قرارات التوظيف.",
      fit_explanation: "Matched analytics and recruiting operations signals.",
      timeline: [
        ev("تمت المطابقة مع السيرة", "09 يوليو", "neutral"),
        ev("جاهزة للتقديم", "09 يوليو", "ready"),
      ],
    },
    {
      id: "job-5",
      title: "كاتب محتوى تقني",
      employer: "StartupJobs MENA",
      source: "startupjobs",
      location: "عن بعد",
      score: 66,
      status: "expired",
      deadline: "2026-07-01",
      description:
        "كتابة محتوى تقني وتسويقي لشركة ناشئة في مجال أدوات المطورين.",
      tailored_resume: "انتهت المهلة قبل توليد الحزمة.",
      cover_letter: "انتهت المهلة قبل توليد الخطاب.",
      fit_explanation: "Lower match because the role is expired and less aligned.",
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
      resume_title: "سيرة UX عربية",
      resume_body:
        "سيرة ذاتية مركزة على تصميم المنتجات، الاختبارات السريعة، وقيادة فرق متعددة التخصصات.",
      cover_letter_title: "خطاب Noon",
      cover_letter_body:
        "خطاب يربط خبرتك في التجارة الإلكترونية بتحسين تجربة المستخدم العربية في Noon.",
      pdf_status: "PDF جاهز",
      generated_at: "2026-07-09T10:00:00+03:00",
    },
    {
      job_id: "job-2",
      resume_title: "سيرة Rust مخصصة",
      resume_body:
        "سيرة تبرز Rust، تصميم الأنظمة، وقابلية التوسع في منتجات المستهلك.",
      cover_letter_title: "متابعة Careem",
      cover_letter_body:
        "خطاب متابعة مهني يوضح الحماس للعمل على بنية تحتية تخدم مستخدمي المنطقة.",
      pdf_status: "PDF محدث",
      generated_at: "2026-07-09T10:00:00+03:00",
    },
    {
      job_id: "job-4",
      resume_title: "سيرة محلل بيانات",
      resume_body:
        "سيرة تركز على SQL، لوحات القياس، وقراءة مؤشرات رحلة التوظيف.",
      cover_letter_title: "خطاب Bayt",
      cover_letter_body:
        "خطاب عربي مختصر يوضح أثر التحليلات في تحسين قرارات التوظيف.",
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
    src("startupjobs", "startup.jobs", "Remote", true, "public_html"),
    src("workingnomads", "Working Nomads", "Remote", true, "public_html"),
    src("bayt", "Bayt", "MENA", true, "public_html"),
    src("wazzuf", "WUZZUF", "MENA", true, "public_html"),
    src("fiveamsat", "Khamsat", "MENA", true, "public_html"),
    src("manual", "إضافة يدوية", "Manual", true, "unsupported"),
  ];
}

function src(id, label, region, enabled, connectorMode) {
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
    connector_note: "",
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
    startupjobs: "https://startup.jobs/",
    workingnomads: "https://www.workingnomads.com/jobs",
    bayt: "https://www.bayt.com/en/jobs/",
    wazzuf: "https://wuzzuf.net/jobs/",
    fiveamsat: "https://khamsat.com/",
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
