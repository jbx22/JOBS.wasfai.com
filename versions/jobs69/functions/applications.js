import { page, loginGate } from "./_recruitment_page.js";

export function onRequestGet() {
  return page("متابعة طلباتي", `<div data-portal-gate>${loginGate("/applications")}</div>
    <section class="recruitment-card" data-candidate-dashboard hidden><h2>طلبات التوظيف</h2>
    <p class="muted">يمكنك سحب طلبك لإيقاف وصول الشركة إلى سيرتك وبيانات اتصالك من المنصة.</p><div data-my-applications></div></section>`,
    { path: "/applications", private: true });
}
