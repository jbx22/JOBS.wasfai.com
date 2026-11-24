const root = document.querySelector("#pricing-root");
const catalog = [
  { id: "free", price_sar: 0, billing: "monthly", limits: { saved_jobs: 10, ai_matches_per_month: 20, application_kits_per_month: 2, resume_improvements_per_month: 1 } },
  { id: "gold_monthly", price_sar: 50, billing: "monthly", limits: { saved_jobs: 300, ai_matches_per_month: 200, application_kits_per_month: 30, resume_improvements_per_month: 12 } },
  { id: "gold_annual", price_sar: 499, billing: "yearly", limits: { saved_jobs: 300, ai_matches_per_month: 200, application_kits_per_month: 30, resume_improvements_per_month: 12 } },
];
const copy = {
  free: ["المجانية", "Free"], gold_monthly: ["الذهبية الشهرية", "Monthly Gold"], gold_annual: ["الذهبية السنوية", "Annual Gold"],
  title: ["باقات الاشتراك", "Subscription plans"], account: ["حسابي", "My account"], profile: ["الملف الشخصي", "User profile"], app: ["فتح التطبيق", "Open app"],
  signin: ["تسجيل الدخول", "Sign in"], intro: ["قارن مدد الاشتراك وحدود الاستخدام، ثم اختر الباقة التي تناسبك.", "Compare payment terms and usage allowances, then choose your plan."],
  current: ["باقتك الحالية", "Your current plan"], end: ["نهاية الفترة المدفوعة", "Paid term ends"],
  currentFree: ["تستخدم الباقة المجانية.", "You have Free access."],
  expired: ["انتهت الفترة المدفوعة.", "Your paid term has ended."],
  cancelledAccess: ["أُلغي اشتراكك المدفوع.", "Your paid subscription was cancelled."],
  termPolicy: ["تدفع مقابل مدة واحدة. لا يُخصم مبلغ تلقائياً عند انتهائها.", "You pay for one term. There is no automatic charge when it ends."],
  activePolicy: ["يمكنك تجديد نفس الباقة الآن. تُضاف مدة التجديد إلى ما تبقى من اشتراكك. يمكنك اختيار مدة مختلفة بعد انتهاء الفترة الحالية.", "You can renew this plan now. The new term extends your remaining paid time. You can switch billing intervals after this term ends."],
  loading: ["جارٍ تحميل الباقات…", "Loading plans…"], reload: ["إعادة تحميل الباقات", "Reload plans"],
  unavailable: ["تعذّر تحميل حالة حسابك والباقات الحالية. الأسعار المعروضة للرجوع إليها فقط.", "We couldn’t load current plans or account status. The prices below are for reference."],
  checkoutOff: ["الدفع للباقة الذهبية غير متاح حالياً.", "Checkout for Gold is temporarily unavailable."],
  monthly: ["شهرياً", "per month"], yearly: ["سنوياً", "per year"], currency: ["ر.س.", "SAR"],
  saved: ["وظائف محفوظة", "Saved jobs"], matches: ["مطابقات ذكية شهرياً", "AI matches per month"],
  kits: ["حزم تقديم شهرياً", "Application kits per month"], improvements: ["تحسينات للسيرة شهرياً", "Résumé improvements per month"],
  full: ["عرض حدود الاستخدام", "View usage allowances"],
  startFree: ["استخدام الباقة المجانية", "Use Free"], chooseMonth: ["اختيار الذهبي الشهري", "Choose monthly Gold"],
  chooseYear: ["اختيار الذهبي السنوي", "Choose annual Gold"], renew: ["تجديد اشتراكي", "Renew my plan"],
  currentButton: ["الباقة الحالية", "Current plan"], afterEnd: ["متاحة بعد نهاية الفترة الحالية", "Available after this term"],
  busy: ["جارٍ فتح الدفع…", "Opening checkout…"], saving: ["جارٍ تحديث الاشتراك…", "Updating plan…"],
  checkoutDisabled: ["الدفع غير متاح", "Checkout unavailable"], verifyFirst: ["تحقق من الفاتورة أولاً", "Check invoice first"],
  freeInfo: ["متابعة طلبات التوظيف وتنظيم الوظائف المحفوظة.", "Track applications and organize saved jobs."],
  goldInfo: ["حزم تقديم ثنائية اللغة وتخصيص السيرة للوظيفة المختارة.", "Bilingual application kits and résumés tailored to a selected job."],
  annualInfo: ["مزايا الذهبي وحدود الاستخدام الشهرية نفسها، بدفعة سنوية واحدة.", "The same Gold features and monthly allowances, paid in one annual instalment."],
  selected: ["الباقة المختارة", "Selected plan"], review: ["مراجعة الباقة المختارة", "Review selected plan"],
  hosted: ["تراجع الإجمالي وتؤكّد الدفع على صفحة مويَسّر. لا يتم التحصيل بمجرد اختيار الباقة.", "Review the total and confirm payment on Moyasar’s checkout page. Selecting a plan does not charge you."],
  history: ["سجل المدفوعات", "Payment history"], order: ["رقم الطلب", "Order"], invoice: ["حالة الفاتورة", "Invoice status"],
  check: ["التحقق من الدفع", "Check payment"], retry: ["إعادة التحقق", "Check again"],
  signVerify: ["سجّل الدخول بالحساب الذي استخدمته للدفع للتحقق من هذه الفاتورة.", "Sign in with the account used at checkout to verify this invoice."],
  verifying: ["جارٍ التحقق من الفاتورة…", "Checking your invoice…"],
  pending: ["لم يصل تأكيد الدفع بعد. تحقّق من هذه الفاتورة مجدداً قبل بدء دفع جديد.", "Payment has not been confirmed yet. Check this invoice again before starting another payment."],
  paidActive: ["تم التحقق من الدفع. اشتراكك الذهبي نشط.", "Payment verified. Your Gold subscription is active."],
  paidInactive: ["تم التحقق من أن الفاتورة مدفوعة. لا يوجد اشتراك نشط لهذه الفاتورة حالياً.", "This invoice is paid. It has no current active term."],
  verifyError: ["تعذّر التحقق من الدفع الآن. يمكنك إعادة التحقق من نفس الفاتورة.", "We couldn’t verify this payment. Check the same invoice again."],
  missing: ["لم نجد هذه الفاتورة في الحساب الحالي. افتح سجل مدفوعاتك أو سجّل الدخول بالحساب المستخدم للدفع.", "This invoice was not found in the current account. Check your payment history or sign in with the account used at checkout."],
  badOrder: ["مرجع الفاتورة غير صالح. راجع سجل المدفوعات في حسابك.", "The invoice reference is invalid. Check the payment history in your account."],
  ended: ["انتهى الدفع لهذه الفاتورة بالحالة المعروضة أدناه.", "Checkout for this invoice ended with the status shown below."],
  back: ["عدت من صفحة الدفع. يمكنك استئناف فاتورتك المفتوحة إذا رغبت.", "You returned from checkout. You can resume an open invoice if you wish."],
  freeActive: ["تم تفعيل الباقة المجانية.", "Your Free plan is active."],
  useWorkspace: ["متابعة استخدام الباقة المجانية", "Continue with Free"],
  manuallySettled: ["سُجلت تسوية يدوية لهذا الطلب. راجع باقتك الحالية لمعرفة حالة الوصول.", "This order was settled manually. Your current plan shows your access."],
  openOrder: ["لديك فاتورة مفتوحة. راجع الفاتورة الحالية قبل إنشاء أخرى.", "You have an open invoice. Review it before starting another checkout."],
  cancelInvoice: ["إلغاء الفاتورة غير المدفوعة", "Cancel unpaid invoice"],
  confirmClose: ["هل تريد إغلاق هذه الفاتورة غير المدفوعة؟ سيتوقف رابط الدفع الخاص بها عن العمل، وستبقى باقتك الحالية سارية.", "Close this unpaid invoice? Its checkout link will stop working. Your current plan will stay in place."],
  closeNow: ["تأكيد إلغاء الفاتورة", "Confirm invoice cancellation"], keep: ["الإبقاء على الفاتورة", "Keep invoice"],
  closing: ["جارٍ إلغاء الفاتورة…", "Cancelling invoice…"], closed: ["تم إلغاء الفاتورة غير المدفوعة.", "The unpaid invoice was cancelled."],
  cannotClose: ["لا يمكن إلغاء هذه الفاتورة. تحقّق من حالتها قبل المتابعة.", "This invoice can no longer be cancelled. Check its status before continuing."],
  closeFailed: ["تعذّر تأكيد إلغاء الفاتورة. حاول مرة أخرى أو تحقّق من حالة الدفع.", "Invoice cancellation could not be confirmed. Retry or check the payment status."],
  resume: ["استئناف الدفع", "Resume checkout"], continuePlan: ["متابعة الباقة المختارة", "Continue with selected plan"],
  AUTH_REQUIRED: ["انتهت جلسة الدخول. سجّل الدخول للمتابعة.", "Your session ended. Sign in to continue."],
  PAID_PLAN_ACTIVE: ["ما زالت باقتك المدفوعة سارية. يمكنك تغيير الباقة بعد انتهاء مدتها.", "Your paid term is still active. You can change plans when it ends."],
  OTHER_ORDER_OPEN: ["لديك فاتورة مفتوحة لباقة أخرى. استأنفها أو انتظر انتهاءها.", "An invoice is open for another plan. Resume it or wait for it to expire."],
  CHECKOUT_IN_PROGRESS: ["يجري تجهيز فاتورتك. انتظر قليلاً ثم أعد المحاولة للباقة نفسها.", "Your invoice is being prepared. Wait a moment, then retry the same plan."],
  RATE_LIMITED: ["انتظر دقيقة ثم أعد المحاولة.", "Wait a minute and try again."],
  invalidLink: ["تعذّر التأكد من رابط الدفع. أعد المحاولة لاحقاً.", "We could not confirm the checkout link. Try again later."],
  checkoutError: ["تعذّر فتح صفحة الدفع. حاول مجدداً للباقة نفسها.", "Checkout could not be opened. Retry the same plan."],
  PLAN_ALREADY_ACTIVE: ["هذه الباقة نشطة بالفعل. راجع فترة اشتراكك قبل تجديده.", "This plan is already active. Review your term before renewing."],
  partialRefund: ["استرداد جزئي", "Partially refunded"], creating: ["جارٍ تجهيز الفاتورة", "Preparing invoice"], onHold: ["بانتظار تأكيد مويَسّر", "Awaiting provider confirmation"],
  refundReceipt: ["توضح هذه الفاتورة استرداداً للمبلغ.", "A refund was recorded against this invoice."], refundAmount: ["المبلغ المسترد", "Amount refunded"],
  initiated: ["بانتظار الدفع", "Awaiting payment"], paid: ["مدفوعة", "Paid"], failed: ["تعذر الدفع", "Failed"],
  refunded: ["مستردة", "Refunded"], canceled: ["ملغاة", "Cancelled"], expiredInvoice: ["منتهية", "Expired"],
  voided: ["مبطلة", "Voided"], pendingInvoice: ["قيد التحقق", "Pending verification"], manual: ["تسوية يدوية", "Manually settled"],
};
const query = new URLSearchParams(location.search);
const validOrder = value => /^\d{1,15}$/.test(String(value ?? ""));
const validPlan = id => catalog.some(plan => plan.id === id);
const returned = query.get("payment");
const state = {
  locale: loadLocale(), plans: catalog, live: false, authenticated: false, current: null, recent: [], pendingCheckout: null,
  checkoutReady: false, intent: validPlan(query.get("plan")) ? query.get("plan") : "", busy: "", error: "", notice: "",
  order: returned === "success" && validOrder(query.get("order")) ? query.get("order") : "",
  cancelFor: "", cancelBusy: false, cancelMessage: "", cancelResultOrder: "",
  phase: returned === "success" && !validOrder(query.get("order")) ? "badOrder" : "", invoice: null,
};
let verificationToken = 0;
let timer = 0;
const retryDelays = [4000, 10000, 20000];

