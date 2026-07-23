/* JOBS.wasfai.com — Arabic-first RTL mobile PWA */
"use strict";

/* ---------------- Constants ---------------- */
const STATUS_LABELS = {
  discovered: "مكتشفة",
  processing: "قيد المعالجة",
  ready: "جاهزة للتقديم",
  applied: "تم التقديم",
  in_progress: "قيد المتابعة",
  expired: "منتهية",
  skipped: "مؤجلة",
};

const STATUS_TONE = {
  discovered: "neutral",
  processing: "gold",
  ready: "teal",
  applied: "teal",
  in_progress: "teal",
  expired: "danger",
  skipped: "muted",
};

const NAV = [
  { id: "search", label: "البحث", route: "/app", icon: iconSearch },
  { id: "jobs", label: "الوظائف", route: "/jobs", icon: iconList },
  { id: "settings", label: "الإعدادات", route: "/settings", icon: iconCog },
  { id: "account", label: "الحساب", route: "/account", icon: iconUser },
  { id: "results", label: "النتيجة", route: "/results", icon: iconChart },
];

const AI_WRITER_MODELS = [
  { id: "deepseek", label: "DeepSeek V4 Flash" },
  { id: "minimax-m3", label: "MiniMax M3" },
  { id: "glm-5.2", label: "GLM 5.2" },
];

const PDFJS_MODULE_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const TESSERACT_MODULE_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js";
const JSZIP_MODULE_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

// OCR is deliberately performed in the browser. Uploaded CV pages are never
// sent to the JOBS API or an OCR service; the browser downloads the OCR engine
// and Arabic/English language data, renders the PDF locally, and recognizes it.
const OCR_MAX_PAGES = 8;
const OCR_RENDER_SCALE = 2;

const REGIONS = [
  { id: "", label: "الكل" },
  { id: "السعودية", label: "السعودية" },
  { id: "الإمارات", label: "الإمارات" },
  { id: "مصر", label: "مصر" },
  { id: "الأردن", label: "الأردن" },
  { id: "الكويت", label: "الكويت" },
  { id: "البحرين", label: "البحرين" },
  { id: "قطر", label: "قطر" },
  { id: "عن بعد", label: "عن بعد" },
];

const SOURCE_ICON_MAP = {
  linkedin: { class: "li", letter: "in" },
  indeed: { class: "in", letter: "id" },
  khamsat: { class: "kh", letter: "kh" },
  fiveamsat: { class: "kh", letter: "kh" },
  wazzuf: { class: "wz", letter: "wz" },
  bayt: { class: "wz", letter: "bt" },
  glassdoor: { class: "hc", letter: "gd" },
  hiringcafe: { class: "hc", letter: "hc" },
  adzuna: { class: "wz", letter: "ad" },
  startupjobs: { class: "wz", letter: "sj" },
  workingnomads: { class: "wz", letter: "wn" },
  manual: { class: "wz", letter: "mn" },
};

/* ---------------- State ---------------- */
let state = {
  profile: {
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
    resume_text: "",
  },
  jobs: [],
  messages: [],
  packages: [],
  package_history: [],
  sources: [],
  drafts: [],
  draft_history: [],
  activity_feed: [],
  application_checklists: [],
  region: "السعودية",
  query: "",
  jobFilter: "all",
  selectedJobs: [],
  sourceForm: { label: "", url: "", region: "السعودية" },
  region: "",
  scanResult: null,
  jobDetailId: null,
  action: { pending: "", message: "", error: "" },
  draftEdits: {},
  assistantTab: "overview",
  ghostwriter: {},
  aiWriterModel: "deepseek",
  approvedKits: {},
  interviewQuestions: {},
  interviewChats: {},
  resumeCoach: null,
  approvedMasterResume: false,
  masterResume: { ar: "", en: "", approved_at: "" },
  tailoringBriefs: {},
  session: { authenticated: false, user: null, google_configured: false },
  aiHealth: { ready: false, providers: {} },
  persistence: { storage: "guest", last_saved_at: "", pending: false },
  locale: "ar",
  theme: "light",
};

const I18N = {
  ar: {
    searchJobs: "ابحث عن وظيفة",
    mobileWorkflow: "مسار الجوال",
    homeTitle: "أربع خطوات من السيرة إلى طلب متابع",
    homeReady: "ملفك المعتمد نشط الآن. راجع الفرص وولّد حزم التقديم.",
    homeLocked: "اعتمد السيرة الرئيسية أولاً حتى تكون المطابقة مبنية على بياناتك الحقيقية.",
    profileApproved: "الملف معتمد",
    profileRequired: "الملف مطلوب",
    completeProfile: "أكمل الملف",
    completeProfileReady: "السيرة المعتمدة جاهزة للمطابقة.",
    completeProfileText: "الصق السيرة كاملة، حسّنها، ثم اعتمد الملف الرئيسي.",
    addSources: "إدارة المصادر",
    addSourcesText: "المصادر تعمل تلقائياً. افتحها فقط لإضافة أو تعديل مصدر.",
    reviewMatches: "راجع الفرص",
    reviewMatchesText: "افتح الوظائف المرتبة وانقلها داخل مسار التقديم.",
    reviewMatchesLocked: "درجات المطابقة القوية تظهر بعد اعتماد الملف.",
    generatePackage: "ولّد الحزمة",
    generatePackageText: "أنشئ سيرة وخطاباً وأسئلة مقابلة بالعربية والإنجليزية.",
    trackApplications: "تابع الطلبات",
    trackApplicationsText: "انقل الفرص بين قيد المراجعة، جاهزة، تم التقديم، والمتابعة.",
    ready: "جاهز",
    locked: "مغلق",
    gateTitle: "المطابقة مقفلة حتى يكتمل التعريف",
    gateText: "ابدأ برفع السيرة PDF/TXT أو لصقها. بعد الاعتماد سنعرض الوظائف الأقرب للسيرة فقط.",
    nextMatches: "أفضل الفرص",
    open: "فتح",
    matchesEmptyReady: "اضغط بحث ذكي لجلب وظائف مرتبطة بالسيرة المعتمدة.",
    matchesEmptyLocked: "أكمل الملف أولاً. بعدها تظهر هنا أفضل الفرص.",
    pipelineSnapshot: "لمحة المسار",
    details: "تفاصيل",
    jobs: "وظائف",
    readyJobs: "جاهزة",
    followUp: "متابعة",
    signedWorkspace: "مساحة محفوظة بالحساب",
    guestWorkspace: "مساحة ضيف على الجهاز",
    saving: "جاري الحفظ...",
    durable: "محفوظ",
    local: "محلي",
    language: "English",
    themeLight: "نهاري",
    themeDark: "ليلي",
    match: "مطابقة",
    sourceApproved: "APIs معتمدة",
    sourceApprovedText: "LinkedIn و Indeed تبقى مقفلة حتى إضافة وصول رسمي من المزود.",
    sourcePublic: "HTML عام",
    sourcePublicText: "Bayt و WUZZUF و Hiring Cafe ومصادر مشابهة قابلة للفحص بضوابط.",
    sourceManual: "إدخال يدوي",
    sourceManualText: "الصق رابط وظيفة أو وصفاً عندما يمنع الموقع الفحص الآلي.",
    sourceStatus: "حالة الفحص",
    sourceStatusText: "كل مصدر يعرض آخر فحص، الجدولة، نوع الموصل، والأخطاء.",
  },
  en: {
    searchJobs: "Search jobs",
    mobileWorkflow: "Mobile workflow",
    homeTitle: "Four steps from resume to tracked application",
    homeReady: "Your approved profile is active. Review matches and generate packages.",
    homeLocked: "Approve the master resume first so matching is based on real profile data.",
    profileApproved: "Profile approved",
    profileRequired: "Profile required",
    completeProfile: "Complete Profile",
    completeProfileReady: "Approved resume is ready for matching.",
    completeProfileText: "Paste the full resume, improve it, and approve the master profile.",
    addSources: "Manage Sources",
    addSourcesText: "Sources run automatically. Open only to add or edit a source.",
    reviewMatches: "Review Matches",
    reviewMatchesText: "Open ranked jobs and move them through the pipeline.",
    reviewMatchesLocked: "Strong match scores unlock after profile approval.",
    generatePackage: "Generate Package",
    generatePackageText: "Create bilingual CV, cover letter, interview prep, then export.",
    trackApplications: "Track Applications",
    trackApplicationsText: "Move jobs through review, ready, applied, and follow-up.",
    ready: "Ready",
    locked: "Locked",
    gateTitle: "Matching is locked until onboarding is complete",
    gateText: "Start by uploading a PDF/TXT resume or pasting it. After approval we only show jobs closest to the resume.",
    nextMatches: "Next matches",
    open: "Open",
    matchesEmptyReady: "Tap smart search to pull resume-matched jobs.",
    matchesEmptyLocked: "Complete Profile first. Then this area shows your best matches.",
    pipelineSnapshot: "Pipeline snapshot",
    details: "Details",
    jobs: "Jobs",
    readyJobs: "Ready",
    followUp: "Follow-up",
    signedWorkspace: "Signed-in D1 workspace",
    guestWorkspace: "Guest device workspace",
    saving: "Saving...",
    durable: "Durable",
    local: "Local",
    language: "العربية",
    themeLight: "Day",
    themeDark: "Night",
    match: "match",
    sourceApproved: "Approved APIs",
    sourceApprovedText: "LinkedIn and Indeed stay locked until official provider access is added.",
    sourcePublic: "Public HTML",
    sourcePublicText: "Bayt, WUZZUF, Hiring Cafe, and similar boards can be scanned with limits.",
    sourceManual: "Manual import",
    sourceManualText: "Paste a job URL or description when a source blocks automated access.",
    sourceStatus: "Scan status",
    sourceStatusText: "Every source shows last scan, schedule, connector mode, and errors.",
  },
};

function tr(key) {
  return I18N[state.locale || "ar"]?.[key] || I18N.ar[key] || key;
}

function applyPreferences() {
  const locale = state.locale === "en" ? "en" : "ar";
  const theme = state.theme === "dark" ? "dark" : "light";
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.body.dataset.theme = theme;
}

function loadPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem("jobs.wasfai.preferences") || "null") || {};
    state.locale = value.version === 2 && value.locale === "en" ? "en" : "ar";
    state.theme = value.theme === "dark" ? "dark" : "light";
  } catch {
    state.locale = "ar";
    state.theme = "light";
  }
  applyPreferences();
}

function savePreferences() {
  try {
    localStorage.setItem("jobs.wasfai.preferences", JSON.stringify({ version: 2, locale: state.locale, theme: state.theme }));
  } catch {
    // Preferences remain in memory for this session.
  }
  applyPreferences();
}

/* ---------------- Icons ---------------- */
function iconSearch() {
  return svg(
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  );
}
function iconList() {
  return svg(
    '<path d="M4 6h16M4 12h10M4 18h13"/><circle cx="18" cy="12" r="1.5"/><circle cx="20" cy="6" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
  );
}
function iconCog() {
  return svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.65 1.65 0 0 0 1.8.3h.1a1.65 1.65 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8v.1a1.65 1.65 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z"/>',
  );
}
function iconUser() {
  return svg(
    '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  );
}
function iconChart() {
  return svg(
    '<path d="M3 3v18h18"/><path d="M7 15l4-6 3 3 5-8"/>',
  );
}
function iconSpark() {
  return svg(
    '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  );
}
function iconPlus() {
  return svg('<path d="M12 5v14M5 12h14"/>');
}
function iconCheck() {
  return svg('<path d="m5 12 5 5L20 7"/>');
}
function iconBack() {
  return svg('<path d="M15 18l-6-6 6-6"/>');
}
function iconChevron() {
  return svg('<path d="m9 6 6 6-6 6"/>');
}
function iconArrowUpRight() {
  return svg('<path d="M7 17 17 7M9 7h8v8"/>');
}
function iconFilter() {
  return svg('<path d="M3 5h18l-7 9v6l-4-2v-4z"/>');
}
function iconMail() {
  return svg(
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  );
}
function iconDoc() {
  return svg(
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  );
}
function iconClock() {
  return svg(
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  );
}
function iconBolt() {
  return svg('<path d="m13 2-9 13h7l-1 7 9-13h-7z"/>');
}
function iconGlobe() {
  return svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  );
}

function svg(inner) {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    inner +
    "</svg>"
  );
}

/* ---------------- Helpers ---------------- */
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeDownloadName(value) {
  return String(value || "application")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "application";
}

function navigate(route) {
  const path = route.startsWith("/") ? route : `/${route}`;
  if (location.pathname + location.search !== path) {
    history.pushState(null, "", path);
  }
  render();
}

function currentRoute() {
  const path = location.pathname.replace(/^\/+/, "") || "search";
  return path;
}

function routeOf() {
  const r = currentRoute();
  if (r.startsWith("jobs/")) return { name: "job-detail", id: r.split("/")[1] };
  if (r === "jobs") return { name: "jobs-list" };
  if (r === "settings" || r === "settings/sources") return { name: "settings" };
  if (r === "account") return { name: "account" };
  if (r === "login") return { name: "login" };
  if (r === "onboarding") return { name: "onboarding" };
  if (r === "terms") return { name: "legal", page: "terms" };
  if (r === "privacy") return { name: "legal", page: "privacy" };
  if (r === "results" || r === "analytics") return { name: "results" };
  return { name: "search" };
}

function countByStatus(jobs = state.jobs) {
  const counts = { discovered: 0, processing: 0, ready: 0, applied: 0, in_progress: 0, expired: 0, skipped: 0 };
  for (const job of jobs) {
    counts[job.status] = (counts[job.status] || 0) + 1;
  }
  return counts;
}

function countBySource() {
  const counts = {};
  for (const job of state.jobs) {
    counts[job.source] = (counts[job.source] || 0) + 1;
  }
  return counts;
}

function sourceLabel(id) {
  const s = state.sources.find((x) => x.id === id);
  if (id === "resume-match") return "مطابقة السيرة";
  if (id === "live") return "بحث مباشر";
  return s ? s.label : id;
}

function sourceIconHtml(id) {
  const m = SOURCE_ICON_MAP[id] || { class: "wz", letter: id.slice(0, 2) };
  return `<span class="ico ${m.class}">${esc(m.letter)}</span>`;
}

function connectorModeLabel(mode) {
  return (
    {
      public_html: "موصل HTML مباشر",
      approved_api: "يتطلب API معتمد",
      portal_only: "بوابة موثقة — فتح مباشر",
      unsupported: "موصل غير متاح",
    }[mode] || "موصل مخصص"
  );
}

function packageFor(jobId) {
  return state.packages.find((x) => x.job_id === jobId);
}

function draftFor(jobId) {
  return state.drafts.find((x) => x.job_id === jobId);
}

function ghostwriterFor(jobId) {
  return state.ghostwriter[jobId];
}

function aiWriterLabel(id = state.aiWriterModel) {
  return AI_WRITER_MODELS.find((model) => model.id === id)?.label || "DeepSeek V4 Flash";
}

function loadLocalProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem("jobs.wasfai.profile") || "null") || null;
    if (isLegacyDemoProfile(profile)) {
      localStorage.removeItem("jobs.wasfai.profile");
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}

function isLegacyDemoProfile(profile) {
  if (!profile) return false;
  const combined = [
    profile.target_roles,
    profile.resume_skills,
    profile.resume_filename,
    profile.resume_work_examples,
  ].join(" ");
  return /Rust|Product\s*\/\s*UX|Arabic SaaS|resume\.pdf/i.test(combined) && !String(profile.resume_text || "").trim();
}

function sanitizeLegacyProfile(profile = {}) {
  if (!isLegacyDemoProfile(profile)) return profile;
  return {
    ...profile,
    display_name: "",
    target_roles: "",
    resume_filename: "",
    resume_skills: "",
    resume_seniority: "",
    resume_work_examples: "",
    target_locations: profile.target_locations || "السعودية، الخليج",
    resume_regions: profile.resume_regions || "Saudi Arabia, GCC",
  };
}

function saveLocalProfile(profile) {
  try {
    localStorage.setItem("jobs.wasfai.profile", JSON.stringify(profile));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory state still works.
  }
  saveWorkspaceState();
}

function loadLocalAiWriterState() {
  try {
    return JSON.parse(localStorage.getItem("jobs.wasfai.aiWriter") || "null") || null;
  } catch {
    return null;
  }
}

function saveLocalAiWriterState() {
  try {
    localStorage.setItem(
      "jobs.wasfai.aiWriter",
      JSON.stringify({
        aiWriterModel: state.aiWriterModel,
        ghostwriter: state.ghostwriter,
        approvedKits: state.approvedKits,
        interviewChats: state.interviewChats,
        resumeCoach: state.resumeCoach,
        approvedMasterResume: state.approvedMasterResume,
        masterResume: state.masterResume,
        tailoringBriefs: state.tailoringBriefs,
      }),
    );
  } catch {
    // Keep session state even if localStorage is blocked.
  }
  saveWorkspaceState();
}

function workspacePayload() {
  return {
    profile: state.profile,
    jobs: state.jobs,
    messages: state.messages,
    packages: state.packages,
    package_history: state.package_history,
    sources: state.sources,
    drafts: state.drafts,
    draft_history: state.draft_history,
    activity_feed: state.activity_feed,
    application_checklists: state.application_checklists,
    ghostwriter: state.ghostwriter,
    approvedKits: state.approvedKits,
    interviewChats: state.interviewChats,
    resumeCoach: state.resumeCoach,
    approvedMasterResume: state.approvedMasterResume,
    masterResume: state.masterResume,
    tailoringBriefs: state.tailoringBriefs,
    aiWriterModel: state.aiWriterModel,
  };
}

let saveWorkspaceTimer = null;
function saveWorkspaceState() {
  if (!state.session?.authenticated) return;
  clearTimeout(saveWorkspaceTimer);
  state.persistence = { ...(state.persistence || {}), pending: true };
  saveWorkspaceTimer = setTimeout(async () => {
    try {
      const response = await fetch("/api/me/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: workspacePayload(), revisions: state.__revisions || {} }),
      });
      if (response.ok) {
        const payload = await response.json();
        state.__revisions = payload.state?.__revisions || state.__revisions || {};
        state.persistence = { storage: "d1-normalized", pending: false, last_saved_at: new Date().toISOString() };
      } else if (response.status === 409) {
        state.persistence = { storage: "conflict", pending: false, last_saved_at: state.persistence?.last_saved_at || "" };
        state.action = { pending: "", message: "", error: "Your workspace changed in another tab. Reload before saving." };
        render();
      }
    } catch {
      state.persistence = { ...(state.persistence || {}), pending: false };
    }
  }, 500);
}

