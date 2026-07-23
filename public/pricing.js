"use strict";

const root = document.getElementById("pricing-root");
const FALLBACK_PLANS = [
  {
    id: "free",
    name: "Free",
    name_ar: "المجاني",
    price_sar: 0,
    billing: "monthly",
    limits: { saved_jobs: 10, ai_matches_per_month: 20, application_kits_per_month: 2, resume_improvements_per_month: 1 },
    features: ["1 resume profile", "10 saved jobs", "20 AI matches per month", "2 AI application kits per month", "Basic application tracker"],
  },
  {
    id: "gold_monthly",
    name: "Gold",
    name_ar: "الذهبي",
    price_sar: 50,
    billing: "monthly",
    limits: { saved_jobs: 300, ai_matches_per_month: 200, application_kits_per_month: 30, resume_improvements_per_month: 12 },
    features: ["3 resume profiles", "300 saved jobs", "200 AI matches per month", "30 bilingual application kits per month", "Resume improvement and tailoring", "Interview coach", "PDF/DOCX exports", "Follow-up reminders"],
  },
  {
    id: "gold_annual",
    name: "Gold Annual",
    name_ar: "الذهبي السنوي",
    price_sar: 499,
    billing: "yearly",
    limits: { saved_jobs: 300, ai_matches_per_month: 200, application_kits_per_month: 30, resume_improvements_per_month: 12 },
    features: ["Everything in Gold", "Annual discount", "Best value for active job seekers", "Priority usage review"],
  },
];
const PLAN_COPY = {
  ar: {
    free: {
      name: "المجاني",
      features: ["ملف سيرة واحد", "10 وظائف محفوظة", "20 مطابقة ذكية شهريا", "حزمتا تقديم شهريا", "متابعة طلبات أساسية"],
    },
    gold_monthly: {
      name: "الذهبي",
      features: ["3 ملفات سيرة", "300 وظيفة محفوظة", "200 مطابقة ذكية شهريا", "30 حزمة تقديم عربية/إنجليزية شهريا", "تحسين وتخصيص السيرة", "مدرب مقابلات", "تصدير PDF/DOCX", "تذكيرات متابعة"],
    },
    gold_annual: {
      name: "الذهبي السنوي",
      features: ["كل مزايا الذهبي", "خصم سنوي", "أفضل قيمة للباحث الجاد", "مراجعة أولوية للاستخدام"],
    },
  },
};

const TEXT = {
  en: {
    title: "Choose the AI job-search package that matches your pace.",
    subtitle: "Start free with limited AI usage, or move to Gold for serious applications, bilingual kits, resume tailoring, and interview coaching.",
    eyebrow: "Simple launch pricing",
    brandSub: "AI job-search subscriptions",
    openApp: "Open app",
    signIn: "Sign in",
    currentPlan: "Current plan",
    freeNote: "Free plan available. Gold is SAR 50/month.",
    recommended: "Recommended",
    chooseGold: "Choose Gold",
    startFree: "Start free",
    currentButton: "Current plan",
    month: "month",
    year: "year",
    aiMatches: "AI matches / month",
    kits: "Application kits",
    resumeImprovements: "Resume improvements",
    savedJobs: "Saved jobs",
    unavailable: "Live subscription status is unavailable, but plan details are shown.",
    vatQ: "Is SAR 50 VAT-inclusive?",
    vatA: "Recommended launch display is SAR 50/month VAT-inclusive. Checkout wording can be adjusted once payment is connected.",
    paymentQ: "What happens when Gold is selected?",
    paymentA: "The request is saved as pending payment. Connect Moyasar, Stripe, or manual activation next.",
    freeQ: "Why keep a Free plan?",
    freeA: "It lets users test matching and AI kits, while the limits naturally push active job seekers to Gold.",
    toggle: "العربية",
  },
  ar: {
    title: "اختر باقة البحث عن الوظائف بالذكاء الاصطناعي حسب سرعة استخدامك.",
    subtitle: "ابدأ مجانا باستخدام محدود، أو انتقل إلى الذهبي للطلبات الجادة، حزم التقديم العربية والإنجليزية، تخصيص السيرة، وتدريب المقابلات.",
    eyebrow: "باقات إطلاق بسيطة",
    brandSub: "اشتراكات مساعد البحث عن الوظائف",
    openApp: "فتح التطبيق",
    signIn: "تسجيل الدخول",
    currentPlan: "الباقة الحالية",
    freeNote: "الباقة المجانية متاحة. الذهبي 50 ريال شهريا.",
    recommended: "الأفضل",
    chooseGold: "اختر الذهبي",
    startFree: "ابدأ مجانا",
    currentButton: "الباقة الحالية",
    month: "شهر",
    year: "سنة",
    aiMatches: "مطابقة ذكية / شهر",
    kits: "حزم تقديم",
    resumeImprovements: "تحسينات السيرة",
    savedJobs: "وظائف محفوظة",
    unavailable: "حالة الاشتراك المباشرة غير متاحة الآن، لكن تفاصيل الباقات ظاهرة.",
    vatQ: "هل 50 ريال شاملة الضريبة؟",
    vatA: "الأفضل في الإطلاق عرضها 50 ريال شهريا شاملة الضريبة. يمكن تعديل نص الدفع عند ربط بوابة الدفع.",
    paymentQ: "ماذا يحدث عند اختيار الذهبي؟",
    paymentA: "يتم حفظ الطلب كاشتراك بانتظار الدفع. الخطوة التالية ربط مدى/مويَسّر أو Stripe أو التفعيل اليدوي.",
    freeQ: "لماذا نبقي الباقة المجانية؟",
    freeA: "تسمح للمستخدم بتجربة المطابقة والحزم، ثم تدفع الحدود المستخدم الجاد للترقية إلى الذهبي.",
    toggle: "English",
  },
};

