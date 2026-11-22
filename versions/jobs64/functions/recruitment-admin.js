import { page, loginGate } from "./_recruitment_page.js";

export function onRequestGet() {
  return page("إدارة التوظيف", `<div data-portal-gate>${loginGate("/recruitment-admin")}</div>
    <div data-recruitment-admin hidden><div class="recruitment-actions"><a class="btn ghost" href="/admin/">لوحة الإدارة الرئيسية</a><button class="btn ghost" data-refresh-moderation>تحديث</button></div>
    <section class="recruitment-card"><h2>مراجعة الشركات</h2><p class="muted">تحقق من السجل التجاري وارتباط الحساب بالشركة قبل الاعتماد. الاعتماد هنا مراجعة إدارية يدوية.</p><div data-review-companies></div></section>
    <section class="recruitment-card"><h2>مراجعة إعلانات الوظائف</h2><div data-review-jobs></div></section></div>`,
    { path: "/recruitment-admin", private: true });
}
