export const DEEPSEEK_MODEL = "deepseek-flash";
export const DEEPSEEK_LABEL = "DeepSeek V4.1 Flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export function deepseekModel(configured) {
  const model = String(configured || "").trim();
  return !model || /^deepseek-v4-flash(?:-vision-exp)?$/i.test(model) ? DEEPSEEK_MODEL : model;
}

export function resumeDeepseekKey(env) {
  return [env.JOBS_RESUME_DEEPSEEK_API_KEY, env.DEEPSEEK_API_KEY, env.AI_API_KEY]
    .find(value => typeof value === "string" && value.trim())?.trim() || "";
}