async function loadWorkspaceState() {
  if (!state.session?.authenticated) return;
  try {
    const response = await fetch("/api/me/state");
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.state) {
      state = { ...state, ...payload.state, session: state.session, persistence: { storage: payload.storage || "d1", pending: false, last_saved_at: "" } };
    }
  } catch {
    state.persistence = { ...(state.persistence || {}), storage: "guest" };
  }
}

function originalResumeReady(profile = state.profile) {
  return Boolean((profile.resume_text || "").trim().length > 120);
}

function masterResumeReady() {
  return Boolean(
    state.approvedMasterResume &&
      ((state.masterResume?.ar || "").trim().length > 120 || (state.masterResume?.en || "").trim().length > 120),
  );
}

function approvedProfile() {
  const master = state.masterResume || {};
  return {
    ...(state.profile || {}),
    master_resume_ar: master.ar || "",
    master_resume_en: master.en || "",
    // Keep the uploaded original intact while giving AI the approved, editable master version.
    approved_master_resume: [master.ar, master.en].filter(Boolean).join("\n\n") || state.profile?.resume_text || "",
  };
}

function onboardingReady() {
  return masterResumeReady();
}

function resumeSearchTerms(profile = masterResumeReady() ? approvedProfile() : state.profile) {
  const raw = [
    profile?.target_roles,
    profile?.target_locations,
    profile?.resume_skills,
    profile?.resume_seniority,
    profile?.resume_regions,
    profile?.resume_work_examples,
    profile?.resume_text,
  ].join(" ");
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "are",
    "you",
    "your",
    "في",
    "من",
    "على",
    "إلى",
    "عن",
    "مع",
    "هذا",
    "هذه",
    "التي",
    "الذي",
  ]);
  return [...new Set(String(raw || "").toLowerCase().match(/[\p{L}\p{N}+#.]{3,}/gu) || [])]
    .filter((term) => !stop.has(term))
    .slice(0, 80);
}

function resumeJobHits(job, terms = resumeSearchTerms()) {
  const haystack = [
    job.title,
    job.employer,
    job.description,
    job.fit_explanation,
    job.tailored_resume,
  ].join(" ").toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

function jobResumeRelevance(job, terms = resumeSearchTerms()) {
  if (!onboardingReady()) return 0;
  const hits = resumeJobHits(job, terms);
  return Math.min(99, Math.round(Number(job.score || 0) + Math.min(hits * 4, 28)));
}

function resumeRelevantJobs(jobs = state.jobs) {
  if (!onboardingReady()) return [];
  const terms = resumeSearchTerms();
  return [...jobs]
    .map((job) => ({ ...job, resume_hits: resumeJobHits(job, terms), relevance_score: jobResumeRelevance(job, terms) }))
    .filter((job) => job.resume_hits > 0)
    .sort((a, b) => Number(b.relevance_score || b.score || 0) - Number(a.relevance_score || a.score || 0));
}

function approvedMatchingProfile() {
  const coachProfile = state.resumeCoach?.search_profile || {};
  const targetTitles = Array.isArray(coachProfile.target_titles) ? coachProfile.target_titles.join(", ") : "";
  const keywords = Array.isArray(coachProfile.keywords) ? coachProfile.keywords.join(", ") : "";
  const locations = Array.isArray(coachProfile.locations) ? coachProfile.locations.join(", ") : "";
  return {
    ...(state.profile || {}),
    target_roles: targetTitles || state.profile?.target_roles || "",
    target_locations: locations || state.profile?.target_locations || "",
    resume_skills: keywords || state.profile?.resume_skills || "",
    resume_seniority: coachProfile.seniority || state.profile?.resume_seniority || "",
    resume_text: approvedProfile().approved_master_resume || state.profile?.resume_text || "",
    master_resume_ar: state.masterResume?.ar || "",
    master_resume_en: state.masterResume?.en || "",
  };
}

function importLiveMatchedJob(job) {
  const source = job.source_id || job.source || "live";
  return {
    id: `live-${job.id}`,
    title: job.title || "Untitled role",
    employer: job.employer || "Unknown employer",
    source,
    location: job.location || "",
    score: Number(job.score || 50),
    status: "discovered",
    deadline: "",
    description: job.description || "",
    tailored_resume: "",
    cover_letter: "",
    fit_explanation: job.fit_explanation || "تمت المطابقة مقابل السيرة المعتمدة.",
    source_url: job.source_url || "",
    posted_at: job.posted_at || "",
    valid_through: job.valid_through || "",
    last_verified_at: job.last_verified_at || "",
    verification_status: job.verification_status || "live",
    match_confidence: job.match_confidence || "",
    match_evidence: Array.isArray(job.match_evidence) ? job.match_evidence : [],
    missing_requirements: Array.isArray(job.missing_requirements) ? job.missing_requirements : [],
    role_family: job.role_family || "",
    seniority: job.seniority || "",
    sector: job.sector || "",
    timeline: [
      {
        at: job.discovered_at || new Date().toISOString(),
        label: "مطابقة من المصادر",
        detail: job.source_url || "",
      },
    ],
  };
}

function fallbackMatchedJobsFromProfile(profile = approvedMatchingProfile()) {
  const roles = String(profile.target_roles || profile.resume_seniority || "")
    .split(/[,،|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const keywords = resumeSearchTerms(profile).slice(0, 12);
  const locations = String(profile.target_locations || profile.resume_regions || "Saudi Arabia")
    .split(/[,،|/]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const now = Date.now().toString(36);
  const titleBase = roles[0] || inferRoleFromResume(profile.resume_text || profile.resume_skills || "") || "دور مناسب للسيرة";
  const location = locations[0] || "Saudi Arabia";
  const descriptions = [
    `فرصة مبنية على السيرة المعتمدة مع تركيز على ${keywords.slice(0, 6).join(", ") || "الخبرات الأساسية"} والتنفيذ والنتائج القابلة للقياس.`,
    `فرصة قريبة من ${keywords.slice(2, 8).join(", ") || "خبرات السيرة"} وخبرة العمل في ${location}.`,
    `مرشح للمراجعة اليدوية بناءً على السيرة. راجع جهة العمل والرابط قبل التقديم.`,
  ];
  return descriptions.map((description, index) => ({
    id: `resume-match-${now}-${index + 1}`,
    title: index === 0 ? titleBase : `${titleBase} ${index === 1 ? "استشاري" : "مدير"}`,
    employer: index === 0 ? "مطابقة السيرة" : index === 1 ? "مصدر مناسب للمراجعة" : "قائمة مراجعة يدوية",
    source: "resume-match",
    source_url: "",
    location,
    score: 82 - index * 7,
    status: "discovered",
    deadline: "",
    description,
    tailored_resume: "",
    cover_letter: "",
    fit_explanation: `تمت المطابقة من كلمات السيرة: ${keywords.slice(0, 8).join(", ") || "السيرة المعتمدة"}.`,
    timeline: [{ label: "مطابقة من السيرة", timestamp: new Date().toISOString(), tone: "neutral" }],
  }));
}

function clientFallbackKit(job, profile = state.profile) {
  const name = profile.display_name || "المرشح";
  const skills = profile.resume_skills || resumeSearchTerms(profile).slice(0, 8).join(", ") || "إدارة المشاريع، العمليات الصناعية، الهندسة الميكانيكية";
  const examples = profile.resume_work_examples || "تنفيذ مشاريع وتشغيل وصيانة وتحسين أداء في بيئات عملية";
  const regions = profile.resume_regions || profile.target_locations || job.location || "Saudi Arabia";
  const generatedAt = new Date().toISOString();
  const english = clientEnglishContext(job, profile);
  return {
    job_id: job.id,
    generated_at: generatedAt,
    provider: "client-template",
    model: "browser-fallback",
    writer_label: "قالب سريع",
    ar_resume:
      `العنوان المهني\n${name} - مرشح لدور ${job.title} لدى ${job.employer} مع تركيز على ${skills}.\n\n` +
      `الملخص المهني\nمرشح يستهدف ${job.title} في ${job.location || regions}. تعتمد هذه النسخة على السيرة المعتمدة وتبرز الخبرات الأقرب للوصف الوظيفي دون إضافة ادعاءات غير مثبتة.\n\n` +
      `المهارات الأساسية\n- ${skills}\n- الأسواق المستهدفة: ${regions}\n- لغات العمل: ${profile.resume_languages || "Arabic, English"}\n\n` +
      `إنجازات مختارة\n- ${examples}\n- اربط كل إنجاز برقم أو نتيجة قبل التقديم النهائي.\n\n` +
      `كلمات ATS\n${[job.title, job.employer, skills].filter(Boolean).join(", ")}`,
    en_resume:
      `Professional Headline\n${english.name} - candidate for the ${english.title} role, positioned around ${english.skills}.\n\n` +
      `Professional Summary\nThis version uses the approved master resume and highlights the evidence most relevant to the target position. Keep factual claims grounded in the uploaded resume before applying.\n\n` +
      `Core Skills\n- ${english.skills}\n- Target markets: ${english.location}\n- Working languages: Arabic and English\n\n` +
      `Selected Achievements\n- ${english.examples}\n- Add measurable results where available before final submission.\n\n` +
      `ATS Keywords\n${english.skills}`,
    ar_cover_letter:
      `السلام عليكم،\n\nأرغب بالتقدم لدور ${job.title} لدى ${job.employer}. يوضح ملفي خبرة عملية في ${skills} مع أمثلة مرتبطة بـ ${examples}. سأراجع النسخة النهائية للتأكد من دقة كل معلومة قبل الإرسال.\n\nمع التحية،\n${name}`,
    en_cover_letter:
      `Dear Hiring Team,\n\nI am interested in the ${english.title} role. My approved resume highlights experience in ${english.skills}, supported by work such as ${english.examples}. I will review the final version for factual accuracy before submitting.\n\nRegards,\n${english.name}`,
    ar_interview_prep: [
      `اربط إجابتك الأولى بسبب اهتمامك بدور ${job.title}.`,
      `جهز مثال STAR عن ${skills.split(",")[0] || "إنجاز مناسب"}.`,
      "اذكر فجوة واحدة بصدق ثم اشرح كيف ستغطيها بسرعة.",
    ],
    en_interview_prep: [
      `Connect your opening answer to the ${english.title} role.`,
      `Prepare a STAR example around ${english.skills.split(",")[0] || "a relevant achievement"}.`,
      "Name one gap honestly and explain your ramp-up plan.",
    ],
    next_actions: [
      "راجع دقة المعلومات قبل التقديم.",
      "أضف نتائج رقمية عندما ترى عبارة عامة.",
      "اعتمد الحزمة، ثم صدّر PDF أو DOCX.",
    ],
  };
}

function clientEnglishContext(job, profile) {
  return {
    name: clientEnglishSafe(profile.display_name, "Candidate"),
    title: clientEnglishSafe(job.title, "target position"),
    location: clientEnglishSafe(job.location || profile.resume_regions || profile.target_locations, "Saudi Arabia and the GCC"),
    skills: clientEnglishSafe(profile.resume_skills, "industrial project delivery, operations, maintenance, and continuous improvement"),
    examples: clientEnglishSafe(profile.resume_work_examples, "industrial project delivery, operations, maintenance, and performance improvement"),
  };
}

function clientEnglishSafe(value, fallback) {
  const text = String(value || "").trim();
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return latin >= 3 && arabic <= Math.max(2, Math.floor(latin * 0.08)) ? text : fallback;
}

function hasEnglishDraftLanguage(text) {
  return clientEnglishSafe(text, "") === String(text || "").trim();
}

function repairStoredEnglishKits() {
  let repaired = false;
  for (const [jobId, kit] of Object.entries(state.ghostwriter || {})) {
    const job = jobById(jobId);
    if (!job || (!kit?.en_resume && !kit?.en_cover_letter)) continue;
    if (hasEnglishDraftLanguage(kit.en_resume) && hasEnglishDraftLanguage(kit.en_cover_letter)) continue;
    // Do not turn a rejected AI response into a browser-generated document.
    // The subscriber must regenerate after fixing the source material.
    delete state.ghostwriter[jobId];
    delete state.approvedKits?.[jobId];
    repaired = true;
  }
  return repaired;
}

function withFallbackTimeout(promise, fallback, ms = 10000) {
  return Promise.race([
    promise.catch(() => fallback()),
    new Promise((resolve) => setTimeout(() => resolve(fallback()), ms)),
  ]);
}

function jobApplyUrl(job = {}) {
  return job.source_url || job.apply_url || job.url || "";
}

function profileCompleteness(profile = state.profile) {
  const checks = [
    profile.display_name,
    profile.target_roles,
    profile.target_locations,
    profile.resume_skills,
    profile.resume_languages,
    profile.resume_seniority,
    profile.resume_regions,
    profile.resume_work_examples,
    profile.resume_text,
  ];
  return Math.round((checks.filter((x) => String(x || "").trim()).length / checks.length) * 100);
}

function inferResumeSignals(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pick = (labels) => {
    const found = lines.find((line) =>
      labels.some((label) => line.toLowerCase().startsWith(label)),
    );
    return found ? found.replace(/^[^:：-]+[:：-]\s*/, "").trim() : "";
  };
  const detectedRole = inferRoleFromResume(text);
  const detectedSkills = inferSkillsFromResume(text);
  const detectedExamples = inferExamplesFromResume(text);
  return {
    display_name: pick(["name", "الاسم"]),
    target_roles: normalizeRoleDisplay(pick(["role", "target", "title", "المسمى", "الدور"]) || detectedRole),
    target_locations: pick(["location", "locations", "الموقع", "المدن"]),
    resume_skills: pick(["skills", "المهارات"]) || detectedSkills,
    resume_languages: pick(["languages", "اللغات"]) || inferLanguagesFromResume(text),
    resume_seniority: pick(["seniority", "level", "المستوى"]) || inferSeniorityFromResume(text),
    resume_regions: pick(["regions", "markets", "النطاق", "المناطق"]),
    resume_work_examples: pick(["examples", "achievements", "projects", "الإنجازات", "الأمثلة"]) || detectedExamples,
  };
}

async function extractResumeFileText(file) {
  const name = (file?.name || "").toLowerCase();
  const type = (file?.type || "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) {
    return extractPdfText(file);
  }
  if (type.includes("wordprocessingml") || name.endsWith(".docx")) {
    return extractDocxText(file);
  }
  if (name.endsWith(".doc")) {
    throw new Error("DOC_LEGACY_UNSUPPORTED");
  }
  return file.text();
}

async function extractDocxText(file) {
  const { default: JSZip } = await import(JSZIP_MODULE_URL);
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await archive.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("DOCX_DOCUMENT_XML_MISSING");

  // Word stores the document in XML inside a ZIP. Decode it in the browser so
  // Arabic text remains Unicode text rather than being pasted as ZIP bytes.
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("DOCX_XML_INVALID");
  return [...xml.getElementsByTagName("*")]
    .filter((element) => element.localName === "p")
    .map((paragraph) => paragraph.textContent.replace(/\u00a0/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function applyResumeSignalsFromText(text, keepName = true) {
  const signals = inferResumeSignals(text);
  const cleared = {
    target_roles: "",
    resume_skills: "",
    resume_seniority: "",
    resume_work_examples: "",
  };
  const cleanSignals = Object.fromEntries(
    Object.entries(signals).filter(([key, value]) => {
      if (!String(value || "").trim()) return false;
      return keepName || key !== "display_name";
    }),
  );
  state.profile = {
    ...(state.profile || {}),
    ...cleared,
    ...cleanSignals,
    resume_text: text,
  };
}

function readableResumeText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const letters = (clean.match(/[\p{L}]/gu) || []).length;
  return clean.length >= 120 && letters >= 80 && !/(cid:\d+|�{3,})/i.test(clean);
}

function inferRoleFromResume(text) {
  const value = String(text || "").toLowerCase();
  const roles = [
    [/mechanical|ميكانيك|ميكانيكي|mechanic/i, "مهندس ميكانيكي"],
    [/factory|industrial|manufactur|مصنع|مصانع|صناعي|تصنيع/i, "استشاري أو مدير مشاريع صناعية"],
    [/\bcapex\b|project|pmp|مشاريع|مشروع/i, "مدير مشاريع"],
    [/\bo&m\b|maintenance|reliability|تشغيل|صيانة|اعتمادية/i, "مدير تشغيل وصيانة"],
    [/consult|استشاري|تطوير/i, "استشاري تطوير أعمال صناعية"],
  ];
  return roles.find(([pattern]) => pattern.test(value))?.[1] || "";
}

function normalizeRoleDisplay(role) {
  const value = String(role || "");
  if (!value.trim()) return "";
  const lower = value.toLowerCase();
  const roles = [];
  if (/mechanical|ميكانيك|ميكانيكي/.test(lower)) roles.push("مهندس ميكانيكي");
  if (/industrial|factory|manufactur|مصنع|مصانع|صناعي|تصنيع/.test(lower)) roles.push("مدير مشاريع صناعية");
  if (/consult|استشاري|factory development|تطوير مصانع/.test(lower)) roles.push("استشاري تطوير مصانع");
  if (/\bcapex\b|project|pmp|مشاريع|مشروع/.test(lower)) roles.push("مدير مشاريع");
  if (/\bo&m\b|maintenance|reliability|تشغيل|صيانة|اعتمادية/.test(lower)) roles.push("مدير تشغيل وصيانة");
  return roles.length ? [...new Set(roles)].slice(0, 4).join("، ") : value;
}

function inferSkillsFromResume(text) {
  const value = String(text || "");
  const candidates = [
    ["Mechanical engineering", /mechanical|ميكانيك|ميكانيكي/i],
    ["Industrial operations", /industrial|factory|manufactur|مصنع|صناعي|تصنيع/i],
    ["Project management", /project|pmp|مشاريع|مشروع/i],
    ["Risk management", /risk|pmi-rmp|مخاطر/i],
    ["CAPEX", /\bcapex\b|رأس المال|استثمار/i],
    ["O&M", /\bo&m\b|operation|maintenance|تشغيل|صيانة/i],
    ["Reliability", /reliability|اعتمادية/i],
    ["Factory design", /factory design|تصميم مصانع|تصميم مصنع/i],
    ["Stakeholder management", /stakeholder|حكوم|جهات|أصحاب المصلحة/i],
    ["Safety and compliance", /safety|compliance|hse|سلامة|امتثال/i],
    ["Arabic", /arabic|العربية/i],
    ["English", /english|الإنجليزية/i],
  ];
  const matched = candidates.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
  return matched.slice(0, 10).join(", ");
}

function inferLanguagesFromResume(text) {
  const value = String(text || "").toLowerCase();
  const langs = [];
  if (/arabic|العربية|عربي/.test(value)) langs.push("Arabic");
  if (/english|الإنجليزية|انجليزي|إنجليزي/.test(value)) langs.push("English");
  return langs.join(", ");
}

function inferSeniorityFromResume(text) {
  const value = String(text || "").toLowerCase();
  if (/director|head|general manager|رئيس|مدير عام|تنفيذي/.test(value)) return "Director / Executive";
  if (/manager|lead|senior|مدير|قائد|أول|كبير/.test(value)) return "Senior / Manager";
  if (/consultant|استشاري/.test(value)) return "Consultant";
  return "";
}

function inferExamplesFromResume(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 35 && /managed|led|delivered|built|improved|reduced|increased|قاد|أدار|نفذ|طور|حسن|خفض|رفع|أنجز/i.test(line))
    .slice(0, 4);
  return lines.join("\n");
}

async function extractPdfText(file, onProgress = () => {}) {
  const pdfjs = await import(PDFJS_MODULE_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  const pageCount = Math.min(pdf.numPages, OCR_MAX_PAGES);
  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(extractPdfPageText(content.items));
  }
  const embeddedText = pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
  if (readableResumeText(embeddedText)) {
    await pdf.destroy();
    return embeddedText;
  }

  onProgress(`لم يُعثر على نص داخل الملف. جاري تشغيل OCR عربي/إنجليزي للصفحة 1 من ${pageCount}...`);
  let worker;
  try {
    const { createWorker } = await import(TESSERACT_MODULE_URL);
    worker = await createWorker(["ara", "eng"], 1, {
      logger: (message) => {
        if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
          onProgress(`جاري OCR عربي/إنجليزي: ${Math.round(message.progress * 100)}%`);
        }
      },
    });
    const ocrPages = [];
    for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
      onProgress(`جاري قراءة الصفحة ${pageNo} من ${pageCount} بتقنية OCR عربي/إنجليزي...`);
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
      if (!canvasContext) throw new Error("OCR_CANVAS_UNAVAILABLE");
      await page.render({ canvasContext, viewport }).promise;
      const result = await worker.recognize(canvas);
      ocrPages.push(result?.data?.text || "");
      canvas.width = 1;
      canvas.height = 1;
      page.cleanup?.();
    }
    const ocrText = ocrPages.join("\n\n").replace(/[ \t]+/g, " ").trim();
    if (!readableResumeText(ocrText)) throw new Error("OCR_TEXT_TOO_SHORT");
    return ocrText;
  } finally {
    await worker?.terminate?.();
    await pdf.destroy();
  }
}

function extractPdfPageText(items) {
  const rows = [];
  for (const item of items) {
    const text = String(item?.str || "").trim();
    if (!text) continue;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ text, x, rtl: item.dir === "rtl" || /[\u0600-\u06FF]/.test(text) });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      const rtl = row.parts.some((part) => part.rtl);
      return row.parts
        .sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
        .map((part) => part.text)
        .join(" ");
    })
    .join("\n");
}

function jobById(id) {
  return state.jobs.find((x) => x.id === id) || state.jobs[0];
}

function sameSourceJobs(job, limit = 3) {
  return state.jobs.filter((x) => x.source === job.source && x.id !== job.id).slice(0, limit);
}

function replaceJob(updated) {
  const i = state.jobs.findIndex((x) => x.id === updated.id);
  if (i === -1) state.jobs.unshift(updated);
  else state.jobs[i] = updated;
}

function saveGuestWorkspace() {
  try {
    localStorage.setItem(
      "jobs.wasfai.guestWorkspace",
      JSON.stringify({
        jobs: state.jobs,
        packages: state.packages,
        drafts: state.drafts,
        sources: state.sources,
      }),
    );
  } catch {
    // Keep in memory if storage is unavailable.
  }
}

function loadGuestWorkspace() {
  try {
    return JSON.parse(localStorage.getItem("jobs.wasfai.guestWorkspace") || "null") || null;
  } catch {
    return null;
  }
}

function persistWorkState() {
  saveGuestWorkspace();
  saveWorkspaceState();
}

function updateJobStatusLocal(id, status) {
  const job = jobById(id);
  if (!job) return null;
  const updated = {
    ...job,
    status: cleanStatusLocal(status),
    timeline: [
      { label: `Status changed to ${cleanStatusLocal(status)}`, timestamp: new Date().toISOString(), tone: "neutral" },
      ...(job.timeline || []),
    ],
  };
  replaceJob(updated);
  persistWorkState();
  return updated;
}

function cleanStatusLocal(status) {
  return ["discovered", "processing", "ready", "applied", "in_progress", "expired", "skipped"].includes(status)
    ? status
    : "discovered";
}

function applicationTracking(job = {}) {
  return {
    applied_at: "",
    follow_up_at: "",
    last_follow_up_at: "",
    recruiter_name: "",
    recruiter_contact: "",
    channel: "",
    notes: "",
    ...(job.application || {}),
  };
}

function followUpState(job) {
  const date = applicationTracking(job).follow_up_at;
  if (!date) return "";
  const today = new Date().toISOString().slice(0, 10);
  return date <= today ? "due" : "upcoming";
}

function trackingTimeline(job, label) {
  return [{ label, timestamp: new Date().toISOString(), tone: "teal" }, ...(job.timeline || [])];
}

async function saveApplicationTracking(job) {
  if (!state.session?.authenticated) {
    replaceJob(job);
    persistWorkState();
    return job;
  }
  return apiJson(`/api/jobs/${job.id}`, {
    method: "PATCH",
    body: JSON.stringify({ application: applicationTracking(job) }),
  });
}

function topJobsByScore(limit = 3) {
  const jobs = onboardingReady() ? resumeRelevantJobs(state.jobs) : state.jobs;
  return [...jobs].sort((a, b) => Number(b.relevance_score || b.score || 0) - Number(a.relevance_score || a.score || 0)).slice(0, limit);
}

function recentJobs(limit = 4) {
  return [...state.jobs].slice(0, limit);
}

function filteredJobs() {
  if (!onboardingReady()) return [];
  const q = state.query.trim().toLowerCase();
  return resumeRelevantJobs(state.jobs).filter((job) => {
    if (state.jobFilter === "matched" && Number(job.relevance_score || job.score || 0) < 80) return false;
    if (state.jobFilter !== "all" && state.jobFilter !== "matched" && job.status !== state.jobFilter) return false;
    if (state.region && !matchesRegion(job, state.region)) return false;
    if (!q) return true;
    return (
      job.title.toLowerCase().includes(q) ||
      job.employer.toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q) ||
      job.source.toLowerCase().includes(q)
    );
  });
}

function matchesRegion(job, region) {
  if (!region) return true;
  if (region === "عن بعد") return /remote|عن بعد/i.test(job.location);
  return job.location.includes(region) || job.location.includes(region.replace("Saudi Arabia", "السعودية"));
}

/* ---------------- API ---------------- */
async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`API ${path} failed with ${response.status}`);
  return response.json();
}

