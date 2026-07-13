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

const INGESTION_WORKER_URL = "https://jobs-wasfai-ingestion.jabosaag.workers.dev";

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
    display_name: "جابر",
    preferred_language: "ar",
    target_roles: "Rust / Product / UX",
    target_locations: "الرياض، دبي، القاهرة",
    resume_filename: "resume.pdf",
    resume_skills: "Rust, Product operations, UX, Arabic SaaS",
    resume_languages: "Arabic, English",
    resume_seniority: "Senior",
    resume_regions: "MENA, Saudi Arabia, UAE, Egypt",
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
  session: { authenticated: false, user: null, google_configured: false },
};

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
  if (r === "account" || r === "login") return { name: "account" };
  if (r === "terms") return { name: "legal", page: "terms" };
  if (r === "privacy") return { name: "legal", page: "privacy" };
  if (r === "results" || r === "analytics") return { name: "results" };
  return { name: "search" };
}

function countByStatus() {
  const counts = { discovered: 0, processing: 0, ready: 0, applied: 0, in_progress: 0, expired: 0, skipped: 0 };
  for (const job of state.jobs) {
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
    return JSON.parse(localStorage.getItem("jobs.wasfai.profile") || "null") || null;
  } catch {
    return null;
  }
}

function saveLocalProfile(profile) {
  try {
    localStorage.setItem("jobs.wasfai.profile", JSON.stringify(profile));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory state still works.
  }
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
        approvedKits: state.approvedKits,
        interviewChats: state.interviewChats,
        resumeCoach: state.resumeCoach,
        approvedMasterResume: state.approvedMasterResume,
      }),
    );
  } catch {
    // Keep session state even if localStorage is blocked.
  }
}

function originalResumeReady(profile = state.profile) {
  return Boolean(
    (profile.resume_text || "").trim().length > 120 ||
      (profile.resume_work_examples || "").trim().length > 40 ||
      (profile.resume_skills || "").trim().length > 12,
  );
}

function masterResumeReady() {
  return Boolean(state.approvedMasterResume && (state.profile?.resume_text || "").trim().length > 120);
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
    resume_text: state.profile?.resume_text || "",
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
    fit_explanation: job.fit_explanation || "Matched against the approved master resume.",
    timeline: [
      {
        at: job.discovered_at || new Date().toISOString(),
        label: "Live crawler match",
        detail: job.source_url || "",
      },
    ],
  };
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
  return {
    display_name: pick(["name", "الاسم"]),
    target_roles: pick(["role", "target", "title", "المسمى", "الدور"]),
    target_locations: pick(["location", "locations", "الموقع", "المدن"]),
    resume_skills: pick(["skills", "المهارات"]),
    resume_languages: pick(["languages", "اللغات"]),
    resume_seniority: pick(["seniority", "level", "المستوى"]),
    resume_regions: pick(["regions", "markets", "النطاق", "المناطق"]),
    resume_work_examples: pick(["examples", "achievements", "projects", "الإنجازات", "الأمثلة"]),
  };
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

function topJobsByScore(limit = 3) {
  return [...state.jobs].sort((a, b) => b.score - a.score).slice(0, limit);
}

function recentJobs(limit = 4) {
  return [...state.jobs].slice(0, limit);
}

