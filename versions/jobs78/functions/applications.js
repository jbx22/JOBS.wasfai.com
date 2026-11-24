import { candidateLanguage, page, loginGate } from "./_recruitment_page.js";

export function onRequestGet(context) {
  const lang = candidateLanguage(context?.request);
  const en = lang === "en";
  const path = "/applications";
  return page(en ? "My applications" : "طلباتي", `<p class="candidate-intro">${en ? "Track applications you sent to employers through Jobs Wasfai." : "تابع الطلبات التي أرسلتها إلى أصحاب العمل عبر وظائف وصفي."}</p>
    <div data-portal-gate hidden>${loginGate(path + (en ? "?lang=en" : ""), lang)}</div>
    <p data-candidate-loading role="status">${en ? "Loading your applications…" : "جارٍ تحميل طلباتك…"}</p>
    <section class="recruitment-card" data-candidate-dashboard hidden aria-label="${en ? "Application history" : "سجل الطلبات"}"><div data-my-applications></div></section>`,
    { path, lang, private: true });
}
