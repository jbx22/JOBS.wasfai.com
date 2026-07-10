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
        <button class="btn primary" data-generate="${esc(job.id)}">${iconSpark()} توليد سيرة</button>
        <button class="btn outline" data-generate-package="${esc(job.id)}">${iconDoc()} تجهيز الحزمة</button>
      </div>
    </div>
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
  const rows = [
    { ico: "📁", title: p.resume_filename || "resume.pdf", sub: p.resume_skills || "لم يتم رفع سيرة بعد" },
    { ico: "🎯", title: p.target_roles || "حدد الأدوار المستهدفة", sub: "الأدوار التي يبحث عنها المساعد" },
    { ico: "🌍", title: p.target_locations || "حدد مواقع البحث", sub: p.resume_regions || "MENA, Saudi Arabia, UAE" },
    { ico: "🗣", title: "اللغة: " + (p.preferred_language === "ar" ? "العربية" : "English"), sub: p.resume_languages || "Arabic, English" },
    { ico: "🏆", title: "مستوى الخبرة: " + (p.resume_seniority || "Senior"), sub: "يستخدم في تقييم المطابقة" },
  ];
  shell(
    `${banner()}
    <header class="section" style="padding-top:14px">
      <div class="row" style="gap:14px">
        <div class="avatar lg">${esc(initials)}</div>
        <div>
          <h1 style="font-size:20px;font-weight:800;color:var(--ink)">${esc(p.display_name || "جابر")}</h1>
          <p class="muted tiny" style="margin-top:2px">${esc(p.target_roles || "")}</p>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="list-rows">
        ${rows.map((r) => `<div class="row-item"><span class="ico">${r.ico}</span><div><strong>${esc(r.title)}</strong><small>${esc(r.sub)}</small></div><span class="badge muted">›</span></div>`).join("")}
      </div>
    </section>
    <section class="section">
      <div class="section-block">
        <h3>إجراءات سريعة</h3>
        <div class="row">
          <button class="btn primary" data-nav="/settings">${iconCog()} المصادر</button>
          <button class="btn outline" data-nav="/results">${iconChart()} النتائج</button>
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