function filteredJobs() {
  const q = state.query.trim().toLowerCase();
  return state.jobs.filter((job) => {
    if (state.jobFilter === "matched" && job.score < 80) return false;
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

function shell(content, options = {}) {
  const { showNav = true, topbar = null, screen = "" } = options;
  const navHtml = NAV.map((item) => {
    const active = isNavActive(item.id, screen);
    return `<button class="nav-link ${active ? "active" : ""}" data-nav="${item.route}" aria-label="${esc(item.label)}">${item.icon()}<span>${item.label}</span></button>`;
  }).join("");

  const sideNavHtml = `<aside class="side-nav">
    <div class="brand" style="padding: 0 4px;">
      <span class="logo">J</span>
      <div class="titles"><h1>JOBS.wasfai.com</h1><small>مركز البحث عن عمل</small></div>
    </div>
    <h3>القائمة</h3>
    ${NAV.map((item) => {
      const active = isNavActive(item.id, screen);
      return `<button class="nav-link ${active ? "active" : ""}" data-nav="${item.route}">${item.icon()}<span>${item.label}</span></button>`;
    }).join("")}
    <h3>المصادر</h3>
    ${state.sources.slice(0, 4).map((s) => `<div class="row-item" style="padding:8px 10px"><span class="ico" style="width:28px;height:28px">${esc((s.label || s.id).slice(0, 2))}</span><div><strong style="font-size:12px">${esc(s.label)}</strong><small>${esc(s.region || "")}</small></div></div>`).join("")}
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
  const name = state.profile?.display_name || "جابر";
  const initial = (name || "J").trim().charAt(0);
  return `<header class="topbar">
    <div class="brand">
      <span class="logo">J</span>
      <div class="titles"><h1>JOBS.wasfai.com</h1><small>${esc(subtitle)}</small></div>
    </div>
    <div class="greet"><span class="hi">مرحباً ${esc(name)}</span><span class="sub">أبدأ يومك</span></div>
    <div class="avatar">${esc(initial)}</div>
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
  const steps = [
    {
      icon: iconDoc(),
      title: "أضف سيرتك الأصلية",
      text: "الصق السيرة كما هي أو اكتب أهم الإنجازات. الكاتب يستخدمها كمرجع قبل تخصيص أي وظيفة.",
      action: "الحساب",
      route: "/account",
      done: originalResumeReady(),
    },
    {
      icon: iconCog(),
      title: "حدد مصادر البحث",
      text: "أضف مواقع الوظائف والمناطق التي تهمك، ثم شغل الفحص أو اترك المصادر المجدولة لاحقاً.",
      action: "المصادر",
      route: "/settings",
      done: (state.sources || []).some((s) => s.enabled),
    },
    {
      icon: iconList(),
      title: "راجع أفضل الفرص",
      text: "افتح الوظيفة، راجع المطابقة والمهارات، وانقلها بين قيد المعالجة وجاهزة وتم التقديم.",
      action: "الوظائف",
      route: "/jobs",
      done: (state.jobs || []).length > 0,
    },
    {
      icon: iconSpark(),
      title: "ولّد حزمة كاملة",
      text: "AI كاتب ينتج سيرة عربية، سيرة إنجليزية، خطابين، وأسئلة مقابلة لكل وظيفة.",
      action: "AI كاتب",
      route: "/jobs",
      done: Object.keys(state.ghostwriter || {}).length > 0,
    },
  ];
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

/* ---------------- Home / Search ---------------- */
function renderSearch() {
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
  const counts = countByStatus();
  const jobs = filteredJobs();
  const sourceByCount = countBySource();
  const sources = state.sources.filter((s) => s.enabled);
  const total = state.jobs.length;
  const matched = state.jobs.filter((j) => j.score >= 80).length;
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
    : `<p class="empty">لا توجد وظائف مطابقة. جرّب مدينة أو مصدر آخر.</p>`;

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
          <h1 style="font-size:20px;font-weight:800;color:var(--ink)">الوظائف (${total})</h1>
          <p class="muted tiny" style="margin-top:2px">قائمة الفرص المرتبة حسب المطابقة</p>
        </div>
        <button class="btn outline sm" data-nav="/settings">${iconPlus()} مصدر</button>
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
  const tone = job.score >= 80 ? "" : job.score >= 60 ? "gold" : "danger";
  const selected = state.selectedJobs.includes(job.id);
  return `<article class="card job-card ${selected ? "selected" : ""}" data-job="${esc(job.id)}">
    <div class="score-ring ${tone}" style="--score:${job.score}"><span>${job.score}%</span></div>
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
        ${job.status === "expired" ? `<span class="tag danger">منتهية</span>` : ""}
        ${job.score >= 90 ? `<span class="tag outline">مطابقة عالية</span>` : ""}
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
        <div class="fit-pill match"><strong>${Math.min(job.score + 5, 99)}%</strong><small>المهارات التقنية</small></div>
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
    <div class="section-block">
      <h3>قائمة التقديم</h3>
      <div class="checklist">${buildChecklist(job, pkg, draft)}</div>
    </div>
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
      <p class="lede">ركّز خطاب التقديم على بنية الـ Rust وقابلية التوسع، وأضف مثالاً قابلاً للقياس عن تحسين الأداء. اللغة العربية ميزة تنافسية في السوق.</p>
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
  const skills = ["Rust", "Microservices", "Kubernetes", "PostgreSQL", "AWS"];
  return skills
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
        <h3>AI Writer / AI كاتب</h3>
        <p class="muted tiny">سيرة وخطاب ومقابلة بالعربية والإنجليزية، ثم DOCX/PDF بعد الاعتماد.</p>
      </div>
      <span class="badge">${esc(provider)}</span>
    </div>
    <div class="field compact-field">
      <label>نموذج AI كاتب</label>
      <select data-ai-writer-model>${modelOptions}</select>
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
          ${ghostDoc("السيرة العربية", kit.ar_resume)}
          ${ghostDoc("English resume", kit.en_resume)}
          ${ghostDoc("خطاب عربي", kit.ar_cover_letter)}
          ${ghostDoc("English cover letter", kit.en_cover_letter)}
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
        <div class="ghostwriter-actions">
          <button class="btn outline" data-export-kit="docx" data-job-id="${esc(job.id)}" ${approved ? "" : "disabled"}>${iconDoc()} DOCX</button>
          <button class="btn outline" data-export-kit="pdf" data-job-id="${esc(job.id)}" ${approved ? "" : "disabled"}>${iconDoc()} PDF</button>
          <button class="btn outline" data-copy-ghostwriter="${esc(job.id)}">${iconDoc()} نسخ</button>
        </div>
        ${renderInterviewChat(job)}`
        : `<div class="empty compact">اضغط AI كاتب لتجهيز نسخة عربية وإنجليزية مخصصة لهذه الوظيفة، مع أسئلة مقابلة وإجابات تدريبية.</div>`
    }
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
    </div>
  </div>`;
}

function ghostDoc(title, body) {
  return `<article class="ghost-doc">
    <h4>${esc(title)}</h4>
    <pre>${esc(body || "لم يتم التوليد بعد.")}</pre>
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
  shell(
    `${banner()}
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
  const iconMode = s.connector_mode === "approved_api" ? "API" : s.connector_mode === "public_html" ? "HTML" : "يدوي";
  return `<div class="kvs">
    <div>
      <h4>${esc(s.label)}</h4>
      <p>${esc(s.region || "مخصص")} · ${s.job_count || 0} وظائف · ${esc(connectorModeLabel(s.connector_mode))}</p>
    </div>
    <div class="right">
      <span class="badge ${s.enabled ? "" : "muted"}">${s.enabled ? "مفعل" : "يحتاج إعداد"}</span>
    </div>
  </div>
  <div class="kvs" style="margin-top:6px">
    <div>
      <h4 style="font-size:12.5px">فحص تلقائي</h4>
      <p>${s.last_scanned_at ? `آخر فحص: ${esc(s.last_scanned_at)}` : "لم يتم الفحص بعد"}</p>
    </div>
    <div class="right">
      ${s.connector_mode === "public_html"
        ? `<button class="btn primary sm" data-scan-source="${esc(s.id)}">${iconBolt()} فحص</button>`
        : `<button class="btn outline sm" disabled>يحتاج API</button>`}
      <label class="toggle"><input type="checkbox" data-source-schedule="${esc(s.id)}" ${s.scheduled ? "checked" : ""}/><span class="slider"></span></label>
      <select data-source-interval="${esc(s.id)}" style="height:32px;border:1px solid var(--line);border-radius:999px;padding:0 8px;font-size:11px">
        <option value="60" ${s.interval_minutes === 60 ? "selected" : ""}>كل ساعة</option>
        <option value="360" ${s.interval_minutes === 360 || !s.interval_minutes ? "selected" : ""}>كل 6 ساعات</option>
        <option value="1440" ${s.interval_minutes === 1440 ? "selected" : ""}>يومياً</option>
      </select>
    </div>
  </div>`;
}

/* ---------------- Account ---------------- */
function renderAccount() {
  const p = state.profile || {};
  const initials = (p.display_name || "J").trim().slice(0, 1);
  const completeness = profileCompleteness(p);
  const resumeReady = originalResumeReady(p);
  shell(
    `${banner()}
    <header class="section" style="padding-top:14px">
      <div class="row account-hero">
        <div class="avatar lg">${esc(initials)}</div>
        <div class="account-title">
          <h1 style="font-size:20px;font-weight:800;color:var(--ink)">${esc(p.display_name || "جابر")}</h1>
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
    ${renderHowItWorks("account")}
    <section class="section">
      <div class="section-block">
        <div class="section-head tight">
          <div>
            <h3>السيرة الأصلية</h3>
            <p class="muted tiny">الصق سيرتك الحالية كاملة هنا. لا تجعلها فقرة مختصرة؛ أضف الخبرات، التعليم، الشهادات، المشاريع، والإنجازات الرقمية.</p>
          </div>
          <span class="badge">${(p.resume_text || "").trim().length} حرف</span>
        </div>
        <div class="form profile-form">
          <div class="field">
            <label>اسم ملف السيرة</label>
            <input data-profile-field="resume_filename" value="${esc(p.resume_filename || "")}" placeholder="jaber-cv.pdf" />
          </div>
          <div class="field">
            <label>لصق السيرة الأصلية</label>
            <textarea class="resume-editor" data-profile-field="resume_text" data-original-resume placeholder="الصق النص الكامل للسيرة هنا... الخبرات، الإنجازات، التعليم، الشهادات، المهارات، واللغات.">${esc(p.resume_text || "")}</textarea>
          </div>
          <div class="row profile-actions">
            <label class="btn outline">
              ${iconDoc()} ملف نصي
              <input type="file" data-resume-file accept=".txt,.md,.text" hidden />
            </label>
            <button class="btn outline" data-profile-autofill>${iconSpark()} استخراج الإشارات</button>
          </div>
        </div>
      </div>
    </section>
    ${renderResumeCoach(p, resumeReady)}
    <section class="section">
      <div class="section-block">
        <h3>إشارات التخصيص</h3>
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
        <h3>Account access</h3>
        <p class="muted tiny">Best-practice sign in uses Google OAuth, secure HttpOnly cookies, and clear terms before storing subscriber data.</p>
      </div>
      <span class="badge ${session.authenticated ? "" : "muted"}">${session.authenticated ? "Signed in" : "Guest"}</span>
    </div>
    ${session.authenticated ? `
      <div class="row account-hero">
        <div class="avatar">${esc((user.name || user.email || "U").slice(0, 1))}</div>
        <div class="account-title">
          <h4>${esc(user.name || "Subscriber")}</h4>
          <p class="muted tiny">${esc(user.email || "")}</p>
        </div>
        <button class="btn outline sm" data-auth-logout>Sign out</button>
      </div>
    ` : `
      <div class="row profile-actions">
        <a class="btn primary" href="/api/auth/google/start">${iconUser()} Continue with Google</a>
        <button class="btn outline" data-nav="/terms">Terms</button>
        <button class="btn outline" data-nav="/privacy">Privacy</button>
      </div>
      ${session.google_configured ? "" : `<div class="empty compact">Google OAuth code is ready. Add Google client ID/secret in Cloudflare to activate sign-in.</div>`}
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
            <h3>AI Resume Coach</h3>
            <p class="muted tiny">Improve and approve the master resume first. Then matching and AI Writer use it as the source of truth.</p>
          </div>
          <span class="badge ${approved ? "" : "muted"}">${approved ? "Master approved" : "Needs approval"}</span>
        </div>
        <div class="resume-flow">
          <span class="${resumeReady ? "done" : ""}">1. Upload</span>
          <span class="${coach ? "done" : ""}">2. Improve</span>
          <span class="${approved ? "done" : ""}">3. Approve</span>
          <span class="${approved ? "done" : ""}">4. Search + tailor</span>
        </div>
        ${resumeReady ? "" : `<div class="empty compact">Paste or import the original resume first. The coach needs real resume text before improving it.</div>`}
        ${coach ? `
          <div class="coach-grid">
            <div>
              <h4>Improved Arabic master resume</h4>
              <pre>${esc(coach.ar_master_resume || "")}</pre>
            </div>
            <div>
              <h4>Improved English master resume</h4>
              <pre>${esc(coach.en_master_resume || "")}</pre>
            </div>
          </div>
          <div class="tags">
            ${titles.slice(0, 6).map((item) => `<span class="tag">${esc(item)}</span>`).join("")}
            ${keywords.slice(0, 8).map((item) => `<span class="tag outline">${esc(item)}</span>`).join("")}
          </div>
          <ul class="coach-list">
            ${improvements.map((item) => `<li>${esc(item)}</li>`).join("")}
          </ul>
          <p class="muted tiny">${esc(coach.approval_note || "Review before approval.")}</p>
        ` : ""}
        <div class="row profile-actions">
          <button class="btn primary" data-resume-coach ${resumeReady ? "" : "disabled"}>${iconSpark()} Improve master resume</button>
          <button class="btn ${approved ? "outline" : "primary"}" data-approve-master-resume ${coach ? "" : "disabled"}>${iconCheck()} ${approved ? "Master approved" : "Approve improved resume"}</button>
          <button class="btn outline" data-search-approved-jobs ${approved ? "" : "disabled"}>${iconBolt()} Search matching jobs</button>
        </div>
      </div>
    </section>`;
}

function renderLegal(page) {
  const isPrivacy = page === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms and Conditions";
  const rows = isPrivacy
    ? [
        ["Data we use", "Resume text, profile fields, job preferences, generated documents, and account identity are used to provide matching and AI Writer features."],
        ["AI processing", "Resume and job content may be sent to configured AI providers only to improve resumes, explain matches, and generate approved application files."],
        ["Storage", "This prototype keeps most subscriber workflow data in browser storage; production account persistence will use durable Cloudflare storage with access controls."],
        ["Control", "Subscribers should review and approve generated resumes before export or application. Do not upload private data you do not want processed."],
      ]
    : [
        ["Subscriber responsibility", "Generated resumes, cover letters, and interview notes are drafts. The subscriber must review facts, dates, credentials, and claims before applying."],
        ["No auto-apply", "The service prepares applications and matching guidance; it does not submit job applications without explicit subscriber action."],
        ["Source access", "Job ingestion uses public pages or approved APIs only. Protected boards require provider-approved credentials."],
        ["Acceptable use", "Do not use the service to fabricate experience, scrape prohibited systems, or submit misleading applications."],
      ];
  shell(
    `${banner()}
    <section class="section" style="padding-top:14px">
      <button class="btn ghost sm" data-nav="/account">${iconBack()} Back</button>
      <div class="section-block legal-panel">
        <h1>${title}</h1>
        <p class="muted">Best-practice baseline for JOBS.wasfai.com subscriber accounts and AI-generated application documents.</p>
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
            body: JSON.stringify({ job, profile: state.profile, ai_model: state.aiWriterModel }),
          }),
      );
      if (kit) {
        state.ghostwriter[jobId] = kit;
        state.approvedKits = { ...(state.approvedKits || {}), [jobId]: false };
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
      }
      render();
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
        "Improving master resume...",
        "Master resume draft is ready for review",
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
        resume_text: `${coach.ar_master_resume || ""}\n\n${coach.en_master_resume || ""}`.trim() || state.profile.resume_text,
      };
      state.approvedMasterResume = true;
      state.action = { pending: "", message: "Approved master resume is now used for matching and AI Writer.", error: "" };
      saveLocalProfile(state.profile);
      saveLocalAiWriterState();
      render();
    });
  }

  const searchApprovedJobs = document.querySelector("[data-search-approved-jobs]");
  if (searchApprovedJobs) {
    searchApprovedJobs.addEventListener("click", async () => {
      if (!masterResumeReady()) return;
      const result = await runAction(
        "live-match",
        "Searching live jobs against the approved resume...",
        "Live matching complete",
        () =>
          apiJson(`${INGESTION_WORKER_URL}/match`, {
            method: "POST",
            body: JSON.stringify({ profile: approvedMatchingProfile(), limit: 40 }),
          }),
      );
      const jobs = Array.isArray(result?.jobs) ? result.jobs.map(importLiveMatchedJob) : [];
      if (jobs.length) {
        const existing = new Map(state.jobs.map((job) => [job.id, job]));
        for (const job of jobs) existing.set(job.id, { ...(existing.get(job.id) || {}), ...job });
        state.jobs = [...existing.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        state.action = { pending: "", message: `Imported ${jobs.length} live jobs matched to the approved resume.`, error: "" };
        navigate("/jobs");
        return;
      }
      state.action = { pending: "", message: "", error: "No clean live jobs matched the approved resume yet. Try another source or scan again." };
      render();
    });
  }

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

  const resumeFile = document.querySelector("[data-resume-file]");
  if (resumeFile) {
    resumeFile.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text().catch(() => "");
      state.profile = {
        ...(state.profile || {}),
        resume_filename: file.name,
        resume_text: text || state.profile.resume_text || "",
      };
      state.approvedMasterResume = false;
      if (!text) {
        state.action = { pending: "", message: "", error: "تعذر قراءة الملف. الصق نص السيرة يدوياً أو استخدم ملف TXT/MD." };
      } else {
        state.action = { pending: "", message: "تم إدخال نص السيرة من الملف", error: "" };
      }
      render();
    });
  }

  const autofillProfile = document.querySelector("[data-profile-autofill]");
  if (autofillProfile) {
    autofillProfile.addEventListener("click", () => {
      const signals = inferResumeSignals(state.profile?.resume_text || "");
      state.profile = {
        ...(state.profile || {}),
        ...Object.fromEntries(
          Object.entries(signals).filter(([, value]) => String(value || "").trim()),
        ),
      };
      state.action = { pending: "", message: "تم استخراج الإشارات من السيرة", error: "" };
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
  if (r.name === "legal") return renderLegal(r.page);
  if (r.name === "results") return renderResults();
  return renderSearch();
}

/* ---------------- Init ---------------- */
async function init() {
  try {
    const response = await fetch("/api/bootstrap");
    if (!response.ok) throw new Error("bootstrap failed");
    const data = await response.json();
    state = { ...state, ...data };
  } catch (error) {
    // Demo fallback when backend is unavailable
    state = {
      ...state,
      jobs: demoJobs(),
      sources: demoSources(),
    };
  }
  const localProfile = loadLocalProfile();
  if (localProfile) {
    state.profile = { ...(state.profile || {}), ...localProfile };
  }
  const localAiWriter = loadLocalAiWriterState();
  if (localAiWriter) {
    state.aiWriterModel = localAiWriter.aiWriterModel || state.aiWriterModel;
    state.approvedKits = localAiWriter.approvedKits || state.approvedKits;
    state.interviewChats = localAiWriter.interviewChats || state.interviewChats;
    state.resumeCoach = localAiWriter.resumeCoach || state.resumeCoach;
    state.approvedMasterResume = Boolean(localAiWriter.approvedMasterResume);
  }
  try {
    const sessionResponse = await fetch("/api/auth/session");
    if (sessionResponse.ok) state.session = await sessionResponse.json();
  } catch {
    state.session = { authenticated: false, user: null, google_configured: false };
  }
  if (location.pathname === "/") history.replaceState(null, "", "/app");
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

function demoJobs() {
  return [
    { id: "demo-1", title: "مهندس برمجيات Rust أول", employer: "شركة ركن", source: "linkedin", location: "الرياض، السعودية", score: 92, status: "ready", deadline: "2026-07-18", description: "العمل على بنية الخدمات الخلفية بـ Rust وتطوير واجهات API لمنصة إقليمية.", tailored_resume: "سيرة مخصصة تبرز خبرة Rust وقابلية التوسع.", cover_letter: "خطاب متابعة مهني.", fit_explanation: "تطابق قوي في Rust, AWS, Microservices.", timeline: [] },
    { id: "demo-2", title: "Full Stack Engineer", employer: "مختبرات صباح", source: "wazzuf", location: "دبي، الإمارات", score: 78, status: "processing", deadline: "2026-07-25", description: "العمل على واجهات React وخدمات Node.", tailored_resume: "", cover_letter: "", fit_explanation: "تطابق متوسط.", timeline: [] },
    { id: "demo-3", title: "Full Stack Developer", employer: "كايرو كلاود", source: "khamsat", location: "القاهرة، مصر", score: 65, status: "discovered", deadline: "2026-07-30", description: "تطوير تطبيقات SaaS للقطاع المالي.", tailored_resume: "", cover_letter: "", fit_explanation: "", timeline: [] },
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
