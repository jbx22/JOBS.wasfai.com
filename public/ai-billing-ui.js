import { PERSONAL_AI_MODELS } from "./personal-ai-models.js";

export { PERSONAL_AI_MODELS };
export const PERSONAL_SOURCE = "openrouter_personal";

export function aiDisclosure(locale, source, model, jobsModel, task) {
  const en = locale === "en";
  const info = ({
    coach: en ? "your résumé" : "سيرتك الذاتية",
    target: en ? "your résumé and the selected job posting" : "سيرتك وإعلان الوظيفة المختارة",
    writer: en ? "your résumé, the job posting and any tailoring notes" : "سيرتك وإعلان الوظيفة وملاحظات التخصيص",
    review: en ? "your résumé, the posting and your application documents" : "سيرتك والإعلان ومستندات التقديم",
    interview: en ? "your résumé, the job, your question and interview chat" : "سيرتك والوظيفة وسؤالك ومحادثة المقابلة",
    reply: en ? "your résumé, the job and the message you enter" : "سيرتك والوظيفة والرسالة التي تكتبها",
  })[task];
  let summary;
  if (source === PERSONAL_SOURCE) {
    const personal = PERSONAL_AI_MODELS.find(item => item.id === model);
    if (!personal) return en ? "Choose a personal model before continuing." : "اختر نموذجاً لحسابك الشخصي قبل المتابعة.";
    summary = en
      ? `Your personal account pays through your OpenRouter credits or provider billing settings. OpenRouter sends ${info} to ${personal.host} to run ${personal.label}.`
      : `يتحمّل حسابك الشخصي تكلفة الطلب عبر رصيد OpenRouter أو إعدادات فوترة المزوّد. يرسل OpenRouter ${info} إلى ${personal.host} لتشغيل ${personal.label}.`;
  } else {
    const route = jobsModel === "minimax-m3" ? "OpenRouter · MiniMax M3" : jobsModel === "glm-5.2" ? "OpenRouter · GLM 5.2" : "DeepSeek";
    summary = en
      ? `Jobs pays for this request under your plan. ${route} processes ${info}.`
      : `يتحمّل Jobs تكلفة الطلب ضمن باقتك. يعالج ${route} ${info}.`;
  }
  if (["target","writer"].includes(task)) summary += en ? " The kit and its quality review are separate AI requests using the same account." : "إعداد الحزمة ومراجعة جودتها طلبان منفصلان يستخدمان الحساب نفسه.";
  return summary;
}

export function personalErrorText(code, locale) {
  const en = locale === "en";
  switch (code) {
    case "OPENROUTER_REQUEST_DENIED": return en ? "OpenRouter or the selected provider declined this request. Review your OpenRouter settings before trying again." : "رفض OpenRouter أو المزوّد المختار هذا الطلب. راجع إعدادات OpenRouter قبل إعادة المحاولة.";
    case "OPENROUTER_CREDITS_REQUIRED": return en ? "Your OpenRouter account has insufficient credits. Add credits with OpenRouter, then retry." : "رصيد حسابك في OpenRouter غير كافٍ. أضف رصيداً لدى OpenRouter ثم أعد المحاولة.";
    case "OPENROUTER_RECONNECT_REQUIRED": return en ? "OpenRouter rejected the connection. Reconnect your account before retrying." : "رفض OpenRouter الاتصال. أعد ربط حسابك قبل المحاولة.";
    case "OPENROUTER_NOT_CONNECTED": return en ? "Connect your OpenRouter account to use personal credits." : "اربط حسابك في OpenRouter لاستخدام رصيدك الشخصي.";
    case "AI_BUSY": return en ? "Your selected provider is busy. Retry later using the same credits." : "المزوّد الذي اخترته مشغول. أعد المحاولة لاحقاً باستخدام الرصيد نفسه.";
    case "PERSONAL_MODEL_REQUIRED": return en ? "Choose one of the available personal models." : "اختر أحد النماذج المتاحة للاستخدام الشخصي.";
    case "AI_TIMEOUT": return en ? "Your provider did not finish in time. You can retry the same model." : "لم يكمل المزوّد الطلب في الوقت المحدد. يمكنك إعادة المحاولة بالنموذج نفسه.";
    case "AI_INVALID_DRAFT": return en ? "The provider returned an incomplete draft. Review any saved work before retrying." : "أعاد المزوّد مسودة غير مكتملة. راجع ما تم حفظه قبل إعادة المحاولة.";
    default: return en ? "The personal request could not be completed. Check your OpenRouter connection or retry later." : "تعذّر إكمال الطلب الشخصي. تحقّق من اتصال OpenRouter أو أعد المحاولة لاحقاً.";
  }
}
