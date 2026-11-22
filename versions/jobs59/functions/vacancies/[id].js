import { escapeHtml as e, getPublicJob, jobPosting, plainDescription, sourceLink } from "../api/_public_jobs.js";
import { page, problem } from "../_recruitment_page.js";

export async function onRequestGet(context) {
  try {
    const job = await getPublicJob(context.env, context.params.id);
    if (!job) return page("الوظيفة غير متاحة", '<p>قد يكون الإعلان منتهياً أو مغلقاً.</p><a class="btn primary" href="/vacancies">تصفح الوظائف المتاحة</a>', { status: 404, private: true });
    const salary = job.salary_min !== null || job.salary_max !== null
      ? [job.salary_min, job.salary_max].filter((v) => v !== null).map((v) => Number(v).toLocaleString("en-US")).join(" – ") + " ر.س/شهر" : "الراتب غير معلن";
    const external = sourceLink(job.source_url);
    const action = job.kind === "employer" ? `<section class="recruitment-card" data-apply-job="${e(job.id)}"><h2>التقديم على الوظيفة</h2><p data-apply-status>جارٍ التحقق من حسابك…</p></section>`
      : external ? `<a class="btn primary" href="${e(external)}" target="_blank" rel="noopener noreferrer nofollow">التقديم لدى المصدر</a>` : "<p>رابط التقديم غير متاح حالياً.</p>";
    return page(job.title, `<article class="recruitment-card"><h2>${e(job.company_name)}</h2>
      <p>${e(job.city)}${job.country_code ? " · " + e(job.country_code) : ""}</p><p>${e(salary)}</p>
      ${job.experience_min !== null ? "<p>الحد الأدنى للخبرة: " + Number(job.experience_min) + " سنة</p>" : ""}
      ${job.published_at ? "<p>تاريخ النشر: " + e(String(job.published_at).slice(0, 10)) + "</p>" : ""}
      ${job.valid_through ? "<p>آخر موعد: " + e(String(job.valid_through).slice(0, 10)) + "</p>" : ""}
      <div class="job-description">${e(plainDescription(job.description))}</div></article>${action}`,
      { path: "/vacancies/" + encodeURIComponent(job.public_id), description: plainDescription(job.description).slice(0, 160), schema: jobPosting(job) });
  } catch (error) { return problem(error); }
}
