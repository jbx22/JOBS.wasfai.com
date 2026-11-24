import { PERSONAL_AI_MODELS } from "../../public/personal-ai-models.js";
import { PERSONAL_OPENROUTER_PROVIDER, recordAiUsage } from "./_ai_usage.js";
import { DEEPSEEK_BASE_URL, DEEPSEEK_LABEL, DEEPSEEK_MODEL, deepseekModel, resumeDeepseekKey } from "./_deepseek.js";
import { getJobDb } from "./_db.js";
import { readAiPreferences } from "./_state.js";
import { getUserOpenRouterKey } from "./openrouter/_shared.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const PLATFORM_WRITERS = {
  "minimax-m3": { label: "MiniMax M3", model: "minimax/minimax-m3", modelNames: ["MINIMAX_MODEL", "OPENROUTER_MINIMAX_MODEL"] },
  "glm-5.2": { label: "GLM 5.2", model: "z-ai/glm-5.2", modelNames: ["GLM_MODEL", "OPENROUTER_GLM_MODEL"] },
};

export class CandidateAiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
  toJSON() {
    return { error: this.message, code: this.code };
  }
}

function platformWriter(env, payload, route) {
  const chat = route === "ai-writer-chat";
  const requested = payload.ai_model || payload.writer_model;
  const modelId = route === "resume-coach" ? "deepseek" : requested;
  if (Object.hasOwn(PLATFORM_WRITERS, modelId)) {
    const config = PLATFORM_WRITERS[modelId];
    return {
      provider: "openrouter", label: config.label, apiKey: env.OPENROUTER_API_KEY,
      model: env[config.modelNames[0]] || env[config.modelNames[1]] || config.model,
      baseUrl: env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL,
    };
  }
  if ((modelId === "luna" || (chat && modelId !== "deepseek")) && env.OPENAI_API_KEY) {
    return {
      provider: "openai", label: "GPT-5.6 Luna", apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || env.LUNA_MODEL || "gpt-5.6-luna",
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    };
  }
  return {
    provider: "deepseek", label: DEEPSEEK_LABEL,
    apiKey: chat ? env.DEEPSEEK_API_KEY || env.AI_API_KEY : resumeDeepseekKey(env),
    model: route === "resume-coach" ? DEEPSEEK_MODEL : deepseekModel(env.DEEPSEEK_MODEL || env.AI_MODEL),
    baseUrl: env.DEEPSEEK_BASE_URL || env.AI_BASE_URL || DEEPSEEK_BASE_URL,
  };
}

export function resolveCandidateWriter(env, payload, route) {
  const source = Object.hasOwn(payload, "billing_source") ? payload.billing_source : "jobs";
  if (source === "jobs") return { ...platformWriter(env, payload, route), billingSource: source };
  if (source !== PERSONAL_OPENROUTER_PROVIDER) {
    throw new CandidateAiError("INVALID_BILLING_SOURCE", "Choose Jobs or your personal OpenRouter account.", 400);
  }
  const option = PERSONAL_AI_MODELS.find(item => item.id === payload.ai_model);
  if (!option) throw new CandidateAiError("PERSONAL_MODEL_REQUIRED", "Select a supported model and inference provider.", 400);
  return {
    billingSource: source, provider: PERSONAL_OPENROUTER_PROVIDER, modelId: option.id, label: option.label,
    model: option.model, host: option.host, hostSlug: option.hostSlug, baseUrl: OPENROUTER_BASE_URL,
  };
}

