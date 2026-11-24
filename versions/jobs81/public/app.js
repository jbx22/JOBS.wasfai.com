import { PERSONAL_AI_MODELS, PERSONAL_SOURCE, aiDisclosure, personalErrorText } from "./ai-billing-ui.js";
/* JOBS.wasfai.com — Arabic-first RTL mobile PWA */
"use strict";

import { safeReturnPath } from "./return-path.js";
import { inferResumeSignals, readableResumeText } from "./resume-signals.js";
import { assessResumeText } from "./resume-text-quality.js";
import { extractResumeFileText, resumeExtractionErrorMessage } from "./resume-extraction.js";

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
  { id: "search", ar: "الرئيسية", en: "Home", route: "/app", icon: iconHome },
  { id: "jobs", ar: "الوظائف", en: "Jobs", route: "/jobs", icon: iconList },
  { id: "account", ar: "سيرتي", en: "My résumé", route: "/account", icon: iconDoc },
  { id: "results", ar: "المتابعة", en: "Follow-up", route: "/results", icon: iconClock },
  { id: "profile", ar: "حسابي", en: "Profile", route: "/profile", icon: iconUser },
];
const SETTINGS_NAV = { id: "settings", ar: "الإعدادات", en: "Settings", route: "/settings", icon: iconCog };

const AI_WRITER_MODELS = [
  { id: "deepseek", label: "DeepSeek V4.1 Flash" },
  { id: "minimax-m3", label: "MiniMax M3" },
  { id: "glm-5.2", label: "GLM 5.2" },
];

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
    target_locations: "",
    resume_filename: "",
    resume_skills: "",
    resume_languages: "",
    resume_seniority: "",
    resume_regions: "",
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
  jobSort: "score",
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
  aiBillingSource: "jobs",
  aiPersonalModel: "deepseek-v4.1-flash",
  approvedKits: {},
  interviewQuestions: {},
  interviewChats: {},
  applicationDrafts: {},
  applicationDraftTask: null,
  resumeCoach: null,
  resumeCoachPending: false,
  jobWriterPending: false,
  resumeImportPending: false,
  approvedMasterResume: false,
  masterResume: { ar: "", en: "", approved_at: "" },
  tailoringBriefs: {},
  session: { authenticated: false, user: null, google_configured: false },
  resumeFile: null,
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
    homeReady: "سيرتك جاهزة للبحث عن فرص تناسب خبراتك.",
    homeLocked: "تصفّح الوظائف أو أضف سيرتك للحصول على نتائج مخصصة.",
    profileApproved: "السيرة جاهزة",
    profileRequired: "الملف مطلوب",
    completeProfile: "أكمل الملف",
    completeProfileReady: "السيرة جاهزة للمطابقة.",
    completeProfileText: "الصق السيرة كاملة، حسّنها، ثم اعتمد الملف الرئيسي.",
    addSources: "إدارة المصادر",
    addSourcesText: "المصادر تعمل تلقائياً. افتحها فقط لإضافة أو تعديل مصدر.",
    reviewMatches: "راجع الفرص",
    reviewMatchesText: "افتح الوظائف المرتبة وانقلها داخل مسار التقديم.",
    reviewMatchesLocked: "تصفّح الشواغر حسب المسمى والموقع.",
    generatePackage: "ولّد الحزمة",
    generatePackageText: "أنشئ سيرة وخطاباً وأسئلة مقابلة بالعربية والإنجليزية.",
    trackApplications: "تابع الطلبات",
    trackApplicationsText: "انقل الفرص بين قيد المراجعة، جاهزة، تم التقديم، والمتابعة.",
    ready: "جاهز",
    locked: "مغلق",
    gateTitle: "ابحث باستخدام سيرتك",
    gateText: "ارفع السيرة أو الصقها لتخصيص البحث وفق خبراتك.",
    nextMatches: "أفضل الفرص",
    open: "فتح",
    matchesEmptyReady: "ابدأ البحث بسيرتك لعرض الفرص المناسبة.",
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
    homeReady: "Find openings that match the experience in your résumé.",
    homeLocked: "Browse open jobs, or add your résumé to find personalized matches.",
    profileApproved: "Résumé ready",
    profileRequired: "Profile required",
    completeProfile: "Complete Profile",
    completeProfileReady: "Your résumé is ready for matching.",
    completeProfileText: "Paste the full resume, improve it, and approve the master profile.",
    addSources: "Manage Sources",
    addSourcesText: "Sources run automatically. Open only to add or edit a source.",
    reviewMatches: "Review Matches",
    reviewMatchesText: "Open ranked jobs and move them through the pipeline.",
    reviewMatchesLocked: "Search open vacancies by title and location.",
    generatePackage: "Generate Package",
    generatePackageText: "Create bilingual CV, cover letter, interview prep, then export.",
    trackApplications: "Track Applications",
    trackApplicationsText: "Move jobs through review, ready, applied, and follow-up.",
    ready: "Ready",
    locked: "Locked",
    gateTitle: "Search with your résumé",
    gateText: "Upload or paste your résumé to search by your experience.",
    nextMatches: "Next matches",
    open: "Open",
    matchesEmptyReady: "Search with your résumé to see matching jobs.",
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
  const language = new URLSearchParams(location.search).get("lang");
  if (language === "en" || language === "ar") {
    state.locale = language;
    savePreferences();
  } else {
    applyPreferences();
  }
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
function iconHome() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10H15v-6H9v6H3Z"/></svg>';
}

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

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let returningScroll = null;

function restoreReadingPosition() {
  const target = returningScroll;
  if (!target || target.path !== location.pathname + location.search) return;
  requestAnimationFrame(() => {
    if (returningScroll !== target) return;
    window.scrollTo(0, target.y);
    if (Math.abs(window.scrollY - target.y) <= 1) returningScroll = null;
  });
}

