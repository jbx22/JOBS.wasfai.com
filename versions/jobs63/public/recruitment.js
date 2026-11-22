"use strict";
const portalStatuses = { pending: "قيد المراجعة", verified: "شركة مراجعة", rejected: "مرفوض", suspended: "موقوف", published: "منشور", closed: "مغلق", submitted: "تم التقديم", shortlisted: "في القائمة المختصرة", interviewing: "مقابلة", hired: "تم التوظيف", withdrawn: "مسحوب" };
const portalErrors = { AUTH_REQUIRED: "سجل الدخول بحساب Google للمتابعة.", ACCOUNT_RESTRICTED: "حسابك موقوف. يرجى التواصل مع الدعم.", EMPLOYER_NOT_VERIFIED: "يجب اعتماد الشركة أولاً.", ALREADY_APPLIED: "سبق لك التقديم على هذه الوظيفة.", CV_REQUIRED: "يرجى رفع سيرة ذاتية أولاً.", SCOPE_REQUIRED: "لا تملك صلاحية هذا القسم.", ADMIN_REQUIRED: "هذه الصفحة مخصصة للإدارة.", STORAGE_NOT_CONFIGURED: "التخزين غير متاح حالياً. حاول لاحقاً.", RECRUITMENT_UNAVAILABLE: "خدمة التوظيف غير متاحة مؤقتاً." };
const portalEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const portalStatus = (value) => portalStatuses[value] || value;
let portalSession = null;

