import { escapeHtml as e } from "./api/_public_jobs.js";

export function page(title, content, options = {}) {
  const canonical = "https://jobs.wasfai.com" + (options.path || "/vacancies");
  const schema = options.schema ? '<script type="application/ld+json">' + JSON.stringify(options.schema).replace(/</g, "\\u003c") + "</script>" : "";
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(title)} | JOBS.wasfai.com</title><meta name="description" content="${e(options.description || "فرص عمل موثقة ومساحة توظيف لأصحاب العمل والباحثين عن عمل.")}">
  <meta name="robots" content="${options.private ? "noindex,nofollow" : "index,follow"}">
  <link rel="canonical" href="${e(canonical)}"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/recruitment.css">
  ${schema}<script src="/recruitment.js" defer></script></head><body>
  <div class="recruitment-shell"><header class="recruitment-header"><a href="/app" class="recruitment-brand">JOBS<span>.wasfai.com</span></a>
  <nav aria-label="التنقل"><a href="/vacancies">الوظائف العامة</a><a href="/employers">أصحاب العمل</a><a href="/applications">طلباتي</a><a href="/account">حسابي</a></nav></header>
  <main><h1>${e(title)}</h1><p id="recruitment-feedback" role="status" aria-live="polite"></p>${content}</main>
  <footer><a href="/app">العودة لمساحتي</a><span>JOBS.wasfai.com · التوظيف بثقة</span></footer></div></body></html>`, {
    status: options.status || 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(options.status >= 500 ? { "Retry-After": "60" } : {}) },
  });
}

export function loginGate(next) {
  return `<section class="recruitment-card"><h2>تسجيل الدخول</h2><p>سجل بحساب Google لحفظ بياناتك ومتابعة طلبات التوظيف.</p>
  <label><input type="checkbox" data-login-terms> أوافق على <a href="/terms">الشروط</a> و<a href="/privacy">الخصوصية</a>.</label>
  <a class="btn primary" data-portal-login data-next="${e(next)}" aria-disabled="true">المتابعة بحساب Google</a></section>`;
}

export function problem(error) {
  const status = error?.status === 400 ? 400 : 503;
  return page(status === 400 ? "خيارات البحث غير صالحة" : "الخدمة غير متاحة مؤقتاً", "<p>يرجى المحاولة مرة أخرى بعد قليل.</p>", { private: true, status });
}
