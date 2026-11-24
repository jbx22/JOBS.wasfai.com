import { escapeHtml as e, listPublicJobs } from "../api/_public_jobs.js";
import { candidateLanguage, catalogueQuery, page, problem } from "../_recruitment_page.js";

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const filters = Object.fromEntries(searchParams);
  const lang = candidateLanguage(context.request);
  const text = (en, ar) => lang === "en" ? en : ar;
  const pageNumber = Math.max(1, Math.min(Math.trunc(Number(filters.page)) || 1, 20000));
  const path = "/vacancies";
  const options = { path, lang, searchParams, private: searchParams.size > 0 };
  try {
    const jobs = await listPublicJobs(context.env, filters, 41, (pageNumber - 1) * 40);
    const url = (changes = {}) => {
      const params = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, String(value));
        else params.delete(key);
      }
      return e(path + catalogueQuery(params, lang));
    };
    const field = (key, label, type = "text") => `<label>${label}<input name="${key}" type="${type}" value="${e(filters[key] || "")}" ${type === "number" ? 'min="0"' : ""}></label>`;
    const government = filters.sector === "government";
    const results = jobs.slice(0, 40).map((job) => {
      const detail = e(path + "/" + encodeURIComponent(job.public_id) + catalogueQuery(searchParams, lang));
      const source = job.government ? text("Official government portal", "بوابة حكومية رسمية") : job.kind === "employer" ? text("Verified employer posting", "إعلان شركة مراجعة") : text("External posting", "فرصة من مصدر خارجي");
      return `<article class="recruitment-card"><h2 dir="auto"><a href="${detail}">${e(job.title)}</a></h2>
        <p dir="auto">${e(job.company_name)} · ${e(job.city)}</p><p class="muted">${source}</p>
        <a class="btn ghost" href="${detail}">${text("View details and apply", "التفاصيل والتقديم")}</a></article>`;
    }).join("");
    const advanced = !!(filters.profession || filters.min_salary || filters.experience);
    const content = `<form class="recruitment-card recruitment-grid catalogue-form" action="/vacancies" method="GET">
      ${lang === "en" ? '<input type="hidden" name="lang" value="en">' : ""}
      ${field("q", text("Job title or keyword", "المسمى أو الكلمة"))}${field("city", text("City", "المدينة"))}
      <details class="catalogue-more" ${advanced ? "open" : ""}><summary>${text("More filters", "مرشحات إضافية")}</summary><div class="recruitment-grid">${field("profession", text("Profession", "المهنة"))}
      ${field("min_salary", text("Minimum salary · SAR/month", "الحد الأدنى للراتب · ر.س/شهر"), "number")}${field("experience", text("My years of experience", "خبرتي بالسنوات"), "number")}</div></details>
      ${filters.sector ? '<input type="hidden" name="sector" value="' + e(filters.sector) + '">' : ""}
      <button class="btn primary">${text("Search", "بحث")}</button></form>
      <nav class="recruitment-actions" aria-label="${text("Job sector", "قطاع الوظائف")}">
        <a class="btn ghost" href="${url({ sector: null, page: null })}" ${!filters.sector ? 'aria-current="page"' : ""}>${text("All jobs", "كل الوظائف")}</a>
        <a class="btn ghost" href="${url({ sector: "government", page: null })}" ${government ? 'aria-current="page"' : ""}>${text("Saudi government jobs", "وظائف حكومية سعودية")}</a>
        <a class="btn ghost" href="https://jadarat.sa/" target="_blank" rel="noopener noreferrer">${text("Open Jadarat", "الانتقال إلى جدارات")}</a>
      </nav>
      <p class="muted">${text("We review employers and their postings. External vacancies link to the original source. Salary and experience filters apply to postings that disclose those details.", "تظهر فرص أصحاب العمل بعد مراجعة الشركة والإعلان. الفرص الخارجية مرتبطة بمصدرها. مرشحا الراتب والخبرة يعرضان الإعلانات التي توضح هذه البيانات.")}</p>
      <div class="recruitment-list">${results || '<section class="recruitment-card"><p>' + text("No vacancies match these filters. Try changing your search.", "لا توجد فرص مطابقة حالياً. جرّب تعديل المرشحات.") + '</p></section>'}</div>`;
    const pageLink = (num, label) => '<a class="btn ghost" href="' + url({ page: num === 1 ? null : num }) + '">' + label + '</a>';
    const paging = (pageNumber > 1 ? pageLink(pageNumber - 1, text("Previous", "السابق")) : "") + (jobs.length > 40 ? pageLink(pageNumber + 1, text("Next", "التالي")) : "");
    return page(text("Open vacancies", "الوظائف المتاحة"), content + (paging ? '<nav class="recruitment-actions" aria-label="' + text("Results pages", "صفحات النتائج") + '">' + paging + '</nav>' : ""), options);
  } catch (error) { return problem(error, options); }
}