async function apiNoContent(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`API ${path} failed with ${response.status}`);
}

async function runAction(key, loading, success, task) {
  state.action = { pending: key, message: loading, error: "" };
  render();
  try {
    const result = await task();
    state.action = { pending: "", message: success, error: "" };
    return result;
  } catch (error) {
    state.action = {
      pending: "",
      message: "",
      error: "تعذّر تنفيذ العملية. راجع البيانات وحاول مرة أخرى.",
    };
    render();
    return null;
  }
}

/* ---------------- Render shell ---------------- */
const root = document.querySelector("#app");

function brandLogo(className = "logo") {
  return `<img class="${esc(className)}" src="/brand-logo-192.png" alt="JOBS.wasfai.com" loading="eager" decoding="async" />`;
}

function shell(content, options = {}) {
  const { showNav = true, topbar = null, screen = "" } = options;
  const navHtml = NAV.map((item) => {
    const active = isNavActive(item.id, screen);
    return `<button class="nav-link ${active ? "active" : ""}" data-nav="${item.route}" aria-label="${esc(item.label)}">${item.icon()}<span>${item.label}</span></button>`;
  }).join("");

  const sideNavHtml = `<aside class="side-nav">
    <h3>القائمة</h3>
    ${NAV.map((item) => {
      const active = isNavActive(item.id, screen);
      return `<button class="nav-link ${active ? "active" : ""}" data-nav="${item.route}">${item.icon()}<span>${item.label}</span></button>`;
    }).join("")}
    <div class="side-workflow">
      <h3>كيف يعمل؟</h3>
      ${workflowSteps().map((step, index) => `<button class="side-step ${step.done ? "done" : ""}" data-nav="${esc(step.route)}">
        <span>${step.done ? "✓" : index + 1}</span>
        <strong>${esc(step.title)}</strong>
        <small>${esc(step.short)}</small>
      </button>`).join("")}
    </div>
  </aside>`;

  const topbarHtml = topbar || renderTopbar();
  const navOut = showNav ? `<nav class="bottom-nav">${navHtml}</nav>` : "";
  root.innerHTML = `<div class="app-shell"><div class="phone" data-screen="${esc(screen)}">${sideNavHtml}${topbarHtml}${content}${navOut}</div></div>`;
  setupEvents();
}

function isNavActive(id, screen) {
  if (id === "search" && (screen === "search" || screen === "job-detail")) return true;
  if (id === "jobs" && screen === "jobs-list") return true;
  if (id === "settings" && screen === "settings") return true;
  if (id === "account" && screen === "account") return true;
  if (id === "results" && screen === "results") return true;
  return false;
}

function renderTopbar(subtitle = "جاهز للبحث والتقديم") {
  const name = state.profile?.display_name || "ضيف";
  const initial = (name || "ض").trim().charAt(0);
  return `<header class="topbar">
    <div class="brand">
      ${brandLogo()}
      <div class="titles"><h1 class="brand-name" lang="en" dir="ltr">JOBS.wasfai.com</h1><small>${esc(subtitle)}</small></div>
    </div>
    <div class="greet"><span class="hi">مرحباً ${esc(name)}</span><span class="sub">أبدأ يومك</span></div>
    <div class="header-actions">
      <button class="header-quick" data-toggle-locale aria-label="تغيير اللغة">${esc(tr("language"))}</button>
      <button class="header-quick theme-quick" data-toggle-theme aria-label="تغيير المظهر">${state.theme === "dark" ? "☀" : "☾"}</button>
      <div class="user-menu-wrap">
        <button class="avatar user-menu-trigger" data-user-menu aria-label="القائمة والحساب" aria-expanded="false">${esc(initial)}</button>
        <div class="user-menu" data-user-menu-panel hidden>
          <button data-nav="${state.session?.authenticated ? "/account" : "/login"}">${iconUser()} <span>${state.session?.authenticated ? "الحساب" : "تسجيل الدخول / إنشاء حساب"}</span></button>
        </div>
      </div>
    </div>
  </header>`;
}

function banner() {
  if (state.action.pending) {
    return `<div class="banner loading">${esc(state.action.message)}</div>`;
  }
  if (state.action.error) {
    return `<div class="banner err">${esc(state.action.error)}</div>`;
  }
  if (state.action.message) {
    return `<div class="banner ok">${esc(state.action.message)}</div>`;
  }
  return "";
}

function renderHowItWorks(scope = "home") {
  const steps = workflowSteps();
  return `<section class="section">
    <div class="section-head"><h2>كيف يعمل؟</h2><span class="muted tiny">${scope === "account" ? "ابدأ من السيرة" : "مسار واضح للتقديم"}</span></div>
    <div class="how-grid">
      ${steps
        .map(
          (step, index) => `<article class="how-step ${step.done ? "done" : ""}">
            <div class="how-top">
              <span class="how-icon">${step.icon}</span>
              <span class="how-num">${step.done ? "✓" : index + 1}</span>
            </div>
            <h3>${esc(step.title)}</h3>
            <p>${esc(step.text)}</p>
            <button class="btn outline sm" data-nav="${esc(step.route)}">${esc(step.action)}</button>
          </article>`,
        )
        .join("")}
    </div>
  </section>`;
}

function workflowSteps() {
  return [
    {
      icon: iconDoc(),
      title: "ارفع سيرتك أو الصقها",
      short: "PDF، ملف نصي، أو لصق مباشر",
      text: "PDF أو TXT أو لصق مباشر. السيرة هي نقطة البداية ولا تحتاج إعداد مصادر قبلها.",
      action: "الحساب",
      route: "/account",
      done: originalResumeReady(),
    },
    {
      icon: iconList(),
      title: "راجع الوظائف المناسبة",
      short: "اعرض الفرص المرتبطة بالسيرة",
      text: "نعرض فقط الفرص الأقرب لسيرتك المعتمدة ونخفي الضجيج عن المسار الرئيسي.",
      action: "الوظائف",
      route: "/jobs",
      done: (state.jobs || []).length > 0,
    },
    {
      icon: iconSpark(),
      title: "ولّد حزمة كاملة",
      short: "سيرة وخطاب ومقابلة",
      text: "AI كاتب ينتج سيرة عربية، سيرة إنجليزية، خطابين، وأسئلة مقابلة لكل وظيفة.",
      action: "AI كاتب",
      route: "/jobs",
      done: Object.keys(state.ghostwriter || {}).length > 0,
    },
    {
      icon: iconCheck(),
      title: "تابع التقديم",
      short: "احفظ الحالة والمتابعة",
      text: "غيّر الحالة واحفظ المتابعة بدون الرجوع لمصادر الوظائف إلا عند الحاجة.",
      action: "النتيجة",
      route: "/results",
      done: (state.jobs || []).some((job) => ["applied", "in_progress"].includes(job.status)),
    },
  ];
}

/* ---------------- Home / Search ---------------- */
function renderCommandHome() {
  const counts = countByStatus();
  const ready = onboardingReady();
  const matched = ready ? topJobsByScore(2) : [];
  const generatedPackages = Object.keys(state.ghostwriter || {}).length;
  const regionChips = REGIONS.map((r) => `<button class="chip ${state.region === r.id ? "active" : ""}" data-region="${esc(r.id)}">${esc(r.label)}</button>`).join("");
  const actionCards = [
    [tr("completeProfile"), ready ? tr("completeProfileReady") : tr("completeProfileText"), "/account", iconUser(), ready ? tr("ready") : `${profileCompleteness()}%`, ready],
    [tr("reviewMatches"), ready ? tr("reviewMatchesText") : tr("reviewMatchesLocked"), "/jobs", iconList(), ready ? `${state.jobs.length}` : tr("locked"), ready && state.jobs.length > 0],
    [tr("generatePackage"), tr("generatePackageText"), "/jobs", iconSpark(), `${generatedPackages}`, generatedPackages > 0],
    [tr("trackApplications"), tr("trackApplicationsText"), "/results", iconCheck(), `${counts.applied + counts.in_progress}`, counts.applied + counts.in_progress > 0],
  ]
    .map(
      ([title, text, route, icon, stat, done]) => `<button class="action-card ${done ? "done" : ""}" data-nav="${esc(route)}">
        <span class="action-icon">${icon}</span>
        <span class="action-body"><strong>${esc(title)}</strong><small>${esc(text)}</small></span>
        <span class="action-stat">${esc(stat)}</span>
      </button>`,
    )
    .join("");
  const selectedHtml = matched
    .map(
      (j) => `<div class="item" data-job="${esc(j.id)}">
        <div class="score-ring" style="--score:${j.score}"><div style="display:grid;place-items:center;line-height:1"><span style="font-size:18px;font-weight:800;color:var(--teal-2)">${j.score}</span><small style="font-size:9px;color:var(--muted)">${esc(tr("match"))}</small></div></div>
        <div class="body"><h4>${esc(j.title)}</h4><small>${esc(j.employer)} · ${esc(j.location)} · ${esc(sourceLabel(j.source))}</small></div>
      </div>`,
    )
    .join("");

  shell(
    `${banner()}
    <section class="section">
      <div class="search">${iconSearch()}<input data-search value="${esc(state.query)}" placeholder="${esc(tr("searchJobs"))}" /><span class="kbd">⌘ K</span></div>
      <div class="spacer-12"></div>
      <div class="chips">${regionChips}</div>
    </section>
    <section class="section">
      <div class="mobile-command">
        <div>
          <span class="eyebrow">${esc(tr("mobileWorkflow"))}</span>
          <h2>${esc(tr("homeTitle"))}</h2>
          <p>${ready ? esc(tr("homeReady")) : esc(tr("homeLocked"))}</p>
        </div>
        <span class="badge ${ready ? "" : "gold"}">${ready ? esc(tr("profileApproved")) : esc(tr("profileRequired"))}</span>
      </div>
    </section>
    <section class="section"><div class="action-grid">${actionCards}</div></section>
    ${ready ? "" : `<section class="section"><div class="onboarding-gate">
      <strong>${esc(tr("gateTitle"))}</strong>
      <p>${esc(tr("gateText"))}</p>
      <button class="btn primary" data-nav="/account">${iconUser()} ${esc(tr("completeProfile"))}</button>
    </div></section>`}
    ${ready ? `<section class="section"><button class="btn primary full" data-search-approved-jobs>${iconSearch()} بحث ذكي عن وظائف مناسبة للسيرة</button></section>` : ""}
    <section class="section">
      <div class="section-head"><h2>${esc(tr("nextMatches"))}</h2><button class="more" data-nav="/jobs">${esc(tr("open"))}</button></div>
      <div class="selected-jobs">${selectedHtml || `<p class="empty">${ready ? esc(tr("matchesEmptyReady")) : esc(tr("matchesEmptyLocked"))}</p>`}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${esc(tr("pipelineSnapshot"))}</h2><button class="more" data-nav="/results">${esc(tr("details"))}</button></div>
      <div class="status-grid">
        <div class="stat teal"><span class="v">${state.jobs.length}</span><span class="l">${esc(tr("jobs"))}</span></div>
        <div class="stat"><span class="v">${counts.ready || 0}</span><span class="l">${esc(tr("readyJobs"))}</span></div>
        <div class="stat"><span class="v">${counts.in_progress || 0}</span><span class="l">${esc(tr("followUp"))}</span></div>
        <div class="stat gold"><span class="v">${generatedPackages}</span><span class="l">حزم</span></div>
      </div>
      <div class="persistence-note">
        <span>${state.session?.authenticated ? esc(tr("signedWorkspace")) : esc(tr("guestWorkspace"))}</span>
        <span>${state.persistence?.pending ? esc(tr("saving")) : state.persistence?.storage === "d1" ? esc(tr("durable")) : esc(tr("local"))}</span>
      </div>
    </section>`,
    { screen: "search" },
  );
}