function t(key) { return copy[key]?.[state.locale === "en" ? 1 : 0] || ""; }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function number(value) { return Number(value).toLocaleString(state.locale === "ar" ? "ar-SA" : "en-GB"); }
function date(value) {
  if (!value) return "";
  const parsed = new Date(String(value).slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(state.locale === "ar" ? "ar-SA" : "en-GB", { calendar: "gregory", timeZone: "UTC", dateStyle: "medium" }).format(parsed);
}
function statusKey(value) {
  const labels = { creating: "creating", on_hold: "onHold", partially_refunded: "partialRefund", initiated: "initiated", pending: "pendingInvoice", paid: "paid", paid_manual: "manual", canceled: "canceled", cancelled: "canceled", failed: "failed", expired: "expiredInvoice", voided: "voided", refunded: "refunded" };
  return labels[value] || "pendingInvoice";
}
function loadLocale() {
  try {
    const workspace = JSON.parse(localStorage.getItem("jobs.wasfai.preferences") || "null");
    if (workspace?.version === 2 && ["en", "ar"].includes(workspace.locale)) return workspace.locale;
    return localStorage.getItem("jobs.wasfai.pricing.locale") === "en" ? "en" : "ar";
  } catch { return "ar"; }
}
function setLocale() {
  state.locale = state.locale === "ar" ? "en" : "ar";
  try {
    const prefs = JSON.parse(localStorage.getItem("jobs.wasfai.preferences") || "{}") || {};
    localStorage.setItem("jobs.wasfai.preferences", JSON.stringify({ ...prefs, version: 2, locale: state.locale }));
    localStorage.setItem("jobs.wasfai.pricing.locale", state.locale);
  } catch {}
  render();
  root.querySelector("[data-toggle-locale]")?.focus({ preventScroll: true });
}
function pricingPath(plan = state.intent) {
  if (state.order) return "/pricing/?payment=success&order=" + encodeURIComponent(state.order);
  return plan ? "/pricing/?plan=" + encodeURIComponent(plan) : "/pricing/";
}
function signin(plan) { return "/login?next=" + encodeURIComponent(pricingPath(plan)); }
function validatedCheckout(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://checkout.moyasar.com" && !url.username && !url.password && /^\/invoices\/[^/]+\/?$/.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}
function normalizePending(value) {
  if (!value || !validOrder(value.order_id) || !validPlan(value.plan) || value.plan === "free") return null;
  return { order_id: String(value.order_id), plan: value.plan, checkout_url: validatedCheckout(value.checkout_url) };
}
function access() {
  const current = state.current;
  const active = current?.paid_active ?? Boolean(current?.plan !== "free" && current?.status === "active" && current.current_period_end > new Date().toISOString().slice(0, 10));
  return { paid: active, plan: active && validPlan(current?.effective_plan || current?.plan) ? (current.effective_plan || current.plan) : "free" };
}
function verifying() { return Boolean(state.order && !["paidActive", "paidInactive", "ended", "refundReceipt", "manuallySettled", "missing"].includes(state.phase)); }
function actionLabel(plan) {
  const { paid, plan: active } = access();
  if (state.busy === plan.id) return plan.id === "free" ? "saving" : "busy";
  if (paid && active !== plan.id) return "afterEnd";
  if (plan.id === "free" && state.authenticated && state.current) return "currentButton";
  if (plan.id !== "free" && !state.checkoutReady) return "checkoutDisabled";
  if (verifying()) return "verifyFirst";
  if (paid) return "renew";
  if (state.pendingCheckout?.plan === plan.id) return "resume";
  return { free: "startFree", gold_monthly: "chooseMonth", gold_annual: "chooseYear" }[plan.id];
}

function renderPlan(plan, openLimits) {
  const action = actionLabel(plan);
  const disabled = !state.live || state.busy || state.cancelBusy || ["afterEnd", "currentButton", "checkoutDisabled", "verifyFirst"].includes(action);
  const limitKeys = [["saved_jobs", "saved"], ["ai_matches_per_month", "matches"], ["application_kits_per_month", "kits"], ["resume_improvements_per_month", "improvements"]];
  return `<article class="plan-card" id="plan-${esc(plan.id)}" ${state.intent === plan.id ? "data-selected" : ""}>
    <h2>${t(plan.id)}</h2>
    <p class="price"><strong>${number(plan.price_sar)}</strong> ${t("currency")} ${plan.id === "free" ? "" : t(plan.billing === "yearly" ? "yearly" : "monthly")}</p>
    <p>${t({ free: "freeInfo", gold_monthly: "goldInfo", gold_annual: "annualInfo" }[plan.id])}</p>
    <button class="btn primary" data-select-plan="${esc(plan.id)}" ${disabled ? "disabled" : ""}>${t(action)}</button>
    <details data-plan-limits="${esc(plan.id)}" ${openLimits ? "open" : ""}>
      <summary>${t("full")}</summary><dl class="limits">${limitKeys.filter(([key]) => Number.isFinite(Number(plan.limits?.[key]))).map(([key,label]) => `<div><dt>${t(label)}</dt><dd>${number(plan.limits[key])}</dd></div>`).join("")}</dl>
    </details>
  </article>`;
}

function renderHistory(open) {
  if (!state.authenticated || !state.recent.length) return "";
  return `<details class="panel history" data-payment-history ${open ? "open" : ""}><summary>${t("history")}</summary><ol>${state.recent.map(item => {
    const refund = Number(item.refunded_sar || 0);
    const partial = refund > 0 && refund < Number(item.amount_sar);
    const status = partial ? "partialRefund" : statusKey(item.status);
    return `<li><div><strong>${t(item.plan)}</strong> · ${number(item.amount_sar)} ${t("currency")}
      <span>${t("order")} <bdi>#${esc(item.id)}</bdi> · ${esc(date(item.created_at))}</span></div>
      <div>${t(status)}${refund > 0 ? `<span>${t("refundAmount")} · ${number(refund)} ${t("currency")}</span>` : ""} ${["initiated", "creating", "onHold", "pendingInvoice", "failed"].includes(status) ? `<a class="text-link" href="/pricing/?payment=success&amp;order=${esc(item.id)}" data-check-order="${esc(item.id)}">${t("check")}</a>` : ""}</div>
    </li>`;
  }).join("")}</ol></details>`;
}

function render() {
  const limits = new Set([...root.querySelectorAll("[data-plan-limits][open]")].map(el => el.dataset.planLimits));
  const historyOpen = root.querySelector("[data-payment-history]")?.open;
  const focused = document.activeElement?.closest("#pricing-root [data-retry-payment], #pricing-root [data-select-plan]");
  document.documentElement.lang = state.locale;
  document.documentElement.dir = state.locale === "ar" ? "rtl" : "ltr";
  document.title = t("title") + " | JOBS.wasfai.com";
  const { paid, plan } = access();
  const currentStatus = state.current?.status;
  const selected = state.intent;
  const open = state.pendingCheckout;
  const receipt = state.recent.find(item => String(item.id) === state.order);
  const refund = Number(receipt?.refunded_sar || 0);
  root.innerHTML = `<header class="pricing-top">
    <a class="brand" href="/app"><img src="/brand-logo-192.png" width="36" height="36" alt=""><strong>JOBS.wasfai.com</strong></a>
    <nav aria-label="${t("account")}"><button class="text-link" data-toggle-locale lang="${state.locale === "ar" ? "en" : "ar"}">${state.locale === "ar" ? "English" : "العربية"}</button>
    ${state.authenticated ? `<a href="/profile?lang=${state.locale}">${t("profile")}</a>` : `<a data-pricing-signin href="${esc(signin())}">${t("signin")}</a>`}</nav>
  </header>
  <section class="hero"><h1>${t("title")}</h1><p>${t("intro")}</p></section>
  ${state.authenticated && state.live ? `<section class="panel current" data-current-plan><div><h2>${t("current")}</h2><strong>${t(plan)}</strong></div>
      ${paid ? `<p>${t("end")} <bdi>${esc(date(state.current.current_period_end))}</bdi></p><p>${t("activePolicy")}</p>`
        : `<p>${currentStatus === "expired" ? t("expired") + " " : ["canceled","cancelled"].includes(currentStatus) ? t("cancelledAccess") + " " : ""}${t("currentFree")}</p>`}
      <a class="text-link" href="/app">${t("app")}</a></section>` : ""}
  ${state.phase ? `<section class="panel feedback" data-payment-status tabindex="-1" aria-labelledby="invoice-heading"><h2 id="invoice-heading">${t("invoice")}${state.order ? " · <bdi>#" + esc(state.order) + "</bdi>" : ""}</h2>
    <p role="status">${t(state.phase)}${["ended", "refundReceipt"].includes(state.phase) ? " " + t(statusKey(state.invoice?.status)) : ""}</p>
    ${state.phase === "refundReceipt" && refund > 0 ? `<p>${t("refundAmount")} · ${number(refund)} ${t("currency")}</p>` : ""}
    ${state.phase === "signVerify" ? `<a class="btn primary" data-pricing-signin href="${esc(signin())}">${t("signin")}</a>` : ""}
    ${["pending","verifyError","paidInactive","verifying","RATE_LIMITED"].includes(state.phase) ? `<button class="btn" data-retry-payment ${state.phase === "verifying" ? "disabled" : ""}>${t("retry")}</button>` : ""}
  </section>` : ""}
  ${!state.live ? `<div class="panel feedback error" role="alert"><p>${t("unavailable")}</p><button class="btn" data-retry-plans>${t("reload")}</button></div>` : ""}
  ${state.error ? `<div class="panel feedback error" role="alert">${t(state.error)}</div>` : ""}
  ${state.notice || selected ? `<div class="panel feedback" data-plan-intent><p role="status">${state.notice ? t(state.notice) : ""}${selected ? " " + t("selected") + " · " + t(selected) : ""}</p>
    ${selected === "free" && state.authenticated && !paid && state.current ? `<a class="text-link" href="/app">${t("useWorkspace")}</a>` : selected ? `<a class="text-link" href="#plan-${esc(selected)}">${t("review")}</a>` : ""}</div>` : ""}
  ${open && state.live && !verifying() && !(open.order_id === state.order && ["paidActive", "paidInactive", "refundReceipt", "manuallySettled", "ended"].includes(state.phase)) ? `<section class="panel feedback" data-open-checkout><p>${t("openOrder")} ${t(open.plan)} · <bdi>#${esc(open.order_id)}</bdi></p>
    <div class="actions" ${state.cancelBusy ? "hidden" : ""}>${open.checkout_url && state.checkoutReady ? `<a class="btn" href="${esc(open.checkout_url)}" rel="noreferrer">${t("resume")}</a>` : ""}
    <a class="text-link" href="/pricing/?payment=success&amp;order=${esc(open.order_id)}" data-check-order="${esc(open.order_id)}">${t("check")}</a>
    ${open.checkout_url && state.authenticated && state.cancelFor !== open.order_id ? `<button class="text-link" data-cancel-invoice="${esc(open.order_id)}">${t("cancelInvoice")}</button>` : ""}</div>
    ${open.checkout_url && state.cancelFor === open.order_id ? `<div class="cancel-confirm">
      <p id="cancel-confirm-text">${t("confirmClose")}</p><div class="actions"><button class="btn" data-confirm-cancel-invoice="${esc(open.order_id)}" aria-describedby="cancel-confirm-text" ${state.cancelBusy ? "disabled" : ""}>${t(state.cancelBusy ? "closing" : "closeNow")}</button>
      <button class="text-link" data-keep-invoice ${state.cancelBusy ? "disabled" : ""}>${t("keep")}</button></div></div>` : ""}
    </section>` : ""}
  ${state.cancelMessage ? `<div class="panel feedback" tabindex="-1" data-cancel-result><p role="${state.cancelMessage === "closed" ? "status" : "alert"}">${t(state.cancelMessage)} <bdi>#${esc(state.cancelResultOrder)}</bdi></p>
    ${state.cancelMessage === "cannotClose" ? `<a class="text-link" href="/pricing/?payment=success&amp;order=${esc(state.cancelResultOrder)}" data-check-order="${esc(state.cancelResultOrder)}">${t("check")}</a>` : ""}</div>` : ""}
  ${state.live && !state.checkoutReady ? `<div class="panel feedback" role="status" data-checkout-unavailable>${t("checkoutOff")}</div>` : ""}
  <section class="plans" aria-label="${t("title")}">${state.plans.map(p => renderPlan(p, limits.has(p.id))).join("")}</section>
  <section class="billing-notes"><p>${t("termPolicy")}</p><p>${t("hosted")}</p></section>
  ${renderHistory(historyOpen)}`;
  if (focused?.hasAttribute("data-retry-payment")) (root.querySelector("[data-retry-payment]:enabled") || root.querySelector("[data-payment-status]"))?.focus({ preventScroll: true });
  else if (focused?.dataset.selectPlan) root.querySelector(`[data-select-plan="${focused.dataset.selectPlan}"]:enabled`)?.focus({ preventScroll: true });
}

async function api(path, body) {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(body ? 45000 : 20000),
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error("Request failed"), { code: data.code, data, status: response.status });
  return data;
}

async function loadPlans() {
  try {
    const data = await api("/api/subscriptions");
    if (!Array.isArray(data.plans) || !data.plans.length) throw Error();
    state.live = true;
    state.plans = data.plans.filter(p => validPlan(p.id));
    state.authenticated = data.authenticated === true;
    state.current = data.current || null;
    state.checkoutReady = data.payment_ready === true;
    state.pendingCheckout = normalizePending(data.pending_checkout);
    state.recent = state.authenticated && Array.isArray(data.recent_payments) ? data.recent_payments.filter(item => validOrder(item.id) && validPlan(item.plan)).slice(0, 10) : [];
  } catch {
    state.live = false;
    state.checkoutReady = false;
  }
}
async function verify(attempt = 0) {
  clearTimeout(timer);
  const token = ++verificationToken;
  if (!state.order) return;
  state.phase = !state.live ? "verifyError" : !state.authenticated ? "signVerify" : "verifying";
  render();
  if (state.phase !== "verifying") return;
  try {
    const data = await api("/api/payments/moyasar/status?order=" + encodeURIComponent(state.order));
    if (token !== verificationToken) return;
    state.invoice = data.payment || null;
    if (!data.payment) state.phase = state.pendingCheckout?.order_id === state.order ? "pending" : "missing";
    else if (data.verified && data.payment.status === "paid") {
      state.phase = data.subscription_active ? "paidActive" : "paidInactive";
      await loadPlans();
    } else if (data.verified && data.payment.status === "paid_manual") {
      state.phase = "manuallySettled";
      await loadPlans();
    } else if (data.verified && ["partially_refunded", "refunded"].includes(data.payment.status)) {
      state.phase = "refundReceipt";
      await loadPlans();
    } else if (data.verified && ["failed", "canceled", "cancelled", "expired", "voided"].includes(data.payment.status)) {
      state.phase = "ended";
      if (state.pendingCheckout?.order_id === state.order) state.pendingCheckout = null;
    } else state.phase = "pending";
  } catch (error) {
    if (token !== verificationToken) return;
    if (error.status === 401) { state.authenticated = false; state.phase = "signVerify"; }
    else state.phase = error.status === 429 ? "RATE_LIMITED" : "verifyError";
  }
  if (token !== verificationToken) return;
  render();
  if (["pending", "verifyError"].includes(state.phase) && attempt < retryDelays.length)
    timer = setTimeout(() => verify(attempt + 1), retryDelays[attempt]);
}

async function selectPlan(id) {
  if (state.busy || state.cancelBusy || !state.live || verifying() || !validPlan(id)) return;
  const plan = state.plans.find(p => p.id === id);
  if (!plan) return;
  const action = actionLabel(plan);
  if (["afterEnd", "checkoutDisabled", "currentButton"].includes(action)) return;
  state.order = "";
  state.phase = "";
  state.intent = id;
  state.cancelMessage = "";
  state.cancelFor = "";
  history.replaceState(null, "", pricingPath(id));
  if (!state.authenticated) { location.assign(signin(id)); return; }
  state.busy = id;
  state.error = "";
  state.notice = "";
  render();
  try {
    const selection = action === "renew"
      ? { plan: id, renew: true, renew_from: String(state.current.current_period_end).slice(0, 10) }
      : { plan: id };
    const data = await api("/api/subscriptions", selection);
    if (data.next_action === "redirect_to_moyasar") {
      const url = validatedCheckout(data.checkout_url);
      if (!url) throw Object.assign(Error(), { code: "invalidLink" });
      location.assign(url);
      return;
    }
    if (data.next_action === "payment_confirmed" && validOrder(data.order_id)) {
      state.order = String(data.order_id);
      history.replaceState(null, "", pricingPath());
      state.busy = "";
      await verify();
      return;
    }
    if (data.next_action !== "free_active" || id !== "free") throw Error();
    state.current = data.current;
    state.notice = "freeActive";
    state.intent = "";
    history.replaceState(null, "", "/pricing/");
  } catch (error) {
    const code = error.code;
    if (code === "AUTH_REQUIRED" || error.status === 401) {
      location.assign(signin(id)); return;
    }
    if (code === "MOYASAR_NOT_CONFIGURED") state.checkoutReady = false;
    state.error = ["CHECKOUT_IN_PROGRESS", "OTHER_ORDER_OPEN", "PAID_PLAN_ACTIVE", "PLAN_ALREADY_ACTIVE", "RATE_LIMITED", "invalidLink"].includes(code) ? code : code === "MOYASAR_NOT_CONFIGURED" ? "" : "checkoutError";
    if (code === "PAID_PLAN_ACTIVE" || code === "PLAN_ALREADY_ACTIVE") await loadPlans();
    state.pendingCheckout = normalizePending(error.data?.pending_checkout) || state.pendingCheckout;
  } finally {
    state.busy = "";
  }
  render();
  root.querySelector("[role=alert], [data-checkout-unavailable], [data-plan-intent]")?.scrollIntoView({ block: "center" });
}

async function cancelInvoice(order) {
  const pending = state.pendingCheckout;
  if (!state.authenticated || !pending?.checkout_url || pending.order_id !== order || state.cancelFor !== order || state.cancelBusy || state.busy) return;
  state.cancelBusy = true;
  state.cancelResultOrder = order;
  state.cancelMessage = "";
  render();
  try {
    const result = await api("/api/payments/moyasar/cancel", { order });
    if (!result.ok || !["canceled", "cancelled"].includes(result.status)) throw Error();
    state.pendingCheckout = null;
    state.cancelFor = "";
    state.cancelMessage = "closed";
    state.error = "";
    if (state.notice === "back") state.notice = "";
    await loadPlans();
  } catch (error) {
    state.cancelMessage = error.code === "PAYMENT_NOT_CANCELABLE" ? "cannotClose" : "closeFailed";
    if (state.cancelMessage === "cannotClose") {
      state.cancelFor = "";
      await loadPlans();
    }
  } finally {
    state.cancelBusy = false;
    render();
    root.querySelector("[data-cancel-result]")?.focus();
  }
}

root.addEventListener("click", async event => {
  const item = event.target.closest("a,button");
  if (!item) return;
  if (item.hasAttribute("data-toggle-locale")) return setLocale();
  if (item.dataset.cancelInvoice) {
    state.cancelFor = item.dataset.cancelInvoice;
    state.cancelMessage = "";
    render();
    root.querySelector("[data-keep-invoice]")?.focus({ preventScroll: true });
    return;
  }
  if (item.hasAttribute("data-keep-invoice")) {
    state.cancelFor = ""; state.cancelMessage = ""; render();
    root.querySelector("[data-cancel-invoice]")?.focus({ preventScroll: true });
    return;
  }
  if (item.dataset.confirmCancelInvoice) return cancelInvoice(item.dataset.confirmCancelInvoice);
  if (item.hasAttribute("data-retry-plans")) {
    item.disabled = true; await loadPlans(); if (state.order) await verify(); else render(); return;
  }
  if (item.hasAttribute("data-retry-payment")) { if (!state.live) await loadPlans(); return verify(); }
  if (item.dataset.checkOrder) {
    event.preventDefault(); state.order = item.dataset.checkOrder; state.invoice = null; state.notice = ""; state.error = ""; state.cancelMessage = ""; state.cancelFor = "";
    history.replaceState(null, "", pricingPath()); const checking = verify(); root.querySelector("[data-payment-status]")?.focus(); await checking; return;
  }
  if (item.dataset.selectPlan) return selectPlan(item.dataset.selectPlan);
});

if (returned === "cancelled") {
  state.notice = "back";
  history.replaceState(null, "", pricingPath());
}
await loadPlans();
if (state.order) await verify(); else render();