const state = { plans: [], current: null, authenticated: false, user: null, message: "", error: "", locale: loadLocale() };

init();

async function init() {
  try {
    const data = await api("/api/subscriptions");
    Object.assign(state, data);
  } catch (error) {
    state.plans = FALLBACK_PLANS;
    state.error = text("unavailable");
  }
  render();
}

function render() {
  document.documentElement.lang = state.locale;
  document.documentElement.dir = state.locale === "ar" ? "rtl" : "ltr";
  root.innerHTML = `
    <header class="pricing-top">
      <a class="brand" href="/app">
        <img src="/brand-logo-192.png" alt="JOBS.wasfai.com">
        <span><strong>JOBS.wasfai.com</strong><small>${esc(text("brandSub"))}</small></span>
      </a>
      <div class="top-actions">
        <button class="btn" data-toggle-locale>${esc(text("toggle"))}</button>
        <a class="btn" href="/app">${esc(text("openApp"))}</a>
        ${state.authenticated ? `<a class="btn" href="/account">${esc(state.user?.email || "Account")}</a>` : `<a class="btn primary" href="/api/auth/google/start?next=%2Fpricing%2F">${esc(text("signIn"))}</a>`}
      </div>
    </header>
    <section class="hero">
      <span class="eyebrow">${esc(text("eyebrow"))}</span>
      <h1>${esc(text("title"))}</h1>
      <p>${esc(text("subtitle"))}</p>
      <span class="status-note">${state.current ? `${esc(text("currentPlan"))}: ${esc(planName(state.current.plan))} · ${esc(state.current.status)}` : esc(text("freeNote"))}</span>
    </section>
    ${state.message ? `<div class="message">${esc(state.message)}</div>` : ""}
    ${state.error ? `<div class="message error">${esc(state.error)}</div>` : ""}
    <section class="plans">
      ${state.plans.map(renderPlan).join("")}
    </section>
    <section class="faq">
      <article><h3>${esc(text("vatQ"))}</h3><p>${esc(text("vatA"))}</p></article>
      <article><h3>${esc(text("paymentQ"))}</h3><p>${esc(text("paymentA"))}</p></article>
      <article><h3>${esc(text("freeQ"))}</h3><p>${esc(text("freeA"))}</p></article>
    </section>`;
  bind();
}

function renderPlan(plan) {
  const current = state.current?.plan === plan.id;
  const featured = plan.id === "gold_monthly";
  return `
    <article class="plan-card ${featured ? "featured" : ""}">
      ${featured ? `<span class="popular">${esc(text("recommended"))}</span>` : ""}
      <div class="plan-head">
        <h2>${esc(localPlanName(plan))}</h2>
        <small>${state.locale === "ar" ? esc(plan.name) : esc(plan.name_ar || "")}</small>
        <div class="price"><strong>${plan.price_sar ? esc(plan.price_sar) : "0"}</strong><span>${state.locale === "ar" ? "ريال" : "SAR"} / ${plan.billing === "yearly" ? esc(text("year")) : esc(text("month"))}</span></div>
      </div>
      <div class="limits">
        ${limit(plan.limits.ai_matches_per_month, text("aiMatches"))}
        ${limit(plan.limits.application_kits_per_month, text("kits"))}
        ${limit(plan.limits.resume_improvements_per_month, text("resumeImprovements"))}
        ${limit(plan.limits.saved_jobs, text("savedJobs"))}
      </div>
      <ul class="features">${planFeatures(plan).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <button class="btn ${featured ? "gold" : "primary"}" data-select-plan="${esc(plan.id)}" ${current ? "disabled" : ""}>
        ${current ? esc(text("currentButton")) : plan.id === "free" ? esc(text("startFree")) : esc(text("chooseGold"))}
      </button>
    </article>`;
}

function limit(value, label) {
  return `<div class="limit"><strong>${Number(value || 0).toLocaleString()}</strong><small>${esc(label)}</small></div>`;
}

function bind() {
  const toggle = document.querySelector("[data-toggle-locale]");
  if (toggle) toggle.addEventListener("click", toggleLocale);
  document.querySelectorAll("[data-select-plan]").forEach((button) => {
    button.addEventListener("click", () => selectPlan(button.dataset.selectPlan));
  });
}

async function selectPlan(plan) {
  state.message = "";
  state.error = "";
  if (!state.authenticated) {
    location.href = "/api/auth/google/start?next=%2Fpricing%2F";
    return;
  }
  try {
    const data = await api("/api/subscriptions", { method: "POST", body: { plan } });
    state.current = data.current;
    state.message = data.message || "Subscription updated.";
  } catch (error) {
    state.error = error.message || "Could not update subscription.";
  }
  render();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function planName(id) {
  const plan = state.plans.find((item) => item.id === id);
  return plan ? localPlanName(plan) : id || "Free";
}

function localPlanName(plan) {
  if (state.locale === "ar") return PLAN_COPY.ar[plan.id]?.name || plan.name_ar || plan.name;
  return plan.name || plan.id;
}

function planFeatures(plan) {
  if (state.locale === "ar") return PLAN_COPY.ar[plan.id]?.features || plan.features || [];
  return plan.features || [];
}

function text(key) {
  return TEXT[state.locale]?.[key] || TEXT.en[key] || key;
}

function loadLocale() {
  try {
    return localStorage.getItem("jobs.wasfai.pricing.locale") === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

function toggleLocale() {
  state.locale = state.locale === "ar" ? "en" : "ar";
  try { localStorage.setItem("jobs.wasfai.pricing.locale", state.locale); } catch {}
  render();
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