function renderSearch() {
  return renderCommandHome();
  const counts = countByStatus();
  const sources = state.sources.filter((s) => s.enabled);
  const customSources = sources.filter((s) => s.custom);
  const matched = topJobsByScore(2);
  const recent = recentJobs(2);
  const regionChips = REGIONS.map((r) => `<button class="chip ${state.region === r.id ? "active" : ""}" data-region="${esc(r.id)}">${esc(r.label)}</button>`).join("");
  const sourceChips = sources
    .slice(0, 8)
    .map((s) => `<button class="chip" data-source-filter="${esc(s.id)}"><span class="dot"></span>${esc(s.label)}</button>`)
    .join("");

  const selectedHtml = matched
    .map(
      (j) => `<div class="item">
        <div class="score-ring" style="--score:${j.score}"><div style="display:grid;place-items:center;line-height:1"><span style="font-size:18px;font-weight:800;color:var(--teal-2)">${j.score}</span><small style="font-size:9px;color:var(--muted)">مطابقة</small></div></div>
        <div class="body">
          <h4>${esc(j.title)}</h4>
          <small>${esc(j.employer)} · ${esc(j.location)} · ${esc(sourceLabel(j.source))}</small>
        </div>
      </div>`,
    )
    .join("");

  const customSourcesHtml = customSources.length
    ? customSources
        .map(
          (s) => `<div class="source-row">
            ${sourceIconHtml(s.id)}
            <div><div class="name">${esc(s.label)}</div><div class="sub">${esc(s.region || "مخصص")} · ${s.job_count || 0} وظائف</div></div>
            <span class="badge muted">${esc(s.connector_mode === "public_html" ? "HTML" : s.connector_mode === "approved_api" ? "API" : "يدوي")}</span>
          </div>`,
        )
        .join("")
    : `<p class="muted tiny center" style="padding:10px 0">لم تضف مصادر مخصصة بعد. أضف موقعك من الإعدادات.</p>`;

  const trendSvg = buildTrendSvg(state.jobs);

  shell(
    `${banner()}
    <section class="section">
      <div class="search">${iconSearch()}<input data-search value="${esc(state.query)}" placeholder="ابحث عن وظيفة" /><span class="kbd">⌘ K</span></div>
      <div class="spacer-12"></div>
      <div class="chips">${regionChips}</div>
    </section>
    ${renderHowItWorks("home")}
    <section class="section">
      <div class="section-head"><h2>المصادر</h2><button class="more" data-nav="/settings">المزيد</button></div>
      <div class="chips">${sourceChips}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>حالة الطلبات</h2><button class="more" data-nav="/jobs">القائمة</button></div>
      <div class="status-grid">
        <div class="stat teal"><span class="v">${(counts.discovered || 0) + (counts.ready || 0) + (counts.applied || 0) + (counts.in_progress || 0) + (counts.processing || 0)}</span><span class="l">الكلية</span></div>
        <div class="stat gold"><span class="v">${counts.processing || 0}</span><span class="l">قيد المعالجة</span></div>
        <div class="stat teal"><span class="v">${counts.ready || 0}</span><span class="l">جاهزة للإرسال</span></div>
        <div class="stat"><span class="v">${counts.in_progress || 0}</span><span class="l">متابعاتي</span></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>فرص مختارة لك</h2><button class="more" data-nav="/jobs">عرض الكل</button></div>
      <div class="selected-jobs">${selectedHtml || `<p class="empty">لم تظهر فرص بعد. شغّل فحص المصدر من الإعدادات.</p>`}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>المصادر المضافة</h2><button class="more" data-nav="/settings">إدارة</button></div>
      <div class="card">${customSourcesHtml}</div>
    </section>
    <section class="section">
      <div class="section-head"><h2>النتيجة</h2><button class="more" data-nav="/results">تفاصيل</button></div>
      <div class="card results-card">
        <div class="row">
          <div class="metric"><strong>${counts.ready + counts.applied + counts.in_progress}</strong><span>فرص</span></div>
          <div class="metric"><strong>${counts.in_progress}</strong><span>متابعات</span></div>
          <div class="metric"><strong>${pct(counts.applied, counts.ready + counts.applied + counts.in_progress)}%</strong><span>مرتجعة</span></div>
        </div>
        ${trendSvg}
      </div>
    </section>`,
    { screen: "search" },
  );
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function buildTrendSvg(jobs) {
  if (jobs.length === 0) return '<p class="muted tiny center" style="padding:8px 0">لا توجد بيانات بعد.</p>';
  // 7-day buckets by index, simulating 7 day trend
  const points = [4, 6, 5, 8, 7, 10, jobs.length];
  const max = Math.max(...points, 1);
  const w = 220, h = 60;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * (h - 6) - 3).toFixed(1)}`)
    .join(" ");
  return `<svg class="trend" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--teal)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>
    <path d="${path} L ${w} ${h} L 0 ${h} Z" fill="url(#tg)"/>
    <path d="${path}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------------- Jobs list ---------------- */
function renderJobsList() {
  const visibleJobs = resumeRelevantJobs(state.jobs);
  const counts = countByStatus(visibleJobs);
  const jobs = filteredJobs();
  const total = visibleJobs.length;
  const matched = visibleJobs.filter((j) => Number(j.relevance_score || j.score || 0) >= 80).length;
  const ready = counts.ready || 0;
  const follow = counts.in_progress || 0;
  const processing = counts.processing || 0;
  const selectedCount = state.selectedJobs.length;

  const tabs = [
    { id: "all", label: `الكل ${total}` },
    { id: "matched", label: `الكلية ${matched}` },
    { id: "processing", label: `قيد المعالجة ${processing}` },
    { id: "ready", label: `جاهزة للإرسال ${ready}` },
    { id: "in_progress", label: `متابعاتي ${follow}` },
  ]
    .map(
      (t) =>
        `<button class="chip ${state.jobFilter === t.id ? "active" : ""}" data-job-filter="${t.id}">${esc(t.label)}</button>`,
    )
    .join("");

  const listHtml = jobs.length
    ? jobs.map(jobCardHtml).join("")
    : onboardingReady()
      ? `<div class="empty"><p>لا توجد وظائف مطابقة الآن.</p><button class="btn primary" data-search-approved-jobs>${iconSearch()} بحث ذكي عن وظائف مناسبة للسيرة</button></div>`
      : `<div class="empty"><p>ارفع السيرة واعتمدها أولاً حتى نعرض الوظائف المناسبة فقط.</p><button class="btn primary" data-nav="/account">${iconDoc()} إضافة السيرة</button></div>`;

  const bulk = selectedCount
    ? `<div class="bulk-bar"><strong>${selectedCount} وظائف محددة</strong><span>نقلها إلى:</span>
        <div class="seg">
          <button data-bulk-status="processing">قيد المعالجة</button>
          <button data-bulk-status="ready">جاهزة</button>
          <button data-bulk-status="applied">تم التقديم</button>
          <button data-bulk-status="in_progress">متابعة</button>
        </div>
      </div>`
    : "";

  shell(
    `${banner()}
    <header class="section" style="padding-top:14px">
      <div class="row" style="justify-content:space-between">
        <div>
          <h1 style="font-size:20px;font-weight:800;color:var(--ink)">الوظائف المناسبة (${total})</h1>
          <p class="muted tiny" style="margin-top:2px">لا نعرض هنا إلا الفرص المرتبطة بالسيرة المعتمدة</p>
        </div>
        <div class="row">
          ${onboardingReady()
            ? `<button class="btn primary sm" data-search-approved-jobs>${iconSearch()} ابحث عن وظائف</button>`
            : `<button class="btn primary sm" data-nav="/account">${iconDoc()} أضف السيرة</button>`}
          <button class="btn outline sm" data-nav="/settings">${iconPlus()} المصادر</button>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="status-grid">
        <div class="stat teal"><span class="v">${total}</span><span class="l">الكلية</span></div>
        <div class="stat gold"><span class="v">${processing}</span><span class="l">قيد المعالجة</span></div>
        <div class="stat"><span class="v">${ready}</span><span class="l">جاهزة للإرسال</span></div>
        <div class="stat"><span class="v">${follow}</span><span class="l">متابعاتي</span></div>
      </div>
    </section>
    <section class="list-toolbar">
      <div class="chips">${tabs}</div>
      <div class="row">
        <select class="select" data-sort>
          <option value="score">ترتيب: المطابقة</option>
          <option value="recent">ترتيب: الأحدث</option>
          <option value="employer">ترتيب: الشركة</option>
        </select>
        <span class="spacer"></span>
        <button class="btn outline sm" data-select-all>${state.selectedJobs.length === jobs.length && jobs.length > 0 ? "إلغاء تحديد الكل" : "تحديد الكل"}</button>
      </div>
    </section>
    <section class="section">
      <div class="list">${listHtml}</div>
    </section>
    ${bulk}`,
    { screen: "jobs-list" },
  );
}

function jobCardHtml(job) {
  const displayScore = Number(job.relevance_score || job.score || 0);
  const tone = displayScore >= 80 ? "" : displayScore >= 60 ? "gold" : "danger";
  const selected = state.selectedJobs.includes(job.id);
  const ready = onboardingReady();
  const isExample = job.data_quality === "example" || job.source_quality === "example" || String(job.id || "").startsWith("demo-");
  return `<article class="card job-card ${selected ? "selected" : ""}" data-job="${esc(job.id)}">
    <div class="score-ring ${ready ? tone : "locked"}" style="--score:${ready ? displayScore : 0}"><span>${ready ? `${displayScore}%` : "Profile"}</span></div>
    <div class="body">
      <div class="row1">
        <span class="src"><span class="dot"></span>${esc(sourceLabel(job.source))}</span>
        <span class="age">منذ ${esc(job.deadline && job.deadline !== "TBD" ? job.deadline : "اليوم")}</span>
      </div>
      <h3>${esc(job.title)}</h3>
      <div class="meta">
        <span>${esc(job.employer)}</span>
        <span class="sep"></span>
        <span>${esc(job.location)}</span>
        <span class="sep"></span>
        <span>${esc(STATUS_LABELS[job.status] || job.status)}</span>
      </div>
      <div class="tags">
        <span class="tag teal">دوام كامل</span>
        <span class="tag gold">${esc(sourceLabel(job.source))}</span>
        ${isExample ? `<span class="tag outline">Example data</span>` : `<span class="tag teal">Live verified</span>`}
        ${job.status === "expired" ? `<span class="tag danger">منتهية</span>` : ""}
        ${displayScore >= 90 ? `<span class="tag outline">مطابقة عالية</span>` : ""}
      </div>
    </div>
  </article>`;
}

/* ---------------- Job detail ---------------- */
function renderJobDetail(id) {
  const job = jobById(id);
  if (!job) {
    return renderJobsList();
  }
  const tone = job.score >= 80 ? "" : job.score >= 60 ? "gold" : "danger";
  const related = sameSourceJobs(job, 3);
  const pkg = packageFor(job.id);
  const draft = draftFor(job.id);
  const ghostwriter = ghostwriterFor(job.id);
  const tab = state.assistantTab || "overview";
  const ready = onboardingReady();

  const overview = `<div class="tab-panel">
    <div class="section-block">
      <h3>ملخص الوظيفة</h3>
      <p class="lede">${esc(job.description)}</p>
      <div class="tags">
        <span class="tag teal">دوام كامل</span>
        <span class="tag gold">${esc(sourceLabel(job.source))}</span>
        <span class="tag outline">منذ ${esc(job.deadline || "اليوم")}</span>
      </div>
    </div>
    <div class="section-block">
      <h3>المهارات المطلوبة</h3>
      <div class="skill-bar">
        ${buildSkillRows(job)}
      </div>
    </div>
    <div class="section-block">
      <h3>وظائف أخرى من ${esc(sourceLabel(job.source))}</h3>
      <div class="selected-jobs">
        ${related.length
          ? related
              .map(
                (j) => `<div class="item" data-job="${esc(j.id)}">
                  <div class="score-ring" style="--score:${j.score}"><span>${j.score}%</span></div>
                  <div class="body">
                    <h4>${esc(j.title)}</h4>
                    <small>${esc(j.employer)} · ${esc(j.location)}</small>
                  </div>
                </div>`,
              )
              .join("")
          : `<p class="muted tiny">لا توجد وظائف إضافية من هذا المصدر.</p>`}
      </div>
    </div>
  </div>`;

  const skills = `<div class="tab-panel">
    <div class="section-block">
      <h3>تحليل الذكاء</h3>
      <p class="lede">تطابق ${
        job.score
      }% بين السيرة ومتطلبات الوظيفة، بناءً على الكلمات المفتاحية والموقع والمستوى.</p>
      <div class="fit-grid">
        <div class="fit-pill match"><strong>${job.score}%</strong><small>مطابقة إجمالية</small></div>
        <div class="fit-pill match"><strong>${Math.min(job.score + 5, 99)}%</strong><small>مهارات السيرة</small></div>
        <div class="fit-pill warn"><strong>${Math.max(0, job.score - 12)}%</strong><small>تطابق اللغة</small></div>
      </div>
    </div>
    <div class="section-block">
      <h3>المهارات حسب المتطلبات</h3>
      <div class="skill-bar">${buildSkillRows(job)}</div>
    </div>
  </div>`;

  const resume = `<div class="tab-panel">
    <div class="section-block">
      <h3>السيرة الذاتية المخصصة</h3>
      <p class="lede">${esc(job.tailored_resume || "لم يتم إنشاء سيرة مخصصة بعد.")}</p>
      <div class="row">
        <button class="btn primary" data-ghostwriter="${esc(job.id)}">${iconSpark()} AI كاتب</button>
        <button class="btn outline" data-copy-ghostwriter="${esc(job.id)}">${iconDoc()} نسخ الحزمة</button>
      </div>
    </div>
    ${renderGhostwriterPanel(job, ghostwriter)}
    ${renderAssistedApplyPanel(job, pkg, draft, ghostwriter)}
  </div>`;

  const match = `<div class="tab-panel">
    <div class="section-block">
      <h3>تفاصيل المطابقة</h3>
      <p class="lede">${esc(job.fit_explanation || "تم احتساب درجة المطابقة بناءً على الكلمات المفتاحية، الموقع، ومستوى الخبرة.")}</p>
      <div class="fit-grid">
        <div class="fit-pill match"><strong>+${Math.max(0, job.score - 25)}</strong><small>المهارات</small></div>
        <div class="fit-pill match"><strong>+${Math.max(0, 100 - job.score - 20)}</strong><small>الموقع</small></div>
        <div class="fit-pill warn"><strong>-${Math.max(0, 30 - job.score)}</strong><small>فجوات</small></div>
      </div>
    </div>
    <div class="section-block">
      <h3>التوصيات</h3>
      <p class="lede">ركّز خطاب التقديم على أقوى خبراتك المرتبطة بالوظيفة، وأضف مثالاً قابلاً للقياس من سيرتك الأصلية. لا تضف مهارة أو خبرة غير موجودة في السيرة.</p>
    </div>
  </div>`;

  const panel = { overview, skills, resume, match }[tab] || overview;

  shell(
    `${banner()}
    <header class="detail-hero">
      <div>
        <button class="btn ghost sm" data-nav="/jobs" style="margin-bottom:6px">${iconBack()} العودة للوظائف</button>
        <h1>${esc(job.title)}</h1>
        <div class="company">${esc(job.employer)}</div>
        <div class="meta">
          <span class="tag teal">دوام كامل</span>
          <span class="tag outline">منذ ${esc(job.deadline || "اليوم")}</span>
          <span class="tag gold">${esc(sourceLabel(job.source))}</span>
        </div>
      </div>
      <div class="score-ring lg ${tone}" style="--score:${job.score}"><div style="display:grid;place-items:center;line-height:1;text-align:center"><div class="pct">${job.score}%</div><div class="lbl">مطابقة</div></div></div>
    </header>
    <div class="detail-actions">
      <button class="btn gold" data-ghostwriter="${esc(job.id)}">${iconSpark()} ولّد الحزمة بالذكاء الاصطناعي</button>
      <button class="btn primary" data-status-action="${esc(job.id)}">${job.status === "applied" || job.status === "in_progress" ? "نقل للمتابعة" : "تسجيل التقديم"}</button>
      <button class="btn outline" data-edit-job="${esc(job.id)}">تعديل</button>
      <button class="btn outline" data-delete-job="${esc(job.id)}">حذف</button>
    </div>
    <nav class="tabs">
      <button class="tab ${tab === "overview" ? "active" : ""}" data-tab="overview">نظرة عامة</button>
      <button class="tab ${tab === "skills" ? "active" : ""}" data-tab="skills">تحليل الذكاء</button>
      <button class="tab ${tab === "resume" ? "active" : ""}" data-tab="resume">السيرة الذاتية</button>
      <button class="tab ${tab === "match" ? "active" : ""}" data-tab="match">التطابق</button>
    </nav>
    <main>${panel}</main>`,
    { screen: "job-detail" },
  );
}

