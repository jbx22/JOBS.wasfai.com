import { escapeHtml as e } from "./api/_public_jobs.js";

export function candidateLanguage(request) {
  return request && new URL(request.url).searchParams.get("lang") === "en" ? "en" : "ar";
}

export function catalogueQuery(searchParams, lang) {
  const result = new URLSearchParams();
  if (lang === "en") result.set("lang", "en");
  for (const key of ["q", "city", "profession", "min_salary", "experience", "sector", "page"]) {
    const value = searchParams?.get(key);
    if (value) result.set(key, value);
  }
  return result.size ? "?" + result.toString() : "";
}

export function page(title, content, options = {}) {
  const path = options.path || "/vacancies";
  const canonical = "https://jobs.wasfai.com" + path;
  const en = options.lang === "en";
  const schema = options.schema ? '<script type="application/ld+json">' + JSON.stringify(options.schema).replace(/</g, "\\u003c") + "</script>" : "";
  const navigation = options.lang
    ? `<a href="/vacancies${e(catalogueQuery(options.searchParams, options.lang))}">${en ? "Browse jobs" : "تصفح الوظائف"}</a><a href="/applications${en ? "?lang=en" : ""}">${en ? "My applications" : "طلباتي"}</a><a href="${e(path + catalogueQuery(options.searchParams, en ? "ar" : "en"))}" hreflang="${en ? "ar" : "en"}" lang="${en ? "ar" : "en"}">${en ? "العربية" : "English"}</a>`
    : '<a href="/vacancies">الوظائف العامة</a><a href="/employers">أصحاب العمل</a><a href="/applications">طلباتي</a><a href="/account">حسابي</a>';
  return new Response(`<!doctype html><html lang="${en ? "en" : "ar"}" dir="${en ? "ltr" : "rtl"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(title)} | JOBS.wasfai.com</title><meta name="description" content="${e(options.description || (en ? "Job openings and applications on Jobs Wasfai." : "فرص عمل موثقة ومساحة توظيف لأصحاب العمل والباحثين عن عمل."))}">
  <meta name="robots" content="${options.private ? "noindex,nofollow" : "index,follow"}">
  <link rel="canonical" href="${e(canonical)}"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/recruitment.css">
  ${schema}<script src="/recruitment.js" defer></script></head><body>
  <div class="recruitment-shell${options.lang ? " candidate-page" : ""}"><header class="recruitment-header"><a href="/app" class="recruitment-brand">JOBS<span>.wasfai.com</span></a>
  <nav aria-label="${en ? "Navigation" : "التنقل"}">${navigation}</nav></header>
  <main><h1 dir="auto">${e(title)}</h1><p id="recruitment-feedback" role="status" aria-live="polite"></p>${content}</main>
  <footer><a href="/app">${en ? "My workspace" : "العودة لمساحتي"}</a><span>JOBS.wasfai.com${options.lang ? "" : " · التوظيف بثقة"}</span></footer></div></body></html>`, {
    status: options.status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(options.status >= 500 ? { "Retry-After": "60" } : {}) },
  });
}

export function loginGate(next, lang = "ar") {
  const en = lang === "en";
  return `<section class="recruitment-card"><h2>${en ? "Sign in" : "تسجيل الدخول"}</h2><p>${en ? "Sign in with Google to see your applications." : "سجل بحساب Google لحفظ بياناتك ومتابعة طلبات التوظيف."}</p>
  <label class="consent-line"><input type="checkbox" data-login-terms><span>${en ? 'I agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.' : 'أوافق على <a href="/terms">الشروط</a> و<a href="/privacy">سياسة الخصوصية</a>.'}</span></label>
  <a class="btn primary" data-portal-login data-next="${e(next)}" aria-disabled="true">${en ? "Continue with Google" : "المتابعة بحساب Google"}</a></section>`;
}

export function problem(error, options = {}) {
  const status = error?.status === 400 ? 400 : 503;
  const en = options.lang === "en";
  return page(status === 400 ? (en ? "Invalid search options" : "خيارات البحث غير صالحة") : (en ? "Service temporarily unavailable" : "الخدمة غير متاحة مؤقتاً"), en ? "<p>Please try again shortly.</p>" : "<p>يرجى المحاولة مرة أخرى بعد قليل.</p>", { ...options, private: true, status });
}