function navigate(route) {
  const path = route.startsWith("/") ? route : `/${route}`;
  const changed = location.pathname + location.search !== path;
  if (changed) {
    returningScroll = null;
    history.replaceState({ ...history.state, scrollY: window.scrollY }, "");
    history.pushState({ scrollY: 0 }, "", path);
  }
  render();
  if (changed) {
    document.getElementById("workspace-content")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
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
  if (r === "profile" || r === "profile/") return { name: "profile" };
  if (r === "login") return { name: "login" };
  if (r === "onboarding") return { name: "onboarding" };
  if (r === "terms") return { name: "legal", page: "terms" };
  if (r === "privacy") return { name: "legal", page: "privacy" };
  if (r === "results" || r === "analytics") return { name: "results" };
  return { name: "search" };
}

function countByStatus(jobs = workspaceJobs()) {
  const counts = { discovered: 0, processing: 0, ready: 0, applied: 0, in_progress: 0, expired: 0, skipped: 0 };
  for (const job of jobs) {
    counts[job.status] = (counts[job.status] || 0) + 1;
  }
  return counts;
}

function countBySource() {
  const counts = {};
  for (const job of workspaceJobs()) {
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
      public_json: "خلاصة JSON عامة",
      greenhouse: "لوحة Greenhouse",
      lever: "لوحة Lever",
      ashby: "لوحة Ashby",
      workable: "لوحة Workable",
      smartrecruiters: "لوحة SmartRecruiters",
      saudi_government: "بوابة حكومية رسمية",
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

function invalidateApplicationReview(jobId, changes = {}) {
  const kit = ghostwriterFor(jobId);
  if (!kit) return;
  state.ghostwriter[jobId] = { ...kit, ...changes, quality_review: null };
  state.approvedKits[jobId] = false;
  document.querySelectorAll("[data-export-kit]").forEach((button) => {
    if (button.dataset.jobId === jobId) button.disabled = true;
  });
  document.querySelectorAll("[data-requirement-review]").forEach((review) => {
    if (review.dataset.requirementReview === jobId) review.remove();
  });
}

function applicationErrorMessage(code) {
  const english = state.locale === "en";
  switch (code) {
    case "JOB_DETAILS_REQUIRED": return english ? "Paste the full job posting or its requirements before generating." : "الصق إعلان الوظيفة الكامل أو متطلباتها قبل التوليد.";
    case "SOURCE_EVIDENCE_REQUIRED": return english ? "Add your résumé before tailoring an application." : "أضف سيرتك الذاتية قبل تخصيص مستندات التقديم.";
    case "KIT_INCOMPLETE": return english ? "Complete both language versions before review." : "أكمل المستندات باللغتين قبل المراجعة.";
    case "QUALITY_REVIEW_REQUIRED": return english ? "Review the current documents before exporting." : "راجع المستندات الحالية قبل التصدير.";
    case "JOB_CONTEXT_CHANGED": return english ? "The job or source résumé changed during generation. Generate again." : "تغيّرت معلومات الوظيفة أو السيرة أثناء التوليد. أعد التوليد.";
    default: return resumeCoachError(code);
  }
}

function aiWriterLabel(id = state.aiWriterModel) {
  return AI_WRITER_MODELS.find((model) => model.id === id)?.label || AI_WRITER_MODELS[0].label;
}

function accountId() {
  return state.session?.authenticated ? state.session.user?.sub || "" : "";
}

// Guest drafts belong to this tab. Earlier installations used unowned shared
// keys for signed-in and guest data; none can be attributed to this guest.
function guestDraft(name, value) {
  if (state.session?.authenticated || !guestSessionVerified) return null;
  try {
    const key = "jobs.guest.v2." + name;
    if (value !== undefined) sessionStorage.setItem(key, JSON.stringify(value));
    else return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch { /* Storage may be disabled. */ }
  return null;
}

function loadLocalProfile() {
  return guestDraft("profile");
}

function sanitizeLegacyProfile(profile = {}) {
  if (profile.resume_text?.trim() || profile.target_roles !== "Rust / Product / UX"
      || profile.resume_skills !== "Rust, Product operations, UX, Arabic SaaS" || profile.resume_filename !== "resume.pdf") return profile;
  return { ...profile, display_name: state.session?.user?.name || "", target_roles: "", target_locations: "",
    resume_filename: "", resume_skills: "", resume_languages: "", resume_seniority: "", resume_regions: "", resume_work_examples: "" };
}

function saveLocalProfile(profile) {
  guestDraft("profile", profile);
  saveWorkspaceState();
}

function loadLocalAiWriterState() {
  return guestDraft("writer");
}

function saveLocalAiWriterState() {
  guestDraft("writer", {
    aiWriterModel: state.aiWriterModel, ghostwriter: state.ghostwriter, approvedKits: state.approvedKits,
    interviewChats: state.interviewChats, resumeCoach: state.resumeCoach, approvedMasterResume: state.approvedMasterResume,
    masterResume: state.masterResume, tailoringBriefs: state.tailoringBriefs,
  });
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
    applicationDrafts: state.applicationDrafts,
    resumeCoach: state.resumeCoach,
    approvedMasterResume: state.approvedMasterResume,
    masterResume: state.masterResume,
    tailoringBriefs: state.tailoringBriefs,
    aiWriterModel: state.aiWriterModel,
    aiBillingSource: state.aiBillingSource,
    aiPersonalModel: state.aiPersonalModel,
  };
}

let guestSessionVerified = false;
let workspaceOwner = "";
let saveWorkspaceTimer;
let workspaceSaving = false;
let workspaceSaveQueued = false;

function saveWorkspaceState() {
  if (!workspaceOwner || accountId() !== workspaceOwner) return;
  clearTimeout(saveWorkspaceTimer);
  state.persistence = { ...(state.persistence || {}), pending: true };
  saveWorkspaceTimer = setTimeout(flushWorkspaceState, 500);
}

let activeWorkspaceSave = null;
function flushWorkspaceState() {
  const owner = accountId();
  if (!owner || owner !== workspaceOwner) return Promise.resolve();
  if (activeWorkspaceSave) {
    workspaceSaveQueued = true;
    return activeWorkspaceSave;
  }
  workspaceSaving = true;
  activeWorkspaceSave = (async () => {
    do {
      workspaceSaveQueued = false;
      await writeWorkspaceSnapshot(owner);
    } while (workspaceSaveQueued && accountId() === owner && !["conflict","save-failed"].includes(state.persistence.storage));
  })().finally(() => { workspaceSaving = false; activeWorkspaceSave = null; });
  return activeWorkspaceSave;
}

async function writeWorkspaceSnapshot(owner) {
  let conflict = false;
  try {
    const response = await accountFetch("/api/me/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: workspacePayload(), revisions: state.__revisions || {} }),
    });
    if (accountId() !== owner) return;
    if (response.ok) {
      const payload = await response.json();
      if (accountId() !== owner || payload.user?.sub && payload.user.sub !== owner) return;
      state.__revisions = payload.state?.__revisions || state.__revisions || {};
      state.persistence = { storage: payload.storage || "postgres-normalized", pending: false, last_saved_at: new Date().toISOString() };
    } else {
      conflict = response.status === 409;
      showWorkspaceSaveError(conflict);
    }
  } catch {
    if (accountId() === owner) showWorkspaceSaveError(false);
  }
}

function showWorkspaceSaveError(conflict) {
  state.persistence = { ...state.persistence, storage: conflict ? "conflict" : "save-failed", pending: false };
  const error = conflict
    ? "تغيرت مساحة العمل في جلسة أخرى. حدّث الصفحة قبل الحفظ."
    : "تعذر حفظ مساحة العمل. تعديلاتك ما زالت مفتوحة في هذه الصفحة.";
  state.action = { pending: "", message: "", error };
  render();
}

async function loadWorkspaceState() {
  const owner = accountId();
  if (!owner) return;
  try {
    const response = await accountFetch("/api/me/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Account data unavailable");
    const payload = await response.json();
    if (accountId() !== owner) return;
    if (!payload.state || payload.user?.sub && payload.user.sub !== owner) throw new Error("Workspace unavailable");
    state = { ...state, ...payload.state, session: state.session, persistence: { storage: payload.storage || "d1", pending: false, last_saved_at: "" } };
    workspaceOwner = owner;
  } catch {
    if (accountId() !== owner) return;
    workspaceOwner = "";
    state.persistence = { storage: "load-failed", pending: false };
    state.action = { pending: "", message: "", error: "تعذر تحميل بيانات حسابك. حدّث الصفحة لاستعادة سيرتك قبل الحفظ." };
  }
}

let deferredResumeOwner = "";
async function loadResumeFile() {
  const owner = accountId();
  const prior = state.resumeFile;
  if (!owner) return;
  try {
    const response = await accountFetch("/api/resumes", { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (owner === accountId() && prior === state.resumeFile) state.resumeFile = payload.file || null;
    }
  } catch {
    if (owner === accountId() && prior === state.resumeFile) state.resumeFile = null;
  }
}

async function uploadResumeFile(file) {
  if (!state.session?.authenticated) return null;
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await accountFetch("/api/resumes", { method: "POST", body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Secure resume upload failed.");
  if (!payload.file?.id) throw new Error("Resume storage returned no file.");
  return payload.file;
}

async function importProfileResume(file, savedFile = null) {
  if (state.resumeImportPending || (!file && !savedFile)) return;
  state.resumeImportPending = true;
  const account = state.session?.user?.sub;
  const previousText = state.profile?.resume_text;
  const progress = (message) => {
    checkContext();
    state.action = { pending: "resume-upload", message, error: "" };
    render();
  };
  const checkContext = () => {
    if (account !== state.session?.user?.sub || previousText !== state.profile?.resume_text || savedFile && savedFile.id !== state.resumeFile?.id) {
      const error = new Error("Source changed during extraction");
      error.code = "RESUME_CHANGED";
      throw error;
    }
  };
  try {
    progress("جاري قراءة ملف السيرة…");
    if (savedFile) {
      const response = await accountFetch(`/api/resumes/${encodeURIComponent(savedFile.id)}`, { cache: "no-store" });
      if (!response.ok) throw Object.assign(new Error(), { code: "SAVED_FILE_UNAVAILABLE" });
      file = new File([await response.blob()], savedFile.name, { type: savedFile.content_type });
    }
    const text = await extractResumeFileText(file, progress);
    if (!readableResumeText(text)) throw Object.assign(new Error(), { code: "RESUME_TEXT_DAMAGED" });
    checkContext();
    let storageFailed = false;
    if (!savedFile && state.session?.authenticated) {
      progress("جاري حفظ الملف الأصلي مشفراً…");
      try {
        const stored = await uploadResumeFile(file);
        checkContext();
        state.resumeFile = stored;
      } catch {
        storageFailed = true;
      }
    }
    checkContext();
    if (previousText !== text) resetResumeCoach();
    applyResumeSignalsFromText(text, previousText === text);
    state.profile.resume_filename = file.name;
    saveLocalProfile(state.profile);
    saveLocalAiWriterState();
    state.action = storageFailed
      ? { pending: "", message: "", error: "استخرجنا النص وهو جاهز للتحسين، لكن تعذر حفظ نسخة الملف الأصلي في الحساب." }
      : { pending: "", message: "تم استخراج نص السيرة. يمكنك مراجعته ثم تحسينه باستخدام DeepSeek.", error: "" };
  } catch (error) {
    const message = error.code === "SAVED_FILE_UNAVAILABLE"
      ? "تعذر تنزيل ملف السيرة المحفوظ. أعد رفع الملف من جهازك."
      : error.code === "RESUME_CHANGED" ? resumeCoachError("RESUME_CHANGED") : resumeExtractionErrorMessage(error);
    state.action = { pending: "", message: "", error: message };
  } finally {
    state.resumeImportPending = false;
    render();
  }
}

function originalResumeReady(profile = state.profile) {
  return assessResumeText(profile?.resume_text).readable;
}

function approvedImprovement() {
  const master = state.masterResume || {};
  return Boolean(originalResumeReady() && state.approvedMasterResume && master.source !== "original"
    && readableResumeText(master.ar) && readableResumeText(master.en));
}

function masterResumeReady() {
  return Boolean(originalResumeReady() && state.approvedMasterResume);
}

function usableCoachDraft(coach = state.resumeCoach) {
  return Boolean(originalResumeReady() && ["deepseek", PERSONAL_SOURCE].includes(coach?.provider)
    && readableResumeText(coach.ar_master_resume) && readableResumeText(coach.en_master_resume));
}

function approvedProfile() {
  const master = approvedImprovement() ? state.masterResume : {};
  return {
    ...(state.profile || {}),
    master_resume_ar: master.ar || "",
    master_resume_en: master.en || "",
    // Keep the uploaded original intact while giving AI the approved, editable master version.
    approved_master_resume: [master.ar, master.en].filter(Boolean).join("\n\n") || state.profile?.resume_text || "",
  };
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

function matchingReady() {
  return originalResumeReady() || masterResumeReady();
}

function workspaceJobs() {
  return state.jobs.filter((job) => !["example", "demo"].includes(job.data_quality)
    && job.source_quality !== "example" && job.source !== "resume-match"
    && !/^(demo-|resume-match-)/.test(job.id)
    && !(/^scan-.*-[0-9a-z]+-[1-3]$/.test(job.id) && !job.last_verified_at && !job.imported)
    && !(/^job-[1-5]$/.test(job.id) && !job.source_url && !job.imported));
}

function approvedMatchingProfile() {
  const profile = state.profile || {};
  const master = approvedImprovement() ? state.masterResume : {};
  const source = profile.resume_text || master.en || master.ar || "";
  const extracted = (!profile.target_roles || !profile.resume_skills) && source ? inferResumeSignals(source) : {};
  const coachProfile = usableCoachDraft() ? state.resumeCoach.search_profile || {} : {};
  const targetTitles = Array.isArray(coachProfile.target_titles) ? coachProfile.target_titles.join(", ") : "";
  const keywords = Array.isArray(coachProfile.keywords) ? coachProfile.keywords.join(", ") : "";
  const locations = Array.isArray(coachProfile.locations) ? coachProfile.locations.join(", ") : "";
  return {
    ...(state.profile || {}),
    target_roles: profile.target_roles || extracted.target_roles || targetTitles || "",
    target_locations: profile.target_locations || extracted.target_locations || locations || "",
    resume_skills: profile.resume_skills || extracted.resume_skills || keywords || "",
    resume_seniority: profile.resume_seniority || extracted.resume_seniority || coachProfile.seniority || "",
    resume_regions: profile.resume_regions || extracted.resume_regions || "",
    resume_text: state.profile?.resume_text || "",
    master_resume_ar: master.ar || "",
    master_resume_en: master.en || "",
  };
}

function importLiveMatchedJob(job) {
  const source = job.source_id || job.source || "live";
  return {
    id: `live-${job.id}`,
    public_id: job.public_id,
    public_url: "/vacancies/" + encodeURIComponent(job.public_id),
    employment_type: job.employment_type || "",
    title: job.title || "Untitled role",
    employer: job.employer || "Unknown employer",
    source,
    location: job.location || "",
    score: Number(job.score ?? 0),
    status: "discovered",
    deadline: "",
    description: job.description || "",
    tailored_resume: "",
    cover_letter: "",
    fit_explanation: job.fit_explanation || "",
    source_url: job.source_url || "",
    posted_at: job.posted_at || "",
    valid_through: job.valid_through || "",
    last_verified_at: job.last_verified_at || "",
    verification_status: job.verification_status || "live",
    match_confidence: job.match_confidence || "",
    match_eligible: job.match_eligible === true,
    match_breakdown: Array.isArray(job.match_breakdown) ? job.match_breakdown : [],
    fit_grade: job.fit_grade || "",
    match_evidence: Array.isArray(job.match_evidence) ? job.match_evidence : [],
    missing_requirements: Array.isArray(job.missing_requirements) ? job.missing_requirements : [],
    requirements_to_verify: Array.isArray(job.requirements_to_verify) ? job.requirements_to_verify : [],
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

function applyResumeSignalsFromText(text, preserveEdits = false) {
  const current = state.profile || {};
  const signals = inferResumeSignals(text);
  const changed = current.resume_text !== text;
  const previous = changed && originalResumeReady(current) ? inferResumeSignals(current.resume_text) : {};
  const editedFields = new Set(current.resume_edited_fields || []);
  for (const field of Object.keys(signals)) {
    const prior = current[field]?.trim();
    const preference = ["target_roles", "target_locations", "resume_regions"].includes(field);
    if (editedFields.has(field) || preserveEdits && prior && !changed
        || preference && prior && previous[field] !== undefined && prior !== previous[field]) {
      signals[field] = current[field] || "";
    } else if (!signals[field] && prior && !previous[field] && !current.resume_text) {
      signals[field] = prior;
    }
  }
  state.profile = {
    ...current,
    ...signals,
    display_name: signals.display_name || state.session?.user?.name || "",
    resume_text: text,
  };
}

function jobById(id) {
  return workspaceJobs().find((x) => x.id === id);
}

const selectedPostingRequests = new Map();
async function loadSelectedPosting(job) {
  const id = job.public_id;
  const original = job.description;
  if (!/^i-ksa-[a-z0-9]+-smartrecruiters-\d+$/u.test(id || "") ||
      (original && original !== "المتطلبات والتقديم في الإعلان الرسمي.")) return;
  let entry = selectedPostingRequests.get(id);
  if (!entry || entry.until <= Date.now()) {
    entry = { until: Date.now() + 300000, request: apiJson("/api/jobs/detail?id=" + encodeURIComponent(id)).catch(() => null) };
    selectedPostingRequests.set(id, entry);
  }
  const detail = await entry.request;
  if (detail?.description && detail.description !== original && job.description === original) {
    job.description = detail.description;
    const current = document.querySelector("[data-official-job-description]");
    if (current?.dataset.officialJobDescription === job.id) current.textContent = job.description;
  }
}

function sameSourceJobs(job, limit = 3) {
  return workspaceJobs().filter((x) => x.source === job.source && x.id !== job.id).slice(0, limit);
}

function replaceJob(updated) {
  const i = state.jobs.findIndex((x) => x.id === updated.id);
  if (i === -1) state.jobs.unshift(updated);
  else {
    const old = state.jobs[i];
    if (["title", "employer", "description"].some((field) => old[field] !== updated[field])) invalidateApplicationReview(updated.id);
    state.jobs[i] = updated;
  }
}

function saveGuestWorkspace() {
  guestDraft("jobs", { jobs: state.jobs, packages: state.packages, drafts: state.drafts, sources: state.sources });
}

function loadGuestWorkspace() {
  return guestDraft("jobs");
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

function filteredJobs() {
  const q = state.query.trim().toLowerCase();
  const jobs = workspaceJobs().filter((job) => {
    if (state.jobFilter === "matched" && !job.match_eligible) return false;
    if (state.jobFilter !== "all" && state.jobFilter !== "matched" && job.status !== state.jobFilter) return false;
    if (!q) return true;
    return (
      job.title.toLowerCase().includes(q) ||
      job.employer.toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q) ||
      job.source.toLowerCase().includes(q)
    );
  });
  if (state.jobSort === "employer") return jobs.sort((a, b) => a.employer.localeCompare(b.employer, state.locale));
  if (state.jobSort === "recent") return jobs.sort((a, b) => String(b.posted_at || b.updated_at || "").localeCompare(String(a.posted_at || a.updated_at || "")));
  return jobs.sort((a, b) => Number(b.relevance_score ?? b.score ?? 0) - Number(a.relevance_score ?? a.score ?? 0));
}

/* ---------------- API ---------------- */
function accountFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  const owner = accountId();
  if (owner) headers.set("X-Workspace-User", owner);
  else if (guestSessionVerified) headers.set("X-Workspace-User", "!guest");
  return fetch(path, { ...options, headers });
}

async function apiJson(path, options = {}) {
  const response = await accountFetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const error = new Error(`API ${path} failed with ${response.status}`);
    error.code = (await response.json().catch(() => null))?.code;
    throw error;
  }
  return response.json();
}

async function apiNoContent(path, options = {}) {
  const response = await accountFetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`API ${path} failed with ${response.status}`);
}

async function runAction(key, loading, success, task, errorMessage) {
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
      error: errorMessage?.(error?.code) || "تعذّر تنفيذ العملية. راجع البيانات وحاول مرة أخرى.",
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
  const previousContent = document.getElementById("workspace-content");
  const hadContentFocus = previousContent && document.activeElement === previousContent;
  const en = state.locale === "en";
  const current = screen === "jobs-list" || screen === "job-detail" ? "jobs" : screen;
  const navLink = item => {
    const active = item.id === current;
    return `<a class="nav-link${active ? " active" : ""}" href="${item.route}" data-nav="${item.route}"${active ? ' aria-current="page"' : ""}>${item.icon()}<span>${en ? item.en : item.ar}</span></a>`;
  };
  const navLabel = en ? "Main navigation" : "التنقل الرئيسي";
  const sideNav = showNav ? `<nav class="side-nav" aria-label="${navLabel}">${[...NAV, SETTINGS_NAV].map(navLink).join("")}</nav>` : "";
  const bottomNav = showNav ? `<nav class="bottom-nav" aria-label="${navLabel}">${NAV.map(navLink).join("")}</nav>` : "";
  const title = [...NAV, SETTINGS_NAV].find(item => item.id === current);
  const routeTitle = title ? (en ? title.en : title.ar) : "";
  document.title = routeTitle ? `${routeTitle} · JOBS.wasfai.com` : "JOBS.wasfai.com";
  root.innerHTML = `<a class="skip-content" href="#workspace-content">${en ? "Skip to content" : "انتقل إلى المحتوى"}</a>
    <div class="phone${showNav ? "" : " standalone"}" data-screen="${esc(screen)}">${sideNav}${topbar || renderTopbar()}
      <main id="workspace-content" tabindex="-1">${content}</main>${bottomNav}</div>`;
  setupEvents();
  if (hadContentFocus) document.getElementById("workspace-content").focus({ preventScroll: true });
  restoreReadingPosition();
}

function renderTopbar() {
  const en = state.locale === "en";
  const name = state.session?.user?.name || "";
  const accountRoute = state.session?.authenticated ? "/profile" : "/login?next=%2Fprofile";
  const accountLabel = state.session?.authenticated ? (en ? "User profile" : "الملف الشخصي") : (en ? "Sign in or create an account" : "تسجيل الدخول أو إنشاء حساب");
  return `<header class="topbar">
    <a class="brand" href="/app" data-nav="/app" aria-label="${en ? "Jobs home" : "الصفحة الرئيسية للوظائف"}">
      ${brandLogo()}<span class="brand-name" lang="en" dir="ltr">JOBS.wasfai.com</span>
    </a>
    <div class="header-actions">
      <button class="header-quick" data-toggle-locale lang="${en ? "ar" : "en"}" aria-label="${en ? "التبديل إلى العربية" : "Switch to English"}"><span class="locale-full">${esc(tr("language"))}</span><span class="locale-short" aria-hidden="true">${en ? "عربي" : "EN"}</span></button>
      <button class="header-quick theme-quick" data-toggle-theme aria-label="${en ? "Dark appearance" : "المظهر الداكن"}" aria-pressed="${state.theme === "dark"}">${state.theme === "dark" ? "☀" : "☾"}</button>
      <div class="user-menu-wrap">
        <button class="avatar user-menu-trigger" data-user-menu aria-label="${en ? "Account menu" : "قائمة الحساب"}" aria-expanded="false" aria-controls="account-menu">${name ? esc(name.trim().charAt(0)) : iconUser()}</button>
        <div class="user-menu" id="account-menu" data-user-menu-panel hidden>
          <a href="${accountRoute}" data-nav="${accountRoute}">${iconUser()} <span>${accountLabel}</span></a>
          <a href="/settings" data-nav="/settings">${iconCog()} <span>${en ? "Settings" : "الإعدادات"}</span></a>
          <a href="/applications${en ? "?lang=en" : ""}">${iconDoc()} <span>${en ? "My applications" : "طلبات التوظيف"}</span></a>
          <a href="/vacancies${en ? "?lang=en" : ""}">${iconList()} <span>${en ? "Public vacancies" : "الوظائف العامة"}</span></a>
          <a href="/employers">${iconUser()} <span>${en ? "Employers" : "أصحاب العمل"}</span></a>
          <a href="/pricing/?lang=${en ? "en" : "ar"}">${iconSpark()} <span>${en ? "Plans and payments" : "الباقات والمدفوعات"}</span></a>
        </div>
      </div>
    </div>
  </header>`;
}

function banner() {
  if (state.action.pending) {
    return `<div class="banner loading" role="status">${esc(state.action.message)}</div>`;
  }
  if (state.action.error) {
    return `<div class="banner err" role="alert">${esc(state.action.error)}</div>`;
  }
  if (state.action.message) {
    return `<div class="banner ok" role="status">${esc(state.action.message)}</div>`;
  }
  return "";
}

/* ---------------- Home / Search ---------------- */
function renderCommandHome() {
  const en = state.locale === "en";
  const signedIn = state.session?.authenticated;
  const saved = workspaceJobs();
  const active = saved.filter(job => !["expired", "skipped"].includes(job.status));
  const hasResume = signedIn && matchingReady();
  const targetRoles = hasResume ? String(approvedMatchingProfile().target_roles || "").trim() : "";
  const matchButton = (style) => `<button class="btn ${style}" data-search-approved-jobs>${iconSearch()} ${en ? "Find jobs for my résumé" : "ابحث عن وظائف تناسب سيرتي"}</button>`;
  const navLink = (route, label, style) => `<a class="btn ${style}" href="${esc(route)}" data-nav="${esc(route)}">${label}</a>`;

  let nextStep = "";
  if (active.length) {
    const job = active.length === 1 ? active[0] : null;
    const note = job ? [job.title, job.employer].filter(Boolean).map(esc).join(" · ")
      : (en ? `Saved vacancies: ${active.length}` : `وظائفك المحفوظة قيد المتابعة: ${active.length}`);
    nextStep = `<section class="home-next" aria-labelledby="home-next-title">
      <div><h2 id="home-next-title">${en ? "Continue with saved jobs" : "متابعة وظائفك المحفوظة"}</h2><p dir="auto">${note}</p></div>
      <div class="home-actions">${navLink(job ? "/jobs/" + encodeURIComponent(job.id) : searchUrl("saved"),
        job ? (en ? "Open saved job" : "افتح الوظيفة المحفوظة") : (en ? "View saved jobs" : "اعرض الوظائف المحفوظة"), "primary")}
      ${targetRoles ? matchButton("outline") : ""}</div>
    </section>`;
  } else if (targetRoles) {
    nextStep = `<section class="home-next" aria-labelledby="home-next-title">
      <div><h2 id="home-next-title">${en ? "Search with your résumé" : "البحث بسيرتك الذاتية"}</h2>
      <p>${en ? "Target role" : "المسمى المستهدف"} · <bdi>${esc(targetRoles)}</bdi></p></div>
      <div class="home-actions">${matchButton("primary")}</div>
    </section>`;
  }

  let secondary = "";
  if (!signedIn) {
    secondary = navLink("/login", en ? "Sign in to save jobs" : "سجّل الدخول لحفظ الوظائف", "ghost");
  } else if (!hasResume) {
    const existing = Boolean(state.profile?.resume_filename || state.profile?.resume_text);
    secondary = navLink("/account", existing
      ? (en ? "Review your résumé for job matching" : "راجع سيرتك للبحث عن وظائف مناسبة")
      : (en ? "Add a résumé to find matches" : "أضف سيرتك للعثور على وظائف تناسبك"), "ghost");
  } else if (!targetRoles) {
    secondary = `<button class="btn ghost" data-edit-match-role>${en ? "Add your target job title" : "أضف المسمى الوظيفي المستهدف"}</button>`;
  }
  if (saved.length && !active.length) {
    secondary += navLink(searchUrl("saved"), en ? "View saved jobs" : "اعرض الوظائف المحفوظة", "ghost");
  }

  const draft = history.state?.homeFilters || {};
  shell(
    `${banner()}<div class="section job-home">
      <section class="home-search" aria-labelledby="home-search-title">
        <h1 id="home-search-title">${en ? "Find a job in Saudi Arabia" : "ابحث عن وظيفة في السعودية"}</h1>
        ${jobSearchForm("browse", draft, true, nextStep ? "outline" : "primary")}
      </section>
      ${nextStep}
      ${secondary ? `<div class="home-links">${secondary}</div>` : ""}
    </div>`,
    { screen: "search" },
  );
  const form = document.querySelector(".home-search form");
  form.addEventListener("input", () => {
    history.replaceState({ ...history.state, homeFilters: Object.fromEntries(new FormData(form)) }, "");
  });
}

function renderSearch() {
  renderCommandHome();
}

/* ---------------- Jobs list ---------------- */
let searchPage = { key: "", mode: "", jobs: [] };
let lastMatches = { profileKey: "", jobs: [] };

function matchingProfileKey() {
  return JSON.stringify([state.session?.user?.sub || "", approvedMatchingProfile()]);
}

function targetJobs() {
  const saved = workspaceJobs();
  const recent = lastMatches.profileKey === matchingProfileKey() ? lastMatches.jobs : [];
  const byId = new Map(recent.map((job) => [job.id, job]));
  for (const job of saved) byId.set(job.id, job);
  return [...byId.values()];
}

function targetJobOptions(jobs, selected = "") {
  const placeholder = accountLabel("اختر وظيفة من قائمتك", "Choose a job from your list");
  return `<option value="">${placeholder}</option>` + jobs.map(job =>
    `<option value="${esc(job.id)}" ${job.id === selected ? "selected" : ""}>${esc(job.title)} · ${esc(job.employer)}</option>`).join("");
}

const SEARCH_FIELDS = ["q", "city", "profession", "min_salary", "experience", "sector"];

function defaultJobSearchMode() {
  let previous = "";
  try { previous = sessionStorage.getItem("jobs.search-tab." + (state.session?.user?.sub || "guest")); } catch {}
  if (previous === "saved" || previous === "browse") return previous;
  return state.session?.authenticated && matchingReady() ? "matches" : "browse";
}

function searchParamsFromUrl(query = location.search) {
  const params = new URLSearchParams(query);
  const mode = ["browse", "matches", "saved"].includes(params.get("view")) ? params.get("view") : defaultJobSearchMode();
  const offset = Number(params.get("offset"));
  const filters = Object.fromEntries(SEARCH_FIELDS.filter((field) => params.get(field)?.trim())
    .map((field) => [field, params.get(field).trim()]));
  return { mode, filters, offset: Number.isSafeInteger(offset) && offset > 0 ? offset : 0, asOf: params.get("as_of") || "" };
}

function searchUrl(mode, filters = {}, offset = 0, asOf = "") {
  const params = new URLSearchParams();
  params.set("view", mode);
  for (const key of SEARCH_FIELDS) if (filters[key]) params.set(key, filters[key]);
  if (offset) params.set("offset", String(offset));
  if (asOf) params.set("as_of", asOf);
  return "/jobs?" + params.toString();
}

function searchModes(active) {
  const en = state.locale === "en";
  const labels = { browse: en ? "All vacancies" : "كل الوظائف", matches: en ? "Résumé matches" : "وظائف تناسب سيرتي", saved: en ? "Saved jobs" : "الوظائف المحفوظة" };
  return `<nav class="section chips job-navigation" aria-label="${en ? "Job search" : "بحث الوظائف"}">${Object.entries(labels).map(([mode, label]) =>
    `<button class="chip ${active === mode ? "active" : ""}" data-nav="${searchUrl(mode)}" data-search-tab="${mode}" aria-pressed="${active === mode}">${label}</button>`).join("")}</nav>`;
}

function jobSearchForm(mode, filters, compact = false, submitStyle = "primary") {
  const en = state.locale === "en";
  const field = (key, label, type = "text") => `<label class="field">${label}<input type="${type}" name="${key}" value="${esc(filters[key] || "")}" ${type === "number" ? 'min="0" step="1"' : 'maxlength="180"'} /></label>`;
  const expanded = ["profession", "min_salary", "experience", "sector"].some(key => filters[key]);
  return `<form class="form vacancy-search" data-vacancy-filters="${mode}">
    <div class="vacancy-search-fields">${field("q", en ? "Job title, keyword or employer" : "المسمى أو الكلمة أو جهة العمل")}
    ${field("city", en ? "City or location" : "المدينة أو الموقع")}</div>
    ${compact ? "" : `<details class="vacancy-filters" ${expanded ? "open" : ""}><summary>${en ? "More filters" : "مرشحات إضافية"}</summary>
      <div class="vacancy-search-fields">${field("profession", en ? "Profession" : "المهنة")}
      ${field("min_salary", en ? "Minimum monthly salary (SAR)" : "الحد الأدنى للراتب الشهري (ر.س)", "number")}
      ${field("experience", en ? "Years of experience" : "سنوات الخبرة", "number")}
      <label class="field">${en ? "Sector" : "القطاع"}<select name="sector"><option value="">${en ? "All sectors" : "جميع القطاعات"}</option><option value="government" ${filters.sector === "government" ? "selected" : ""}>${en ? "Saudi government" : "حكومي سعودي"}</option></select></label></div></details>`}
    <div class="row"><button class="btn ${submitStyle}" type="submit">${iconSearch()} ${en ? "Search jobs" : "بحث عن وظائف"}</button>
    ${!compact && Object.keys(filters).length ? `<button class="btn outline" type="button" data-nav="${searchUrl(mode)}">${en ? "Clear filters" : "مسح المرشحات"}</button>` : ""}</div>
  </form>`;
}

const PAGE_SIZE = 20;

async function fetchJobPage(page, filters, offset, asOf, profile) {
  try {
    const params = { ...filters, limit: String(PAGE_SIZE), offset: String(offset) };
    if (asOf) params.as_of = asOf;
    const result = page.mode === "matches"
      ? await apiJson("/api/jobs/match", { method: "POST", body: JSON.stringify({ profile, filters, offset, limit: PAGE_SIZE, as_of: asOf }) })
      : await apiJson("/api/jobs/search?" + new URLSearchParams(params));
    if (!Array.isArray(result.jobs) || !Number.isFinite(result.total) || result.total < 0) throw new Error("Invalid job results");
    if (searchPage !== page) return;
    page.jobs = result.jobs.map(importLiveMatchedJob);
    page.total = result.total;
    page.asOf = result.as_of || asOf;
    page.next = Number.isSafeInteger(result.next_offset) && result.next_offset > offset ? result.next_offset : null;
    if (page.mode === "matches") {
      lastMatches = { profileKey: page.profileKey, jobs: page.jobs };
      refreshTargetChoices();
      const account = state.session?.user?.sub;
      if (account && matchingProfileKey() === page.profileKey) {
        try { sessionStorage.setItem("jobs.match-search." + account, searchUrl("matches", filters, offset)); } catch {}
      }
    }
  } catch (error) {
    if (searchPage !== page) return;
    page.error = error.code || "SEARCH_UNAVAILABLE";
  }
  page.pending = false;
  if (routeOf().name === "jobs-list") render();
}

let restoredSearchProfile = "";

async function restoreRecentMatches() {
  const account = state.session?.user?.sub;
  if (!account || !matchingReady()) return;
  const profileKey = matchingProfileKey();
  if (lastMatches.profileKey === profileKey || restoredSearchProfile === profileKey) return;
  restoredSearchProfile = profileKey;
  try {
    const saved = sessionStorage.getItem("jobs.match-search." + account);
    if (!saved) return;
    const { filters, offset } = searchParamsFromUrl(new URL(saved, location.origin).search);
    const previous = lastMatches;
    const result = await apiJson("/api/jobs/match", { method: "POST",
      body: JSON.stringify({ profile: approvedMatchingProfile(), filters, offset, limit: PAGE_SIZE }) });
    if (matchingProfileKey() !== profileKey || lastMatches !== previous || !Array.isArray(result.jobs)) return;
    lastMatches = { profileKey, jobs: result.jobs.map(importLiveMatchedJob) };
    refreshTargetChoices();
  } catch { /* Saved jobs and manual search remain available. */ }
}

function refreshTargetChoices() {
  const selector = document.querySelector("#coach-target-job");
  if (selector) {
    const current = selector.value;
    const targets = targetJobs();
    selector.innerHTML = targetJobOptions(targets);
    if (targets.some(job => job.id === current)) selector.value = current;
    selector.form.hidden = !targets.length;
    document.querySelector("[data-find-coach-job]").hidden = Boolean(targets.length);
  }
}

function validVacancyId(id) {
  return typeof id === "string" && /^[ei]-[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function vacancyPageUrl(id) {
  return "/vacancies/" + encodeURIComponent(id) + (state.locale === "en" ? "?lang=en" : "");
}

function saveVacancyUrl(id) {
  return "/jobs?view=browse&vacancy=" + encodeURIComponent(id);
}

function publicJobCard(job, matched, selected = false) {
  const en = state.locale === "en";
  const signedIn = Boolean(state.session?.authenticated);
  const saved = state.persistence?.storage !== "save-failed" && workspaceJobs().some(item => item.public_id === job.public_id);
  const role = job.match_breakdown?.find(item => item.key === "role");
  const evidence = role?.evidence?.[0] || job.match_evidence?.[0];
  const savePrimary = signedIn && (matched || selected);
  const saveLabel = !signedIn ? (en ? "Sign in to save" : "سجّل الدخول للحفظ") : saved ? (en ? "Open saved job" : "فتح الوظيفة المحفوظة") : (en ? "Save and tailor résumé" : "حفظ وتخصيص السيرة");
  const saveButton = `<button class="btn ${savePrimary ? "primary" : "ghost"}" data-open-search-job="${esc(job.public_id)}">${saveLabel}</button>`;
  const details = `<a class="btn ${savePrimary ? "ghost" : "primary"}" href="${esc(vacancyPageUrl(job.public_id))}">${en ? "Vacancy details" : "تفاصيل الإعلان"}</a>`;
  return `<article class="card job-search-card"><div class="section-head"><h2><a href="${esc(vacancyPageUrl(job.public_id))}">${esc(job.title)}</a></h2>
    ${matched ? `<span class="tag teal">${esc(job.score)}% · ${en ? "match" : "تطابق"}</span>` : ""}</div>
    <p>${esc([job.employer, job.location].filter(Boolean).join(" · "))}</p>
    ${matched && evidence ? `<p class="muted tiny">${esc(evidence)}</p>` : ""}
    ${matched && job.requirements_to_verify?.length ? `<p class="muted tiny">${en ? "Confirm" : "تحقق من المتطلب"} · ${esc(job.requirements_to_verify.join(", "))}</p>` : ""}
    <div class="job-card-actions">${savePrimary ? saveButton + details : details + saveButton}</div></article>`;
}

function renderJobsList() {
  const { mode, filters, offset, asOf } = searchParamsFromUrl();
  if (mode === "saved") return renderSavedJobs();
  const en = state.locale === "en";
  const wanted = mode === "browse" ? new URLSearchParams(location.search).get("vacancy") : null;
  if (wanted && !validVacancyId(wanted)) {
    return shell(`<section class="section empty"><h1>${en ? "Vacancy unavailable" : "الإعلان غير متاح"}</h1><a class="btn primary" href="/jobs?view=browse">${en ? "Browse vacancies" : "تصفح الوظائف"}</a></section>`, { screen: "jobs-list" });
  }
  if (wanted) {
    filters.id = wanted.slice(2);
    filters.kind = wanted.startsWith("e-") ? "employer" : "ingested";
  }
  const matching = mode === "matches";
  const profileKey = matching ? matchingProfileKey() : "";
  let content;
  if (matching && (!state.session?.authenticated || !matchingReady())) {
    const guest = !state.session?.authenticated;
    const hasSource = Boolean(state.profile?.resume_text?.trim() || state.profile?.resume_filename);
    const message = guest ? (en ? "Sign in to search with your résumé." : "سجّل الدخول للبحث باستخدام سيرتك.")
      : hasSource ? (en ? "We need clearer résumé text to find matches. Re-read your file or paste its text." : "نحتاج نصاً أوضح لمطابقة سيرتك. أعد استخراج الملف أو الصق نص السيرة.")
      : (en ? "Upload or paste your résumé to find matching vacancies." : "ارفع سيرتك أو الصقها للبحث عن وظائف تناسب خبراتك.");
    content = `<div class="empty"><p>${message}</p>
      <button class="btn primary" data-nav="${guest ? "/login" : "/account"}">${guest ? (en ? "Sign in" : "تسجيل الدخول") : hasSource ? (en ? "Review résumé" : "مراجعة السيرة") : (en ? "Add résumé" : "إضافة السيرة")}</button>
      <button class="btn outline" data-nav="${searchUrl("browse")}">${en ? "Browse all vacancies" : "تصفح جميع الشواغر"}</button></div>`;
  } else {
    const key = JSON.stringify([mode, filters, offset, asOf, profileKey]);
    if (key !== searchPage.key) {
      if (matching) lastMatches = { profileKey, jobs: [] };
      searchPage = { key, mode, profileKey, pending: true, jobs: [] };
      void fetchJobPage(searchPage, filters, offset, asOf, matching ? approvedMatchingProfile() : null);
    }
    const page = searchPage;
    if (page.pending) content = `<p role="status" class="empty">${en ? "Searching vacancies…" : "جاري البحث عن الوظائف…"}</p>`;
    else if (page.error) {
      const needsRole = ["PROFILE_REQUIRED", "TARGET_ROLE_REQUIRED"].includes(page.error);
      const needsResume = ["RESUME_REQUIRED", "RESUME_UNREADABLE"].includes(page.error);
      const message = needsRole ? (en ? "Which job title should we search for? Add one to your profile." : "ما المسمى الوظيفي الذي تريد البحث عنه؟ أضفه إلى ملفك.")
        : needsResume ? (en ? "Re-read the saved file or paste readable résumé text to find matches." : "أعد استخراج الملف المحفوظ أو الصق نصاً واضحاً للبحث عن وظائف تناسبك.")
        : (en ? "Job search is temporarily unavailable." : "تعذّر الاتصال بخدمة البحث عن الوظائف.");
      content = `<div role="alert" class="empty"><p>${message}</p>
        ${needsRole ? `<button class="btn primary" data-edit-match-role>${en ? "Enter target job title" : "إدخال المسمى المستهدف"}</button>` : needsResume ? `<button class="btn primary" data-nav="/account">${en ? "Review résumé" : "مراجعة السيرة"}</button>` : `<button class="btn outline" data-retry-job-search>${en ? "Try again" : "إعادة المحاولة"}</button>`}
        ${matching ? `<button class="btn outline" data-nav="${searchUrl("browse")}">${en ? "Browse all vacancies" : "تصفح جميع الشواغر"}</button>` : ""}</div>`;
    } else {
      const count = page.jobs.length;
      content = count ? `<p class="muted tiny" role="status">${en ? "Showing" : "عرض"} ${offset + 1}–${offset + count} ${en ? "of" : "من"} ${page.total}</p><div class="list">${page.jobs.map(job => publicJobCard(job, matching, Boolean(wanted))).join("")}</div>`
        : `<p class="empty" role="status">${matching ? (en ? "No verified vacancies match this résumé and these filters." : "لا توجد شواغر موثقة تطابق سيرتك والمرشحات الحالية.") : (en ? "No vacancies match these filters." : "لا توجد شواغر تطابق هذه المرشحات.")}</p>`;
      if (wanted && !count) content = `<div class="empty" role="status"><p>${en ? "This vacancy is no longer available." : "لم يعد هذا الإعلان متاحاً."}</p><a class="btn primary" href="/jobs?view=browse">${en ? "Browse vacancies" : "تصفح الوظائف"}</a></div>`;
      if (matching && !count) content += `<div class="row"><button class="btn outline" data-edit-match-role>${en ? "Edit target job title" : "تعديل المسمى المستهدف"}</button>
        <button class="btn outline" data-nav="${searchUrl("browse")}">${en ? "Browse all vacancies" : "تصفح جميع الشواغر"}</button></div>`;
      const paging = (cursor, label) => `<button class="btn outline" data-nav="${esc(searchUrl(mode, filters, cursor, page.asOf))}">${label}</button>`;
      content += `<nav class="row vacancy-paging">${offset ? paging(Math.max(0, offset - PAGE_SIZE), en ? "Previous" : "السابق") : ""}${page.next !== null ? paging(page.next, en ? "Next" : "التالي") : ""}</nav>`;
    }
  }
  shell(`${banner()}<header class="section"><h1>${wanted ? (en ? "Selected vacancy" : "الإعلان المحدد") : matching ? (en ? "Résumé matches" : "وظائف تناسب سيرتي") : (en ? "Find a job" : "البحث عن وظيفة")}</h1></header>
    ${searchModes(mode)}${wanted ? `<a class="job-back" href="/jobs?view=browse">${iconBack()} ${en ? "All vacancies" : "جميع الوظائف"}</a>` : `<section class="section">${jobSearchForm(mode, filters)}</section>`}<section class="section">${content}</section>`, { screen: "jobs-list" });
}


function renderSavedJobs() {
  const en = state.locale === "en";
  const saved = workspaceJobs();
  const shown = filteredJobs();
  const counts = countByStatus(saved);
  const labels = en ? { all: "All", matched: "Résumé matches", processing: "Preparing", ready: "Ready", applied: "Applied", in_progress: "Following up" }
    : { all: "الكل", matched: "مطابقة للسيرة", processing: "قيد التجهيز", ready: "جاهزة", applied: "تم التقديم", in_progress: "قيد المتابعة" };
  const available = { ...counts, all: saved.length, matched: saved.filter(job => job.match_eligible).length };
  const filters = Object.entries(labels).filter(([key]) => key === "all" || available[key] || state.jobFilter === key)
    .map(([key, label]) => `<button class="chip ${state.jobFilter === key ? "active" : ""}" aria-pressed="${state.jobFilter === key}" data-job-filter="${key}">${label} (${available[key] || 0})</button>`).join("");
  const sorts = en ? { score: "Résumé fit", recent: "Most recent", employer: "Employer" }
    : { score: "الملاءمة", recent: "الأحدث", employer: "جهة العمل" };
  const list = shown.length ? shown.map(jobCardHtml).join("") : `<p class="empty">${en ? "No saved jobs here yet." : "لا توجد وظائف محفوظة هنا بعد."}</p>`;
  const bulk = state.selectedJobs.length ? `<div class="bulk-bar"><strong>${en ? "Selected" : "المحددة"} · ${state.selectedJobs.length}</strong>
    <span>${en ? "Set status" : "تغيير الحالة"}</span><div class="seg">${["processing","ready","applied","in_progress"].map(key => `<button data-bulk-status="${key}">${labels[key]}</button>`).join("")}</div></div>` : "";
  shell(`${banner()}<header class="section"><h1>${en ? "Saved jobs" : "الوظائف المحفوظة"} (${saved.length})</h1></header>${searchModes("saved")}
    ${saved.length ? `<section class="section job-saved-controls"><div class="chips">${filters}</div><div class="row">
      <label>${en ? "Sort by" : "ترتيب حسب"} <select data-sort class="select">${Object.entries(sorts).map(([key, text]) => `<option value="${key}" ${state.jobSort === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>
      ${shown.length ? `<button class="btn ghost" data-select-all>${state.selectedJobs.length === shown.length ? (en ? "Clear selection" : "إلغاء التحديد") : (en ? "Select all" : "تحديد الكل")}</button>` : ""}</div></section>` : ""}
    <section class="section"><div class="list">${list}</div>${!saved.length ? `<a class="btn primary" href="/jobs?view=browse">${en ? "Find a vacancy" : "البحث عن وظيفة"}</a>` : ""}</section>${bulk}
    ${state.session?.authenticated ? `<section class="section"><details class="section-block"><summary>${en ? "Import a job link" : "استيراد رابط وظيفة"}</summary>
    <form class="form" data-import-job><label class="field">${en ? "Wasfai or Greenhouse vacancy URL" : "رابط إعلان وصفاي أو Greenhouse"}<input name="url" type="url" required maxlength="500" placeholder="https://…" /></label>
    <button class="btn primary" type="submit">${en ? "Save vacancy" : "حفظ الوظيفة"}</button></form></details></section>` : ""}`, { screen: "jobs-list" });
}

function jobCardHtml(job) {
  const en = state.locale === "en";
  const selected = state.selectedJobs.includes(job.id);
  const statuses = { discovered: "Saved", processing: "Preparing", ready: "Ready", applied: "Applied", in_progress: "Following up", expired: "Expired" };
  const href = "/jobs/" + encodeURIComponent(job.id);
  const verified = job.verification_status === "live" && job.last_verified_at ? String(job.last_verified_at).slice(0, 10) : "";
  return `<article class="card job-search-card job-saved-card"><h2><a href="${esc(href)}" data-job="${esc(job.id)}">${esc(job.title)}</a></h2>
    <p>${esc([job.employer, job.location].filter(Boolean).join(" · "))}</p>
    <p class="muted tiny">${esc(en ? statuses[job.status] || job.status : STATUS_LABELS[job.status] || job.status)}${job.match_breakdown?.length ? " · " + esc(job.score) + "%" : ""}${verified ? " · " + (en ? "Verified" : "تاريخ التحقق") + " " + esc(verified) : ""}</p>
    <div class="job-card-actions"><a class="btn primary" href="${esc(href)}" data-job="${esc(job.id)}">${en ? "Open saved job" : "فتح الوظيفة المحفوظة"}</a>
    <button class="btn ghost" aria-pressed="${selected}" data-select-job="${esc(job.id)}">${selected ? (en ? "Deselect" : "إلغاء التحديد") : (en ? "Select" : "تحديد")}</button></div></article>`;
}

/* ---------------- Job detail ---------------- */
function detailApplyLink(job) {
  if (validVacancyId(job.public_id) && job.public_id.startsWith("e-")) {
    return { url: vacancyPageUrl(job.public_id) + "#apply", portal: true };
  }
  const raw = jobApplyUrl(job);
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password) {
      return { url: url.href, portal: url.origin === location.origin };
    }
  } catch { /* Saved manual jobs can have no application address. */ }
  return null;
}

function renderJobDetail(id) {
  const job = jobById(id);
  const en = state.locale === "en";
  if (!job) {
    return shell(`<section class="section empty"><h1>${en ? "Saved job unavailable" : "الوظيفة المحفوظة غير متاحة"}</h1><a class="btn primary" href="/jobs?view=saved">${en ? "View saved jobs" : "عرض الوظائف المحفوظة"}</a></section>`, { screen: "job-detail" });
  }
  void loadSelectedPosting(job);
  const tabs = en ? { overview: "Overview", resume: "Tailor résumé", match: "Résumé fit", tracking: "Track application" }
    : { overview: "نظرة عامة", resume: "تخصيص السيرة", match: "ملاءمة السيرة", tracking: "متابعة الطلب" };
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const tab = Object.hasOwn(tabs, requestedTab) ? requestedTab
    : Object.hasOwn(tabs, state.assistantTab) ? state.assistantTab : "overview";
  const pkg = packageFor(job.id);
  const draft = draftFor(job.id);
  const kit = ghostwriterFor(job.id);
  const destination = detailApplyLink(job);
  const applyLabel = destination?.portal ? (en ? "Apply on Wasfai" : "التقديم عبر وصفاي") : (en ? "Apply with employer" : "التقديم لدى جهة العمل");
  const action = destination ? `<a class="btn ${tab === "overview" ? "primary" : "outline"}" data-vacancy-apply href="${esc(destination.url)}" ${destination.portal ? "" : 'target="_blank" rel="noopener noreferrer"'}>
    ${applyLabel}${destination.portal ? "" : ` <span aria-hidden="true">↗</span><span class="job-sr-only">${en ? "(opens a new tab)" : "(يفتح في تبويب جديد)"}</span>`}</a>` : "";
  const related = sameSourceJobs(job, 3);
  const overview = `<section class="section-block"><h2>${en ? "Job description" : "وصف الوظيفة"}</h2>
    <p class="job-posting-text" dir="auto" data-official-job-description="${esc(job.id)}">${esc(job.description || (en ? "No description is available." : "لا يتوفر وصف لهذه الوظيفة."))}</p></section>
    ${!destination ? `<p class="muted" role="status">${en ? "No application link is available for this saved job." : "لا يتوفر رابط تقديم لهذه الوظيفة المحفوظة."}</p>` : ""}
    ${related.length ? `<section class="section-block"><h2>${en ? "Other saved jobs from this source" : "وظائف محفوظة أخرى من هذا المصدر"}</h2><ul class="job-related">${related.map(item => `<li><a href="/jobs/${encodeURIComponent(item.id)}" data-job="${esc(item.id)}">${esc(item.title)}</a> · ${esc(item.employer)}</li>`).join("")}</ul></section>` : ""}`;
  const match = `<section class="section-block"><div class="section-head tight"><h2>${en ? "Résumé fit" : "ملاءمة السيرة"}</h2>
    ${job.match_breakdown?.length ? `<span class="tag teal">${esc(job.score)}%</span>` : ""}</div>
    ${job.fit_explanation ? `<p>${esc(job.fit_explanation)}</p>` : ""}
    <div class="skill-bar">${buildSkillRows(job)}</div>
    ${matchingReady() && state.session?.authenticated ? `<button class="btn primary" data-evaluate-job="${esc(job.id)}">${en ? "Evaluate my résumé" : "تقييم سيرتي لهذه الوظيفة"}</button>` :
      `<button class="btn primary" data-nav="${state.session?.authenticated ? "/account" : "/login"}">${state.session?.authenticated ? (en ? "Add a résumé to evaluate fit" : "أضف سيرتك لتقييم الملاءمة") : (en ? "Sign in to evaluate fit" : "سجّل الدخول لتقييم الملاءمة")}</button>`}</section>`;
  const resumeBody = (en ? kit?.en_resume : kit?.ar_resume) || kit?.ar_resume || kit?.en_resume || pkg?.resume_body || job.tailored_resume;
  const resume = `${renderGhostwriterPanel(job, kit)}${resumeBody ? `<details class="section-block resume-preview"><summary>${en ? "Preview full résumé" : "معاينة السيرة كاملة"}</summary><p class="job-posting-text" dir="auto">${esc(resumeBody)}</p></details>` : ""}`;
  const panels = { overview, resume, match, tracking: renderAssistedApplyPanel(job, pkg, draft, kit) };
  const back = state.jobReturnUrl || "/jobs?view=saved";
  shell(`${banner()}<div class="job-workspace">
    <a class="job-back" href="${esc(back)}" data-nav="${esc(back)}">${iconBack()} ${back.includes("view=saved") ? (en ? "Saved jobs" : "الوظائف المحفوظة") : (en ? "Search results" : "نتائج البحث")}</a>
    <header class="job-workspace-head"><div><h1 dir="auto">${esc(job.title)}</h1><p>${esc([job.employer, job.location].filter(Boolean).join(" · "))}</p>
    ${job.employment_type || job.posted_at ? `<p class="muted tiny">${esc([job.employment_type, job.posted_at?.slice(0,10)].filter(Boolean).join(" · "))}</p>` : ""}</div>${action}</header>
    <nav data-job-tabs class="job-workspace-tabs" aria-label="${en ? "Saved job sections" : "أقسام الوظيفة المحفوظة"}">${Object.entries(tabs).map(([key, label]) => `<button type="button" data-tab="${key}" aria-pressed="${tab === key}" aria-controls="selected-job-panel">${label}</button>`).join("")}</nav>
    <div class="job-workspace-panel" id="selected-job-panel">${panels[tab] || overview}</div>
    <details class="job-manage"><summary>${en ? "Manage saved job" : "إدارة الوظيفة المحفوظة"}</summary><div class="row">
      <button class="btn outline" data-edit-job="${esc(job.id)}">${en ? "Edit saved details" : "تعديل التفاصيل المحفوظة"}</button>
      <button class="btn ghost" data-delete-job="${esc(job.id)}">${en ? "Remove saved job" : "حذف الوظيفة المحفوظة"}</button></div></details></div>`, { screen: "job-detail" });
}

function buildSkillRows(job) {
  const english = state.locale === "en";
  const labels = english ? { role: "Role", skills: "Skills", location: "Location", seniority: "Seniority", sector: "Sector" }
    : { role: "الدور", skills: "المهارات", location: "الموقع", seniority: "الخبرة", sector: "القطاع" };
  const dimensions = Array.isArray(job.match_breakdown) ? job.match_breakdown : [];
  if (!dimensions.length) return `<p class="muted tiny">${english ? "Evaluate this job to see evidence from your approved CV." : "قيّم الوظيفة لعرض الأدلة من سيرتك المعتمدة."}</p>`;
  const rows = dimensions.filter((dimension) => Object.hasOwn(labels, dimension.key)).map((dimension) => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(dimension.points) / Number(dimension.maximum) * 100) || 0));
      const evidence = Array.isArray(dimension.evidence) ? dimension.evidence.join(", ") : "";
      return `<div class="skill-row">
        <span class="name" title="${esc(evidence)}">${esc(labels[dimension.key])}</span>
        <span class="track"><span class="fill" style="width:${pct}%"></span></span>
        <span class="pct">${esc(dimension.points)}/${esc(dimension.maximum)}</span>
      </div>`;
    }).join("");
  const evidence = Array.isArray(job.match_evidence) ? job.match_evidence.join(", ") : "";
  const gaps = Array.isArray(job.missing_requirements) ? job.missing_requirements.join(", ") : "";
  const toVerify = Array.isArray(job.requirements_to_verify) ? job.requirements_to_verify.join(", ") : "";
  return rows + (evidence ? `<p class="muted tiny">${english ? "Matched evidence" : "الأدلة المطابقة"} · ${esc(evidence)}</p>` : "")
    + (toVerify ? `<p class="muted tiny">${english ? "Confirm from the posting" : "متطلبات للتحقق من الإعلان"} · ${esc(toVerify)}</p>` : "")
    + (gaps ? `<p class="muted tiny">${english ? "Gaps" : "الفجوات"} · ${esc(gaps)}</p>` : "");
}

function renderGhostwriterPanel(job, kit) {
  const en = state.locale === "en";
  const hasKit = Boolean(kit);
  const provider = kit?.writer_label || (kit?.provider === "deepseek" ? "DeepSeek" : kit?.provider === "ai" ? "AI" : kit?.provider === "template" ? "قالب ذكي" : aiWriterLabel());
  const generatedAt = kit?.generated_at ? new Date(kit.generated_at).toLocaleString("ar-SA") : "";
  const resumeReady = originalResumeReady();
  const approved = Boolean(state.approvedKits?.[job.id] && kit?.quality_review?.approved);
  return `<div class="section-block ghostwriter-panel">
    <div class="section-head tight">
      <div>
        <h2>${en ? "Tailor your résumé" : "تخصيص سيرتك"}</h2>
        <p class="muted tiny">${en ? "Prepare a bilingual résumé, cover letter and interview notes for this vacancy." : "أعدّ سيرة وخطاباً وتحضيراً للمقابلة بالعربية والإنجليزية لهذه الوظيفة."}</p>
      </div>
      ${hasKit ? `<span class="badge">${esc(provider)}</span>` : ""}
    </div>
    ${aiActionOptions("writer")}
    <div class="field">
      <label for="job-tailoring-notes">${state.locale === "en" ? "Full job posting or recruiter notes" : "إعلان الوظيفة الكامل أو ملاحظات مسؤول التوظيف"}</label>
      <textarea id="job-tailoring-notes" data-tailoring-brief="${esc(job.id)}" placeholder="${state.locale === "en" ? "Paste the full posting if the imported description is incomplete." : "الصق إعلان الوظيفة كاملاً إذا كان الوصف المستورد مختصراً."}">${esc(state.tailoringBriefs?.[job.id] || "")}</textarea>
    </div>
    ${resumeReady ? "" : `<p class="muted">${en ? "Add your original résumé to prepare a tailored version." : "أضف سيرتك الأصلية لإعداد نسخة مخصّصة."}</p>`}
    <div class="ghostwriter-actions">
      ${resumeReady && state.session?.authenticated ? `<button class="btn primary" data-ghostwriter="${esc(job.id)}" ${aiBlocked() || state.jobWriterPending ? "disabled" : ""}>${iconSpark()} ${hasKit ? (en ? "Regenerate application kit" : "إعادة إعداد حزمة التقديم") : (en ? "Generate application kit" : "إعداد حزمة التقديم")}</button>` : `<button class="btn primary" data-nav="${state.session?.authenticated ? "/account" : "/login"}">${state.session?.authenticated ? (en ? "Add original résumé" : "إضافة السيرة الأصلية") : (en ? "Sign in to tailor" : "تسجيل الدخول للتخصيص")}</button>`}
      ${resumeReady ? `<button class="btn outline" data-nav="/account">${iconUser()} ${en ? "Original résumé" : "السيرة الأصلية"}</button>` : ""}
      ${hasKit ? `<button class="btn outline" data-copy-ghostwriter="${esc(job.id)}">${iconDoc()} ${en ? "Copy kit" : "نسخ الحزمة"}</button>` : ""}
    </div>
    ${kit?.review_error_code && !kit.quality_review?.approved ? `<p class="account-note" role="status" data-ai-review-paused>${accountLabel("تم حفظ المسودة، ولم تكتمل مراجعتها.", "Your draft was saved. Its quality review did not finish.")} ${esc(personalErrorText(kit.review_error_code, state.locale))}</p>` : ""}
    ${generatedAt ? `<p class="muted tiny">آخر توليد: ${esc(generatedAt)}</p>` : ""}
    ${
      hasKit
        ? `<div class="ghostwriter-grid">
          ${ghostDoc("السيرة العربية", kit.ar_resume, "ar_resume", job.id, approved)}
          ${ghostDoc("English resume", kit.en_resume, "en_resume", job.id, approved)}
          ${ghostDoc("خطاب عربي", kit.ar_cover_letter, "ar_cover_letter", job.id)}
          ${ghostDoc("English cover letter", kit.en_cover_letter, "en_cover_letter", job.id)}
          ${ghostList("تحضير المقابلة", kit.ar_interview_prep)}
          ${ghostList("Interview prep", kit.en_interview_prep)}
        </div>
        ${renderRequirementReview(kit.quality_review, job.id)}
        <div class="ghostwriter-next">
          <strong>خطوات سريعة</strong>
          <ul>${(kit.next_actions || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </div>
        <div class="approval-box ${approved ? "approved" : ""}">
          <div>
            <strong>${approved ? "الحزمة معتمدة" : "اعتمد الحزمة قبل التصدير"}</strong>
            <p class="muted tiny">راجع أدلة المطابقة والفجوات قبل الاعتماد. تُراجع التعديلات مجدداً قبل التصدير.</p>
          </div>
          ${!kit.quality_review?.approved ? aiActionOptions("review") : ""}
          <button class="btn ${approved ? "outline" : "primary"}" data-approve-kit="${esc(job.id)}" ${state.action.pending === "kit-review" || (!kit.quality_review?.approved && aiBlocked()) ? "disabled" : ""}>${iconCheck()} ${approved ? "معتمدة" : "مراجعة واعتماد الحزمة"}</button>
        </div>
        ${renderApplicationPackageBlock(job, approved)}
        ${renderInterviewChat(job)}`
        : `<div class="empty compact">اضغط AI كاتب لتجهيز نسخة عربية وإنجليزية مخصصة لهذه الوظيفة، مع أسئلة مقابلة وإجابات تدريبية.</div>`
    }
  </div>`;
}

function renderRequirementReview(review, jobId) {
  if (!review) return "";
  const en = state.locale === "en";
  const status = en ? { exceeds: "Exceeds", meets: "Meets", partial: "Partial evidence", gap: "Gap" }
    : { exceeds: "يتجاوز المتطلب", meets: "يفي بالمتطلب", partial: "دليل جزئي", gap: "فجوة" };
  const rows = Array.isArray(review.requirements) ? review.requirements : [];
  const requiredGap = rows.some((row) => row.priority === "required" && ["gap", "partial"].includes(row.status));
  const notes = [...(Array.isArray(review.factual_risks) ? review.factual_risks : []),
    ...(Array.isArray(review.missing_evidence) ? review.missing_evidence : [])];
  return `<div class="ghostwriter-next" data-requirement-review="${esc(jobId)}">
    <strong>${en ? "Evidence against job requirements" : "الأدلة مقابل متطلبات الوظيفة"}</strong>
    <p class="muted tiny">${esc(review.reviewer_summary || (en ? "Review the evidence before applying." : "راجع الأدلة قبل التقديم."))}</p>
    ${review.approved ? "" : `<p role="status">${en ? "Review required before export." : "المراجعة مطلوبة قبل التصدير."}</p>`}
    ${requiredGap ? `<p role="status">${en ? "One or more required qualifications lack full evidence." : "بعض المؤهلات الإلزامية تحتاج إلى أدلة إضافية."}</p>` : ""}
    ${rows.length ? `<ul>${rows.map((row) => `<li>
      <strong>${esc(row.requirement)}</strong> · ${row.priority === "required" ? (en ? "Required" : "إلزامي") : (en ? "Preferred" : "مفضّل")} · ${esc(status[row.status] || "")}
      ${row.evidence_quote ? `<p class="muted tiny">${esc(row.evidence_quote)}</p>` : ""}
    </li>`).join("")}</ul>` : ""}
    ${notes.length ? `<ul>${notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>` : ""}
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
  const en = state.locale === "en";
  const submitted = ["applied", "in_progress"].includes(job.status);
  const tracking = applicationTracking(job);
  const follow = followUpState(job);
  const jobId = esc(job.id);
  const fields = [
    ["applied_at", "date", en ? "Date applied" : "تاريخ التقديم"],
    ["follow_up_at", "date", en ? "Follow-up date" : "موعد المتابعة"],
    ["channel", "text", en ? "Application channel" : "جهة التقديم"],
    ["recruiter_name", "text", en ? "Recruiter name (optional)" : "اسم مسؤول التوظيف (اختياري)"],
    ["recruiter_contact", "text", en ? "Recruiter contact (optional)" : "وسيلة التواصل (اختياري)"],
  ];
  return `<section class="section-block assisted-apply">
    <div class="section-head tight"><h2>${en ? "Application tracker" : "سجل التقديم"}</h2>
    <span class="badge">${job.status === "in_progress" ? (en ? "Following up" : "قيد المتابعة") : submitted ? (en ? "Applied" : "تم التقديم") : (en ? "Not marked as applied" : "لم يُسجّل التقديم")}</span></div>
    ${!submitted ? `<details class="job-record-confirm"><summary>${en ? "Record a submitted application" : "تسجيل طلب أرسلته بالفعل"}</summary>
      <p>${en ? "Confirm after you have sent your application to the employer." : "أكّد بعد إرسال طلبك إلى جهة العمل."}</p>
      <button class="btn outline" data-submit-action="${jobId}">${iconCheck()} ${en ? "I have submitted my application" : "أؤكد أنني أرسلت طلبي"}</button></details>` : `<button class="btn outline" data-followup-action="${jobId}">${en ? "Mark as following up" : "بدء متابعة الطلب"}</button>`}
    <h3>${en ? "Dates and notes" : "التواريخ والملاحظات"}</h3>
    ${follow === "due" || follow === "upcoming" ? `<p class="muted">${follow === "due" ? (en ? "Follow-up due" : "حان موعد المتابعة") : (en ? "Upcoming follow-up" : "متابعة مجدولة")} · ${esc(tracking.follow_up_at)}</p>` : ""}
    <div class="form profile-form">${fields.map(([key, type, label]) => `<label class="field">${label}<input type="${type}" data-application-field="${key}" data-job-id="${jobId}" value="${esc(tracking[key] || "")}" /></label>`).join("")}
      <label class="field full">${en ? "Notes" : "الملاحظات"}<textarea data-application-field="notes" data-job-id="${jobId}">${esc(tracking.notes || "")}</textarea></label></div>
    <div class="row"><button class="btn primary" data-save-application="${jobId}">${iconCheck()} ${en ? "Save tracking details" : "حفظ سجل التقديم"}</button>
    ${tracking.follow_up_at ? `<button class="btn outline" data-complete-followup="${jobId}">${en ? "Mark follow-up complete" : "تسجيل إتمام المتابعة"}</button><button class="btn outline" data-followup-calendar="${jobId}">${en ? "Add to calendar" : "إضافة للتقويم"}</button>` : ""}</div>
  </section>${renderApplicationDrafts(job)}
  <details class="section-block"><summary>${en ? "Application checklist" : "قائمة التحقق للتقديم"}</summary><div class="checklist" data-application-checklist="${jobId}">${buildChecklist(job, pkg, draft)}</div>
    ${state.approvedKits?.[job.id] && kit?.quality_review?.approved ? `<button class="btn outline" data-export-kit="pdf" data-job-id="${jobId}">${iconDoc()} ${en ? "Download approved PDF" : "تنزيل PDF المعتمد"}</button>` : ""}</details>`;
}

function renderApplicationDrafts(job) {
  const english = state.locale === "en";
  const task = state.applicationDraftTask?.jobId === job.id ? state.applicationDraftTask : null;
  const kind = task?.kind || "application_answer";
  const draft = state.applicationDrafts?.[job.id]?.[kind] || "";
  const options = english ? { application_answer: "Screening question", recruiter_reply: "Recruiter reply", followup_email: "Follow-up email" }
    : { application_answer: "سؤال التقديم", recruiter_reply: "الرد على مسؤول التوظيف", followup_email: "رسالة متابعة" };
  const open = task || document.querySelector("[data-application-draft]")?.closest("details")?.open;
  return `<details class="section-block" ${open ? "open" : ""}>
    <summary>${english ? "Draft application answers and messages" : "مسودات إجابات التقديم والرسائل"}</summary>
    <form class="form profile-form" data-application-draft="${esc(job.id)}">
      <label class="field">${english ? "Draft type" : "نوع المسودة"}<select name="kind">${Object.entries(options).map(([value, label]) => `<option value="${value}" ${value === kind ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="field full">${english ? "Question or message to address" : "السؤال أو الرسالة المطلوب الرد عليها"}<textarea name="context" maxlength="3500">${esc(task?.context || "")}</textarea></label>
      ${aiActionOptions("reply")}
      <button class="btn primary" type="submit" ${masterResumeReady() && state.session?.authenticated && !aiBlocked() ? "" : "disabled"}>${english ? "Draft for review" : "إنشاء مسودة للمراجعة"}</button>
      ${draft ? `<label class="field full">${english ? "Draft to review and edit" : "المسودة للمراجعة والتعديل"}<textarea name="draft" maxlength="12000">${esc(draft)}</textarea></label><button class="btn outline" type="button" data-copy-application-draft>${english ? "Copy draft" : "نسخ المسودة"}</button>` : ""}
    </form>
  </details>`;
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
      ${aiActionOptions("interview")}
      <button class="btn primary" data-ask-interview="${esc(job.id)}" ${aiBlocked() ? "disabled" : ""}>${iconSpark()} اسأل تخصيص سيرتي لهذه الوظيفة</button>
      <button class="btn outline" data-start-mock-interview="${esc(job.id)}">${iconBolt()} Start a mock interview</button>
    </div>
  </div>`;
}

function masterDownloadButton(language, approved) {
  const ready = approved && Boolean(state.masterResume?.[language]?.trim());
  return `<button class="btn outline sm" data-export-master="${language}" ${ready ? "" : "disabled"}>${iconDoc()} ${state.locale === "en" ? "Download résumé" : "تنزيل السيرة"} (DOCX)</button>`;
}

function ghostDoc(title, body, field = "", jobId = "", approved = false) {
  const resume = field === "ar_resume" || field === "en_resume";
  return `<article class="ghost-doc">
    <h4>${esc(title)}</h4>
    ${field ? `<textarea class="document-editor" data-kit-document="${esc(field)}" data-job-id="${esc(jobId)}" dir="${field.startsWith("ar_") ? "rtl" : "ltr"}" aria-label="${esc(title)}">${esc(body || "")}</textarea><small class="muted tiny">Edit this job-specific draft before approval. Changes are saved to this application only.</small>` : `<pre>${esc(body || "لم يتم التوليد بعد.")}</pre>`}
    ${resume ? `<button class="btn outline sm" data-export-kit="docx" data-export-document="${field}" data-job-id="${esc(jobId)}" ${approved ? "" : "disabled"}>${iconDoc()} ${state.locale === "en" ? "Download résumé" : "تنزيل السيرة"} (DOCX)</button>` : ""}
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
  const en = state.locale === "en";
  const sources = state.sources;
  const customSources = sources.filter((s) => s.custom);
  const knownSources = sources.filter((s) => !s.custom);
  const f = state.sourceForm;
  const scan = state.scanResult;
  const sourceWorkflow = `<details class="section source-help"><summary>${en ? "How sources are checked" : "كيف يتم فحص المصادر؟"}</summary>
    <div class="source-workflow">
      <div><strong>${esc(tr("sourceApproved"))}</strong><small>${esc(tr("sourceApprovedText"))}</small></div>
      <div><strong>${esc(tr("sourcePublic"))}</strong><small>${esc(tr("sourcePublicText"))}</small></div>
      <div><strong>${esc(tr("sourceManual"))}</strong><small>${esc(tr("sourceManualText"))}</small></div>
      <div><strong>${esc(tr("sourceStatus"))}</strong><small>${esc(tr("sourceStatusText"))}</small></div>
    </div>
  </details>`;
  shell(
    `${banner()}
    <header class="section" style="padding-top:14px">
      <h1 style="font-size:20px;font-weight:800;color:var(--ink)">${en ? "Job sources" : "مصادر الوظائف"}</h1>
      <p class="muted tiny" style="margin-top:2px">${en ? "Manage job boards and their scan schedules." : "أضف مواقع الوظائف وحدد وتيرة الفحص التلقائي."}</p>
    </header>
    ${sourceWorkflow}
    <section class="section">
      <div class="section-block">
        <h3>${en ? "Add a job board" : "أضف موقع وظائف جديد"}</h3>
        <p class="lede">${en ? "Save the board name and its search page to check it on demand." : "أدخل اسم الموقع ورابط صفحة البحث ليتم حفظه كمصدر مستقل وفحصه عند الطلب."}</p>
        <div class="form">
          <div class="field"><label for="source-label">${en ? "Board name" : "اسم الموقع"}</label><input id="source-label" data-source-form-field="label" value="${esc(f.label)}" placeholder="مثال: Remote OK أو لوحة وظائف محلية" /></div>
          <div class="field"><label for="source-url">${en ? "Website or search page URL" : "رابط الموقع أو صفحة البحث"}</label><input id="source-url" data-source-form-field="url" value="${esc(f.url)}" placeholder="https://example.com/jobs" inputmode="url" /></div>
          <div class="field"><label for="source-region">${en ? "Region" : "المنطقة"}</label>
            <select id="source-region" data-source-form-field="region">
              ${REGIONS.filter((r) => r.id).map((r) => `<option value="${r.id}" ${f.region === r.id ? "selected" : ""}>${r.label}</option>`).join("")}
            </select>
          </div>
          <button class="btn primary" data-add-source>${iconPlus()} ${en ? "Add source" : "إضافة المصدر"}</button>
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
  const canScan = s.custom && ["public_html", "public_json", "greenhouse", "lever", "ashby", "workable"].includes(s.connector_mode);
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
      <h4 style="font-size:12.5px">${s.connector_mode === "portal_only" ? "البوابة الرسمية" : "فحص تلقائي"}</h4>
      <p>${s.last_error ? esc(s.last_error) : s.connector_note ? esc(s.connector_note) : (s.last_scanned_at ? `آخر فحص: ${esc(s.last_scanned_at)}` : "لم يتم الفحص بعد")}</p>
    </div>
    <div class="right">
      ${canScan
        ? `<button class="btn primary sm" data-scan-source="${esc(s.id)}">${iconBolt()} فحص</button>`
        : s.url && (s.central || s.connector_mode === "portal_only")
          ? `<a class="btn primary sm" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${iconArrowUpRight()} فتح البوابة</a>`
        : `<button class="btn outline sm" disabled>يحتاج API</button>`}
      ${canScan ? `<label class="toggle"><input type="checkbox" data-source-schedule="${esc(s.id)}" ${s.scheduled ? "checked" : ""}/><span class="slider"></span></label>
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
  if (state.session?.authenticated) {
    const next = safeReturnPath(new URLSearchParams(location.search).get("next"));
    if (next && !/^\/(?:api|login)(?:[/?#]|$)/i.test(new URL(next, location.origin).pathname)) {
      return location.replace(next);
    }
    return navigate("/account");
  }
  const en = state.locale === "en";
  const retry = new URLSearchParams(location.search).get("oauth_retry") === "1";
  shell(
    `<div class="auth-page">
      <section class="login-card">
        <h1>${en ? "Sign in to Jobs" : "تسجيل الدخول إلى وظائف"}</h1>
        <p>${en ? "Use your Google account to save vacancies, improve your résumé and track applications." : "استخدم حساب Google لحفظ الشواغر وتحسين سيرتك ومتابعة طلباتك."}</p>
        ${retry ? `<p role="alert">${en ? "Google sign-in couldn’t finish. Please try again." : "تعذّر إكمال تسجيل الدخول بحساب Google. حاول مرة أخرى."}</p>` : ""}
        <label class="terms-consent"><input type="checkbox" data-terms-consent />
          <span>${en ? "I accept the" : "أوافق على"} <a href="/terms" target="_blank" rel="noopener">${en ? "terms" : "الشروط"}</a> ${en ? "and" : "و"} <a href="/privacy" target="_blank" rel="noopener">${en ? "privacy policy" : "سياسة الخصوصية"}</a>.</span>
        </label>
        <a class="btn primary google-login disabled" data-google-login aria-disabled="true">${iconUser()} ${en ? "Continue with Google" : "المتابعة بحساب Google"}</a>
        <a class="btn ghost" href="/jobs?view=browse" data-nav="/jobs?view=browse">${en ? "Browse vacancies as a guest" : "تصفح الشواغر كضيف"}</a>
      </section>
    </div>`,
    { showNav: false, screen: "login" },
  );
}

function renderOnboarding() {
  if (!state.session?.authenticated) return navigate("/login");
  const en = state.locale === "en";
  shell(
    `<div class="auth-page"><section class="login-card onboarding-card">
      <h1>${en ? "Your account is ready" : "حسابك جاهز"}</h1>
      <p>${en ? "Add a PDF, Word file or résumé text to find vacancies that fit your experience." : "أضف سيرتك بصيغة PDF أو Word أو الصق نصها للبحث عن وظائف تناسب خبرتك."}</p>
      <button class="btn primary full" data-complete-onboarding>${en ? "Add my résumé" : "إضافة سيرتي"}</button>
      <a class="btn ghost" href="/jobs?view=browse" data-nav="/jobs?view=browse">${en ? "Browse vacancies" : "تصفح الشواغر"}</a>
      <p role="alert" data-onboarding-error hidden></p>
    </section></div>`, { showNav: false, screen: "onboarding" });
}

const RESUME_DERIVED_FIELDS = ["display_name", "target_roles", "resume_languages", "resume_skills", "resume_seniority", "resume_work_examples"];

function accountLabel(arabic, english) {
  return state.locale === "en" ? english : arabic;
}

let aiAccount = { owner: "", connected: null, loading: false, checked: false, notice: "", pause: "", confirming: false, busy: false };
function aiConnection() {
  const owner = accountId();
  if (aiAccount.owner !== owner) aiAccount = { owner, connected: null, loading: false, checked: false, notice: "", pause: "", confirming: false, busy: false };
  return aiAccount;
}

function billingSelection(jobsModel = state.aiWriterModel) {
  const billing_source = state.aiBillingSource === PERSONAL_SOURCE ? PERSONAL_SOURCE : "jobs";
  const chosen = PERSONAL_AI_MODELS.find(item => item.id === state.aiPersonalModel) || PERSONAL_AI_MODELS[0];
  const ai_model = billing_source === PERSONAL_SOURCE ? chosen.id : AI_WRITER_MODELS.some(item => item.id === jobsModel) ? jobsModel : "deepseek";
  return { billing_source, ai_model };
}

function aiBlocked() {
  const connection = aiConnection();
  return !connection.owner || connection.owner !== workspaceOwner || connection.savingChoice || connection.choiceError || connection.stalePreference || connection.refreshingPrefs || (state.aiBillingSource === PERSONAL_SOURCE && (connection.busy || connection.connected !== true || Boolean(connection.pause)));
}

function aiPreferenceFeedback(connection) {
  const t = accountLabel;
  if (connection.stalePreference) return t("تغيّرت إعدادات الذكاء الاصطناعي في حسابك. حدّثها من الملف الشخصي قبل إرسال طلب آخر.", "Your saved AI settings changed. Refresh them in User Profile before sending another request.");
  if (connection.choiceError) return t("تعذّر حفظ اختيارك. راجع إعدادات الذكاء الاصطناعي في الملف الشخصي.", "Your billing choice could not be saved. Review your AI settings in User Profile.");
  if (connection.owner !== workspaceOwner) return t("تعذّر تحميل تفضيلات حسابك. أعد المحاولة من الملف الشخصي.", "Your account settings could not be loaded. Try again from User Profile.");
  if (connection.savingChoice) return t("جارٍ حفظ اختيارك…", "Saving your billing preference…");
  return "";
}

function aiActionOptions(task, jobsModel = state.aiWriterModel) {
  if (!accountId()) return "";
  const t = accountLabel;
  const connection = aiConnection();
  const { billing_source, ai_model } = billingSelection(jobsModel);
  const personal = billing_source === PERSONAL_SOURCE;
  const paused = personal && (connection.pause || connection.connected !== true);
  const feedback = aiPreferenceFeedback(connection) || (paused ? (connection.pause ? personalErrorText(connection.pause, state.locale)
    : connection.loading ? t("جارٍ التحقق من الاتصال…", "Checking your connection…") : t("الطلب متوقف إلى أن يتم التحقق من اتصال OpenRouter.", "This request is paused until your OpenRouter connection is verified.")) : "");
  return `<div class="ai-funding" data-ai-funding="${task}">
    <p data-ai-disclosure>${esc(aiDisclosure(state.locale, billing_source, ai_model, jobsModel, task))}</p>
    ${feedback ? `<p role="status">${esc(feedback)}</p>` : ""}
    <a href="/profile" data-nav="/profile" data-open-ai-connections>${t("إدارة إعدادات الذكاء الاصطناعي في الملف الشخصي", "Manage AI settings in User Profile")}</a>
  </div>`;
}

function renderProfileSettings(connection) {
  const t = accountLabel;
  const { billing_source, ai_model } = billingSelection();
  const personal = billing_source === PERSONAL_SOURCE;
  const unavailable = connection.owner !== workspaceOwner || connection.stalePreference || connection.choiceError;
  const models = personal ? PERSONAL_AI_MODELS : AI_WRITER_MODELS;
  const opts = models.map(item => `<option value="${esc(item.id)}" ${item.id === ai_model ? "selected" : ""}>${esc(item.label)}${item.host ? " · " + esc(item.host) : ""}</option>`).join("");
  const feedback = aiPreferenceFeedback(connection);
  return `<section class="section-block account-block" data-profile-ai aria-labelledby="ai-settings-title">
    <h2 id="ai-settings-title">${t("إعدادات الذكاء الاصطناعي", "AI settings")}</h2>
    ${renderAiConnections()}
    <div class="ai-funding-options">
      <label>${t("من يتحمّل تكلفة طلبات الذكاء الاصطناعي؟", "Who pays for AI requests?")}
        <select data-ai-payer ${unavailable ? "disabled" : ""}>
          <option value="jobs" ${personal ? "" : "selected"}>${t("رصيد Jobs ضمن باقتي", "Jobs plan credits")}</option>
          <option value="openrouter_personal" ${personal ? "selected" : ""} ${connection.connected !== true && !personal ? "disabled" : ""}>${t("حسابي الشخصي في OpenRouter", "My personal OpenRouter account")}</option>
        </select></label>
      <label>${personal ? t("النموذج ومزوّد الخدمة", "Model and provider") : t("نموذج Jobs لحزم التقديم والمحادثات", "Jobs model for application kits and chat")}
        <select ${personal ? "data-personal-model" : "data-ai-writer-model"} ${unavailable ? "disabled" : ""}>${opts}</select></label></div>
    <p class="account-note">${personal ? t("يتحمّل حسابك الشخصي تكلفة الطلب عند الضغط على زر الإنشاء، وفق إعدادات الفوترة لديك في OpenRouter.", "Your personal account pays when you choose Generate, according to your billing settings in OpenRouter.")
      : t("تُحتسب الطلبات ضمن باقة Jobs. يستخدم مدرب السيرة وتخصيص الوظيفة من صفحة سيرتي نموذج DeepSeek.", "Writing requests use your Jobs plan. The résumé coach and the job selected on My résumé use DeepSeek.")}</p>
    ${feedback ? `<p class="account-note" role="status">${esc(feedback)}</p>` : ""}
    ${unavailable ? `<button class="btn outline" data-reload-ai-settings ${connection.refreshingPrefs ? "disabled" : ""}>${t("تحديث إعدادات الذكاء الاصطناعي", "Refresh AI settings")}</button>` : ""}
    ${personal && connection.pause ? `<p class="account-note" role="status">${esc(personalErrorText(connection.pause, state.locale))}</p>
      ${connection.connected === true && !unavailable ? `<button class="btn outline" data-retry-personal>${t("استئناف استخدام حسابي الشخصي", "Resume using my personal account")}</button>` : ""}` : ""}
  </section>`;
}

function renderAiConnections() {
  const t = accountLabel;
  const connection = aiConnection();
  const messages = {
    connected: t("تم ربط حسابك في OpenRouter.", "Your OpenRouter account is connected."),
    disconnected: t("تم فصل حساب OpenRouter.", "Your OpenRouter account was disconnected."),
    cancelled: t("لم يكتمل الربط. يمكنك بدء الربط مجدداً.", "Connection was cancelled. You can start it again."),
    expired: t("انتهت مهلة الربط. ابدأ الربط مجدداً.", "The connection request expired. Start again."),
    error: t("تعذّر إكمال التغيير. يمكنك المحاولة مجدداً.", "The connection change could not be completed. You can try again."),
    unavailable: t("تعذّر التحقق من الاتصال. أعد المحاولة.", "Could not check the connection. Try again."),
    auth: t("انتهت جلسة الدخول. سجّل الدخول مجدداً.", "Your session ended. Sign in again."),
  };
  const status = connection.loading ? t("جارٍ التحقق…", "Checking…") : connection.connected === true ? t("متصل", "Connected")
    : connection.connected === false ? t("غير متصل", "Not connected") : t("الحالة غير متوفرة", "Status unavailable");
  return `<section class="profile-connection" aria-labelledby="personal-provider-title" data-ai-connections>
    <div><h3 tabindex="-1" id="personal-provider-title">${t("حساب OpenRouter الشخصي", "Personal OpenRouter connection")}</h3>
    <span role="status" data-ai-connection-status>${status}</span></div>
    ${connection.notice && messages[connection.notice] ? `<p class="account-note" role="status">${messages[connection.notice]}</p>` : ""}
    ${connection.connected === true && state.aiBillingSource === PERSONAL_SOURCE ? "" : `<p class="account-note">${connection.connected === true
      ? t("اختر حساب OpenRouter أدناه إن أردت استخدامه لطلبات الكتابة.", "Choose your OpenRouter account below to use it for writing requests.")
      : t("اربط حسابك لدى OpenRouter ثم اختره إذا أردت أن يتحمّل تكلفة طلباتك. هذا الخيار متاح في الباقتين المجانية والذهبية.", "Connect your OpenRouter account, then choose it below if you want it to pay for writing requests. This option is available on Free and Gold.")}</p>`}
    <a class="profile-provider-link" href="https://openrouter.ai/integrations" target="_blank" rel="noopener noreferrer">${t("لديك مفتاح API من OpenAI أو مزوّد آخر؟ أدِر مفاتيح المزوّدين في OpenRouter.", "Already have an OpenAI or other provider API key? Manage provider keys in OpenRouter.")}</a>
    <div class="ai-funding-actions">
      ${connection.connected === false || connection.pause === "OPENROUTER_RECONNECT_REQUIRED" ? `<button class="btn outline" type="button" data-connect-ai ${connection.busy ? "disabled" : ""}>${t("ربط حساب OpenRouter", "Connect OpenRouter")}</button>` : ""}
      ${connection.connected === true && !connection.confirming ? `<button class="btn outline" type="button" data-disconnect-ai ${connection.busy ? "disabled" : ""}>${t("فصل حساب OpenRouter", "Disconnect OpenRouter")}</button>` : ""}
      ${!connection.loading && (connection.connected === null || ["unavailable","error"].includes(connection.notice)) ? `<button class="btn outline" type="button" data-refresh-ai-status>${t("التحقق من الاتصال", "Check connection")}</button>` : ""}
      ${connection.notice === "auth" ? `<a class="btn outline" href="/login?next=%2Fprofile">${t("تسجيل الدخول", "Sign in")}</a>` : ""}
    </div>
    ${connection.confirming ? `<p>${t("هل تريد فصل OpenRouter عن Jobs؟ ستحتاج إلى ربط حسابك مجدداً لاستخدام رصيدك الشخصي.", "Disconnect OpenRouter from Jobs? Using your personal credits again will require reconnecting.")}</p>
      <div class="ai-funding-actions"><button class="btn outline" type="button" data-confirm-disconnect-ai ${connection.busy ? "disabled" : ""}>${t("تأكيد الفصل", "Confirm disconnect")}</button>
      <button class="btn outline" type="button" data-keep-ai ${connection.busy ? "disabled" : ""}>${t("الإبقاء على الاتصال", "Keep connected")}</button></div>` : ""}
  </section>`;
}

async function loadProfilePlan(connection) {
  connection.planStatus = "loading";
  try {
    const data = await apiJson("/api/subscriptions", { cache: "no-store" });
    const plan = data.current?.effective_plan;
    if (data.authenticated !== true || !["free","gold_monthly","gold_annual"].includes(plan)) throw Error();
    connection.plan = plan;
    connection.planStatus = "ready";
  } catch {
    connection.planStatus = "unavailable";
  }
  if (connection === aiConnection() && routeOf().name === "profile") render();
}

function renderProfile() {
  const t = accountLabel;
  const user = state.session?.user || {};
  const connection = aiConnection();
  const signedIn = Boolean(connection.owner);
  if (signedIn && !connection.planStatus) void loadProfilePlan(connection);
  if (signedIn && !connection.checked && !connection.loading) void checkAiConnection();
  const plans = { free: t("المجانية", "Free"), gold_monthly: t("الذهبية الشهرية", "Monthly Gold"), gold_annual: t("الذهبية السنوية", "Annual Gold") };
  shell(`${banner()}<div class="account-flow user-profile section" data-user-profile>
    <header class="account-flow-heading"><h1>${t("الملف الشخصي", "User Profile")}</h1></header>
    <section class="section-block account-block" data-profile-account><h2>${t("حسابي", "My account")}</h2>
      ${signedIn ? `<dl class="profile-identity">
        ${user.name ? `<div><dt>${t("الاسم", "Name")}</dt><dd dir="auto">${esc(user.name)}</dd></div>` : ""}
        ${user.email ? `<div><dt>${t("البريد الإلكتروني", "Email")}</dt><dd><bdi>${esc(user.email)}</bdi></dd></div>` : ""}
        </dl>` : `<p class="account-note">${t("سجّل الدخول لإدارة اشتراكك واتصالك الشخصي بالذكاء الاصطناعي.", "Sign in to manage your subscription and personal AI connection.")}</p>
        <a class="btn primary" data-profile-signin href="/login?next=%2Fprofile">${t("تسجيل الدخول", "Sign in")}</a>`}
    </section>
    ${signedIn ? `${renderProfileSettings(connection)}
      <section class="section-block account-block" data-profile-plan><h2>${t("اشتراكي", "My subscription")}</h2>
      <p data-profile-plan-status role="status">${plans[connection.plan] || (connection.planStatus === "unavailable" ? t("تعذّر التحقق من الباقة الحالية.", "Current plan unavailable.") : t("جارٍ تحميل الباقة…", "Loading your plan…"))}</p>
      <a class="btn outline" href="/pricing/">${t("إدارة الاشتراك والمدفوعات", "Manage subscription and payments")}</a></section>` : ""}
    <section class="section-block account-block"><h2>${t("روابط الحساب", "Account links")}</h2>
      <div class="account-links"><a data-profile-resume href="/account" data-nav="/account">${t("سيرتي الذاتية", "My résumé")}</a>
      ${signedIn ? "" : `<a href="/pricing/">${t("باقات الاشتراك", "Subscription plans")}</a>`}
      <a href="/terms" data-nav="/terms">${t("الشروط", "Terms")}</a><a href="/privacy" data-nav="/privacy">${t("الخصوصية", "Privacy")}</a></div>
      ${signedIn ? `<button class="btn outline" data-auth-logout>${t("تسجيل الخروج", "Sign out")}</button>` : ""}
    </section></div>`, { screen: "profile" });
}

async function refreshAiPreferences() {
  const connection = aiConnection();
  if (!connection.owner || connection.refreshingPrefs) return;
  connection.refreshingPrefs = true;
  render();
  try {
    if (!workspaceOwner) {
      const drafts = state.profile || {};
      const edits = new Set(drafts.resume_edited_fields || []);
      if (drafts.resume_text?.trim()) { edits.add("resume_text"); edits.add("resume_filename"); }
      await loadWorkspaceState();
      if (workspaceOwner !== connection.owner) throw Error();
      for (const key of edits) {
        if (drafts[key] !== undefined) state.profile[key] = drafts[key];
      }
      if (edits.size) state.profile.resume_edited_fields = [...new Set([...(state.profile.resume_edited_fields || []), ...(drafts.resume_edited_fields || [])])];
    } else {
      const data = await apiJson("/api/me/state", { cache: "no-store" });
      if (connection !== aiConnection() || !data.authenticated || !data.state || data.user?.sub && data.user.sub !== connection.owner) throw Error();
      // Refresh only billing settings and their revisions. Keep any unsaved résumé and application edits intact.
      state.aiBillingSource = data.state.aiBillingSource === PERSONAL_SOURCE ? PERSONAL_SOURCE : "jobs";
      state.aiPersonalModel = PERSONAL_AI_MODELS.some(item => item.id === data.state.aiPersonalModel) ? data.state.aiPersonalModel : PERSONAL_AI_MODELS[0].id;
      state.aiWriterModel = AI_WRITER_MODELS.some(item => item.id === data.state.aiWriterModel) ? data.state.aiWriterModel : "deepseek";
      const revisions = { ...(state.__revisions || {}) };
      for (const key of ["aiBillingSource", "aiPersonalModel", "aiWriterModel"]) revisions[key] = data.state.__revisions?.[key] || 0;
      state.__revisions = revisions;
    }
    connection.choiceError = false;
    connection.stalePreference = false;
    if (state.aiBillingSource === PERSONAL_SOURCE) await checkAiConnection();
  } catch {
    connection.choiceError = true;
  } finally {
    connection.refreshingPrefs = false;
    if (connection === aiConnection()) render();
  }
}

async function checkAiConnection() {
  const connection = aiConnection();
  if (!connection.owner || connection.loading || connection.busy) return;
  connection.loading = true;
  try {
    const status = await apiJson("/api/openrouter/status", { cache: "no-store" });
    if (typeof status.connected !== "boolean") throw Error();
    connection.connected = status.connected;
    if (connection.notice === "unavailable" || connection.notice === "connected" && !status.connected) connection.notice = "";
  } catch (error) {
    connection.connected = null;
    connection.notice = error.code === "AUTH_REQUIRED" ? "auth" : "unavailable";
  } finally {
    connection.loading = false;
    connection.checked = true;
    if (aiConnection() === connection) {
      render();
      if (connection.focusManager) {
        connection.focusManager = false;
        document.querySelector("#personal-provider-title")?.focus();
      }
    }
  }
}

async function setAiConnection(method) {
  const connection = aiConnection();
  if (!connection.owner || connection.busy || method === "disconnect" && !connection.confirming) return;
  connection.busy = true;
  render();
  try {
    if (method === "connect") {
      // Commit the chosen payer before redirecting away from this document.
      clearTimeout(saveWorkspaceTimer);
      if (state.persistence.pending || workspaceSaving || connection.savingChoice) await flushWorkspaceState();
    }
    const response = await apiJson("/api/openrouter/" + method, { method: "POST", body: "{}" });
    if (aiConnection() !== connection) return;
    if (method === "connect") {
      const url = new URL(response.authorization_url);
      if (url.origin !== "https://openrouter.ai" || url.pathname !== "/auth" || url.username || url.password) throw Error();
      location.assign(url.href);
      return;
    }
    if (response.connected !== false) throw Error();
    connection.connected = false;
    connection.confirming = false;
    connection.notice = "disconnected";
    if (state.aiBillingSource === PERSONAL_SOURCE) connection.pause = "OPENROUTER_NOT_CONNECTED";
  } catch (error) {
    connection.notice = error.code === "AUTH_REQUIRED" ? "auth" : "error";
  } finally {
    connection.busy = false;
    if (aiConnection() === connection) render();
  }
}

async function saveAiChoice() {
  const connection = aiConnection();
  const version = (connection.choiceVersion || 0) + 1;
  connection.choiceVersion = version;
  connection.savingChoice = true;
  connection.choiceError = false;
  clearTimeout(saveWorkspaceTimer);
  await flushWorkspaceState();
  if (connection.choiceVersion === version && connection === aiConnection()) {
    connection.savingChoice = false;
    connection.choiceError = ["load-failed","conflict","save-failed"].includes(state.persistence.storage);
    render();
  }
}

function bindAiFunding() {
  const connection = aiConnection();
  document.querySelector("[data-reload-ai-settings]")?.addEventListener("click", refreshAiPreferences);
  document.querySelector("[data-refresh-ai-status]")?.addEventListener("click", () => { connection.notice = ""; void checkAiConnection(); });
  document.querySelector("[data-connect-ai]")?.addEventListener("click", () => setAiConnection("connect"));
  document.querySelector("[data-disconnect-ai]")?.addEventListener("click", () => { connection.confirming = true; render(); document.querySelector("[data-keep-ai]")?.focus(); });
  document.querySelector("[data-keep-ai]")?.addEventListener("click", () => { connection.confirming = false; render(); document.querySelector("[data-disconnect-ai]")?.focus(); });
  document.querySelector("[data-confirm-disconnect-ai]")?.addEventListener("click", () => setAiConnection("disconnect"));
  const update = source => {
    if (!connection.owner || connection.owner !== workspaceOwner || !["jobs", PERSONAL_SOURCE].includes(source)
        || source === PERSONAL_SOURCE && connection.connected !== true || connection.stalePreference || connection.choiceError) return;
    state.aiBillingSource = source;
    void saveAiChoice();
    render();
    document.querySelector("[data-ai-payer]")?.focus({ preventScroll: true });
    if (source === PERSONAL_SOURCE) void checkAiConnection();
  };
  document.querySelector("[data-ai-payer]")?.addEventListener("change", e => update(e.target.value));
  document.querySelector("[data-retry-personal]")?.addEventListener("click", () => {
    connection.pause = ""; connection.notice = ""; render(); void checkAiConnection();
  });
  document.querySelector("[data-personal-model]")?.addEventListener("change", e => {
    if (!PERSONAL_AI_MODELS.some(item => item.id === e.target.value) || connection.owner !== workspaceOwner) return;
    state.aiPersonalModel = e.target.value; void saveAiChoice(); render(); document.querySelector("[data-personal-model]")?.focus({ preventScroll: true });
  });
}

async function candidateAiRequest(path, body, selection) {
  if (aiBlocked() || selection.billing_source !== billingSelection().billing_source) throw Object.assign(Error(), { code: "AI_SELECTION_PAUSED" });
  const connection = aiConnection();
  let result;
  try {
    result = await apiJson(path, { method: "POST", body: JSON.stringify({ ...body, ...selection }) });
  } catch (error) {
    if (["AI_PREFERENCE_CHANGED", "AI_PREFERENCE_UNAVAILABLE"].includes(error.code)) {
      connection.stalePreference = true;
      throw error;
    }
    const localValidation = ["RESUME_REQUIRED", "RESUME_UNREADABLE", "SOURCE_EVIDENCE_REQUIRED", "JOB_DETAILS_REQUIRED", "KIT_INCOMPLETE", "AUTH_REQUIRED"];
    if (selection.billing_source === PERSONAL_SOURCE && !localValidation.includes(error.code)) {
      connection.pause = error.code || "AI_UNAVAILABLE";
      if (["OPENROUTER_RECONNECT_REQUIRED","OPENROUTER_NOT_CONNECTED"].includes(connection.pause)) connection.connected = false;
      throw Object.assign(Error(), { code: "PERSONAL_REQUEST_PAUSED" });
    }
    throw error;
  }
  if (aiConnection() !== connection) throw Object.assign(Error(), { code: "RESUME_CHANGED" });
  if (selection.billing_source === PERSONAL_SOURCE && result.review_error_code) connection.pause = result.review_error_code;
  return result;
}

function sourceStatusLabel(ready, damaged) {
  if (ready) return accountLabel("نص السيرة جاهز", "Original text ready");
  if (damaged) return accountLabel("النص يحتاج إلى إعادة استخراج", "Original text needs recovery");
  return accountLabel("لم تُضف سيرة بعد", "No résumé added yet");
}

function renderAccount() {
  if (deferredResumeOwner && deferredResumeOwner === accountId()) {
    deferredResumeOwner = "";
    void loadResumeFile().then(() => { if (routeOf().name === "account") render(); });
  }
  void restoreRecentMatches();
  const p = { ...(state.profile || {}) };
  const ready = originalResumeReady(p);
  const damaged = Boolean(p.resume_text?.trim()) && !ready;
  if (damaged) {
    for (const key of RESUME_DERIVED_FIELDS) {
      if (!p.resume_edited_fields?.includes(key)) p[key] = "";
    }
  }
  const t = accountLabel;
  const saved = state.resumeFile;
  const disabled = state.resumeImportPending ? "disabled" : "";
  const matchApproved = masterResumeReady();
  const preferencesOpen = document.querySelector("[data-search-preferences]")?.open;
  const originalOpen = document.querySelector("[data-review-original]")?.open;
  const fields = [
    ["target_roles", t("المسميات الوظيفية المستهدفة", "Target job titles")],
    ["target_locations", t("المدن أو الدول المستهدفة", "Target cities or countries")],
    ["resume_skills", t("المهارات الأساسية", "Skills")],
    ["resume_seniority", t("مستوى الخبرة", "Experience level")],
    ["resume_regions", t("الأسواق والمناطق", "Markets and regions")],
    ["resume_work_examples", t("أمثلة على إنجازاتك", "Career achievements")],
    ["resume_languages", t("اللغات", "Languages")],
    ["display_name", t("الاسم", "Name")],
  ];
  shell(`${state.action.context === "resume-coach" || state.action.pending === "resume-coach" ? "" : banner()}
    <div class="account-flow section">
      <header class="account-flow-heading"><h1>${t("سيرتي الذاتية", "My résumé")}</h1></header>
      <section class="section-block account-block" aria-labelledby="original-heading">
        <div class="account-section-head">
          <h2 id="original-heading">${t("السيرة الأصلية", "Original résumé")}</h2>
          <span class="badge ${ready ? "" : "muted"}" data-source-status>${sourceStatusLabel(ready, damaged)}</span>
        </div>
        <p class="account-note">${t("ارفع ملفك أو الصق نص سيرتك بالكامل لاستخراج خبراتك ومؤهلاتك.", "Upload your file or paste your full résumé to extract your experience and qualifications.")}</p>
        <div class="account-actions">
          <label class="btn ${ready ? "outline" : "primary"} account-file">${iconDoc()} ${t("رفع PDF أو Word", "Upload PDF or Word")}
            <input type="file" data-resume-file data-resume-kind="pdf" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" ${disabled} />
          </label>
          <label class="btn outline account-file">${t("رفع ملف نصي", "Upload TXT or MD")}
            <input type="file" data-resume-file data-resume-kind="text" accept=".txt,.md,.text,text/plain,text/markdown" ${disabled} />
          </label>
        </div>
        <p class="account-notice" data-source-recovery ${damaged ? "" : "hidden"}>${resumeRecoveryMessage()}</p>
        ${saved ? `<div class="account-saved-file" data-secure-resume-file>
          <span>${t("الملف المحفوظ", "Saved file")} <bdi>${esc(saved.name)}</bdi></span>
          <button class="btn outline" data-reextract-resume ${disabled}>${t("إعادة استخراج النص", "Extract text again")}</button>
        </div>` : ""}
        <details class="account-disclosure" data-review-original ${originalOpen ? "open" : ""}>
          <summary data-focus-resume>${t("لصق النص الأصلي أو مراجعته", "Paste or review the original text")}</summary>
          <div class="form account-disclosure-body">
            <div class="field">
              <label for="original-resume">${t("نص السيرة كاملاً", "Full résumé text")}</label>
              <textarea id="original-resume" class="resume-editor" dir="auto" data-profile-field="resume_text" data-original-resume ${damaged ? "data-damaged-source" : ""} placeholder="${t("الصق خبراتك وإنجازاتك وتعليمك ومهاراتك هنا.", "Paste your experience, achievements, education and skills here.")}">${esc(p.resume_text || "")}</textarea>
            </div>
            <div class="field">
              <label for="resume-filename">${t("اسم ملف السيرة", "Résumé filename")}</label>
              <input id="resume-filename" dir="auto" data-profile-field="resume_filename" value="${esc(p.resume_filename || "")}" />
            </div>
            ${saved ? `<div class="account-actions">
              <a class="btn outline" href="${esc(saved.download_url)}">${t("تنزيل الملف الأصلي", "Download original file")}</a>
              <button class="btn outline" data-delete-resume-file="${esc(saved.id)}">${t("حذف الملف الأصلي", "Delete original file")}</button>
            </div>` : ""}
          </div>
        </details>
      </section>

      ${renderResumeCoach()}

      <section class="section-block account-block" aria-labelledby="resume-matches-heading">
        <h2 id="resume-matches-heading">${t("وظائف تناسب سيرتي", "Jobs matching my résumé")}</h2>
        <button class="btn primary" data-approve-uploaded-resume ${ready && !disabled ? "" : "disabled"} ${matchApproved ? "hidden" : ""}>${iconSearch()} ${t("اعتماد السيرة الأصلية وعرض الوظائف", "Use my original résumé and find matches")}</button>
        <button class="btn primary" data-search-approved-jobs ${matchApproved ? "" : "hidden"}>${iconSearch()} ${t("عرض الوظائف المطابقة", "View matching jobs")}</button>
      </section>

      <details class="section-block account-panel" data-search-preferences data-profile-summary ${preferencesOpen ? "open" : ""}>
        <summary>${t("تفضيلات البحث وبياناتي المهنية", "Search preferences and profile")}</summary>
        <div class="account-disclosure-body">
          <button class="btn outline" data-profile-autofill ${ready && !disabled ? "" : "disabled"}>${iconSpark()} ${t("استخراج بيانات السيرة", "Extract profile details")}</button>
          <div class="form account-fields">${fields.map(([key, label]) => `<div class="field">
            <label for="profile-${key}">${label}</label>
            ${["resume_skills", "resume_work_examples"].includes(key)
              ? `<textarea id="profile-${key}" data-profile-field="${key}" dir="auto">${esc(p[key] || "")}</textarea>`
              : `<input id="profile-${key}" data-profile-field="${key}" dir="auto" value="${esc(p[key] || "")}" />`}
          </div>`).join("")}</div>
          <button class="btn primary" data-save-profile>${iconCheck()} ${t("حفظ البيانات", "Save profile")}</button>
        </div>
      </details>
    </div>`, { screen: "account" });
}

function resumeRecoveryMessage() {
  return state.resumeFile
    ? accountLabel("تعذرت قراءة النص. أعد استخراجه من الملف المحفوظ، أو الصق نص السيرة الواضح.", "We could not read this text. Extract it again from your saved file or paste a readable copy.")
    : accountLabel("تعذرت قراءة النص. ارفع ملف PDF أو Word واضحاً، أو الصق النص مباشرة.", "We could not read this text. Upload a readable PDF or Word file, or paste the text.");
}

function renderResumeCoach() {
  const t = accountLabel;
  const ready = originalResumeReady();
  const damaged = !ready && Boolean(state.profile?.resume_text?.trim());
  const signedIn = state.session?.authenticated;
  const pending = state.resumeCoachPending;
  const coach = ready && ["deepseek", PERSONAL_SOURCE].includes(state.resumeCoach?.provider) ? state.resumeCoach : null;
  const author = coach?.provider === PERSONAL_SOURCE ? "OpenRouter" : "DeepSeek";
  const approved = approvedImprovement();
  const badge = damaged ? sourceStatusLabel(false, true)
    : approved ? t(`نسخة ${author} معتمدة`, `${author} résumé approved`)
    : coach ? t(`مسودة ${author} تحتاج مراجعة`, `${author} draft awaiting review`)
    : masterResumeReady() ? t("السيرة الأصلية معتمدة للمطابقة", "Original résumé approved for matching")
    : t("لم تُنشأ نسخة محسّنة", "No improved résumé yet");
  const jobs = targetJobs();
  const selected = document.querySelector("#coach-target-job")?.value || "";
  const improvements = Array.isArray(coach?.improvements) ? coach.improvements : [];
  const titles = coach?.search_profile?.target_titles;
  const keywords = coach?.search_profile?.keywords;
  const proposedTitles = Array.isArray(titles) ? titles.slice(0, 6) : [];
  const proposedTerms = Array.isArray(keywords) ? keywords.slice(0, 8) : [];
  const documents = state.locale === "en" ? ["en", "ar"] : ["ar", "en"];
  return `<section class="section-block account-block resume-coach ${approved ? "approved" : ""}" aria-labelledby="coach-heading">
    <div class="account-section-head">
      <h2 id="coach-heading">${t("مدرب السيرة بالذكاء الاصطناعي", "AI résumé coach")}</h2>
      <span class="badge ${approved ? "" : "muted"}" data-coach-approval>${badge}</span>
    </div>
    <p class="account-note">${t("أنشئ سيرة عربية وإنجليزية من خبراتك أو خصّصها لإعلان وظيفة.", "Generate a résumé in Arabic and English from your experience, or tailor it to a specific vacancy.")}</p>
    ${signedIn ? "" : `<a class="account-login" href="/login" data-nav="/login">${t("سجّل الدخول لاستخدام المدرب", "Sign in to use the coach")}</a>`}
    ${aiActionOptions("coach", "deepseek")}
    <button class="btn primary" data-resume-coach ${ready && signedIn && !pending && !aiBlocked() ? "" : "disabled"}>${iconSpark()} ${pending ? t("جارٍ تحسين السيرة…", "Improving résumé…") : t("تحسين السيرة الكاملة", "Improve my full résumé")}</button>
    ${state.action.context === "resume-coach" || state.action.pending === "resume-coach" ? banner() : ""}
    ${coach ? `<div class="account-drafts" data-coach-draft>
      <p class="account-note">${t("راجع التفاصيل والتواريخ في النسختين قبل اعتمادهما وتنزيلهما.", "Review the details and dates in both versions before approving and downloading them.")}</p>
      ${documents.map(language => {
        const label = language === "ar" ? t("السيرة العربية المحسنة", "Improved Arabic résumé") : t("السيرة الإنجليزية المحسنة", "Improved English résumé");
        const old = document.querySelector(`[data-draft-language="${language}"]`);
        return `<details class="account-disclosure" data-draft-language="${language}" ${(old ? old.open : language === documents[0]) ? "open" : ""}>
          <summary>${label}</summary>
          <div class="account-disclosure-body"><textarea class="document-editor" aria-label="${label}" dir="${language === "ar" ? "rtl" : "ltr"}" lang="${language}" data-master-resume="${language}">${esc(coach[language + "_master_resume"] || "")}</textarea>
            ${masterDownloadButton(language, approved)}</div></details>`;
      }).join("")}
      ${improvements.length || proposedTitles.length || proposedTerms.length ? `<details class="account-disclosure"><summary>${t("اقتراحات المدرب", "Coach suggestions")}</summary>
        <div class="account-disclosure-body">
          ${improvements.length ? `<ul class="coach-list">${improvements.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
          ${proposedTitles.length ? `<p class="account-note"><strong>${t("مسميات مقترحة", "Suggested job titles")}</strong> · ${esc(proposedTitles.join(" · "))}</p>` : ""}
          ${proposedTerms.length ? `<p class="account-note"><strong>${t("كلمات مفتاحية", "Keywords")}</strong> · ${esc(proposedTerms.join(" · "))}</p>` : ""}
        </div></details>` : ""}
      <button class="btn outline" data-approve-master-resume ${usableCoachDraft(coach) && !pending && !approved ? "" : "disabled"}>${iconCheck()} <span>${approved ? t(`نسخة ${author} معتمدة`, `${author} résumé approved`) : t("اعتماد السيرة المحسنة", "Approve improved résumé")}</span></button>
    </div>` : ""}
    <div class="account-tailoring">
      <h3>${t("سيرة مخصصة لوظيفة", "Résumé for a specific job")}</h3>
      <form class="form" data-coach-target ${jobs.length ? "" : "hidden"}>
        <div class="field"><label for="coach-target-job">${t("اختر وظيفة", "Select a vacancy")}</label>
          <select id="coach-target-job" name="job" required>${targetJobOptions(jobs, selected)}</select>
        </div>
        ${aiActionOptions("target", "deepseek")}
        <button class="btn outline" type="submit" ${ready && signedIn && !state.jobWriterPending && !aiBlocked() ? "" : "disabled"}>${iconSpark()} ${t("إنشاء سيرة لهذه الوظيفة", "Generate résumé for this job")}</button>
      </form>
      <button class="btn outline" data-find-coach-job data-nav="/jobs" ${jobs.length ? "hidden" : ""}>${t("اختيار وظيفة لتخصيص السيرة", "Choose a job to tailor my résumé")}</button>
    </div>
  </section>`;
}

function resumeCoachError(code) {
  const t = accountLabel;
  if (["AI_PREFERENCE_CHANGED", "AI_PREFERENCE_UNAVAILABLE"].includes(code)) {
    return t("تعذّر تأكيد تفضيل الدفع. حدّث إعدادات الذكاء الاصطناعي في الملف الشخصي ثم أعد المحاولة.", "Your billing choice could not be confirmed. Refresh AI settings in User Profile, then retry.");
  }
  if (code === "PERSONAL_REQUEST_PAUSED") return personalErrorText(aiConnection().pause, state.locale);
  if (code === "AI_SELECTION_PAUSED") return t("راجع اتصالك ومصدر الرصيد قبل المحاولة.", "Review your connection and selected credits before retrying.");
  switch (code) {
    case "AUTH_REQUIRED": return t("سجّل الدخول ثم أعد المحاولة.", "Sign in and try again.");
    case "RESUME_REQUIRED": return t("الصق نص السيرة الكامل أو ارفع ملفاً واضحاً، ثم حاول مرة أخرى.", "Paste your full résumé or upload a readable file, then try again.");
    case "RESUME_UNREADABLE": return t("تعذرت قراءة نص السيرة. أعد استخراج الملف المحفوظ أو الصق نسخة نصية واضحة.", "We could not read the résumé. Extract the saved file again or paste readable text.");
    case "RATE_LIMITED": return t("انتظر دقيقة قبل طلب تحسين جديد.", "Wait a minute before requesting another draft.");
    case "AI_BUSY": return t("مدرب السيرة مشغول الآن. حاول بعد قليل.", "The résumé coach is busy. Try again shortly.");
    case "AI_TIMEOUT": return t("استغرق تحسين السيرة وقتاً أطول من المتوقع. حاول مرة أخرى.", "Improving the résumé took longer than expected. Try again.");
    case "AI_INVALID_DRAFT": return t("لم تكتمل مسودتا السيرة. حاول مرة أخرى.", "The two résumé drafts are incomplete. Try again.");
    case "AI_UNAVAILABLE": return t("تعذر الاتصال بخدمة DeepSeek. أعد المحاولة لاحقاً.", "DeepSeek could not be reached. Try again later.");
    case "RESUME_CHANGED": return t("تغيّر نص السيرة أثناء المعالجة. أعد المحاولة بالنص الحالي.", "Your source changed during processing. Try again with the current text.");
    default: return "";
  }
}

function resetResumeCoach() {
  state.resumeCoach = null;
  state.approvedMasterResume = false;
  state.masterResume = { ar: "", en: "", approved_at: "" };
  Object.keys(state.ghostwriter).forEach((jobId) => invalidateApplicationReview(jobId));
}

function renderLegal(page) {
  const isPrivacy = page === "privacy";
  const en = state.locale === "en";
  const title = isPrivacy ? (en ? "Privacy policy" : "سياسة الخصوصية") : (en ? "Terms of use" : "الشروط والأحكام");
  const rows = isPrivacy
    ? (en ? [
        ["What Jobs uses", "Your résumé, profile, job preferences and application documents support job matching and application preparation."],
        ["AI included with Jobs", "When you use an AI writing tool, Jobs sends the résumé, job details and instructions needed for that task to the provider shown in the tool."],
        ["Your OpenRouter account", "If you select your own account, OpenRouter and the hosting provider shown for your model receive the information needed for that request. The AI charge uses your OpenRouter credits. Jobs stores the connection credential encrypted on its server and records the model and token counts for usage reporting."],
        ["Storage", "Saved account data is kept on the Jobs backend. Guests may have draft data stored in their browser."],
        ["Your controls", "You can disconnect in your profile or revoke the key in OpenRouter. Review generated documents before exporting or submitting them."],
      ] : [
        ["البيانات المستخدمة", "تُستخدم سيرتك الذاتية وبيانات ملفك وتفضيلاتك ومستنداتك لمطابقة الوظائف وتجهيز طلبات التقديم."],
        ["الذكاء الاصطناعي المشمول في Jobs", "عند استخدام أدوات الكتابة، تُرسل بيانات السيرة والوظيفة والتعليمات اللازمة للمهمة إلى المزوّد المبيّن في الأداة."],
        ["حسابك في OpenRouter", "عند اختيار حسابك الشخصي، تُرسل البيانات اللازمة للطلب إلى OpenRouter ومزوّد الاستضافة الموضّح بجوار النموذج. تُخصم تكلفة الذكاء الاصطناعي من رصيدك في OpenRouter. تحفظ Jobs مفتاح الاتصال مشفراً على الخادم وتسجّل النموذج وعدد الرموز لإعداد تقارير الاستخدام."],
        ["التخزين", "تُحفظ بيانات الحساب على خوادم المنصة، وقد تُحفظ مسودات الزوار محلياً في المتصفح."],
        ["التحكم", "يمكنك فصل الاتصال من ملفك الشخصي أو إلغاء المفتاح من OpenRouter. راجع المستندات المولّدة قبل تصديرها أو إرسالها."],
      ])
    : (en ? [
        ["Review your drafts", "Check facts, dates, qualifications and claims in résumés, letters and interview notes before submitting."],
        ["Job applications", "You decide when to submit an application."],
        ["Job sources", "Jobs uses public listings or authorized interfaces. Restricted services require provider authorization."],
        ["Acceptable use", "Use accurate experience and qualifications. Respect source access rules and submit truthful applications."],
      ] : [
        ["مسؤولية المستخدم", "السير والخطابات وملاحظات المقابلة مسودات. يجب مراجعة الحقائق والتواريخ والشهادات والادعاءات قبل التقديم."],
        ["طلبات التوظيف", "أنت من يقرّر متى يُرسَل طلب التوظيف."],
        ["الوصول للمصادر", "إدخال الوظائف يستخدم الصفحات العامة أو الواجهات المعتمدة فقط. المنصات المحمية تحتاج وصولاً رسمياً من المزود."],
        ["الاستخدام المقبول", "لا تستخدم الخدمة لاختلاق خبرات أو سحب بيانات من أنظمة ممنوعة أو إرسال طلبات مضللة."],
      ]);
  shell(
    `${banner()}
    <section class="section" style="padding-top:14px">
      <a class="btn ghost sm" href="/profile" data-nav="/profile">${iconBack()} ${en ? "User profile" : "الملف الشخصي"}</a>
      <div class="section-block legal-panel">
        <h1>${title}</h1>
        <div class="list-rows">
          ${rows.map(([heading, text]) => `<div class="row-item legal-row"><div class="ico">${iconCheck()}</div><div><strong>${esc(heading)}</strong><small>${esc(text)}</small></div></div>`).join("")}
        </div>
      </div>
    </section>`,
    { screen: "profile" },
  );
}

/* ---------------- Results ---------------- */
function renderResults() {
  const en = state.locale === "en";
  const jobs = workspaceJobs();
  const queue = jobs.filter(job => applicationTracking(job).follow_up_at)
    .sort((a, b) => applicationTracking(a).follow_up_at.localeCompare(applicationTracking(b).follow_up_at));
  const submitted = jobs.filter(job => applicationTracking(job).applied_at || ["applied", "in_progress"].includes(job.status)).length;
  const due = queue.filter(job => followUpState(job) === "due").length;
  const activities = (state.activity_feed || []).filter(item => jobById(item.job_id)).slice(0, 6);
  const savedUrl = searchUrl("saved");
  const followUpRow = job => {
    const date = applicationTracking(job).follow_up_at;
    const dueNow = followUpState(job) === "due";
    return `<a class="followup-row" href="/jobs/${encodeURIComponent(job.id)}?tab=tracking" data-nav="/jobs/${encodeURIComponent(job.id)}?tab=tracking">
      <span><strong dir="auto">${esc(job.title)}</strong><small dir="auto">${esc(job.employer)}</small></span>
      <span><small class="${dueNow ? "due-label" : ""}">${dueNow ? (en ? "Due" : "مستحقة") : (en ? "Scheduled" : "مجدولة")}</small><time dir="ltr" datetime="${esc(date)}">${esc(date)}</time></span>
    </a>`;
  };
  shell(`${banner()}
    <header class="section followup-title"><h1>${en ? "Application follow-up" : "متابعة التقديم"}</h1>
      <a class="btn outline" href="/applications${en ? "?lang=en" : ""}">${iconDoc()}${en ? "Applications sent through Jobs" : "الطلبات المرسلة عبر المنصة"}</a></header>
    ${jobs.length ? `<section class="section"><div class="status-grid">
      <div class="stat"><span class="v">${jobs.length}</span><span class="l">${en ? "Saved jobs" : "وظائف محفوظة"}</span></div>
      <div class="stat teal"><span class="v">${submitted}</span><span class="l">${en ? "Marked applied" : "مسجّلة كمُقدَّم عليها"}</span></div>
      <div class="stat gold"><span class="v">${due}</span><span class="l">${en ? "Follow-ups due" : "متابعات مستحقة"}</span></div>
    </div></section>` : ""}
    <section class="section"><div class="section-block followup-queue">
      <h2>${en ? "Follow-up schedule" : "قائمة المتابعة"}</h2>
      ${queue.length ? queue.map(followUpRow).join("") : `<p>${jobs.length
        ? (en ? "Open a saved job and choose Application tracking to set a follow-up date." : "افتح وظيفة محفوظة واختر متابعة التقديم لتحديد موعد.")
        : (en ? "Save a vacancy to track an application or schedule a follow-up." : "احفظ وظيفة لتسجّل التقديم عليها وتحدد موعد متابعتها.")}</p>
        <a class="btn primary" href="${jobs.length ? savedUrl : searchUrl("browse")}" data-nav="${jobs.length ? savedUrl : searchUrl("browse")}">${jobs.length ? (en ? "Open saved jobs" : "فتح الوظائف المحفوظة") : (en ? "Browse vacancies" : "تصفح الشواغر")}</a>`}
    </div></section>
    ${activities.length ? `<section class="section"><div class="section-block"><h2>${en ? "Recent activity" : "أحدث النشاطات"}</h2>${activities.map(activityHtml).join("")}</div></section>` : ""}`,
    { screen: "results" });
}

function activityHtml(item) {
  return `<div class="row-item">
    <span class="ico">${iconDot(item.tone || "neutral")}</span>
    <div><strong>${esc(item.label || item.job_title || "")}</strong><small>${esc(item.timestamp || "")} · ${esc(item.employer || "")}</small></div>
    <button class="btn ghost sm" data-nav="/jobs/${esc(item.job_id || "")}">${state.locale === "en" ? "View" : "عرض"}</button>
  </div>`;
}

function iconDot(tone) {
  const colors = { teal: "var(--teal)", gold: "var(--gold)", danger: "var(--rose)", neutral: "var(--muted)" };
  return `<span style="display:block;width:8px;height:8px;border-radius:50%;background:${colors[tone] || colors.neutral}"></span>`;
}

/* ---------------- Events ---------------- */
async function generateJobKit(jobId, model = state.aiWriterModel) {
  if (state.jobWriterPending || aiBlocked()) return;
  if (!state.session?.authenticated || !originalResumeReady()) {
    state.action = { pending: "", message: "", error: state.session?.authenticated
      ? applicationErrorMessage("SOURCE_EVIDENCE_REQUIRED") : resumeCoachError("AUTH_REQUIRED") };
    render();
    return;
  }
  const job = jobById(jobId);
  if (!job) return;
  const account = state.session.user?.sub;
  const selection = billingSelection(model);
  const profile = { ...approvedProfile(), target_job_brief: state.tailoringBriefs?.[jobId] || "" };
  state.jobWriterPending = true;
  const kit = await runAction(
    "ghostwriter",
    "جاري تجهيز كاتب الظل...",
    "تم تجهيز السيرة والخطاب والمقابلة",
    async () => {
      await loadSelectedPosting(job);
      const result = await candidateAiRequest("/api/ghostwriter", { job, profile }, selection);
      const current = approvedProfile();
      if (account !== state.session.user?.sub || job.title !== jobById(jobId)?.title || job.employer !== jobById(jobId)?.employer
          || profile.target_job_brief !== (state.tailoringBriefs?.[jobId] || "") || job.description !== jobById(jobId)?.description
          || current.approved_master_resume !== profile.approved_master_resume || current.resume_text !== profile.resume_text) {
        const error = new Error("Application context changed");
        error.code = "JOB_CONTEXT_CHANGED";
        throw error;
      }
      return result;
    },
    applicationErrorMessage,
  );
  state.jobWriterPending = false;
  if (kit) {
    state.ghostwriter[jobId] = kit;
    state.approvedKits = { ...(state.approvedKits || {}), [jobId]: false };
    state.assistantTab = "resume";
    replaceJob({
      ...job,
      tailored_resume: kit.ar_resume || kit.en_resume || "",
      cover_letter: kit.ar_cover_letter || kit.en_cover_letter || "",
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
}

function setupEvents() {
  bindAiFunding();
  document.querySelectorAll("[data-nav]").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (item.tagName === "A" && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      e.preventDefault();
      if (item.dataset.searchTab) {
        try { sessionStorage.setItem("jobs.search-tab." + (state.session?.user?.sub || "guest"), item.dataset.searchTab); } catch {}
      }
      navigate(item.dataset.nav);
    });
  });

  document.querySelectorAll("[data-job]").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest("[data-job-action]")) return;
      if (item.tagName === "A" && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      e.preventDefault();
      if (routeOf().name === "jobs-list") state.jobReturnUrl = "/jobs?view=saved";
      state.assistantTab = "overview";
      navigate(`/jobs/${item.dataset.job}`);
    });
  });

  document.querySelectorAll("[data-vacancy-filters]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const filters = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()]));
      searchPage.key = "";
      navigate(searchUrl(form.dataset.vacancyFilters, filters));
    });
  });
  document.querySelector("[data-edit-match-role]")?.addEventListener("click", () => {
    navigate("/account");
    const preferences = document.querySelector("[data-search-preferences]");
    if (preferences) preferences.open = true;
    document.querySelector('[data-profile-field="target_roles"]')?.focus();
  });
  document.querySelector("[data-retry-job-search]")?.addEventListener("click", () => {
    searchPage.key = "";
    render();
  });
  document.querySelectorAll("[data-open-search-job]").forEach((button) => {
    button.addEventListener("click", async () => {
      const list = routeOf().name === "jobs-list" ? searchPage.jobs : lastMatches.jobs;
      const result = list.find((job) => job.public_id === button.dataset.openSearchJob);
      if (!result) return;
      if (!validVacancyId(result.public_id)) return;
      if (!state.session?.authenticated) return navigate("/login?next=" + encodeURIComponent(saveVacancyUrl(result.public_id)));
      const search = searchParamsFromUrl();
      state.jobReturnUrl = routeOf().name === "jobs-list" && !new URLSearchParams(location.search).has("vacancy")
        ? searchUrl(search.mode, search.filters, search.offset, search.asOf) : "/jobs?view=saved";
      const existing = workspaceJobs().find((job) => job.id === result.id || job.public_id === result.public_id
        || (job.source_url && (job.source_url === result.source_url || job.source_url === location.origin + result.public_url)));
      if (!existing || state.persistence?.storage === "save-failed") {
        const en = state.locale === "en";
        const owner = accountId();
        const startUrl = location.href;
        if (!owner || workspaceOwner !== owner || state.persistence?.storage === "conflict") {
          state.action = { pending: "", message: "", error: en ? "Refresh your workspace and try saving this job again." : "حدّث مساحة عملك ثم حاول حفظ الوظيفة مجدداً." };
          render();
          return;
        }
        if (!existing) replaceJob(result);
        button.disabled = true;
        button.textContent = en ? "Saving…" : "جارٍ الحفظ…";
        saveWorkspaceState();
        clearTimeout(saveWorkspaceTimer);
        await flushWorkspaceState();
        if (owner !== accountId()) return;
        if (["save-failed", "conflict"].includes(state.persistence?.storage)) {
          if (!existing) state.jobs = state.jobs.filter(item => item !== result);
          state.action = { pending: "", message: "", error: state.persistence.storage === "conflict"
            ? (en ? "Your workspace changed. Refresh to see the latest saved jobs." : "تغيرت مساحة عملك. حدّث الصفحة لعرض الوظائف المحفوظة.")
            : (en ? "Couldn’t save this vacancy. Try saving it again." : "تعذّر حفظ الوظيفة. حاول الحفظ مرة أخرى.") };
          render();
          return;
        }
        if (location.href !== startUrl) return;
        state.action = { pending: "", message: state.persistence.pending || workspaceSaving
          ? (en ? "Saving this vacancy to your account…" : "يُحفظ هذا الإعلان في حسابك…")
          : (en ? "Vacancy saved to your account." : "حُفظت الوظيفة في حسابك."), error: "" };
      }
      state.assistantTab = "resume";
      navigate("/jobs/" + encodeURIComponent((existing || result).id));
    });
  });

  const localeToggle = document.querySelector("[data-toggle-locale]");
  if (localeToggle) {
    localeToggle.addEventListener("click", () => {
      state.locale = state.locale === "en" ? "ar" : "en";
      const url = new URL(location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.set("lang", state.locale);
        history.replaceState(history.state, "", url.pathname + url.search + url.hash);
      }
      savePreferences();
      render();
      document.querySelector("[data-toggle-locale]")?.focus({ preventScroll: true });
    });
  }

  const themeToggle = document.querySelector("[data-toggle-theme]");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      savePreferences();
      render();
      document.querySelector("[data-toggle-theme]")?.focus({ preventScroll: true });
    });
  }

  document.querySelectorAll("[data-job-filter]").forEach((item) => {
    item.addEventListener("click", () => {
      state.jobFilter = item.dataset.jobFilter;
      render();
    });
  });

  document.querySelector("[data-sort]")?.addEventListener("change", (event) => {
    state.jobSort = event.target.value;
    render();
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

  const menuTrigger = document.querySelector("[data-user-menu]");
  const menuPanel = document.querySelector("[data-user-menu-panel]");
  if (menuTrigger && menuPanel) {
    menuTrigger.addEventListener("click", () => {
      const opening = menuPanel.hidden;
      menuPanel.hidden = !opening;
      menuTrigger.setAttribute("aria-expanded", String(opening));
    });
  }

  document.querySelectorAll("[data-open-url]").forEach((item) => {
    item.addEventListener("click", () => {
      window.location.href = item.dataset.openUrl;
    });
  });

  const termsConsent = document.querySelector("[data-terms-consent]");
  const googleLogin = document.querySelector("[data-google-login]");
  if (termsConsent && googleLogin) {
    const oauthParams = new URLSearchParams({ terms: "1" });
    const next = new URLSearchParams(location.search).get("next");
    if (next) oauthParams.set("next", next);
    termsConsent.addEventListener("change", () => {
      googleLogin.classList.toggle("disabled", !termsConsent.checked);
      googleLogin.setAttribute("aria-disabled", String(!termsConsent.checked));
      googleLogin.href = termsConsent.checked ? `/api/auth/google/start?${oauthParams}` : "";
    });
    googleLogin.addEventListener("click", (event) => {
      if (!termsConsent.checked) event.preventDefault();
    });
  }

  const completeOnboarding = document.querySelector("[data-complete-onboarding]");
  if (completeOnboarding) {
    completeOnboarding.addEventListener("click", async () => {
      completeOnboarding.disabled = true;
      try {
        const result = await fetch("/api/auth/onboarding", { method: "POST" });
        if (!result.ok) throw new Error("Onboarding unavailable");
        if (routeOf().name === "onboarding") navigate("/account");
      } catch {
        completeOnboarding.disabled = false;
        const message = document.querySelector("[data-onboarding-error]");
        if (message) {
          message.hidden = false;
          message.textContent = state.locale === "en" ? "We couldn’t save that change. Please try again." : "تعذّر حفظ التغيير. حاول مرة أخرى.";
        }
      }
    });
  }

  document.querySelectorAll("[data-submit-action]").forEach((item) => {
    item.addEventListener("click", async () => {
      const job = jobById(item.dataset.submitAction);
      if (!job) return;
      if (!state.session?.authenticated) {
        updateJobStatusLocal(job.id, "applied");
        state.action = { pending: "", message: state.locale === "en" ? "Application recorded on this device." : "تم تسجيل التقديم محلياً", error: "" };
        render();
        return;
      }
      const updated = await runAction(
        "submit",
        state.locale === "en" ? "Recording application…" : "جاري تسجيل التقديم...",
        state.locale === "en" ? "Application recorded." : "تم تسجيل التقديم",
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

  document.querySelectorAll("[data-evaluate-job]").forEach((button) => {
    button.addEventListener("click", async () => {
      const job = jobById(button.dataset.evaluateJob);
      if (!job || !matchingReady()) return;
      await loadSelectedPosting(job);
      const result = await runAction("evaluate-job", "جاري التقييم...", "تم تقييم الملاءمة", () =>
        apiJson("/api/jobs/evaluate", { method: "POST", body: JSON.stringify({ job, profile: approvedMatchingProfile() }) }));
      if (result) {
        const { score, match_breakdown, match_eligible, fit_grade, match_evidence, missing_requirements, requirements_to_verify, match_confidence, fit_explanation } = result;
        replaceJob({ ...job, score, match_breakdown, match_eligible, fit_grade, match_evidence, missing_requirements, requirements_to_verify, match_confidence, fit_explanation });
        saveWorkspaceState();
      }
      render();
    });
  });

  document.querySelector("[data-import-job]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = new FormData(event.currentTarget).get("url");
    const job = await runAction("import-job", "جاري استيراد الرابط...", "تم حفظ الوظيفة", () =>
      apiJson("/api/jobs/import", { method: "POST", body: JSON.stringify({ url }) }));
    if (job) {
      state.jobs = [job, ...state.jobs.filter((item) => item.id !== job.id)];
      state.assistantTab = "overview";
      navigate(`/jobs/${encodeURIComponent(job.id)}`);
    }
  });

  document.querySelectorAll("[data-application-draft]").forEach((form) => {
    const jobId = form.dataset.applicationDraft;
    const kind = form.elements.namedItem("kind");
    const context = form.elements.namedItem("context");
    const draft = form.elements.namedItem("draft");
    kind.addEventListener("change", () => {
      state.applicationDraftTask = { jobId, kind: kind.value, context: "" };
      render();
    });
    context.addEventListener("input", () => {
      state.applicationDraftTask = { jobId, kind: kind.value, context: context.value };
    });
    draft?.addEventListener("input", () => {
      state.applicationDrafts[jobId][kind.value] = draft.value;
      saveWorkspaceState();
    });
    form.querySelector("[data-copy-application-draft]")?.addEventListener("click", async () => {
      if (!draft?.value) return;
      try {
        await navigator.clipboard.writeText(draft.value);
        state.action = { pending: "", error: "", message: state.locale === "en" ? "Draft copied" : "تم نسخ المسودة" };
        state.applicationDraftTask = { jobId, kind: kind.value, context: context.value };
        render();
      } catch { draft.focus(); draft.select(); }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const job = jobById(jobId);
      if (!job || !masterResumeReady()) return;
      const intent = kind.value;
      const supplied = context.value.trim();
      const appliedAt = applicationTracking(job).applied_at;
      const question = intent === "followup_email"
        ? [appliedAt ? `Application submitted on ${appliedAt}.` : "Draft a follow-up about this application.", supplied].filter(Boolean).join("\n")
        : supplied;
      state.applicationDraftTask = { jobId, kind: intent, context: context.value };
      if (!question) {
        state.action = { pending: "", message: "", error: state.locale === "en" ? "Enter a question or message." : "أدخل السؤال أو الرسالة." };
        render();
        return;
      }
      const result = await runAction("application-draft", "جاري إعداد المسودة...", "المسودة جاهزة للمراجعة", () =>
        candidateAiRequest("/api/ai-writer-chat", { intent, job, profile: approvedMatchingProfile(), question }, billingSelection()), applicationErrorMessage);
      if (result?.answer) {
        state.applicationDrafts = { ...state.applicationDrafts, [jobId]: { ...state.applicationDrafts?.[jobId], [intent]: result.answer } };
        saveWorkspaceState();
      }
      render();
    });
  });

  document.querySelectorAll("[data-followup-calendar]").forEach((button) => {
    button.addEventListener("click", () => {
      const job = jobById(button.dataset.followupCalendar);
      if (!job) return;
      const date = applicationTracking(job).follow_up_at;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return;
      const title = `${state.locale === "en" ? "Follow up" : "متابعة الطلب"} - ${job.title} (${job.employer})`;
      const summary = title.replaceAll("\\", "\\\\").replace(/\r?\n|\r/g, "\\n").replace(/[;,]/g, "\\$&");
      const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jobs Wasfai//Follow-up//EN", "BEGIN:VEVENT",
        `UID:${safeDownloadName(job.id)}-followup@jobs.wasfai.com`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`, `SUMMARY:${summary}`, "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
      const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "jobs-wasfai-follow-up.ics";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      const url = new URL(location.href);
      url.searchParams.set("tab", item.dataset.tab);
      history.replaceState(null, "", url.pathname + url.search);
      render();
      document.querySelector(`[data-job-tabs] [data-tab="${CSS.escape(item.dataset.tab)}"]`)?.focus({ preventScroll: true });
    });
  });

  const modelSelect = document.querySelector("[data-ai-writer-model]");
  if (modelSelect) {
    modelSelect.addEventListener("change", (e) => {
      state.aiWriterModel = e.target.value;
      if (accountId()) void saveAiChoice(); else saveLocalAiWriterState();
      render();
    });
  }

  document.querySelectorAll("[data-ghostwriter]").forEach((item) => {
    item.addEventListener("click", () => generateJobKit(item.dataset.ghostwriter));
  });

  document.querySelector("[data-coach-target]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const jobId = new FormData(event.currentTarget).get("job");
    if (state.jobWriterPending) return;
    const target = targetJobs().find((job) => job.id === jobId);
    if (!target) return;
    if (!jobById(jobId)) {
      replaceJob(target);
      persistWorkState();
    }
    state.assistantTab = "resume";
    navigate(`/jobs/${encodeURIComponent(jobId)}`);
    generateJobKit(jobId, "deepseek");
  });

  document.querySelectorAll("[data-tailoring-brief]").forEach((item) => {
    item.addEventListener("input", (e) => {
      const jobId = e.target.dataset.tailoringBrief;
      state.tailoringBriefs = { ...(state.tailoringBriefs || {}), [jobId]: e.target.value };
      invalidateApplicationReview(jobId);
      saveLocalAiWriterState();
    });
  });

  document.querySelectorAll("[data-kit-document]").forEach((item) => {
    item.addEventListener("input", (e) => {
      const jobId = e.target.dataset.jobId;
      const field = e.target.dataset.kitDocument;
      const kit = ghostwriterFor(jobId);
      if (!kit || !field) return;
      invalidateApplicationReview(jobId, { [field]: e.target.value, edited_at: new Date().toISOString() });
      saveLocalAiWriterState();
    });
  });

  document.querySelectorAll("[data-approve-kit]").forEach((item) => {
    item.addEventListener("click", async () => {
      const jobId = item.dataset.approveKit;
      const job = jobById(jobId);
      const kit = ghostwriterFor(jobId);
      if (!kit || !job || state.action.pending === "kit-review") return;
      if (!kit.quality_review?.approved) {
        const profile = { ...approvedProfile(), target_job_brief: state.tailoringBriefs?.[jobId] || "" };
        const result = await runAction("kit-review", "جاري مراجعة السيرة والخطاب مقابل متطلبات الوظيفة...", "",
          () => candidateAiRequest("/api/ghostwriter", { job, profile, review_kit: kit }, billingSelection()),
          applicationErrorMessage);
        if (!result || ghostwriterFor(jobId) !== kit) {
          render();
          return;
        }
        state.ghostwriter[jobId] = { ...kit, review_error_code: "", quality_review: result.quality_review };
        if (!result.quality_review?.approved) {
          state.action = { pending: "", message: "", error: "راجع نتائج المطابقة وعدّل المستندات قبل التصدير." };
          saveLocalAiWriterState();
          render();
          return;
        }
      }
      state.approvedKits = { ...(state.approvedKits || {}), [jobId]: true };
      state.action = { pending: "", message: "تم اعتماد الحزمة ويمكن تنزيل DOCX/PDF", error: "" };
      saveLocalAiWriterState();
      render();
    });
  });

  document.querySelectorAll("[data-export-master]").forEach((item) => {
    item.addEventListener("click", async () => {
      if (!masterResumeReady()) return;
      const language = item.dataset.exportMaster;
      const body = state.masterResume?.[language];
      if (!body) return;
      await runAction("export-master", "", "", async () => {
        const { buildDocx } = await import("./resume-docx.mjs");
        const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        downloadBlob(new Blob([buildDocx(body, language)], { type: mime }), `${safeDownloadName(state.profile?.display_name)}-cv-${language}.docx`);
        return true;
      });
      render();
    });
  });

  document.querySelectorAll("[data-export-kit]").forEach((item) => {
    item.addEventListener("click", async () => {
      const format = item.dataset.exportKit;
      const documentType = item.dataset.exportDocument || "package";
      const jobId = item.dataset.jobId;
      const job = jobById(jobId);
      const kit = ghostwriterFor(jobId);
      if (!kit?.quality_review?.approved || !state.approvedKits?.[jobId]) return;
      const response = await runAction(
        `export-${format}`,
        `جاري تجهيز ملف ${format.toUpperCase()}...`,
        `تم تجهيز ملف ${format.toUpperCase()}`,
        async () => {
          const file = await accountFetch("/api/export-package", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format, job, profile: approvedProfile(), kit, document: documentType }),
          });
          if (!file.ok) {
            const error = new Error("Application export failed");
            error.code = (await file.json().catch(() => null))?.code;
            throw error;
          }
          return file;
        },
        applicationErrorMessage,
      );
      if (!response || !response.ok) return;
      const blob = await response.blob();
      const suffix = documentType === "package" ? "" : `-cv-${documentType.slice(0, 2)}`;
      downloadBlob(blob, `${safeDownloadName(job.employer)}-${safeDownloadName(job.title)}${suffix}.${format}`);
      render();
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
          candidateAiRequest("/api/ai-writer-chat", { job, profile: state.profile, kit, question, history }, billingSelection()),
        applicationErrorMessage,
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

  const resumeCoachButton = document.querySelector("[data-resume-coach]");
  if (resumeCoachButton) {
    resumeCoachButton.addEventListener("click", async () => {
      if (state.resumeCoachPending || aiBlocked() || !state.session?.authenticated || !readableResumeText(state.profile?.resume_text)) return;
      applyResumeSignalsFromText(state.profile.resume_text, true);
      saveLocalProfile(state.profile);
      const profile = state.profile;
      const owner = accountId();
      state.resumeCoachPending = true;
      const coach = await runAction(
        "resume-coach",
        accountLabel("جارٍ تحسين السيرة الأصلية…", "Improving your original résumé…"),
        accountLabel("أصبحت مسودة السيرة المحسنة جاهزة للمراجعة", "Your improved résumé is ready to review"),
        async () => {
          const draft = await candidateAiRequest("/api/resume-coach", { profile }, billingSelection("deepseek"));
          if (profile.resume_text !== state.profile?.resume_text || owner !== accountId()) {
            const error = new Error("Resume changed during generation");
            error.code = "RESUME_CHANGED";
            throw error;
          }
          if (!usableCoachDraft(draft)) throw Object.assign(new Error("Incomplete draft"), { code: "AI_INVALID_DRAFT" });
          return draft;
        },
        (code) => resumeCoachError(code) || accountLabel("تعذّر تشغيل مدرب السيرة مؤقتاً. جرّب مرة أخرى.", "The coach could not generate the résumé. Try again."),
      );
      state.resumeCoachPending = false;
      state.action.context = "resume-coach";
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
      if (!usableCoachDraft(coach)) return;
      const searchProfile = coach.search_profile || {};
      const targetTitles = Array.isArray(searchProfile.target_titles) ? searchProfile.target_titles.join(", ") : "";
      const keywords = Array.isArray(searchProfile.keywords) ? searchProfile.keywords.join(", ") : "";
      const locations = Array.isArray(searchProfile.locations) ? searchProfile.locations.join(", ") : "";
      state.profile = {
        ...(state.profile || {}),
        target_roles: state.profile.target_roles || targetTitles,
        target_locations: state.profile.target_locations || locations,
        resume_skills: state.profile.resume_skills || keywords,
        resume_seniority: state.profile.resume_seniority || searchProfile.seniority,
      };
      state.masterResume = {
        source: coach.provider,
        ar: coach.ar_master_resume || "",
        en: coach.en_master_resume || "",
        approved_at: new Date().toISOString(),
      };
      Object.keys(state.ghostwriter).forEach((jobId) => invalidateApplicationReview(jobId));
      state.approvedMasterResume = true;
      state.action = { pending: "", context: "resume-coach", message: accountLabel("تم اعتماد السيرة المحسنة للمطابقة وتخصيص طلبات التوظيف.", "Improved résumé approved for matching and job applications."), error: "" };
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
      const badge = document.querySelector("[data-coach-approval]");
      if (badge) {
        badge.classList.add("muted");
        const author = state.resumeCoach.provider === PERSONAL_SOURCE ? "OpenRouter" : "DeepSeek";
        badge.textContent = accountLabel(`مسودة ${author} تحتاج مراجعة`, `${author} draft awaiting review`);
      }
      document.querySelector(".resume-coach")?.classList.remove("approved");
      const match = document.querySelector("[data-approve-uploaded-resume]");
      if (match) match.hidden = false;
      const approvedMatch = document.querySelector(".account-flow [data-search-approved-jobs]");
      if (approvedMatch) approvedMatch.hidden = true;
      const approve = document.querySelector("[data-approve-master-resume]");
      if (approve) {
        approve.disabled = !usableCoachDraft();
        approve.querySelector("span").textContent = accountLabel("اعتماد السيرة المحسنة", "Approve improved résumé");
      }
      document.querySelectorAll("[data-export-master]").forEach((button) => { button.disabled = true; });
      saveLocalAiWriterState();
    });
  });

  document.querySelectorAll("[data-search-approved-jobs]").forEach((button) => {
    button.addEventListener("click", () => navigate("/jobs?view=matches"));
  });

  const logout = document.querySelector("[data-auth-logout]");
  if (logout) {
    logout.addEventListener("click", async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
      if (!response?.ok) {
        state.action = { pending: "", message: "", error: "تعذر تسجيل الخروج. أعد المحاولة." };
        render();
        return;
      }
      workspaceOwner = "";
      clearTimeout(saveWorkspaceTimer);
      state.session = { authenticated: false, user: null };
      root.replaceChildren();
      location.replace("/profile");
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
      if (!confirm(state.locale === "en" ? "Remove this saved job from your workspace?" : "حذف هذه الوظيفة من قائمتك المحفوظة؟")) return;
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
      if (state.profile?.[key] === e.target.value) return;
      const recovering = key === "resume_text" && e.target.hasAttribute("data-damaged-source");
      state.profile = { ...(state.profile || {}), [key]: e.target.value };
      if (!["resume_text", "resume_filename"].includes(key)) {
        state.profile.resume_edited_fields = [...new Set([...(state.profile.resume_edited_fields || []), key])];
      }
      if (key === "resume_text") {
        if (recovering) {
          e.target.removeAttribute("data-damaged-source");
          for (const field of RESUME_DERIVED_FIELDS) {
            if (!state.profile.resume_edited_fields?.includes(field)) state.profile[field] = "";
          }
        }
        resetResumeCoach();
        const ready = readableResumeText(e.target.value);
        const damaged = !ready && Boolean(e.target.value.trim());
        const hint = document.querySelector("[data-source-recovery]");
        if (hint) { hint.hidden = !damaged; hint.textContent = resumeRecoveryMessage(); }
        document.querySelectorAll("[data-profile-autofill], [data-approve-uploaded-resume]").forEach(button => { button.disabled = !ready || state.resumeImportPending; });
        const sourceStatus = document.querySelector("[data-source-status]");
        if (sourceStatus) {
          sourceStatus.textContent = sourceStatusLabel(ready, damaged);
          sourceStatus.classList.toggle("muted", !ready);
        }
        const match = document.querySelector("[data-approve-uploaded-resume]");
        if (match) match.hidden = false;
        const approvedMatch = document.querySelector(".account-flow [data-search-approved-jobs]");
        if (approvedMatch) approvedMatch.hidden = true;
        const coach = document.querySelector(".resume-coach");
        if (coach) {
          coach.classList.remove("approved");
          const badge = coach.querySelector("[data-coach-approval]");
          badge.textContent = damaged ? sourceStatusLabel(false, true) : accountLabel("لم تُنشأ نسخة محسّنة", "No improved résumé yet");
          badge.classList.add("muted");
          coach.querySelector("[data-coach-draft]")?.remove();
          coach.querySelector(".banner")?.remove();
          if (state.action.context === "resume-coach") state.action = { pending: "", message: "", error: "" };
          coach.querySelector("[data-coach-target] button").disabled = !ready || aiBlocked() || !state.session?.authenticated || state.jobWriterPending;
          coach.querySelector("[data-resume-coach]").disabled = !ready || aiBlocked() || !state.session?.authenticated || state.resumeCoachPending;
        }
        saveLocalProfile(state.profile);
        saveLocalAiWriterState();
      }
    });
  });

  document.querySelectorAll("[data-resume-file]").forEach((input) => {
    input.addEventListener("change", () => importProfileResume(input.files?.[0]));
  });
  document.querySelector("[data-reextract-resume]")?.addEventListener("click", () => {
    if (state.session?.authenticated && state.resumeFile) importProfileResume(null, state.resumeFile);
  });

  const deleteResumeFile = document.querySelector("[data-delete-resume-file]");
  if (deleteResumeFile) {
    deleteResumeFile.addEventListener("click", async () => {
      if (!confirm("حذف ملف السيرة الأصلي المشفّر؟ سيبقى النص المستخرج حتى تحذفه من الحقل وتحفظ الملف الشخصي.")) return;
      const response = await accountFetch(`/api/resumes/${encodeURIComponent(deleteResumeFile.dataset.deleteResumeFile)}`, { method: "DELETE" });
      if (response.ok) {
        state.resumeFile = null;
        state.profile = { ...(state.profile || {}), resume_filename: "" };
        saveWorkspaceState();
        state.action = { pending: "", message: "تم حذف ملف السيرة الأصلي من التخزين الخاص.", error: "" };
      } else {
        const payload = await response.json().catch(() => ({}));
        state.action = { pending: "", message: "", error: payload.error || "تعذر حذف ملف السيرة." };
      }
      render();
    });
  }

  const originalDisclosure = document.querySelector("[data-review-original]");
  originalDisclosure?.addEventListener("toggle", () => {
    if (originalDisclosure.open && document.activeElement === originalDisclosure.querySelector("summary")) {
      originalDisclosure.querySelector("[data-original-resume]").focus({ preventScroll: true });
    }
  });

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
      state.action = { pending: "", message: accountLabel("تم استخراج بيانات السيرة", "Profile details extracted"), error: "" };
      render();
      document.querySelector('[data-profile-field="target_roles"]')?.focus();
    });
  }

  const saveProfile = document.querySelector("[data-save-profile]");
  if (saveProfile) {
    saveProfile.addEventListener("click", async () => {
      if (state.session?.authenticated) {
        if (!workspaceOwner) {
          state.action = { pending: "", message: "", error: accountLabel("تعذر تحميل بيانات الحساب. حدّث الصفحة قبل الحفظ.", "Account data could not be loaded. Refresh the page before saving.") };
          render();
          return;
        }
        clearTimeout(saveWorkspaceTimer);
        await flushWorkspaceState();
        if (state.persistence.storage === "save-failed" || state.persistence.storage === "conflict") return;
        state.action = { pending: "", message: state.persistence.pending || workspaceSaving ? accountLabel("جارٍ حفظ الملف في حسابك.", "Saving your profile…") : accountLabel("تم حفظ الملف في حسابك.", "Your profile was saved."), error: "" };
      } else {
        saveLocalProfile(state.profile);
        state.action = { pending: "", message: accountLabel("ملف الضيف متاح في هذه الجلسة.", "Your guest profile is available in this session."), error: "" };
      }
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
      applyResumeSignalsFromText(state.profile?.resume_text || "", true);
      state.masterResume = { source: "original", ar: "", en: "", approved_at: new Date().toISOString() };
      Object.keys(state.ghostwriter).forEach((jobId) => invalidateApplicationReview(jobId));
      state.approvedMasterResume = true;
      state.action = { pending: "", message: accountLabel("تم اعتماد السيرة الأصلية.", "Original résumé approved."), error: "" };
      saveLocalProfile(state.profile);
      saveLocalAiWriterState();
      saveWorkspaceState();
      navigate("/jobs?view=matches");
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
  if (r.name === "profile") return renderProfile();
  if (r.name === "login") return renderLogin();
  if (r.name === "onboarding") return renderOnboarding();
  if (r.name === "legal") return renderLegal(r.page);
  if (r.name === "results") return renderResults();
  return renderSearch();
}

/* ---------------- Init ---------------- */
async function init() {
  loadPreferences();
  const centralSources = fetch("/api/sources", { signal: AbortSignal.timeout(4000) })
    .then((response) => response.ok ? response.json() : null).catch(() => null);
  try {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) throw new Error("bootstrap failed");
    const data = await response.json();
    state = { ...state, ...data };
  } catch (error) {
    state.action = { pending: "", message: "", error: "Live workspace data is temporarily unavailable. Retry when connected." };
  }
  try {
    const sessionResponse = await fetch("/api/auth/session");
    if (sessionResponse.ok) {
      state.session = await sessionResponse.json();
      guestSessionVerified = state.session.authenticated === false;
    }
  } catch {
    state.session = { authenticated: false, user: null, google_configured: false };
  }
  if (guestSessionVerified) {
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
  }
  await loadWorkspaceState();
  if (!AI_WRITER_MODELS.some(model => model.id === state.aiWriterModel)) state.aiWriterModel = "deepseek";
  const returnUrl = new URL(location.href);
  const isProviderReturn = ["/account", "/profile"].includes(returnUrl.pathname.replace(/\/$/, "")) && returnUrl.searchParams.has("openrouter");
  if (isProviderReturn) {
    const outcome = returnUrl.searchParams.get("openrouter");
    returnUrl.pathname = "/profile";
    returnUrl.searchParams.delete("openrouter");
    history.replaceState(history.state, "", returnUrl.pathname + returnUrl.search + returnUrl.hash);
    if (accountId() && ["connected", "cancelled", "expired", "error"].includes(outcome)) {
      const connection = aiConnection();
      connection.focusManager = true;
      connection.notice = outcome === "connected" ? "" : outcome;
    }
  }
  if (accountId() && (aiConnection().focusManager || state.aiBillingSource === PERSONAL_SOURCE)) void checkAiConnection();
  const profileEntry = routeOf().name === "profile";
  if (profileEntry) deferredResumeOwner = accountId(); else await loadResumeFile();
  const catalog = (await centralSources)?.sources;
  if (Array.isArray(catalog)) {
    const centralIds = new Set(catalog.map((source) => source.id));
    state.sources = [...state.sources.filter((source) => !centralIds.has(source.id)), ...catalog];
  }
  if (state.session?.authenticated && !profileEntry) {
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
    { id: "hiringcafe", label: "HiringCafe", region: "Global", url: "https://hiringcafe.com/", enabled: true, scheduled: false, interval_minutes: 360, last_scanned_at: "", last_error: "", job_count: 0, custom: false, connector_mode: "portal_only", connector_note: "ابحث وقدّم عبر بوابة HiringCafe الرسمية." },
  ];
}

function closeAccountMenu(event) {
  const trigger = document.querySelector("[data-user-menu]");
  const panel = document.querySelector("[data-user-menu-panel]");
  if (!panel || panel.hidden) return;
  if (event.type === "keydown") {
    if (event.key !== "Escape") return;
    trigger.focus();
  } else if (event.target.closest(".user-menu-wrap")) return;
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

document.addEventListener("keydown", closeAccountMenu);
document.addEventListener("click", closeAccountMenu);
document.addEventListener("focusin", closeAccountMenu);
for (const event of ["pointerdown", "wheel", "keydown"]) {
  window.addEventListener(event, () => { returningScroll = null; }, { passive: true, capture: true });
}
window.addEventListener("popstate", () => {
  returningScroll = { path: location.pathname + location.search, y: Number(history.state?.scrollY) || 0 };
  render();
  document.getElementById("workspace-content")?.focus({ preventScroll: true });
});
init();