async function portalApi(path, method = "GET", body) {
  const options = { method, credentials: "same-origin", cache: "no-store" };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) { options.body = JSON.stringify(body); options.headers = { "Content-Type": "application/json" }; }
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(portalErrors[payload.code] || payload.error || "تعذر إتمام الطلب."); error.code = payload.code; throw error; }
  return payload;
}
function portalFeedback(message = "", error = false) {
  const target = document.getElementById("recruitment-feedback");
  target.textContent = message;
  target.classList.toggle("error", error);
}
function portalLogin(next) {
  return '<label><input type="checkbox" data-login-terms> أوافق على <a href="/terms">الشروط</a> و<a href="/privacy">الخصوصية</a>.</label><a class="btn primary" data-portal-login data-next="' + portalEscape(next) + '" aria-disabled="true">المتابعة بحساب Google</a>';
}
function portalRenderJobs(jobs) {
  document.querySelector("[data-employer-jobs]").innerHTML = jobs.map((job) => '<article class="review-row"><h3>' + portalEscape(job.title) + '</h3><p>' + portalEscape(portalStatus(job.status)) + ' · ' + portalEscape(job.city) + '</p>' + (job.review_note ? '<p>' + portalEscape(job.review_note) + '</p>' : '') + '<div class="recruitment-actions"><button class="btn ghost" data-view-applicants="' + portalEscape(job.id) + '">المتقدمون</button>' + (job.status === "published" ? '<a class="btn ghost" href="/vacancies/e-' + encodeURIComponent(job.id) + '">عرض الإعلان</a>' : '') + (job.status !== "closed" ? '<button class="btn ghost" data-close-job="' + portalEscape(job.id) + '">إغلاق</button>' : '') + '</div></article>').join("") || "<p>لم تضف إعلانات بعد.</p>";
}
async function portalLoadMe() {
  const me = await portalApi("/api/recruitment/me");
  const employer = document.querySelector("[data-employer-dashboard]");
  if (employer) {
    employer.hidden = false;
    const company = me.company;
    const form = document.querySelector("[data-company-form]");
    if (company) for (const key of ["company_name", "registration_number", "website"]) form.elements[key].value = company[key] || "";
    document.querySelector("[data-company-status]").textContent = company ? portalStatus(company.status) + (company.review_note ? " · " + company.review_note : "") : "أدخل بيانات شركتك لبدء المراجعة.";
    document.querySelector("[data-post-job]").hidden = company?.status !== "verified";
    portalRenderJobs(me.jobs || []);
  }
  const candidate = document.querySelector("[data-candidate-dashboard]");
  if (candidate) {
    candidate.hidden = false;
    document.querySelector("[data-my-applications]").innerHTML = (me.applications || []).map((app) => '<article class="review-row"><h3>' + portalEscape(app.title) + '</h3><p>' + portalEscape(app.company_name) + ' · ' + portalEscape(portalStatus(app.status)) + '</p>' + (app.status !== "withdrawn" ? '<button class="btn ghost" data-withdraw-application="' + portalEscape(app.id) + '">سحب الطلب وإيقاف مشاركة السيرة</button>' : '') + '</article>').join("") || '<p>لا توجد طلبات بعد. <a href="/vacancies">تصفح الوظائف</a></p>';
  }
}
async function portalLoadApplicants(id) {
  const data = await portalApi("/api/recruitment/jobs/" + encodeURIComponent(id) + "/applications");
  document.querySelector("[data-applicants-panel]").hidden = false;
  document.querySelector("[data-applicants]").innerHTML = (data.applications || []).map((app) => '<article class="review-row"><h3>' + portalEscape(app.candidate_name) + '</h3><p>' + portalEscape(app.candidate_email) + '</p><p>' + portalEscape(app.cover_note) + '</p><p>' + portalEscape(portalStatus(app.status)) + '</p><a class="btn ghost" href="/api/recruitment/applications/' + encodeURIComponent(app.id) + '/resume">تنزيل السيرة المشتركة</a><form data-applicant-status="' + portalEscape(app.id) + '" data-job-id="' + portalEscape(id) + '" class="recruitment-grid"><label>المرحلة<select name="status">' + ["shortlisted", "interviewing", "rejected", "hired"].map((value) => '<option value="' + value + '"' + (value === app.status ? ' selected' : '') + '>' + portalEscape(portalStatus(value)) + '</option>').join("") + '</select></label><button class="btn primary">حفظ المرحلة</button></form></article>').join("") || "<p>لا يوجد متقدمون متاحون حالياً.</p>";
  document.querySelector("[data-applicants-panel]").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function portalLoadModeration() {
  const section = document.querySelector("[data-recruitment-admin]");
  if (!section) return;
  const results = await Promise.allSettled([
    portalApi("/api/recruitment/moderation/companies"), portalApi("/api/recruitment/moderation/jobs"),
  ]);
  section.hidden = false;
  const [companies, jobs] = results;
  const reviewForm = (kind, id, choices) => '<form data-moderation-kind="' + kind + '" data-resource-id="' + portalEscape(id) + '" class="recruitment-grid"><label>القرار<select name="status">' + choices.map((status) => '<option value="' + status + '">' + portalEscape(portalStatus(status)) + '</option>').join("") + '</select></label><label>سبب القرار<input name="review_note" required minlength="3" maxlength="1000"></label><button class="btn primary">حفظ القرار</button></form>';
  document.querySelector("[data-review-companies]").innerHTML = companies.status === "fulfilled" ? companies.value.companies.map((company) => '<article class="review-row"><h3>' + portalEscape(company.company_name) + '</h3><p>السجل: ' + portalEscape(company.registration_number) + '</p><p>' + portalEscape(company.website) + '</p><p>' + portalEscape(portalStatus(company.status)) + '</p>' + reviewForm("companies", company.user_id, ["verified", "rejected", "suspended"]) + '</article>').join("") || "<p>لا توجد شركات للمراجعة.</p>" : "<p>" + portalEscape(companies.reason.message) + "</p>";
  document.querySelector("[data-review-jobs]").innerHTML = jobs.status === "fulfilled" ? jobs.value.jobs.map((job) => '<article class="review-row"><h3>' + portalEscape(job.title) + '</h3><p>' + portalEscape(job.company_name) + ' · ' + portalEscape(job.city) + ' · ' + portalEscape(portalStatus(job.status)) + '</p><div class="job-description">' + portalEscape(job.description) + '</div>' + reviewForm("jobs", job.id, ["published", "rejected", "closed"]) + '</article>').join("") || "<p>لا توجد إعلانات للمراجعة.</p>" : "<p>" + portalEscape(jobs.reason.message) + "</p>";
}
async function portalInitApply() {
  const section = document.querySelector("[data-apply-job]");
  if (!section) return;
  if (!portalSession?.authenticated) { section.innerHTML = "<h2>التقديم على الوظيفة</h2><p>سجل دخولك للمتابعة.</p>" + portalLogin(location.pathname); return; }
  let file = null;
  try { file = (await portalApi("/api/resumes")).file; } catch { /* Allow a fresh upload. */ }
  section.innerHTML = '<h2>التقديم على الوظيفة</h2><form data-apply-form data-job-id="' + portalEscape(section.dataset.applyJob) + '"><p>السيرة الحالية: <span data-current-resume>' + portalEscape(file?.name || "لم ترفع ملفاً بعد") + '</span></p><label>رفع سيرة PDF أو DOCX أو TXT · حتى 10 MB<input type="file" name="resume" accept=".pdf,.docx,.txt,.md"></label><input type="hidden" name="resume_file_id" value="' + portalEscape(file?.id || "") + '"><label>رسالة لصاحب العمل<textarea name="cover_note" maxlength="4000"></textarea></label><label><input type="checkbox" name="consent" required> أوافق على مشاركة سيرتي وبيانات اتصالي مع هذه الشركة لهذا الطلب.</label><button class="btn primary">تقديم الطلب</button></form>';
}
document.addEventListener("change", (event) => {
  if (!event.target.matches("[data-login-terms]")) return;
  const link = event.target.closest("section")?.querySelector("[data-portal-login]") || event.target.parentElement.parentElement.querySelector("[data-portal-login]");
  if (!link) return;
  link.setAttribute("aria-disabled", String(!event.target.checked));
  if (event.target.checked) link.href = "/api/auth/google/start?terms=1&next=" + encodeURIComponent(link.dataset.next);
  else link.removeAttribute("href");
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.matches("[data-company-form],[data-job-form],[data-apply-form],[data-applicant-status],[data-moderation-kind]")) return;
  event.preventDefault();
  const button = form.querySelector("button[type=submit],button:not([type])");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  portalFeedback();
  try {
    const data = Object.fromEntries(new FormData(form));
    if (form.matches("[data-company-form]")) { await portalApi("/api/recruitment/company", "PUT", data); await portalLoadMe(); }
    if (form.matches("[data-job-form]")) {
      data.valid_through += "T23:59:59+03:00";
      await portalApi("/api/recruitment/jobs", "POST", data); form.reset(); await portalLoadMe();
    }
    if (form.matches("[data-apply-form]")) {
      const chosen = form.elements.resume.files[0];
      if (chosen) {
        const upload = new FormData(); upload.set("file", chosen);
        const result = await portalApi("/api/resumes", "POST", upload);
        data.resume_file_id = result.file.id;
        form.elements.resume_file_id.value = result.file.id;
        form.querySelector("[data-current-resume]").textContent = result.file.name;
      }
      if (!data.resume_file_id) throw new Error("ارفع سيرتك الذاتية قبل التقديم.");
      data.consent = form.elements.consent.checked;
      delete data.resume;
      await portalApi("/api/recruitment/jobs/" + encodeURIComponent(form.dataset.jobId) + "/apply", "POST", data);
      form.innerHTML = '<p>تم تقديم طلبك. <a class="btn primary" href="/applications">متابعة الطلب</a></p>';
    }
    if (form.matches("[data-applicant-status]")) {
      await portalApi("/api/recruitment/applications/" + encodeURIComponent(form.dataset.applicantStatus), "PATCH", data);
      await portalLoadApplicants(form.dataset.jobId);
    }
    if (form.matches("[data-moderation-kind]")) {
      await portalApi("/api/recruitment/moderation/" + form.dataset.moderationKind + "/" + encodeURIComponent(form.dataset.resourceId), "PATCH", data);
      await portalLoadModeration();
    }
    portalFeedback("تم الحفظ بنجاح.");
  } catch (error) { portalFeedback(error.message, true); }
  finally { if (button) button.disabled = false; }
});
document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-view-applicants],[data-close-job],[data-withdraw-application],[data-refresh-moderation]");
  if (!target || target.disabled) return;
  target.disabled = true;
  try {
    if (target.dataset.viewApplicants) await portalLoadApplicants(target.dataset.viewApplicants);
    if (target.dataset.closeJob && confirm("إغلاق الإعلان وإيقاف استقبال الطلبات؟")) {
      await portalApi("/api/recruitment/jobs/" + encodeURIComponent(target.dataset.closeJob), "PATCH", { status: "closed" }); await portalLoadMe();
    }
    if (target.dataset.withdrawApplication && confirm("سحب الطلب وإيقاف وصول الشركة إلى السيرة؟")) {
      await portalApi("/api/recruitment/applications/" + encodeURIComponent(target.dataset.withdrawApplication), "PATCH", { status: "withdrawn" }); await portalLoadMe();
    }
    if (target.matches("[data-refresh-moderation]")) await portalLoadModeration();
  } catch (error) { portalFeedback(error.message, true); }
  finally { target.disabled = false; }
});
(async () => {
  try {
    const protectedPage = document.querySelector("[data-employer-dashboard],[data-candidate-dashboard],[data-recruitment-admin],[data-apply-job]");
    if (!protectedPage) return;
    portalSession = await portalApi("/api/auth/session");
    if (portalSession.authenticated) {
      const gate = document.querySelector("[data-portal-gate]");
      if (gate) gate.hidden = true;
      if (document.querySelector("[data-employer-dashboard],[data-candidate-dashboard]")) await portalLoadMe();
      await portalLoadModeration();
    }
    await portalInitApply();
  } catch (error) { portalFeedback(error.message, true); }
})();
