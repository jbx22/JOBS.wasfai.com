import { page, loginGate } from "./_recruitment_page.js";

export function onRequestGet() {
  return page("مساحة أصحاب العمل", `<div data-portal-gate>${loginGate("/employers")}</div><div data-employer-dashboard hidden>
    <section class="recruitment-card"><h2>بيانات الشركة</h2><p class="muted">تراجع الإدارة بيانات السجل التجاري يدوياً قبل السماح بنشر الوظائف. تعديل بيانات الشركة يعيدها للمراجعة.</p>
    <p data-company-status></p><form data-company-form class="recruitment-grid">
    <label>اسم الشركة<input name="company_name" required minlength="2" maxlength="180" autocomplete="organization"></label>
    <label>رقم السجل التجاري<input name="registration_number" required minlength="3" maxlength="80"></label>
    <label>موقع الشركة · HTTPS<input name="website" type="url" placeholder="https://example.com"></label>
    <button class="btn primary">حفظ وإرسال للمراجعة</button></form></section>
    <section class="recruitment-card" data-post-job hidden><h2>إضافة وظيفة</h2><p class="muted">تراجع الإدارة الإعلان قبل نشره. الرواتب المعلنة بالريال السعودي شهرياً.</p>
    <form data-job-form class="recruitment-grid">
      <label>المسمى الوظيفي<input name="title" required minlength="3" maxlength="180"></label>
      <label>المدينة<input name="city" required minlength="2" maxlength="120"></label>
      <label>الدولة<select name="country_code"><option value="SA">السعودية</option><option value="AE">الإمارات</option><option value="BH">البحرين</option><option value="KW">الكويت</option><option value="OM">عمان</option><option value="QA">قطر</option><option value="EG">مصر</option><option value="JO">الأردن</option></select></label>
      <label>المهنة أو التخصص<input name="profession" required minlength="2" maxlength="120"></label>
      <label>الحد الأدنى للخبرة · سنة<input name="experience_min" type="number" min="0" max="50" value="0" required></label>
      <label>نوع الدوام<select name="employment_type"><option value="FULL_TIME">دوام كامل</option><option value="PART_TIME">دوام جزئي</option><option value="CONTRACTOR">تعاقد</option><option value="TEMPORARY">مؤقت</option><option value="INTERN">تدريب</option></select></label>
      <label>الحد الأدنى للراتب · ر.س/شهر<input name="salary_min" type="number" min="0" max="1000000"></label>
      <label>الحد الأعلى للراتب · ر.س/شهر<input name="salary_max" type="number" min="0" max="1000000"></label>
      <label>آخر يوم للتقديم<input name="valid_through" type="date" required></label>
      <label class="wide">وصف الوظيفة والمتطلبات<textarea name="description" required minlength="80" maxlength="8000"></textarea></label>
      <button class="btn primary">إرسال الإعلان للمراجعة</button>
    </form></section><section class="recruitment-card"><h2>إعلاناتي</h2><div data-employer-jobs></div></section>
    <section class="recruitment-card" data-applicants-panel hidden><h2>المتقدمون</h2><div data-applicants></div></section></div>`,
    { path: "/employers", private: true });
}
