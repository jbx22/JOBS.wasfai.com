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
function candidateText(en, ar) {
  return document.documentElement.lang === "en" ? en : ar;
}
function candidateApplicationsUrl() {
  return "/applications" + (document.documentElement.lang === "en" ? "?lang=en" : "");
}
function candidateError(error) {
  switch (error.code) {
    case "AUTH_REQUIRED": return candidateText("Your session expired. Reload this page to sign in again.", "انتهت جلستك. أعد تحميل الصفحة لتسجيل الدخول مجدداً.");
    case "ACCOUNT_RESTRICTED": return candidateText("Your account is restricted. Contact support for help.", "حسابك موقوف. يرجى التواصل مع الدعم.");
    case "JOB_NOT_FOUND": return candidateText("This vacancy has closed. Browse open jobs to continue.", "أُغلقت هذه الوظيفة. يمكنك تصفح الوظائف المتاحة.");
    case "CV_REQUIRED": return candidateText("Choose a résumé file to attach to this application.", "اختر ملف سيرتك الذاتية لإرفاقه بهذا الطلب.");
    case "FILE_TOO_LARGE":
    case "FILE_SIZE_INVALID": return candidateText("Choose a nonempty résumé file no larger than 10 MB.", "اختر ملف سيرة ذاتية غير فارغ لا يتجاوز ١٠ ميغابايت.");
    case "STORAGE_NOT_CONFIGURED": return candidateText("Résumé storage is temporarily unavailable. Try again later.", "تخزين السير الذاتية غير متاح مؤقتاً. حاول لاحقاً.");
    case "FILE_TYPE_INVALID":
    case "FILE_EXTENSION_INVALID":
    case "FILE_SIGNATURE_INVALID":
    case "FILE_CONTENT_INVALID": return candidateText("Choose a valid PDF, DOCX, TXT or MD file.", "اختر ملفاً صالحاً بصيغة PDF أو DOCX أو TXT أو MD.");
    default: return candidateText("We couldn’t complete this request. Please try again.", "تعذر إتمام الطلب. يرجى المحاولة مرة أخرى.");
  }
}
function renderCandidateApplications(applications) {
  const t = candidateText;
  const statuses = { submitted: t("Submitted", "تم التقديم"), shortlisted: t("Shortlisted", "في القائمة المختصرة"),
    interviewing: t("Interviewing", "مرحلة المقابلة"), rejected: t("Rejected", "مرفوض"), hired: t("Hired", "تم التوظيف"), withdrawn: t("Withdrawn", "مسحوب") };
  return applications.map((app) => {
    const date = String(app.created_at || "").slice(0, 10);
    const posting = "/vacancies/e-" + encodeURIComponent(app.job_id) + (document.documentElement.lang === "en" ? "?lang=en" : "");
    return `<article class="candidate-application"><h2 dir="auto"><a href="${posting}">${portalEscape(app.title)}</a></h2><p dir="auto">${portalEscape(app.company_name)}</p>
      <p class="candidate-state">${portalEscape(statuses[app.status] || app.status)}${date ? ' · <time datetime="' + portalEscape(date) + '">' + portalEscape(date) + '</time>' : ""}</p>
      ${app.status === "withdrawn" ? '<p class="muted">' + t("Résumé sharing has stopped.", "توقفت مشاركة سيرتك عبر المنصة.") + '</p>' : '<button type="button" class="btn ghost" data-withdraw-application="' + portalEscape(app.id) + '">' + t("Withdraw application", "سحب الطلب") + '</button>'}</article>`;
  }).join("") || '<p>' + t("You haven’t sent any applications through Jobs Wasfai yet.", "لم ترسل طلبات توظيف عبر وظائف وصفي بعد.") + '</p><a class="btn primary" href="/vacancies' + t("?lang=en", "") + '">' + t("Browse open jobs", "تصفح الوظائف المتاحة") + '</a>';
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
    document.querySelector("[data-my-applications]").innerHTML = renderCandidateApplications(me.applications || []);
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
function candidateFileLabel(saved) {
  return saved ? candidateText("Choose a different résumé (optional)", "اختيار سيرة أخرى (اختياري)") : candidateText("Choose a résumé (required)", "اختيار سيرة ذاتية (مطلوب)");
}
function candidateResume(file) {
  if (!file?.id) return candidateText("No résumé selected", "لم تحدد سيرة ذاتية");
  return '<a dir="auto" href="/api/resumes/' + encodeURIComponent(file.id) + '">' + portalEscape(file.name) + '</a>';
}
function candidateReceipt(form, duplicate = false) {
  const receipt = document.createElement("div");
  receipt.className = "application-receipt";
  receipt.tabIndex = -1;
  const heading = duplicate ? candidateText("You already applied to this vacancy", "سبق لك التقديم على هذه الوظيفة") : candidateText("Application sent", "تم إرسال طلبك");
  receipt.innerHTML = `<h2>${heading}</h2><p>${candidateText("See the status in My applications.", "يمكنك متابعة حالة الطلب في صفحة طلباتي.")}</p>
    <a class="btn primary" href="${candidateApplicationsUrl()}">${candidateText("View my applications", "عرض طلباتي")}</a>`;
  form.replaceWith(receipt);
  receipt.focus();
}
async function portalInitApply() {
  const section = document.querySelector("[data-apply-job]");
  if (!section) return;
  const t = candidateText;
  if (!portalSession?.authenticated) {
    const next = location.pathname + (document.documentElement.lang === "en" ? "?lang=en" : "") + "#apply";
    section.innerHTML = `<p>${t("Sign in to share your résumé with this employer.", "سجل الدخول لإرسال سيرتك الذاتية إلى صاحب العمل.")}</p>
      <label class="consent-line"><input type="checkbox" data-login-terms><span>${t('I agree to the <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.', 'أوافق على <a href="/terms">الشروط</a> و<a href="/privacy">سياسة الخصوصية</a>.')}</span></label>
      <a class="btn primary" data-portal-login data-next="${portalEscape(next)}" aria-disabled="true">${t("Continue with Google", "المتابعة بحساب Google")}</a>`;
    return;
  }
  let file = null;
  let lookupFailed = false;
  try { file = (await portalApi("/api/resumes")).file; } catch { lookupFailed = true; }
  section.innerHTML = `<form data-apply-form data-job-id="${portalEscape(section.dataset.applyJob)}">
    <p>${t("Saved résumé", "السيرة الذاتية المحفوظة")} · <span data-current-resume>${candidateResume(file)}</span></p>
    ${lookupFailed ? '<p class="muted">' + t("Your saved résumé could not be loaded. You can choose a file below.", "تعذر تحميل سيرتك المحفوظة. يمكنك اختيار ملف أدناه.") + '</p>' : ""}
    <label><span data-resume-prompt>${candidateFileLabel(file?.id)}</span>
      <input type="file" name="resume" accept=".pdf,.docx,.txt,.md" aria-describedby="resume-formats"${file?.id ? "" : " required"}></label>
    <small id="resume-formats">${t("PDF, DOCX, TXT or MD · up to 10 MB", "PDF أو DOCX أو TXT أو MD · حتى ١٠ ميغابايت")}</small>
    <input type="hidden" name="resume_file_id" value="${portalEscape(file?.id || "")}">
    <label>${t("Note to the employer (optional)", "رسالة لصاحب العمل (اختياري)")}<textarea name="cover_note" maxlength="4000" rows="3"></textarea></label>
    <label class="consent-line"><input type="checkbox" name="consent" required><span>${t("I agree to share my résumé and contact details with this employer for this application.", "أوافق على مشاركة سيرتي الذاتية وبيانات اتصالي مع صاحب العمل لهذا الطلب.")}</span></label>
    <p data-application-feedback role="status" aria-live="polite"></p><button type="submit" class="btn primary">${t("Send application", "إرسال الطلب")}</button></form>`;
}
async function submitCandidateApplication(form) {
  const feedback = form.querySelector("[data-application-feedback]");
  feedback.classList.remove("error");
  const uploadField = form.elements.resume;
  const chosen = uploadField.files[0];
  const resumeId = form.elements.resume_file_id;
  try {
    if (chosen) {
      if (!chosen.size || chosen.size > 10 * 1024 * 1024) throw Object.assign(new Error(), { code: "FILE_SIZE_INVALID" });
      feedback.textContent = candidateText("Uploading your résumé…", "جارٍ رفع سيرتك الذاتية…");
      const upload = new FormData();
      upload.set("file", chosen);
      const { file } = await portalApi("/api/resumes", "POST", upload);
      if (!file?.id) throw new Error("Missing résumé");
      resumeId.value = file.id;
      form.querySelector("[data-current-resume]").innerHTML = candidateResume(file);
      uploadField.value = "";
      uploadField.required = false;
      form.querySelector("[data-resume-prompt]").textContent = candidateFileLabel(true);
    }
    if (!resumeId.value.trim()) throw Object.assign(new Error(), { code: "CV_REQUIRED" });
    feedback.textContent = candidateText("Sending your application…", "جارٍ إرسال طلبك…");
    await portalApi("/api/recruitment/jobs/" + encodeURIComponent(form.dataset.jobId) + "/apply", "POST", {
      resume_file_id: resumeId.value.trim(), consent: form.elements.consent.checked, cover_note: form.elements.cover_note.value.trim(),
    });
    candidateReceipt(form);
  } catch (error) {
    if (error.code === "ALREADY_APPLIED") { candidateReceipt(form, true); return; }
    if (error.code === "CV_REQUIRED") {
      resumeId.value = "";
      uploadField.required = true;
      form.querySelector("[data-resume-prompt]").textContent = candidateFileLabel(false);
      form.querySelector("[data-current-resume]").innerHTML = candidateResume(null);
    }
    feedback.textContent = candidateError(error);
    feedback.classList.add("error");
  }
}
document.addEventListener("change", (event) => {
  if (!event.target.matches("[data-login-terms]")) return;
  const link = event.target.closest("[data-apply-job],section")?.querySelector("[data-portal-login]") || event.target.parentElement.parentElement.querySelector("[data-portal-login]");
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
    if (form.matches("[data-apply-form]")) { await submitCandidateApplication(form); return; }
    const data = Object.fromEntries(new FormData(form));
    if (form.matches("[data-company-form]")) { await portalApi("/api/recruitment/company", "PUT", data); await portalLoadMe(); }
    if (form.matches("[data-job-form]")) {
      data.valid_through += "T23:59:59+03:00";
      await portalApi("/api/recruitment/jobs", "POST", data); form.reset(); await portalLoadMe();
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
    if (target.dataset.withdrawApplication && confirm(candidateText("Withdraw this application and stop sharing your résumé and contact details with this employer?", "هل تريد سحب هذا الطلب وإيقاف مشاركة سيرتك وبيانات اتصالك مع صاحب العمل؟"))) {
      await portalApi("/api/recruitment/applications/" + encodeURIComponent(target.dataset.withdrawApplication), "PATCH", { status: "withdrawn" }); await portalLoadMe();
      portalFeedback(candidateText("Application withdrawn. Résumé sharing has stopped.", "تم سحب الطلب وإيقاف مشاركة سيرتك."));
    }
    if (target.matches("[data-refresh-moderation]")) await portalLoadModeration();
  } catch (error) { portalFeedback(target.dataset.withdrawApplication ? candidateError(error) : error.message, true); }
  finally { target.disabled = false; }
});
(async () => {
  try {
    const protectedPage = document.querySelector("[data-employer-dashboard],[data-candidate-dashboard],[data-recruitment-admin],[data-apply-job]");
    if (!protectedPage) return;
    const applyPanel = document.querySelector("details#apply");
    if (applyPanel && location.hash === "#apply") applyPanel.open = true;
    portalSession = await portalApi("/api/auth/session");
    if (portalSession.authenticated) {
      const gate = document.querySelector("[data-portal-gate]");
      if (gate) gate.hidden = true;
      if (document.querySelector("[data-employer-dashboard],[data-candidate-dashboard]")) await portalLoadMe();
      await portalLoadModeration();
    }
    if (!portalSession.authenticated && document.querySelector("[data-candidate-dashboard]")) {
      document.querySelector("[data-portal-gate]").hidden = false;
    }
    await portalInitApply();
  } catch (error) {
    const apply = document.querySelector("[data-apply-job]");
    if (apply) apply.textContent = candidateError(error);
    else portalFeedback(document.querySelector("[data-candidate-dashboard]") ? candidateError(error) : error.message, true);
  } finally {
    const loading = document.querySelector("[data-candidate-loading]");
    if (loading) loading.hidden = true;
  }
})();
