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
const state = { plans: [], current: null, authenticated: false, user: null, message: "", error: "" };

init();

async function init() {
  try {
    const data = await api("/api/subscriptions");
    Object.assign(state, data);
  } catch (error) {
    state.plans = FALLBACK_PLANS;
    state.error = "Live subscription status is unavailable, but plan details are shown.";
  }
  render();
}

function render() {
  root.innerHTML = `
    <header class="pricing-top">
      <a class="brand" href="/app">
        <img src="/brand-logo-192.png" alt="JOBS.wasfai.com">
        <span><strong>JOBS.wasfai.com</strong><small>AI job-search subscriptions</small></span>
      </a>
      <div class="top-actions">
        <a class="btn" href="/app">Open app</a>
        ${state.authenticated ? `<a class="btn" href="/account">${esc(state.user?.email || "Account")}</a>` : `<a class="btn primary" href="/api/auth/google/start?next=%2Fpricing%2F">Sign in</a>`}
      </div>
    </header>
    <section class="hero">
      <span class="eyebrow">Simple launch pricing</span>
      <h1>Choose the AI job-search package that matches your pace.</h1>
      <p>Start free with limited AI usage, or move to Gold for serious applications, bilingual kits, resume tailoring, and interview coaching.</p>
      <span class="status-note">${state.current ? `Current plan: ${esc(planName(state.current.plan))} · ${esc(state.current.status)}` : "Free plan available. Gold is SAR 50/month."}</span>
    </section>
    ${state.message ? `<div class="message">${esc(state.message)}</div>` : ""}
    ${state.error ? `<div class="message error">${esc(state.error)}</div>` : ""}
    <section class="plans">
      ${state.plans.map(renderPlan).join("")}
    </section>
    <section class="faq">
      <article><h3>Is SAR 50 VAT-inclusive?</h3><p>Recommended launch display is SAR 50/month VAT-inclusive. Checkout wording can be adjusted once payment is connected.</p></article>
      <article><h3>What happens when Gold is selected?</h3><p>The request is saved as pending payment. Connect Moyasar, Stripe, or manual activation next.</p></article>
      <article><h3>Why keep a Free plan?</h3><p>It lets users test matching and AI kits, while the limits naturally push active job seekers to Gold.</p></article>
    </section>`;
  bind();
}

function renderPlan(plan) {
  const current = state.current?.plan === plan.id;
  const featured = plan.id === "gold_monthly";
  return `
    <article class="plan-card ${featured ? "featured" : ""}">
      ${featured ? `<span class="popular">Recommended</span>` : ""}
      <div class="plan-head">
        <h2>${esc(plan.name)}</h2>
        <small>${esc(plan.name_ar || "")}</small>
        <div class="price"><strong>${plan.price_sar ? esc(plan.price_sar) : "0"}</strong><span>SAR / ${plan.billing === "yearly" ? "year" : "month"}</span></div>
      </div>
      <div class="limits">
        ${limit(plan.limits.ai_matches_per_month, "AI matches / month")}
        ${limit(plan.limits.application_kits_per_month, "Application kits")}
        ${limit(plan.limits.resume_improvements_per_month, "Resume improvements")}
        ${limit(plan.limits.saved_jobs, "Saved jobs")}
      </div>
      <ul class="features">${(plan.features || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
      <button class="btn ${featured ? "gold" : "primary"}" data-select-plan="${esc(plan.id)}" ${current ? "disabled" : ""}>
        ${current ? "Current plan" : plan.id === "free" ? "Start free" : "Choose Gold"}
      </button>
    </article>`;
}

function limit(value, label) {
  return `<div class="limit"><strong>${Number(value || 0).toLocaleString()}</strong><small>${esc(label)}</small></div>`;
}

function bind() {
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
  return state.plans.find((plan) => plan.id === id)?.name || id || "Free";
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