async function authorizedKey(env, userId, writer) {
  let saved;
  try {
    saved = await readAiPreferences(getJobDb(env), userId);
  } catch {
    throw new CandidateAiError("AI_PREFERENCE_UNAVAILABLE", "Your saved AI settings could not be verified. Try again.", 503);
  }
  const personal = writer.billingSource === PERSONAL_OPENROUTER_PROVIDER;
  if (writer.billingSource !== saved.aiBillingSource || (personal && writer.modelId !== saved.aiPersonalModel)) {
    throw new CandidateAiError("AI_PREFERENCE_CHANGED", "Reload your user profile and review the saved AI account and model before trying again.", 409);
  }
  if (!personal) return writer.apiKey;
  let apiKey;
  try {
    apiKey = await getUserOpenRouterKey(env, userId);
  } catch (error) {
    if (error?.code === "OPENROUTER_RECONNECT_REQUIRED") {
      throw new CandidateAiError("OPENROUTER_RECONNECT_REQUIRED", "Reconnect your OpenRouter account to use this model.", 409);
    }
    throw new CandidateAiError("OPENROUTER_CONNECTION_UNAVAILABLE", "Your OpenRouter connection could not be read. Try again.", 503);
  }
  if (!apiKey) throw new CandidateAiError("OPENROUTER_NOT_CONNECTED", "Connect your OpenRouter account to use its credits.", 409);
  return apiKey;
}

export function writerReceipt(writer) {
  return {
    provider: writer.provider, model: writer.model, billing_source: writer.billingSource,
    ...(writer.host ? { inference_provider: writer.host } : {}),
  };
}

function upstreamFailure(writer, status) {
  const personal = writer.billingSource === PERSONAL_OPENROUTER_PROVIDER;
  if (personal && status === 402) return new CandidateAiError("OPENROUTER_CREDITS_REQUIRED", "Check the balance and spending limits on your OpenRouter account.", 402);
  if (personal && status === 401) return new CandidateAiError("OPENROUTER_RECONNECT_REQUIRED", "Reconnect your OpenRouter account to use this model.", 403);
  if (personal && status === 403) return new CandidateAiError("OPENROUTER_REQUEST_DENIED", "Your OpenRouter account or the selected provider declined this request.", 403);
  if (status === 429) return new CandidateAiError("AI_BUSY", "The selected AI provider is busy. Try again later.", personal ? 429 : 503);
  return new CandidateAiError("AI_UNAVAILABLE", "The selected AI provider is temporarily unavailable.", 503);
}

// All attempted completions, including paid but unusable answers, get one usage row.
// The credential, upstream error body, prompt and generated text never enter telemetry.
export async function candidateCompletion(context, user, writer, route, body, signal, readContent) {
  // A later completion (such as quality review) must recheck a payer or connection changed in another tab.
  const apiKey = await authorizedKey(context.env, user.sub, writer);
  if (!apiKey) throw upstreamFailure(writer);
  let usage;
  let status = "provider_error";
  try {
    const base = writer.baseUrl.trim().replace(/\/+$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST", redirect: "manual", signal,
      headers: {
        Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
        ...(base === OPENROUTER_BASE_URL ? { "HTTP-Referer": "https://jobs.wasfai.com", "X-Title": "JOBS.wasfai.com AI Writer" } : {}),
      },
      body: JSON.stringify({
        ...body, model: writer.model,
        ...(writer.hostSlug ? { provider: { only: [writer.hostSlug], allow_fallbacks: false } } : {}),
      }),
    });
    if (!response.ok) throw upstreamFailure(writer, response.status);
    const data = await response.json();
    usage = data?.usage;
    const choice = data?.choices?.[0];
    if (data?.error || choice?.error || choice?.finish_reason === "error") {
      throw upstreamFailure(writer, Number(data?.error?.code || choice?.error?.code));
    }
    const value = choice?.finish_reason === "length" ? null : readContent(choice?.message?.content);
    status = value ? "ok" : "invalid_output";
    return value;
  } catch (error) {
    if (error instanceof CandidateAiError) throw error;
    if (signal.aborted || error?.name === "AbortError") {
      status = "timeout";
      throw new CandidateAiError("AI_TIMEOUT", "The selected AI provider timed out.", 503);
    }
    throw upstreamFailure(writer);
  } finally {
    await recordAiUsage(context, user, { route, provider: writer.provider, model: writer.model, usage, status });
  }
}
