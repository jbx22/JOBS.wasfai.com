import { escapeHtml as e, getPublicJob, jobPosting, plainDescription, sourceLink } from "../api/_public_jobs.js";
import { candidateLanguage, catalogueQuery, page, problem } from "../_recruitment_page.js";

function monthlySalary(job, en) {
  const numbers = new Intl.NumberFormat(en ? "en" : "ar-SA");
  const min = job.salary_min, max = job.salary_max;
  if (min == null && max == null) return en ? "Undisclosed" : "غير معلن";
  let amount;
  if (min != null && max != null) {
    amount = min === max ? numbers.format(min) : numbers.format(min) + " – " + numbers.format(max);
  } else if (min != null) {
    amount = (en ? "From " : "من ") + numbers.format(min);
  } else {
    amount = (en ? "Up to " : "حتى ") + numbers.format(max);
  }
  return amount + (en ? " SAR/month" : " ر.س شهرياً");
}

export async function onRequestGet(context) {
  const lang = candidateLanguage(context.request);
  const en = lang === "en";
  const searchParams = context.request && new URL(context.request.url).searchParams;
  const path = "/vacancies/" + encodeURIComponent(context.params.id);
  try {
    const job = await getPublicJob(context.env, context.params.id);
    if (!job) return page(en ? "Vacancy unavailable" : "الوظيفة غير متاحة", `<p>${en ? "This posting may have closed or expired." : "قد يكون الإعلان منتهياً أو مغلقاً."}</p><a class="btn primary" href="/vacancies${e(catalogueQuery(searchParams, lang))}">${en ? "Browse open jobs" : "تصفح الوظائف المتاحة"}</a>`, { path, lang, searchParams, status: 404, private: true });
    return vacancyPage(job, lang, searchParams);
  } catch (error) { return problem(error, { path, lang, searchParams }); }
}

export function vacancyPage(job, lang, searchParams) {
  const en = lang === "en";
  const path = "/vacancies/" + encodeURIComponent(job.public_id);
  const external = sourceLink(job.source_url);
  const description = plainDescription(job.description);
  const fact = (label, value) => value ? `<div><dt>${label}</dt><dd dir="auto">${e(value)}</dd></div>` : "";
  const facts = [
    fact(en ? "Location" : "الموقع", [job.city, job.country_code].filter(Boolean).join(" · ")),
    fact(en ? "Monthly salary" : "الراتب الشهري", monthlySalary(job, en)),
    fact(en ? "Minimum experience" : "الحد الأدنى للخبرة", job.experience_min != null ? String(job.experience_min) + (en ? (job.experience_min === 1 ? " year" : " years") : " سنة") : ""),
    fact(en ? "Posted" : "تاريخ النشر", job.published_at?.slice(0, 10)),
    fact(en ? "Closing date" : "آخر موعد", job.valid_through?.slice(0, 10)),
  ].join("");
  let action;
  if (job.kind === "employer") {
    action = `<details class="vacancy-apply" id="apply" tabindex="-1"><summary>${en ? "Apply on Jobs Wasfai" : "تقدّم عبر وظائف وصفي"}</summary><div data-apply-job="${e(job.id)}"><p role="status">${en ? "Checking your account…" : "جارٍ التحقق من حسابك…"}</p></div></details>`;
  } else if (external) {
    const host = new URL(external).hostname;
    action = `<div class="vacancy-external"><a class="btn primary" href="${e(external)}" target="_blank" rel="noopener noreferrer nofollow" aria-describedby="vacancy-destination">${en ? "Apply on " : "تقدّم عبر "}<bdi>${e(host)}</bdi></a><p class="muted" id="vacancy-destination">${en ? "The original posting opens in a new tab. Complete your application there." : "يفتح الإعلان الأصلي في علامة تبويب جديدة. أكمل طلبك هناك."}</p></div>`;
  } else {
    action = `<p>${en ? "An application link is currently unavailable." : "رابط التقديم غير متاح حالياً."}</p>`;
  }
  return page(job.title, `<article class="vacancy-content"><p class="vacancy-company" dir="auto">${e(job.company_name)}</p>
    <dl class="vacancy-facts">${facts}</dl><div class="vacancy-actions">${action}
    <a class="vacancy-save" href="/jobs?view=browse&amp;vacancy=${encodeURIComponent(job.public_id)}">${en ? "Save and tailor my résumé" : "حفظ الوظيفة وتخصيص سيرتي"}</a></div>
    ${description ? `<section class="vacancy-description"><h2>${en ? "Job description" : "وصف الوظيفة"}</h2><div class="job-description" dir="auto">${e(description)}</div></section>` : ""}</article>`,
    { path, lang, searchParams, description: description.slice(0, 160), schema: jobPosting(job) });
}
