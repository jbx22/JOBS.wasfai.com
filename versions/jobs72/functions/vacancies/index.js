import { escapeHtml as e, listPublicJobs } from "../api/_public_jobs.js";
import { page, problem } from "../_recruitment_page.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const filters = Object.fromEntries(url.searchParams);
  const pageNumber = Math.max(1, Math.min(Number(filters.page) || 1, 20000));
  try {
    const jobs = await listPublicJobs(context.env, filters, 41, (pageNumber - 1) * 40);
    const more = jobs.length > 40;
    const input = (key, label, type = "text") => `<label>${label}<input name="${key}" type="${type}" value="${e(filters[key] || "")}" ${type === "number" ? 'min="0"' : ""}></label>`;
    const content = `<form class="recruitment-card recruitment-grid" action="/vacancies" method="GET">
      ${input("q", "المسمى أو الكلمة")}${input("city", "المدينة")}${input("profession", "المهنة")}
      ${input("min_salary", "الحد الأدنى للراتب · ر.س/شهر", "number")}${input("experience", "خبرتي بالسنوات", "number")}
      ${filters.sector === "government" ? '<input type="hidden" name="sector" value="government">' : ""}
      <button class="btn primary">بحث</button></form>
      <nav class="recruitment-actions" aria-label="قطاع الوظائف">
        <a class="btn ghost" href="/vacancies" ${filters.sector === "government" ? "" : 'aria-current="page"'}>كل الوظائف</a>
        <a class="btn ghost" href="/vacancies?sector=government" ${filters.sector === "government" ? 'aria-current="page"' : ""}>وظائف حكومية سعودية</a>
        <a class="btn ghost" href="https://jadarat.sa/" target="_blank" rel="noopener noreferrer">الانتقال إلى جدارات</a>
      </nav>
      <p class="muted">تظهر فرص أصحاب العمل بعد مراجعة الشركة والإعلان. الفرص الخارجية مرتبطة بمصدرها. مرشحا الراتب والخبرة يعرضان الإعلانات التي توضح هذه البيانات.</p>
      <div class="recruitment-list">${jobs.slice(0, 40).map((job) => `<article class="recruitment-card">
        <h2><a href="/vacancies/${encodeURIComponent(job.public_id)}">${e(job.title)}</a></h2>
        <p>${e(job.company_name)} · ${e(job.city)}</p>
        <p class="muted">${job.government ? "بوابة حكومية رسمية" : job.kind === "employer" ? "إعلان شركة مراجعة" : "فرصة من مصدر خارجي"}</p>
        <a class="btn ghost" href="/vacancies/${encodeURIComponent(job.public_id)}">التفاصيل والتقديم</a></article>`).join("") || '<section class="recruitment-card"><p>لا توجد فرص مطابقة حالياً. جرّب تعديل المرشحات.</p></section>'}</div>`;
    const paging = new URLSearchParams(url.searchParams);
    const link = (num, label) => { paging.set("page", String(num)); return '<a class="btn ghost" href="/vacancies?' + e(paging) + '">' + label + "</a>"; };
    return page("الوظائف المتاحة", content + '<nav class="recruitment-actions">' + (pageNumber > 1 ? link(pageNumber - 1, "السابق") : "") + (more ? link(pageNumber + 1, "التالي") : "") + "</nav>", { path: "/vacancies", private: url.searchParams.size > 0 });
  } catch (error) { return problem(error); }
}