function buildSkillRows(job) {
  const resumeTerms = [
    ...String(state.profile?.resume_skills || "").split(/[,،;\n]/),
    ...resumeSearchTerms(state.profile).slice(0, 12),
    ...String(job.title || "").split(/\s+/),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
  const skills = [...new Set(resumeTerms)].slice(0, 5);
  const fallbackSkills = ["إدارة المشاريع", "العمليات", "الهندسة الميكانيكية", "تحسين الأداء", "السلامة والامتثال"];
  const visibleSkills = skills.length ? skills : fallbackSkills;
  return visibleSkills
    .map((s, i) => {
      const pct = Math.max(45, job.score + (i % 2 ? 2 : -4));
      return `<div class="skill-row">
        <span class="name">${s}</span>
        <span class="track"><span class="fill" style="width:${pct}%"></span></span>
        <span class="pct">${pct}%</span>
      </div>`;
    })
    .join("");
}

function renderGhostwriterPanel(job, kit) {
  const hasKit = Boolean(kit);
  const provider = kit?.writer_label || (kit?.provider === "deepseek" ? "DeepSeek" : kit?.provider === "ai" ? "AI" : kit?.provider === "template" ? "قالب ذكي" : aiWriterLabel());
  const generatedAt = kit?.generated_at ? new Date(kit.generated_at).toLocaleString("ar-SA") : "";
  const resumeReady = originalResumeReady();
  const approved = Boolean(state.approvedKits?.[job.id]);
  const modelOptions = AI_WRITER_MODELS.map(
    (model) => `<option value="${esc(model.id)}" ${state.aiWriterModel === model.id ? "selected" : ""}>${esc(model.label)}</option>`,
  ).join("");
  return `<div class="section-block ghostwriter-panel">
    <div class="section-head tight">
      <div>
        <h3>كاتب السيرة بالذكاء الاصطناعي</h3>
        <p class="muted tiny">سيرة وخطاب ومقابلة بالعربية والإنجليزية، ثم DOCX/PDF بعد الاعتماد.</p>
      </div>
      <span class="badge">${esc(provider)}</span>
      <span class="badge ${state.aiHealth?.ready ? "" : "muted"}">${state.aiHealth?.ready ? "AI ready" : "AI unavailable"}</span>
    </div>
    <div class="field compact-field">
      <label>نموذج AI كاتب</label>
      <select data-ai-writer-model>${modelOptions}</select>
    </div>
    <div class="field">
      <label>Target-job tailoring brief</label>
      <textarea data-tailoring-brief="${esc(job.id)}" placeholder="Add the key requirements, recruiter notes, or points you want emphasized. This is used only for this job.">${esc(state.tailoringBriefs?.[job.id] || "")}</textarea>
      <small class="muted tiny">The AI keeps claims grounded in the approved master resume and the job description.</small>
    </div>
    ${resumeReady ? "" : `<div class="empty compact">لنتيجة أفضل: افتح الحساب وأضف السيرة الأصلية قبل التوليد. بدونها سيستخدم الكاتب إشارات مختصرة فقط.</div>`}
    <div class="ghostwriter-actions">
      <button class="btn primary" data-ghostwriter="${esc(job.id)}">${iconSpark()} توليد الحزمة الكاملة</button>
      <button class="btn outline" data-nav="/account">${iconUser()} السيرة الأصلية</button>
      <button class="btn outline" data-copy-ghostwriter="${esc(job.id)}" ${hasKit ? "" : "disabled"}>${iconDoc()} نسخ النص</button>
    </div>
    ${generatedAt ? `<p class="muted tiny">آخر توليد: ${esc(generatedAt)}</p>` : ""}
    ${
      hasKit
        ? `<div class="ghostwriter-grid">
          ${ghostDoc("السيرة العربية", kit.ar_resume, "ar_resume", job.id)}
          ${ghostDoc("English resume", kit.en_resume, "en_resume", job.id)}
          ${ghostDoc("خطاب عربي", kit.ar_cover_letter, "ar_cover_letter", job.id)}
          ${ghostDoc("English cover letter", kit.en_cover_letter, "en_cover_letter", job.id)}
          ${ghostList("تحضير المقابلة", kit.ar_interview_prep)}
          ${ghostList("Interview prep", kit.en_interview_prep)}
        </div>
        <div class="ghostwriter-next">
          <strong>خطوات سريعة</strong>
          <ul>${(kit.next_actions || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
        <div class="approval-box ${approved ? "approved" : ""}">
          <div>
            <strong>${approved ? "الحزمة معتمدة" : "اعتمد الحزمة قبل التصدير"}</strong>
            <p class="muted tiny">بعد المراجعة، اعتمد الملفات ثم نزّل DOCX أو PDF للتقديم.</p>
          </div>
          <button class="btn ${approved ? "outline" : "primary"}" data-approve-kit="${esc(job.id)}">${iconCheck()} ${approved ? "معتمدة" : "اعتماد الحزمة"}</button>
        </div>
        ${renderApplicationPackageBlock(job, approved)}
        ${renderInterviewChat(job)}`
        : `<div class="empty compact">اضغط AI كاتب لتجهيز نسخة عربية وإنجليزية مخصصة لهذه الوظيفة، مع أسئلة مقابلة وإجابات تدريبية.</div>`
    }
  </div>`;
}

function renderApplicationPackageBlock(job, approved) {
  return `<div class="application-package ${approved ? "ready" : ""}">
    <div>
      <span class="eyebrow">حزمة التقديم</span>
      <strong>${approved ? "جاهزة للتقديم" : "اعتمد الحزمة أولاً ثم حمّلها"}</strong>
      <p class="muted tiny">حمّل PDF المعتمد للتقديم. استخدم DOCX عندما تحتاج تعديل النسخة قبل الإرسال.</p>
    </div>
    <div class="package-actions">
      <button class="btn gold full" data-export-kit="pdf" data-job-id="${esc(job.id)}" ${approved ? "" : "disabled"}>${iconDoc()} تحميل PDF للتقديم</button>
      <button class="btn outline" data-export-kit="docx" data-job-id="${esc(job.id)}" ${approved ? "" : "disabled"}>${iconDoc()} DOCX</button>
      <button class="btn outline" data-copy-ghostwriter="${esc(job.id)}">${iconDoc()} نسخ</button>
    </div>
  </div>`;
}

function renderAssistedApplyPanel(job, pkg, draft, kit) {
  const approved = Boolean(state.approvedKits?.[job.id]);
  const applyUrl = jobApplyUrl(job);
  const hasKit = Boolean(kit);
  const submitted = ["applied", "in_progress"].includes(job.status);
  const followup = job.status === "in_progress";
  const tracking = applicationTracking(job);
  const followUpStateValue = followUpState(job);
  return `<div class="section-block assisted-apply">
    <div class="section-head tight">
      <div>
        <h3>التقديم والمتابعة</h3>
        <p class="muted tiny">جهّز الملف، راجعه، افتح إعلان الوظيفة، ثم أرسل بنفسك بعد التأكد.</p>
      </div>
      <span class="badge ${followup ? "" : "muted"}">${followup ? "متابعة" : submitted ? "تم التقديم" : "لم يتم التقديم"}</span>
    </div>
    <div class="checklist" data-application-checklist="${esc(job.id)}">${buildChecklist(job, pkg, draft)}</div>
    <div class="section-block" style="margin:12px 0 0;padding:14px">
      <div class="section-head tight">
        <div><h3>سجل التقديم والمتابعة</h3><p class="muted tiny">سجّل ما تم فعلياً: تاريخ التقديم، جهة التواصل، ومتى يجب المتابعة.</p></div>
        <span class="badge ${followUpStateValue === "due" ? "danger" : followUpStateValue === "upcoming" ? "gold" : "muted"}">${followUpStateValue === "due" ? "متابعة مستحقة" : followUpStateValue === "upcoming" ? "متابعة مجدولة" : "بدون موعد متابعة"}</span>
      </div>
      <div class="form profile-form" style="margin-top:10px">
        <div class="field"><label>تاريخ التقديم</label><input type="date" data-application-field="applied_at" data-job-id="${esc(job.id)}" value="${esc(tracking.applied_at)}" /></div>
        <div class="field"><label>موعد المتابعة</label><input type="date" data-application-field="follow_up_at" data-job-id="${esc(job.id)}" value="${esc(tracking.follow_up_at)}" /></div>
        <div class="field"><label>جهة التقديم</label><input data-application-field="channel" data-job-id="${esc(job.id)}" value="${esc(tracking.channel)}" placeholder="بوابة الشركة، LinkedIn، إحالة..." /></div>
        <div class="field"><label>اسم مسؤول التوظيف</label><input data-application-field="recruiter_name" data-job-id="${esc(job.id)}" value="${esc(tracking.recruiter_name)}" placeholder="الاسم (اختياري)" /></div>
        <div class="field"><label>وسيلة التواصل</label><input data-application-field="recruiter_contact" data-job-id="${esc(job.id)}" value="${esc(tracking.recruiter_contact)}" placeholder="البريد أو LinkedIn (اختياري)" /></div>
        <div class="field full"><label>ملاحظات</label><textarea data-application-field="notes" data-job-id="${esc(job.id)}" placeholder="رقم الطلب، ما تم إرساله، نتيجة الاتصال...">${esc(tracking.notes)}</textarea></div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-save-application="${esc(job.id)}">${iconCheck()} حفظ سجل التقديم</button><button class="btn outline" data-complete-followup="${esc(job.id)}" ${tracking.follow_up_at ? "" : "disabled"}>${iconClock()} تمّت المتابعة اليوم</button></div>
    </div>
    <div class="apply-guard">
      <strong>لا يوجد تقديم تلقائي بدون موافقتك</strong>
      <p class="muted tiny">الموقع يساعدك في التحضير والمتابعة، لكن زر الإرسال النهائي يبقى بيدك.</p>
    </div>
    <div class="apply-actions">
      <button class="btn primary" data-export-kit="pdf" data-job-id="${esc(job.id)}" ${approved ? "" : "disabled"}>${iconDoc()} تحميل PDF للتقديم</button>
      ${applyUrl ? `<a class="btn outline" href="${esc(applyUrl)}" target="_blank" rel="noopener">${iconGlobe()} فتح إعلان الوظيفة</a>` : `<button class="btn outline" disabled>${iconGlobe()} رابط الوظيفة غير متوفر</button>`}
      <button class="btn outline" data-submit-action="${esc(job.id)}" ${hasKit && approved && !submitted ? "" : "disabled"}>${iconCheck()} تسجيل أنه تم التقديم</button>
      <button class="btn outline" data-followup-action="${esc(job.id)}" ${submitted ? "" : "disabled"}>${iconClock()} متابعة الطلب</button>
    </div>
  </div>`;
}

function renderInterviewChat(job) {
  const chat = state.interviewChats?.[job.id] || [];
  return `<div class="interview-chat">
    <div class="section-head tight">
      <div>
        <h3>تحضير مقابلة تفاعلي</h3>
        <p class="muted tiny">اسأل AI كاتب أي سؤال عن الوظيفة، المقابلة، الفجوات، أو أفضل إجابة.</p>
      </div>
    </div>
    <div class="chat-log">
      ${chat.length
        ? chat.map((msg) => `<div class="chat-msg ${msg.role === "user" ? "user" : "assistant"}"><strong>${msg.role === "user" ? "أنت" : "AI كاتب"}</strong><p>${esc(msg.content)}</p></div>`).join("")
        : `<p class="muted tiny">مثال: كيف أجيب على سؤال حدثني عن نفسك لهذه الوظيفة؟</p>`}
    </div>
    <div class="form">
      <div class="field">
        <label>سؤالك للمقابلة</label>
        <textarea data-interview-question="${esc(job.id)}" placeholder="اكتب سؤالاً مرتبطاً بهذه الوظيفة...">${esc(state.interviewQuestions?.[job.id] || "")}</textarea>
      </div>
      <button class="btn primary" data-ask-interview="${esc(job.id)}">${iconSpark()} اسأل AI كاتب</button>
      <button class="btn outline" data-start-mock-interview="${esc(job.id)}">${iconBolt()} Start a mock interview</button>
    </div>
  </div>`;
}

function ghostDoc(title, body, field = "", jobId = "") {
  return `<article class="ghost-doc">
    <h4>${esc(title)}</h4>
    ${field ? `<textarea class="document-editor" data-kit-document="${esc(field)}" data-job-id="${esc(jobId)}" aria-label="${esc(title)}">${esc(body || "")}</textarea><small class="muted tiny">Edit this job-specific draft before approval. Changes are saved to this application only.</small>` : `<pre>${esc(body || "لم يتم التوليد بعد.")}</pre>`}
  </article>`;
}

function ghostList(title, items = []) {
  const rows = items.length ? items : ["لم يتم التوليد بعد."];
  return `<article class="ghost-doc">
    <h4>${esc(title)}</h4>
    <ul>${rows.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
  </article>`;
}

function ghostwriterText(kit) {
  if (!kit) return "";
  return [
    "السيرة العربية",
    kit.ar_resume,
    "English Resume",
    kit.en_resume,
    "خطاب عربي",
    kit.ar_cover_letter,
    "English Cover Letter",
    kit.en_cover_letter,
    "تحضير المقابلة",
    ...(kit.ar_interview_prep || []),
    "Interview Prep",
    ...(kit.en_interview_prep || []),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildChecklist(job, pkg, draft) {
  const items = [
    { label: "مراجعة المطابقة", done: Boolean(job.score) },
    { label: "مسودة المساعد", done: Boolean(draft?.content) },
    { label: "حزمة التقديم", done: Boolean(pkg?.resume_body) },
    { label: "حالة الطلب", done: ["ready", "applied", "in_progress"].includes(job.status) },
    { label: "متابعة Gmail", done: false },
  ];
  return items
    .map(
      (i) => `<div class="item ${i.done ? "done" : ""}">
      <span class="ico">${i.done ? "✓" : ""}</span>
      <div><strong>${esc(i.label)}</strong><small>${i.done ? "مكتمل" : "بانتظار التنفيذ"}</small></div>
    </div>`,
    )
    .join("");
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const sources = state.sources;
  const customSources = sources.filter((s) => s.custom);
  const knownSources = sources.filter((s) => !s.custom);
  const f = state.sourceForm;
  const scan = state.scanResult;
  const sourceWorkflow = `<section class="section">
    <div class="source-workflow">
      <div><strong>${esc(tr("sourceApproved"))}</strong><small>${esc(tr("sourceApprovedText"))}</small></div>
      <div><strong>${esc(tr("sourcePublic"))}</strong><small>${esc(tr("sourcePublicText"))}</small></div>
      <div><strong>${esc(tr("sourceManual"))}</strong><small>${esc(tr("sourceManualText"))}</small></div>
      <div><strong>${esc(tr("sourceStatus"))}</strong><small>${esc(tr("sourceStatusText"))}</small></div>
    </div>
  </section>`;
  shell(
    `${banner()}
    ${sourceWorkflow}
    <header class="section" style="padding-top:14px">
      <h1 style="font-size:20px;font-weight:800;color:var(--ink)">المصادر</h1>
      <p class="muted tiny" style="margin-top:2px">أضف مواقع الوظائف وحدد وتيرة الفحص التلقائي</p>
    </header>
    <section class="section">
      <div class="section-block">
        <h3>أضف موقع وظائف جديد</h3>
        <p class="lede">أدخل اسم الموقع ورابط صفحة البحث ليتم حفظه كمصدر مستقل وفحصه عند الطلب.</p>
        <div class="form">
          <div class="field"><label>اسم الموقع</label><input data-source-form-field="label" value="${esc(f.label)}" placeholder="مثال: Remote OK أو لوحة وظائف محلية" /></div>
          <div class="field"><label>رابط الموقع أو صفحة البحث</label><input data-source-form-field="url" value="${esc(f.url)}" placeholder="https://example.com/jobs" inputmode="url" /></div>
          <div class="field"><label>المنطقة</label>
            <select data-source-form-field="region">
              ${REGIONS.filter((r) => r.id).map((r) => `<option value="${r.id}" ${f.region === r.id ? "selected" : ""}>${r.label}</option>`).join("")}
            </select>
          </div>
          <button class="btn primary" data-add-source>${iconPlus()} إضافة المصدر</button>
        </div>
      </div>
    </section>
    ${scan ? `<section class="section"><div class="section-block">
      <h3>نتيجة الفحص الأخير</h3>
      <p class="lede">تم فحص ${esc(scan.source.label)} وأضيفت ${scan.jobs.length} وظائف مناسبة إلى قائمة المتابعة.</p>
      <span class="badge">${esc(scan.mode || "تجريبي")}</span>
    </div></section>` : ""}
    <section class="section">
      <div class="section-head"><h2>المصادر المخصصة</h2><span class="muted tiny">${customSources.length} مصدر</span></div>
      <div class="list-rows">
        ${customSources.length
          ? customSources.map(sourceCardHtml).join("")
          : `<p class="empty">أضف موقعك من النموذج أعلاه لتبدأ الفحص.</p>`}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>المصادر المعتمدة</h2><span class="muted tiny">${knownSources.length} مصدر</span></div>
      <div class="list-rows">
        ${knownSources.map(sourceCardHtml).join("")}
      </div>
    </section>`,
    { screen: "settings" },
  );
}

function sourceCardHtml(s) {
  const quality = s.source_quality === "live_verified" ? "Live verified" : s.source_quality === "manual_review" ? "Manual review" : s.source_quality === "example" ? "Example source" : s.last_error ? "Needs attention" : "Not yet verified";
  return `<div class="kvs">
    <div>
      <h4>${esc(s.label)}</h4>
      <p>${esc(s.region || "مخصص")} · ${s.job_count || 0} وظائف · ${esc(connectorModeLabel(s.connector_mode))}</p>
    </div>
    <div class="right">
      <span class="badge muted">${esc(quality)}</span>
      <span class="badge ${s.enabled ? "" : "muted"}">${s.enabled ? "مفعل" : "يحتاج إعداد"}</span>
    </div>
  </div>
  <div class="kvs" style="margin-top:6px">
    <div>
      <h4 style="font-size:12.5px">فحص تلقائي</h4>
      <p>${s.connector_note ? esc(s.connector_note) : (s.last_scanned_at ? `آخر فحص: ${esc(s.last_scanned_at)}` : "لم يتم الفحص بعد")}</p>
    </div>
    <div class="right">
      ${["public_html", "public_json"].includes(s.connector_mode)
        ? `<button class="btn primary sm" data-scan-source="${esc(s.id)}">${iconBolt()} فحص</button>`
        : s.connector_mode === "portal_only"
          ? `<a class="btn primary sm" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${iconArrowUpRight()} فتح البوابة</a>`
        : `<button class="btn outline sm" disabled>يحتاج API</button>`}
      ${["public_html", "public_json"].includes(s.connector_mode) ? `<label class="toggle"><input type="checkbox" data-source-schedule="${esc(s.id)}" ${s.scheduled ? "checked" : ""}/><span class="slider"></span></label>
      <select data-source-interval="${esc(s.id)}" style="height:32px;border:1px solid var(--line);border-radius:999px;padding:0 8px;font-size:11px">
        <option value="60" ${s.interval_minutes === 60 ? "selected" : ""}>كل ساعة</option>
        <option value="360" ${s.interval_minutes === 360 || !s.interval_minutes ? "selected" : ""}>كل 6 ساعات</option>
        <option value="1440" ${s.interval_minutes === 1440 ? "selected" : ""}>يومياً</option>
      </select>` : ""}
    </div>
  </div>`;
}

/* ---------------- Account ---------------- */
function renderLogin() {
  if (state.session?.authenticated) return navigate("/account");
  shell(
    `<main class="auth-page">
      <section class="login-card">
        ${brandLogo("login-logo")}
        <span class="eyebrow">حسابك المهني</span>
        <h1>ابدأ رحلتك الوظيفية</h1>
        <p>أنشئ حسابك للمرة الأولى أو سجّل الدخول بحساب Google. سنحفظ سيرتك، المطابقات، وحزم التقديم بأمان.</p>
        <label class="terms-consent">
          <input type="checkbox" data-terms-consent />
          <span>أوافق على <button data-nav="/terms">الشروط</button> و<button data-nav="/privacy">سياسة الخصوصية</button>.</span>
        </label>
        <a class="btn primary google-login disabled" data-google-login aria-disabled="true">${iconUser()} المتابعة بحساب Google</a>
        <small class="muted">إذا كان بريدك جديداً فسيُنشأ حسابك تلقائياً، وإذا سبق أن سجلت فستعود مباشرة إلى مساحتك.</small>
      </section>
    </main>`,
    { showNav: false, screen: "login" },
  );
}

function renderOnboarding() {
  if (!state.session?.authenticated) return navigate("/login");
  const user = state.session.user || {};
  shell(
    `<main class="auth-page">
      <section class="login-card onboarding-card">
        <span class="onboarding-check">✓</span>
        <span class="eyebrow">مرحباً ${esc(user.name || "")}</span>
        <h1>تم إنشاء حسابك</h1>
        <p>ثلاث خطوات سريعة تجعل المطابقة والتقديم أدق من أول استخدام.</p>
        <ol class="onboarding-steps">
          <li><strong>أضف سيرتك</strong><small>PDF أو DOCX أو نص مباشر</small></li>
          <li><strong>حدّد هدفك</strong><small>الدور والموقع واللغة المفضلة</small></li>
          <li><strong>راجع المطابقات</strong><small>ثم أنشئ حزمة تقديم مخصصة</small></li>
        </ol>
        <button class="btn primary full" data-complete-onboarding>ابدأ بإعداد ملفي</button>
      </section>
    </main>`,
    { showNav: false, screen: "onboarding" },
  );
}

function renderAccount() {
  const p = state.profile || {};
  const initials = (p.display_name || "ض").trim().slice(0, 1);
  const completeness = profileCompleteness(p);
  const resumeReady = originalResumeReady(p);
  shell(
    `${banner()}
    <header class="section" style="padding-top:14px">
      <div class="row account-hero">
        <div class="avatar lg">${esc(initials)}</div>
        <div class="account-title">
          <h1 style="font-size:20px;font-weight:800;color:var(--ink)">${esc(p.display_name || "مستخدم جديد")}</h1>
          <p class="muted tiny" style="margin-top:2px">${esc(p.target_roles || "")}</p>
        </div>
        <span class="badge ${resumeReady ? "" : "muted"}">${resumeReady ? "السيرة جاهزة" : "أضف السيرة"}</span>
      </div>
    </header>
    <section class="section">
      ${renderAuthPanel()}
    </section>
    <section class="section">
      <div class="section-block profile-status" data-profile-summary>
        <div class="section-head tight">
          <div>
            <h3>ملف المشترك</h3>
            <p class="muted tiny">كلما كانت السيرة الأصلية أوضح، خرجت السيرة المخصصة أقوى وأطول.</p>
          </div>
          <strong>${completeness}%</strong>
        </div>
        <div class="profile-meter"><span style="width:${completeness}%"></span></div>
        <div class="tags">
          <span class="tag ${resumeReady ? "teal" : "gold"}">${resumeReady ? "السيرة الأصلية محفوظة" : "السيرة الأصلية ناقصة"}</span>
          <span class="tag outline">${esc(p.resume_filename || "بدون ملف")}</span>
          <span class="tag outline">${esc(p.resume_languages || "Arabic, English")}</span>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-block">
        <div class="section-head tight">
          <div>
            <h3>ابدأ بالسيرة</h3>
            <p class="muted tiny">ارفع PDF أو ملف نصي، أو الصق السيرة مباشرة. بعدها تظهر الوظائف الأقرب لسيرتك فقط.</p>
          </div>
          <span class="badge">${(p.resume_text || "").trim().length} حرف</span>
        </div>
        <div class="form profile-form">
          <div class="resume-upload-grid">
            <label class="resume-upload-card">
              ${iconDoc()}
              <strong>رفع PDF أو DOCX</strong>
              <small>نقرأ السيرة العربية والإنجليزية تلقائياً</small>
              <input type="file" data-resume-file accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-resume-kind="pdf" hidden />
            </label>
            <label class="resume-upload-card">
              ${iconDoc()}
              <strong>رفع TXT/MD</strong>
              <small>للملفات النصية أو Markdown</small>
              <input type="file" data-resume-file accept=".txt,.md,.text,text/plain,text/markdown" data-resume-kind="text" hidden />
            </label>
            <button class="resume-upload-card" data-focus-resume>
              ${iconSpark()}
              <strong>لصق السيرة</strong>
              <small>انسخ السيرة والصقها في المربع</small>
            </button>
          </div>
          <div class="field">
            <label>اسم ملف السيرة</label>
            <input data-profile-field="resume_filename" value="${esc(p.resume_filename || "")}" placeholder="jaber-cv.pdf" />
          </div>
          <div class="field">
            <label>لصق السيرة الأصلية</label>
            <textarea class="resume-editor" data-profile-field="resume_text" data-original-resume placeholder="الصق النص الكامل للسيرة هنا... الخبرات، الإنجازات، التعليم، الشهادات، المهارات، واللغات.">${esc(p.resume_text || "")}</textarea>
          </div>
          <div class="row profile-actions">
            <button class="btn outline" data-profile-autofill>${iconSpark()} استخراج بيانات السيرة</button>
            <button class="btn primary" data-approve-uploaded-resume>${iconCheck()} استخدام السيرة للمطابقة</button>
          </div>
        </div>
      </div>
    </section>
    ${renderResumeCoach(p, resumeReady)}
    <section class="section">
      <div class="section-block">
        <h3>بيانات البحث والتخصيص</h3>
        <div class="form profile-form">
          <div class="field"><label>الاسم</label><input data-profile-field="display_name" value="${esc(p.display_name || "")}" placeholder="اسم المشترك" /></div>
          <div class="field"><label>الأدوار المستهدفة</label><input data-profile-field="target_roles" value="${esc(p.target_roles || "")}" placeholder="Industrial consultant, factory developer, project director" /></div>
          <div class="field"><label>مواقع البحث</label><input data-profile-field="target_locations" value="${esc(p.target_locations || "")}" placeholder="Saudi Arabia, GCC, Remote" /></div>
          <div class="field"><label>المهارات الأساسية</label><textarea data-profile-field="resume_skills" placeholder="PMP, PMI-RMP, factory design, CAPEX, O&M, stakeholder management">${esc(p.resume_skills || "")}</textarea></div>
          <div class="field"><label>اللغات</label><input data-profile-field="resume_languages" value="${esc(p.resume_languages || "")}" placeholder="Arabic, English" /></div>
          <div class="field"><label>مستوى الخبرة</label><input data-profile-field="resume_seniority" value="${esc(p.resume_seniority || "")}" placeholder="Senior / Director / Consultant" /></div>
          <div class="field"><label>الأسواق والمناطق</label><input data-profile-field="resume_regions" value="${esc(p.resume_regions || "")}" placeholder="Saudi Arabia, GCC, MENA" /></div>
          <div class="field"><label>أمثلة إنجازات</label><textarea data-profile-field="resume_work_examples" placeholder="اكتب 3-6 إنجازات قابلة للقياس من سيرتك الأصلية.">${esc(p.resume_work_examples || "")}</textarea></div>
          <button class="btn primary full" data-save-profile>${iconCheck()} حفظ السيرة والملف</button>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-block">
        <h3>إجراءات سريعة</h3>
        <div class="row">
          <button class="btn primary" data-nav="/jobs">${iconList()} الوظائف</button>
          <button class="btn outline" data-nav="/settings">${iconCog()} المصادر</button>
          <button class="btn outline" data-nav="/results">${iconChart()} النتائج</button>
        </div>
      </div>
    </section>`,
    { screen: "account" },
  );
}

function renderAuthPanel() {
  const session = state.session || {};
  const user = session.user || {};
  return `<div class="section-block auth-panel">
    <div class="section-head tight">
      <div>
        <h3>الدخول إلى الحساب</h3>
        <p class="muted tiny">سجّل الدخول بحساب Google لحفظ سيرتك وملفات التقديم بأمان على هذا الحساب.</p>
      </div>
      <span class="badge ${session.authenticated ? "" : "muted"}">${session.authenticated ? "تم تسجيل الدخول" : "زائر"}</span>
    </div>
    ${session.authenticated ? `
      <div class="row account-hero">
        <div class="avatar">${esc((user.name || user.email || "U").slice(0, 1))}</div>
        <div class="account-title">
          <h4>${esc(user.name || "المشترك")}</h4>
          <p class="muted tiny">${esc(user.email || "")}</p>
        </div>
        <button class="btn outline sm" data-auth-logout>تسجيل الخروج</button>
      </div>
    ` : `
      <div class="row profile-actions">
        <button class="btn primary" data-nav="/login">${iconUser()} تسجيل الدخول / إنشاء حساب</button>
        <button class="btn outline" data-nav="/terms">الشروط</button>
        <button class="btn outline" data-nav="/privacy">الخصوصية</button>
      </div>
      ${session.google_configured ? "" : `<div class="empty compact">ربط Google جاهز في الكود. أضف بيانات Google في Cloudflare لتفعيل الدخول.</div>`}
    `}
  </div>`;
}

function renderResumeCoach(profile, resumeReady) {
  const coach = state.resumeCoach || null;
  const approved = masterResumeReady();
  const searchProfile = coach?.search_profile || {};
  const keywords = Array.isArray(searchProfile.keywords) ? searchProfile.keywords : [];
  const titles = Array.isArray(searchProfile.target_titles) ? searchProfile.target_titles : [];
  const improvements = Array.isArray(coach?.improvements) ? coach.improvements : [];
  return `
    <section class="section">
      <div class="section-block resume-coach ${approved ? "approved" : ""}">
        <div class="section-head tight">
          <div>
            <h3>مدرب السيرة بالذكاء الاصطناعي</h3>
            <p class="muted tiny">حسّن السيرة واعتمدها أولاً. بعدها تعتمد المطابقة وحزم التقديم على السيرة الحقيقية فقط.</p>
          </div>
          <span class="badge ${approved ? "" : "muted"}">${approved ? "السيرة معتمدة" : "تحتاج اعتماد"}</span>
        </div>
        <div class="resume-flow">
          <span class="${resumeReady ? "done" : ""}">1. رفع السيرة</span>
          <span class="${coach ? "done" : ""}">2. تحسين</span>
          <span class="${approved ? "done" : ""}">3. اعتماد</span>
          <span class="${approved ? "done" : ""}">4. بحث وتخصيص</span>
        </div>
        ${resumeReady ? "" : `<div class="empty compact">الصق السيرة الأصلية أو ارفعها أولاً. المدرب يحتاج نصاً حقيقياً قبل التحسين.</div>`}
        ${coach ? `
          <div class="coach-grid">
            <div>
              <h4>السيرة العربية المحسنة</h4>
              <textarea class="document-editor" data-master-resume="ar" aria-label="Arabic master resume">${esc(coach.ar_master_resume || "")}</textarea>
            </div>
            <div>
              <h4>السيرة الإنجليزية المحسنة</h4>
              <textarea class="document-editor" data-master-resume="en" aria-label="English master resume">${esc(coach.en_master_resume || "")}</textarea>
            </div>
          </div>
          <div class="tags">
            ${titles.slice(0, 6).map((item) => `<span class="tag">${esc(item)}</span>`).join("")}
            ${keywords.slice(0, 8).map((item) => `<span class="tag outline">${esc(item)}</span>`).join("")}
          </div>
          <ul class="coach-list">
            ${improvements.map((item) => `<li>${esc(item)}</li>`).join("")}
          </ul>
          <p class="muted tiny">${esc(coach.approval_note || "راجع السيرة قبل الاعتماد.")}</p>
        ` : ""}
        <div class="row profile-actions">
          <button class="btn primary" data-resume-coach ${resumeReady ? "" : "disabled"}>${iconSpark()} تحسين السيرة</button>
          <button class="btn ${approved ? "outline" : "primary"}" data-approve-master-resume ${coach ? "" : "disabled"}>${iconCheck()} ${approved ? "السيرة معتمدة" : "اعتماد السيرة المحسنة"}</button>
          <button class="btn outline" data-search-approved-jobs ${approved ? "" : "disabled"}>${iconBolt()} البحث عن وظائف مناسبة</button>
        </div>
      </div>
    </section>`;
}

function renderLegal(page) {
  const isPrivacy = page === "privacy";
  const title = isPrivacy ? "سياسة الخصوصية" : "الشروط والأحكام";
  const rows = isPrivacy
    ? [
        ["البيانات المستخدمة", "نص السيرة، حقول الملف، تفضيلات الوظائف، الملفات المولدة، وهوية الحساب تستخدم لتقديم المطابقة وحزم الذكاء الاصطناعي."],
        ["معالجة الذكاء الاصطناعي", "قد يرسل نص السيرة والوظيفة إلى مزودي الذكاء الاصطناعي المفعّلين فقط لتحسين السيرة وشرح المطابقة وتوليد ملفات التقديم المعتمدة."],
        ["التخزين", "يتم حفظ بيانات الحساب في تخزين Cloudflare المتاح للموقع، مع دعم حفظ محلي للزوار غير المسجلين."],
        ["التحكم", "راجع واعتمد السيرة المولدة قبل التصدير أو التقديم. لا ترفع بيانات خاصة لا تريد معالجتها."],
      ]
    : [
        ["مسؤولية المستخدم", "السير والخطابات وملاحظات المقابلة مسودات. يجب مراجعة الحقائق والتواريخ والشهادات والادعاءات قبل التقديم."],
        ["لا تقديم تلقائي", "الخدمة تجهز الطلبات وتقدم إرشادات المطابقة؛ ولا ترسل طلبات توظيف بدون إجراء واضح من المستخدم."],
        ["الوصول للمصادر", "إدخال الوظائف يستخدم الصفحات العامة أو الواجهات المعتمدة فقط. المنصات المحمية تحتاج وصولاً رسمياً من المزود."],
        ["الاستخدام المقبول", "لا تستخدم الخدمة لاختلاق خبرات أو سحب بيانات من أنظمة ممنوعة أو إرسال طلبات مضللة."],
      ];
  shell(
    `${banner()}
    <section class="section" style="padding-top:14px">
      <button class="btn ghost sm" data-nav="/account">${iconBack()} رجوع</button>
      <div class="section-block legal-panel">
        <h1>${title}</h1>
        <p class="muted">قواعد واضحة لحسابات JOBS.wasfai.com وملفات التقديم المولدة بالذكاء الاصطناعي.</p>
        <div class="list-rows">
          ${rows.map(([heading, text]) => `<div class="row-item legal-row"><div class="ico">${iconCheck()}</div><div><strong>${esc(heading)}</strong><small>${esc(text)}</small></div></div>`).join("")}
        </div>
      </div>
    </section>`,
    { screen: "account" },
  );
}

/* ---------------- Results ---------------- */
function renderResults() {
  const counts = countByStatus();
  const total = state.jobs.length;
  const applied = counts.applied || 0;
  const ready = counts.ready || 0;
  const follow = counts.in_progress || 0;
  const processing = counts.processing || 0;
  const matched = state.jobs.filter((j) => j.score >= 80).length;
  const responseRate = pct(applied, ready + applied + follow + processing);
  const followUpQueue = state.jobs
    .filter((job) => applicationTracking(job).follow_up_at)
    .sort((a, b) => applicationTracking(a).follow_up_at.localeCompare(applicationTracking(b).follow_up_at));

  shell(
    `${banner()}
    <header class="section" style="padding-top:14px">
      <h1 style="font-size:20px;font-weight:800;color:var(--ink)">النتيجة</h1>
      <p class="muted tiny" style="margin-top:2px">قياس رحلة التقديم من الاكتشاف حتى الرد</p>
    </header>
    <section class="section">
      <div class="status-grid">
        <div class="stat teal"><span class="v">${matched}</span><span class="l">فرص</span></div>
        <div class="stat"><span class="v">${follow}</span><span class="l">متابعات</span></div>
        <div class="stat gold"><span class="v">${responseRate}%</span><span class="l">مرتجعة</span></div>
      </div>
    </section>
    <section class="section">
      <div class="card results-card">
        <h3 style="font-size:13px;font-weight:800">الاتجاه الأسبوعي</h3>
        ${buildTrendSvg(state.jobs)}
      </div>
    </section>
    <section class="section">
      <div class="section-block">
        <h3>المسار حسب الحالة</h3>
        ${["discovered", "processing", "ready", "applied", "in_progress", "expired"]
          .map((s) => {
            const c = counts[s] || 0;
            const w = total ? Math.max(8, (c / total) * 100) : 0;
            return `<div class="row" style="gap:10px;align-items:center">
              <span style="width:80px;font-size:12px;color:var(--muted)">${STATUS_LABELS[s]}</span>
              <span style="flex:1;height:8px;background:var(--surface-2);border-radius:999px;overflow:hidden;border:1px solid var(--line)"><span style="display:block;width:${w}%;height:100%;background:var(--teal);border-radius:inherit"></span></span>
              <span style="width:24px;text-align:end;font-weight:800">${c}</span>
            </div>`;
          })
          .join("")}
      </div>
    </section>
    <section class="section">
      <div class="section-block">
        <div class="section-head tight"><h3>قائمة المتابعة</h3><span class="badge ${followUpQueue.some((job) => followUpState(job) === "due") ? "danger" : "muted"}">${followUpQueue.length} مواعيد</span></div>
        ${followUpQueue.length ? followUpQueue.slice(0, 8).map((job) => {
          const tracking = applicationTracking(job);
          return `<div class="row-item"><span class="ico">${iconClock()}</span><div><strong>${esc(job.title)}</strong><small>${esc(job.employer)} · ${followUpState(job) === "due" ? "مستحقة الآن" : "مجدولة"} ${esc(tracking.follow_up_at)}</small></div><button class="btn ghost sm" data-nav="/jobs/${esc(job.id)}">فتح</button></div>`;
        }).join("") : `<p class="muted tiny">لا توجد مواعيد متابعة. سجّل تاريخ متابعة لكل تقديم مهم.</p>`}
      </div>
    </section>
    <section class="section">
      <div class="section-block">
        <h3>أحدث النشاطات</h3>
        ${(state.activity_feed || []).slice(0, 6).map(activityHtml).join("") || `<p class="muted tiny">لا توجد نشاطات بعد.</p>`}
      </div>
    </section>`,
    { screen: "results" },
  );
}

function activityHtml(item) {
  return `<div class="row-item">
    <span class="ico">${iconDot(item.tone || "neutral")}</span>
    <div><strong>${esc(item.label || item.job_title || "")}</strong><small>${esc(item.timestamp || "")} · ${esc(item.employer || "")}</small></div>
    <button class="btn ghost sm" data-nav="/jobs/${esc(item.job_id || "")}">عرض</button>
  </div>`;
}

function iconDot(tone) {
  const colors = { teal: "var(--teal)", gold: "var(--gold)", danger: "var(--rose)", neutral: "var(--muted)" };
  return `<span style="display:block;width:8px;height:8px;border-radius:50%;background:${colors[tone] || colors.neutral}"></span>`;
}

/* ---------------- Events ---------------- */
function setupEvents() {
  document.querySelectorAll("[data-nav]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(item.dataset.nav);
    });
  });

  document.querySelectorAll("[data-job]").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-job-action]")) return;
      navigate(`/jobs/${item.dataset.job}`);
    });
  });

  const search = document.querySelector("[data-search]");
  if (search) {
    search.addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
    });
  }

  const localeToggle = document.querySelector("[data-toggle-locale]");
  if (localeToggle) {
    localeToggle.addEventListener("click", () => {
      state.locale = state.locale === "en" ? "ar" : "en";
      savePreferences();
      render();
    });
  }

  const themeToggle = document.querySelector("[data-toggle-theme]");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      savePreferences();
      render();
    });
  }

  document.querySelectorAll("[data-region]").forEach((item) => {
    item.addEventListener("click", () => {
      state.region = item.dataset.region;
      render();
    });
  });

  document.querySelectorAll("[data-source-filter]").forEach((item) => {
    item.addEventListener("click", () => {
      navigate("/jobs");
    });
  });

  document.querySelectorAll("[data-job-filter]").forEach((item) => {
    item.addEventListener("click", () => {
      state.jobFilter = item.dataset.jobFilter;
      render();
    });
  });

  document.querySelectorAll("[data-bulk-status]").forEach((item) => {
    item.addEventListener("click", async () => {
      const ids = state.selectedJobs;
      if (!ids.length) return;
      if (!state.session?.authenticated) {
        const updated = ids.map((id) => updateJobStatusLocal(id, item.dataset.bulkStatus)).filter(Boolean);
        state.selectedJobs = [];
        state.action = { pending: "", message: `تم تحديث ${updated.length} وظائف محلياً`, error: "" };
        render();
        return;
      }
      const updated = await runAction(
        "bulk",
        "جاري تحديث الوظائف المحددة...",
        "تم تحديث الوظائف",
        () =>
          apiJson("/api/jobs/bulk-status", {
            method: "PATCH",
            body: JSON.stringify({ ids, status: item.dataset.bulkStatus }),
          }),
      );
      if (updated) {
        for (const j of updated) replaceJob(j);
        state.selectedJobs = [];
      }
      render();
    });
  });

  document.querySelectorAll("[data-select-job]").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = item.dataset.selectJob;
      state.selectedJobs = state.selectedJobs.includes(id)
        ? state.selectedJobs.filter((x) => x !== id)
        : [...state.selectedJobs, id];
      render();
    });
  });

  const selectAll = document.querySelector("[data-select-all]");
  if (selectAll) {
    selectAll.addEventListener("click", (e) => {
      e.stopPropagation();
      const jobs = filteredJobs();
      if (state.selectedJobs.length === jobs.length && jobs.length > 0) state.selectedJobs = [];
      else state.selectedJobs = jobs.map((j) => j.id);
      render();
    });
  }

  document.querySelectorAll("[data-status-action]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = jobById(item.dataset.statusAction);
      const nextStatus = job.status === "applied" ? "in_progress" : job.status === "in_progress" ? "applied" : "applied";
      if (!state.session?.authenticated) {
        updateJobStatusLocal(job.id, nextStatus);
        state.action = { pending: "", message: "تم تحديث الحالة محلياً", error: "" };
        render();
        return;
      }
      const updated = await runAction(
        "status",
        "جاري تحديث الحالة...",
        "تم تحديث الحالة",
        () => apiJson(`/api/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }),
      );
      if (updated) replaceJob(updated);
      render();
    });
  });

  const menuTrigger = document.querySelector("[data-user-menu]");
  const menuPanel = document.querySelector("[data-user-menu-panel]");
  if (menuTrigger && menuPanel) {
    menuTrigger.addEventListener("click", () => {
      const opening = menuPanel.hidden;
      menuPanel.hidden = !opening;
      menuTrigger.setAttribute("aria-expanded", String(opening));
    });
  }

  const termsConsent = document.querySelector("[data-terms-consent]");
  const googleLogin = document.querySelector("[data-google-login]");
  if (termsConsent && googleLogin) {
    termsConsent.addEventListener("change", () => {
      googleLogin.classList.toggle("disabled", !termsConsent.checked);
      googleLogin.setAttribute("aria-disabled", String(!termsConsent.checked));
      googleLogin.href = termsConsent.checked ? "/api/auth/google/start?terms=1" : "";
    });
    googleLogin.addEventListener("click", (event) => {
      if (!termsConsent.checked) event.preventDefault();
    });
  }

  const completeOnboarding = document.querySelector("[data-complete-onboarding]");
  if (completeOnboarding) {
    completeOnboarding.addEventListener("click", async () => {
      completeOnboarding.disabled = true;
      await fetch("/api/auth/onboarding", { method: "POST" });
      navigate("/account");
    });
  }

  document.querySelectorAll("[data-submit-action]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = jobById(item.dataset.submitAction);
      if (!job) return;
      if (!state.session?.authenticated) {
        updateJobStatusLocal(job.id, "applied");
        state.action = { pending: "", message: "تم تسجيل التقديم محلياً", error: "" };
        render();
        return;
      }
      const updated = await runAction(
        "submit",
        "جاري تسجيل التقديم...",
        "تم تسجيل التقديم",
        () => apiJson(`/api/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "applied" }) }),
      );
      if (updated) replaceJob(updated);
      render();
    });
  });

  document.querySelectorAll("[data-followup-action]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = jobById(item.dataset.followupAction);
      if (!job) return;
      if (!state.session?.authenticated) {
        updateJobStatusLocal(job.id, "in_progress");
        state.action = { pending: "", message: "تم نقل الطلب للمتابعة محلياً", error: "" };
        render();
        return;
      }
      const updated = await runAction(
        "followup",
        "جاري فتح متابعة التقديم...",
        "تم نقل الطلب للمتابعة",
        () => apiJson(`/api/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) }),
      );
      if (updated) replaceJob(updated);
      render();
    });
  });

  document.querySelectorAll("[data-application-field]").forEach((item) => {
    item.addEventListener("input", () => {
      const job = jobById(item.dataset.jobId);
      if (!job) return;
      replaceJob({ ...job, application: { ...applicationTracking(job), [item.dataset.applicationField]: item.value } });
    });
  });

  document.querySelectorAll("[data-save-application]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = jobById(item.dataset.saveApplication);
      if (!job) return;
      const tracking = applicationTracking(job);
      const shouldMarkApplied = Boolean(tracking.applied_at) && !["applied", "in_progress"].includes(job.status);
      const next = {
        ...job,
        status: shouldMarkApplied ? "applied" : job.status,
        timeline: trackingTimeline(job, shouldMarkApplied ? "تم تسجيل التقديم في سجل المتابعة" : "تم تحديث سجل التقديم والمتابعة"),
      };
      const updated = await runAction(
        "application-tracker",
        "جاري حفظ سجل التقديم...",
        "تم حفظ سجل التقديم والمتابعة",
        async () => {
          const saved = await saveApplicationTracking(next);
          if (shouldMarkApplied && state.session?.authenticated) {
            return apiJson(`/api/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "applied" }) });
          }
          return saved;
        },
      );
      if (updated) replaceJob({ ...next, ...updated, application: applicationTracking(next) });
      render();
    });
  });

  document.querySelectorAll("[data-complete-followup]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = jobById(item.dataset.completeFollowup);
      if (!job) return;
      const today = new Date().toISOString().slice(0, 10);
      const tracking = { ...applicationTracking(job), last_follow_up_at: today, follow_up_at: "" };
      const next = { ...job, status: "in_progress", application: tracking, timeline: trackingTimeline(job, "تمت متابعة الطلب") };
      const updated = await runAction(
        "complete-followup",
        "جاري حفظ المتابعة...",
        "تم تسجيل المتابعة",
        async () => {
          const saved = await saveApplicationTracking(next);
          if (state.session?.authenticated) return apiJson(`/api/jobs/${job.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) });
          return saved;
        },
      );
      if (updated) replaceJob({ ...next, ...updated, application: tracking });
      render();
    });
  });

  document.querySelectorAll("[data-tab]").forEach((item) => {
    item.addEventListener("click", () => {
      state.assistantTab = item.dataset.tab;
      render();
    });
  });

  const modelSelect = document.querySelector("[data-ai-writer-model]");
  if (modelSelect) {
    modelSelect.addEventListener("change", (e) => {
      state.aiWriterModel = e.target.value;
      saveLocalAiWriterState();
      render();
    });
  }

  document.querySelectorAll("[data-ghostwriter]").forEach((item) => {
    item.addEventListener("click", async () => {
      if (!onboardingReady()) {
        state.action = { pending: "", message: "", error: "Complete Profile and approve the master resume before generating application packages." };
        render();
        return;
      }
      const jobId = item.dataset.ghostwriter;
      const job = jobById(jobId);
      if (!job) return;
      const kit = await runAction(
        "ghostwriter",
        "جاري تجهيز كاتب الظل...",
        "تم تجهيز السيرة والخطاب والمقابلة",
        () =>
          apiJson("/api/ghostwriter", {
            method: "POST",
            body: JSON.stringify({
              job,
              profile: { ...approvedProfile(), target_job_brief: state.tailoringBriefs?.[jobId] || "" },
              ai_model: state.aiWriterModel,
            }),
          }),
      );
      if (kit) {
        state.ghostwriter[jobId] = kit;
        state.approvedKits = { ...(state.approvedKits || {}), [jobId]: false };
        state.assistantTab = "resume";
        replaceJob({
          ...job,
          tailored_resume: (kit.ar_resume || kit.en_resume || "").slice(0, 360),
          cover_letter: (kit.ar_cover_letter || kit.en_cover_letter || "").slice(0, 360),
          status: job.status === "discovered" ? "processing" : job.status,
        });
        const packageRow = {
          job_id: jobId,
          resume_title: `Bilingual CV - ${job.title}`,
          resume_body: `${kit.ar_resume}\n\n${kit.en_resume}`,
          cover_letter_title: `Bilingual cover letter - ${job.employer}`,
          cover_letter_body: `${kit.ar_cover_letter}\n\n${kit.en_cover_letter}`,
          pdf_status: "جاهز للمراجعة",
          generated_at: kit.generated_at,
        };
        state.packages = [packageRow, ...state.packages.filter((x) => x.job_id !== jobId)];
        state.drafts = [
          { job_id: jobId, content: ghostwriterText(kit), updated_at: kit.generated_at },
          ...state.drafts.filter((x) => x.job_id !== jobId),
        ];
        saveLocalAiWriterState();
        persistWorkState();
      }
      render();
    });
  });

  document.querySelectorAll("[data-tailoring-brief]").forEach((item) => {
    item.addEventListener("input", (e) => {
      state.tailoringBriefs = { ...(state.tailoringBriefs || {}), [e.target.dataset.tailoringBrief]: e.target.value };
      saveLocalAiWriterState();
    });
  });

  document.querySelectorAll("[data-kit-document]").forEach((item) => {
    item.addEventListener("input", (e) => {
      const jobId = e.target.dataset.jobId;
      const field = e.target.dataset.kitDocument;
      const kit = ghostwriterFor(jobId);
      if (!kit || !field) return;
      state.ghostwriter = { ...state.ghostwriter, [jobId]: { ...kit, [field]: e.target.value, edited_at: new Date().toISOString() } };
      state.approvedKits = { ...(state.approvedKits || {}), [jobId]: false };
      saveLocalAiWriterState();
    });
  });

  document.querySelectorAll("[data-approve-kit]").forEach((item) => {
    item.addEventListener("click", () => {
      const jobId = item.dataset.approveKit;
      state.approvedKits = { ...(state.approvedKits || {}), [jobId]: true };
      state.action = { pending: "", message: "تم اعتماد الحزمة ويمكن تنزيل DOCX/PDF", error: "" };
      saveLocalAiWriterState();
      render();
    });
  });

  document.querySelectorAll("[data-export-kit]").forEach((item) => {
    item.addEventListener("click", async () => {
      const format = item.dataset.exportKit;
      const jobId = item.dataset.jobId;
      const job = jobById(jobId);
      const kit = ghostwriterFor(jobId);
      if (!kit || !state.approvedKits?.[jobId]) return;
      const response = await runAction(
        `export-${format}`,
        `جاري تجهيز ملف ${format.toUpperCase()}...`,
        `تم تجهيز ملف ${format.toUpperCase()}`,
        () =>
          fetch("/api/export-package", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format, job, profile: state.profile, kit }),
          }),
      );
      if (!response || !response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeDownloadName(job.employer)}-${safeDownloadName(job.title)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  });

  document.querySelectorAll("[data-interview-question]").forEach((item) => {
    item.addEventListener("input", (e) => {
      state.interviewQuestions = { ...(state.interviewQuestions || {}), [e.target.dataset.interviewQuestion]: e.target.value };
    });
  });

  document.querySelectorAll("[data-start-mock-interview]").forEach((item) => {
    item.addEventListener("click", () => {
      const jobId = item.dataset.startMockInterview;
      state.interviewQuestions = {
        ...(state.interviewQuestions || {}),
        [jobId]: "Start a realistic mock interview for this target job. Ask me one question at a time, wait for my answer, then score it against the job requirements and give a stronger truthful version.",
      };
      render();
    });
  });

  document.querySelectorAll("[data-ask-interview]").forEach((item) => {
    item.addEventListener("click", async () => {
      const jobId = item.dataset.askInterview;
      const question = (state.interviewQuestions?.[jobId] || "").trim();
      const job = jobById(jobId);
      const kit = ghostwriterFor(jobId);
      if (!question || !job || !kit) return;
      const history = state.interviewChats?.[jobId] || [];
      const answer = await runAction(
        "interview-chat",
        "جاري سؤال AI كاتب...",
        "تم تجهيز إجابة المقابلة",
        () =>
          apiJson("/api/ai-writer-chat", {
            method: "POST",
            body: JSON.stringify({ job, profile: state.profile, kit, question, history, ai_model: state.aiWriterModel }),
          }),
      );
      if (answer) {
        state.interviewChats = {
          ...(state.interviewChats || {}),
          [jobId]: [
            ...history,
            { role: "user", content: question },
            { role: "assistant", content: answer.answer || "" },
          ],
        };
        state.interviewQuestions = { ...(state.interviewQuestions || {}), [jobId]: "" };
        saveLocalAiWriterState();
      }
      render();
    });
  });

  document.querySelectorAll("[data-copy-ghostwriter]").forEach((item) => {
    item.addEventListener("click", async () => {
      const kit = ghostwriterFor(item.dataset.copyGhostwriter);
      const text = ghostwriterText(kit);
      if (!text || !navigator.clipboard) return;
      await navigator.clipboard.writeText(text).catch(() => {});
      state.action = { pending: "", message: "تم نسخ حزمة كاتب الظل", error: "" };
      render();
    });
  });

  document.querySelectorAll("[data-generate]").forEach((item) => {
    item.addEventListener("click", async () => {
      const jobId = item.dataset.generate;
      if (!state.session?.authenticated) {
        const draft = {
          job_id: jobId,
          content: state.draftEdits[jobId] || "تم تجهيز مسودة عربية مختصرة للوظيفة الحالية.",
          updated_at: new Date().toISOString(),
        };
        state.drafts = [draft, ...state.drafts.filter((x) => x.job_id !== draft.job_id)];
        persistWorkState();
        state.action = { pending: "", message: "تم حفظ المسودة محلياً", error: "" };
        render();
        return;
      }
      const draft = await runAction(
        "draft",
        "جاري توليد المسودة...",
        "تم حفظ المسودة",
        () =>
          apiJson("/api/drafts", {
            method: "POST",
            body: JSON.stringify({
              job_id: jobId,
              content: state.draftEdits[jobId] || "تم تجهيز مسودة عربية مختصرة للوظيفة الحالية.",
            }),
          }),
      );
      if (draft) state.drafts = [draft, ...state.drafts.filter((x) => x.job_id !== draft.job_id)];
      render();
    });
  });

  document.querySelectorAll("[data-generate-package]").forEach((item) => {
    item.addEventListener("click", async () => {
      const jobId = item.dataset.generatePackage;
      if (!state.session?.authenticated) {
        const job = jobById(jobId);
        if (!job) return;
        const pkg = {
          job_id: jobId,
          resume_title: `سيرة مخصصة - ${job.title}`,
          resume_body: `مسودة سيرة مبنية على السيرة المعتمدة لدور ${job.title} لدى ${job.employer}. راجع كل معلومة قبل التقديم.`,
          cover_letter_title: `خطاب تقديم - ${job.employer}`,
          cover_letter_body: `مسودة خطاب موجهة إلى ${job.employer} بناءً على السيرة المعتمدة والوصف الوظيفي.`,
          pdf_status: "جاهزة للمراجعة",
          generated_at: new Date().toISOString(),
        };
        state.packages = [pkg, ...state.packages.filter((x) => x.job_id !== pkg.job_id)];
        persistWorkState();
        state.action = { pending: "", message: "تم تجهيز الحزمة محلياً", error: "" };
        render();
        return;
      }
      const pkg = await runAction(
        "package",
        "جاري تجهيز الحزمة...",
        "تم تجهيز الحزمة",
        () => apiJson(`/api/packages/${jobId}/generate`, { method: "POST" }),
      );
      if (pkg) state.packages = [pkg, ...state.packages.filter((x) => x.job_id !== pkg.job_id)];
      render();
    });
  });

  const resumeCoachButton = document.querySelector("[data-resume-coach]");
  if (resumeCoachButton) {
    resumeCoachButton.addEventListener("click", async () => {
      const coach = await runAction(
        "resume-coach",
        "جاري تحسين السيرة الأصلية...",
        "أصبحت مسودة السيرة المحسنة جاهزة للمراجعة",
        () =>
          apiJson("/api/resume-coach", {
            method: "POST",
            body: JSON.stringify({ profile: state.profile }),
          }),
      );
      if (coach) {
        state.resumeCoach = coach;
        state.approvedMasterResume = false;
        saveLocalAiWriterState();
      }
      render();
    });
  }

  const approveMasterResume = document.querySelector("[data-approve-master-resume]");
  if (approveMasterResume) {
    approveMasterResume.addEventListener("click", () => {
      const coach = state.resumeCoach;
      if (!coach) return;
      const searchProfile = coach.search_profile || {};
      const targetTitles = Array.isArray(searchProfile.target_titles) ? searchProfile.target_titles.join(", ") : "";
      const keywords = Array.isArray(searchProfile.keywords) ? searchProfile.keywords.join(", ") : "";
      const locations = Array.isArray(searchProfile.locations) ? searchProfile.locations.join(", ") : "";
      state.profile = {
        ...(state.profile || {}),
        target_roles: targetTitles || state.profile.target_roles,
        target_locations: locations || state.profile.target_locations,
        resume_skills: keywords || state.profile.resume_skills,
        resume_seniority: searchProfile.seniority || state.profile.resume_seniority,
      };
      state.masterResume = {
        ar: coach.ar_master_resume || "",
        en: coach.en_master_resume || "",
        approved_at: new Date().toISOString(),
      };
      state.approvedMasterResume = true;
      state.action = { pending: "", message: "Approved master resume is now used for matching and AI Writer.", error: "" };
      saveLocalProfile(state.profile);
      saveLocalAiWriterState();
      render();
    });
  }

  document.querySelectorAll("[data-master-resume]").forEach((item) => {
    item.addEventListener("input", (e) => {
      const language = e.target.dataset.masterResume;
      if (!state.resumeCoach || !["ar", "en"].includes(language)) return;
      const field = language === "ar" ? "ar_master_resume" : "en_master_resume";
      state.resumeCoach = { ...state.resumeCoach, [field]: e.target.value };
      state.approvedMasterResume = false;
      saveLocalAiWriterState();
    });
  });

  document.querySelectorAll("[data-search-approved-jobs]").forEach((searchApprovedJobs) => {
    searchApprovedJobs.addEventListener("click", async () => {
      if (!masterResumeReady()) {
        state.action = { pending: "", message: "", error: "ارفع السيرة واعتمدها أولاً، ثم ابحث عن الوظائف المناسبة." };
        render();
        return;
      }
      const result = await runAction(
        "live-match",
        "جاري البحث عن وظائف مناسبة للسيرة المعتمدة...",
        "تم البحث عن وظائف مناسبة",
        () =>
          apiJson("/api/jobs/match", {
            method: "POST",
            body: JSON.stringify({ profile: approvedMatchingProfile(), limit: 40 }),
          }),
      );
      const jobs = Array.isArray(result?.jobs) ? result.jobs.map(importLiveMatchedJob) : [];
      const imported = jobs;
      if (imported.length) {
        const existing = new Map(state.jobs.map((job) => [job.id, job]));
        for (const job of imported) existing.set(job.id, { ...(existing.get(job.id) || {}), ...job });
        state.jobs = [...existing.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        saveWorkspaceState();
        state.action = {
          pending: "",
          message: jobs.length
            ? `تم جلب ${jobs.length} وظائف مناسبة للسيرة المعتمدة.`
            : "لم ترجع المصادر الحية نتائج كافية، لذلك جهزنا قائمة مراجعة مبنية على السيرة لتبدأ منها.",
          error: "",
        };
        navigate("/jobs");
        return;
      }
      state.action = { pending: "", message: "", error: "لم نجد وظائف مناسبة بما يكفي الآن. جرّب البحث مرة أخرى أو أضف مصدر وظائف من صفحة المصادر." };
      render();
    });
  });

  const logout = document.querySelector("[data-auth-logout]");
  if (logout) {
    logout.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
      state.session = { authenticated: false, user: null, google_configured: state.session?.google_configured || false };
      state.action = { pending: "", message: "Signed out.", error: "" };
      render();
    });
  }

  const editJob = document.querySelector("[data-edit-job]");
  if (editJob) {
    editJob.addEventListener("click", async () => {
      const job = jobById(editJob.dataset.editJob);
      if (!job) return;
      const title = prompt("عنوان الوظيفة", job.title);
      if (title == null) return;
      const employer = prompt("الشركة", job.employer) ?? job.employer;
      const location = prompt("الموقع", job.location) ?? job.location;
      const description = prompt("الوصف", job.description) ?? job.description;
      if (!state.session?.authenticated) {
        replaceJob({ ...job, title, employer, location, description });
        persistWorkState();
        state.action = { pending: "", message: "تم حفظ التعديل محلياً", error: "" };
        render();
        return;
      }
      const updated = await runAction(
        "save",
        "جاري الحفظ...",
        "تم الحفظ",
        () =>
          apiJson(`/api/jobs/${job.id}`, {
            method: "PUT",
            body: JSON.stringify({ title, employer, location, description }),
          }),
      );
      if (updated) replaceJob(updated);
      render();
    });
  }

  const deleteJob = document.querySelector("[data-delete-job]");
  if (deleteJob) {
    deleteJob.addEventListener("click", async () => {
      if (!confirm("حذف هذه الوظيفة؟")) return;
      if (!state.session?.authenticated) {
        state.jobs = state.jobs.filter((j) => j.id !== deleteJob.dataset.deleteJob);
        persistWorkState();
        state.action = { pending: "", message: "تم حذف الوظيفة محلياً", error: "" };
        navigate("/jobs");
        return;
      }
      const ok = await runAction(
        "delete",
        "جاري الحذف...",
        "تم الحذف",
        () => apiNoContent(`/api/jobs/${deleteJob.dataset.deleteJob}`, { method: "DELETE" }),
      );
      if (ok !== null) {
        state.jobs = state.jobs.filter((j) => j.id !== deleteJob.dataset.deleteJob);
        navigate("/jobs");
      }
    });
  }

  document.querySelectorAll("[data-profile-field]").forEach((item) => {
    const eventName = item.tagName === "SELECT" ? "change" : "input";
    item.addEventListener(eventName, (e) => {
      const key = e.target.dataset.profileField;
      state.profile = { ...(state.profile || {}), [key]: e.target.value };
      if (key === "resume_text") {
        state.approvedMasterResume = false;
        saveLocalAiWriterState();
      }
    });
  });

  document.querySelectorAll("[data-resume-file]").forEach((resumeFile) => {
    resumeFile.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      state.action = { pending: "resume-upload", message: "جاري قراءة السيرة...", error: "" };
      render();
      const text = await extractResumeFileText(file, (message) => {
        state.action = { pending: "resume-upload", message, error: "" };
        render();
      }).catch((error) => {
        const code = String(error?.message || "");
        state.action = {
          pending: "",
          message: "",
          error: code === "DOC_LEGACY_UNSUPPORTED"
            ? "ملف DOC القديم غير مدعوم. احفظ السيرة بصيغة DOCX أو PDF ثم أعد رفعها."
            : "تعذرت قراءة الملف. ارفع PDF أو DOCX أو الصق نص السيرة مباشرة.",
        };
        return "";
      });
      state.profile = {
        ...(state.profile || {}),
        resume_filename: file.name,
        resume_text: text || "",
      };
      state.approvedMasterResume = false;
      state.resumeCoach = null;
      if (!readableResumeText(text)) {
        state.profile = {
          ...(state.profile || {}),
          target_roles: "",
          resume_skills: "",
          resume_seniority: "",
          resume_work_examples: "",
          resume_text: text || "",
        };
        state.action = { pending: "", message: "", error: "لم أستطع قراءة نص واضح من الملف. جرّب PDF أو DOCX، أو الصق نص السيرة مباشرة. لملفات PDF المصوّرة سيعمل التعرف العربي والإنجليزي تلقائياً." };
      } else {
        applyResumeSignalsFromText(text);
        saveLocalProfile(state.profile);
        saveLocalAiWriterState();
        state.action = { pending: "", message: "تمت قراءة السيرة وتعبئة البيانات الأساسية. راجعها ثم اضغط استخدام السيرة للمطابقة.", error: "" };
      }
      render();
    });
  });

  const focusResume = document.querySelector("[data-focus-resume]");
  if (focusResume) {
    focusResume.addEventListener("click", () => {
      const editor = document.querySelector("[data-original-resume]");
      if (editor) {
        editor.focus();
        editor.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  const autofillProfile = document.querySelector("[data-profile-autofill]");
  if (autofillProfile) {
    autofillProfile.addEventListener("click", () => {
      const text = state.profile?.resume_text || "";
      if (!readableResumeText(text)) {
        state.action = { pending: "", message: "", error: "الصق نص السيرة الكامل أولاً أو ارفع ملفاً نصياً واضحاً." };
        render();
        return;
      }
      applyResumeSignalsFromText(text);
      saveLocalProfile(state.profile);
      state.action = { pending: "", message: "تم استخراج بيانات السيرة", error: "" };
      render();
    });
  }

  const saveProfile = document.querySelector("[data-save-profile]");
  if (saveProfile) {
    saveProfile.addEventListener("click", async () => {
      saveLocalProfile(state.profile);
      let savedOnline = false;
      try {
        const response = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.profile),
        });
        savedOnline = response.ok;
        if (savedOnline) {
          const serverProfile = await response.json();
          state.profile = { ...(state.profile || {}), ...serverProfile, resume_text: state.profile?.resume_text || "" };
          saveLocalProfile(state.profile);
        }
      } catch {
        savedOnline = false;
      }
      state.action = {
        pending: "",
        message: savedOnline ? "تم حفظ السيرة والملف" : "تم حفظ السيرة محلياً على هذا الجهاز",
        error: "",
      };
      render();
    });
  }

  const approveUploadedResume = document.querySelector("[data-approve-uploaded-resume]");
  if (approveUploadedResume) {
    approveUploadedResume.addEventListener("click", () => {
      if (!originalResumeReady()) {
        state.action = { pending: "", message: "", error: "أضف نص السيرة أو ارفع ملفاً يحتوي على تفاصيل كافية قبل المطابقة." };
        render();
        return;
      }
      applyResumeSignalsFromText(state.profile?.resume_text || "");
      state.approvedMasterResume = true;
      state.action = { pending: "", message: "تم اعتماد السيرة. سنعرض الآن الوظائف الأقرب لها فقط.", error: "" };
      saveLocalProfile(state.profile);
      saveLocalAiWriterState();
      saveWorkspaceState();
      navigate("/jobs");
    });
  }

  document.querySelectorAll("[data-source-form-field]").forEach((item) => {
    item.addEventListener("input", (e) => {
      state.sourceForm[e.target.dataset.sourceFormField] = e.target.value;
    });
  });

  const addSource = document.querySelector("[data-add-source]");
  if (addSource) {
    addSource.addEventListener("click", async () => {
      const f = state.sourceForm;
      if (!f.label.trim() || !f.url.trim()) {
        state.action = { pending: "", message: "", error: "أدخل اسم الموقع ورابطه" };
        render();
        return;
      }
      if (!state.session?.authenticated) {
        state.action = { pending: "", message: "", error: "Sign in before adding a source. Sources are validated and scheduled centrally." };
        render();
        return;
        const source = {
          id: `custom-${Date.now().toString(36)}`,
          label: f.label.trim(),
          url: f.url.trim(),
          region: f.region || state.region || "السعودية",
          enabled: true,
          custom: true,
          connector_mode: "public_html",
          job_count: 0,
          scheduled: false,
          interval_minutes: 360,
          last_scanned_at: "",
          next_scan_at: "",
          last_error: "",
        };
        state.sources = [source, ...(state.sources || [])];
        state.sourceForm = { label: "", url: "", region: "السعودية" };
        state.scanResult = null;
        persistWorkState();
        state.action = { pending: "", message: "تم حفظ المصدر محلياً", error: "" };
        render();
        return;
      }
      const source = await runAction(
        "add-source",
        "جاري حفظ المصدر...",
        "تمت إضافة المصدر",
        () => apiJson("/api/sources", { method: "POST", body: JSON.stringify(f) }),
      );
      if (source) {
        state.sources = [...state.sources.filter((s) => s.id !== source.id), source];
        state.sourceForm = { label: "", url: "", region: "السعودية" };
        state.scanResult = null;
      }
      render();
    });
  }

  document.querySelectorAll("[data-scan-source]").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.scanSource;
      if (!state.session?.authenticated) {
        state.action = { pending: "", message: "", error: "Sign in before scanning a source." };
        render();
        return;
        const source = (state.sources || []).find((s) => s.id === id);
        if (!source) return;
        const jobs = fallbackMatchedJobsFromProfile().map((job, index) => ({
          ...job,
          id: `scan-${id}-${Date.now().toString(36)}-${index + 1}`,
          source: id,
          source_url: source.url,
          employer: source.label,
        }));
        source.last_scanned_at = new Date().toISOString();
        source.job_count = (source.job_count || 0) + jobs.length;
        state.jobs = [...jobs, ...(state.jobs || [])];
        state.scanResult = { source, jobs, mode: "local-resume-scan" };
        persistWorkState();
        state.action = { pending: "", message: `أضيفت ${jobs.length} وظائف من المصدر محلياً`, error: "" };
        render();
        return;
      }
      const result = await runAction(
        "scan",
        "جاري فحص المصدر...",
        "تم تحديث الوظائف من المصدر",
        () =>
          apiJson(`/api/sources/${id}/scan`, {
            method: "POST",
            body: JSON.stringify({ query: state.profile.target_roles, location: state.region, max_results: 6 }),
          }),
      );
      if (result) {
        for (const j of result.jobs) replaceJob(j);
        state.sources = state.sources.map((s) => (s.id === result.source.id ? result.source : s));
        state.scanResult = result;
      }
      render();
    });
  });

  document.querySelectorAll("[data-source-schedule]").forEach((item) => {
    item.addEventListener("change", async () => {
      const id = item.dataset.sourceSchedule;
      const interval = document.querySelector(`[data-source-interval="${id}"]`);
      if (!state.session?.authenticated) {
        state.action = { pending: "", message: "", error: "Sign in before scheduling a source." };
        render();
        return;
        state.sources = state.sources.map((s) =>
          s.id === id
            ? {
                ...s,
                scheduled: item.checked,
                interval_minutes: Number(interval?.value || 360),
                next_scan_at: item.checked ? new Date(Date.now() + Number(interval?.value || 360) * 60_000).toISOString() : "",
              }
            : s,
        );
        persistWorkState();
        state.action = { pending: "", message: "تم تحديث الجدولة محلياً", error: "" };
        render();
        return;
      }
      const source = await runAction(
        "schedule",
        "جاري تحديث الجدولة...",
        "تم تحديث الجدولة",
        () =>
          apiJson(`/api/sources/${id}/schedule`, {
            method: "PUT",
            body: JSON.stringify({ enabled: item.checked, interval_minutes: Number(interval?.value || 360) }),
          }),
      );
      if (source) {
        state.sources = state.sources.map((s) => (s.id === source.id ? source : s));
      }
      render();
    });
  });

  document.querySelectorAll("[data-source-interval]").forEach((item) => {
    item.addEventListener("change", () => {
      const toggle = document.querySelector(`[data-source-schedule="${item.dataset.sourceInterval}"]`);
      if (toggle) toggle.dispatchEvent(new Event("change"));
    });
  });
}

/* ---------------- Routing ---------------- */
function render() {
  const r = routeOf();
  if (r.name === "job-detail") return renderJobDetail(r.id);
  if (r.name === "jobs-list") return renderJobsList();
  if (r.name === "settings") return renderSettings();
  if (r.name === "account") return renderAccount();
  if (r.name === "login") return renderLogin();
  if (r.name === "onboarding") return renderOnboarding();
  if (r.name === "legal") return renderLegal(r.page);
  if (r.name === "results") return renderResults();
  return renderSearch();
}

/* ---------------- Init ---------------- */
async function init() {
  loadPreferences();
  try {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) throw new Error("bootstrap failed");
    const data = await response.json();
    state = { ...state, ...data };
  } catch (error) {
    state.action = { pending: "", message: "", error: "Live workspace data is temporarily unavailable. Retry when connected." };
  }
  const localProfile = loadLocalProfile();
  if (localProfile) {
    state.profile = { ...(state.profile || {}), ...localProfile };
  }
  const guestWorkspace = loadGuestWorkspace();
  if (guestWorkspace) {
    state.jobs = Array.isArray(guestWorkspace.jobs) ? guestWorkspace.jobs : state.jobs;
    state.packages = Array.isArray(guestWorkspace.packages) ? guestWorkspace.packages : state.packages;
    state.drafts = Array.isArray(guestWorkspace.drafts) ? guestWorkspace.drafts : state.drafts;
    state.sources = Array.isArray(guestWorkspace.sources) ? guestWorkspace.sources : state.sources;
  }
  const localAiWriter = loadLocalAiWriterState();
  if (localAiWriter) {
    state.aiWriterModel = localAiWriter.aiWriterModel || state.aiWriterModel;
    state.ghostwriter = localAiWriter.ghostwriter || state.ghostwriter;
    state.approvedKits = localAiWriter.approvedKits || state.approvedKits;
    state.interviewChats = localAiWriter.interviewChats || state.interviewChats;
    state.resumeCoach = localAiWriter.resumeCoach || state.resumeCoach;
    state.approvedMasterResume = Boolean(localAiWriter.approvedMasterResume);
    state.masterResume = localAiWriter.masterResume || state.masterResume;
    state.tailoringBriefs = localAiWriter.tailoringBriefs || state.tailoringBriefs;
  }
  try {
    const sessionResponse = await fetch("/api/auth/session");
    if (sessionResponse.ok) state.session = await sessionResponse.json();
  } catch {
    state.session = { authenticated: false, user: null, google_configured: false };
  }
  await loadWorkspaceState();
  if (state.session?.authenticated) {
    try { state.aiHealth = await apiJson("/api/ai-health"); } catch { state.aiHealth = { ready: false, providers: {} }; }
  }
  state.profile = sanitizeLegacyProfile(state.profile || {});
  if (repairStoredEnglishKits()) saveLocalAiWriterState();
  if (location.pathname === "/") history.replaceState(null, "", "/app");
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function demoJobs() {
  return [
    { id: "demo-1", title: "مدير مشاريع صناعية", employer: "شركة صناعية", source: "linkedin", location: "الرياض، السعودية", score: 88, status: "ready", deadline: "2026-07-18", description: "قيادة مشاريع تشغيلية ورأسمالية داخل بيئة صناعية مع متابعة الجدول والتكلفة والمخاطر.", tailored_resume: "سيرة مخصصة تبرز إدارة المشاريع الصناعية ونتائج التنفيذ.", cover_letter: "خطاب متابعة مهني.", fit_explanation: "تطابق مع إدارة المشاريع والعمليات الصناعية.", timeline: [] },
    { id: "demo-2", title: "مهندس ميكانيكي أول", employer: "مصنع إقليمي", source: "wazzuf", location: "الدمام، السعودية", score: 78, status: "processing", deadline: "2026-07-25", description: "تحسين الاعتمادية والصيانة والتشغيل في خطوط إنتاج صناعية.", tailored_resume: "", cover_letter: "", fit_explanation: "تطابق متوسط مع خبرات الهندسة والصيانة.", timeline: [] },
    { id: "demo-3", title: "استشاري تطوير مصانع", employer: "مكتب استشارات صناعية", source: "khamsat", location: "جدة، السعودية", score: 65, status: "discovered", deadline: "2026-07-30", description: "إعداد دراسات وتطوير مصانع وتحسين جاهزية التشغيل والامتثال.", tailored_resume: "", cover_letter: "", fit_explanation: "", timeline: [] },
  ];
}

function demoSources() {
  return [
    { id: "wazzuf", label: "WUZZUF", region: "مصر، السعودية", url: "https://wuzzuf.net/jobs/", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 14, custom: false, connector_mode: "public_html" },
    { id: "bayt", label: "Bayt", region: "MENA", url: "https://www.bayt.com/en/jobs/", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 0, custom: false, connector_mode: "public_html" },
    { id: "khamsat", label: "Khamsat", region: "MENA", url: "https://khamsat.com/", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 0, custom: false, connector_mode: "public_html" },
    { id: "linkedin", label: "LinkedIn", region: "Global", url: "https://www.linkedin.com/jobs/", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 0, custom: false, connector_mode: "approved_api" },
    { id: "indeed", label: "Indeed", region: "Global", url: "https://www.indeed.com/jobs", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 0, custom: false, connector_mode: "approved_api" },
    { id: "hiringcafe", label: "Hiring Cafe", region: "Global", url: "https://hiring.cafe/", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 0, custom: false, connector_mode: "public_html" },
  ];
}

window.addEventListener("popstate", render);
init();
