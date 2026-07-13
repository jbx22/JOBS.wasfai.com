/**
 * Cloudflare Pages Function - POST /api/ai-writer-chat
 *
 * Interactive interview-prep chat for a generated application kit. Uses the
 * selected AI Writer model when a matching key is configured, and falls back to
 * a structured local answer when no key is available.
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const WRITERS = {
  deepseek: {
    provider: "deepseek",
    label: "DeepSeek V4 Flash",
    keyNames: ["DEEPSEEK_API_KEY", "AI_API_KEY"],
    baseUrlNames: ["DEEPSEEK_BASE_URL", "AI_BASE_URL"],
    modelNames: ["DEEPSEEK_MODEL", "AI_MODEL"],
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
  },
  "minimax-m3": {
    provider: "openrouter",
    label: "MiniMax M3",
    keyNames: ["OPENROUTER_API_KEY"],
    baseUrlNames: ["OPENROUTER_BASE_URL"],
    modelNames: ["MINIMAX_MODEL", "OPENROUTER_MINIMAX_MODEL"],
    defaultBaseUrl: OPENROUTER_BASE_URL,
    defaultModel: "minimax/minimax-m3",
  },
  "glm-5.2": {
    provider: "openrouter",
    label: "GLM 5.2",
    keyNames: ["OPENROUTER_API_KEY"],
    baseUrlNames: ["OPENROUTER_BASE_URL"],
    modelNames: ["GLM_MODEL", "OPENROUTER_GLM_MODEL"],
    defaultBaseUrl: OPENROUTER_BASE_URL,
    defaultModel: "z-ai/glm-5.2",
  },
  "kimi-2.7": {
    provider: "openrouter",
    label: "Kimi K2.7",
    keyNames: ["OPENROUTER_API_KEY"],
    baseUrlNames: ["OPENROUTER_BASE_URL"],
    modelNames: ["KIMI_MODEL", "OPENROUTER_KIMI_MODEL"],
    defaultBaseUrl: OPENROUTER_BASE_URL,
    defaultModel: "moonshotai/kimi-k2.7-code",
  },
};

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const job = normalizeJob(payload.job || {});
    const profile = normalizeProfile(payload.profile || {});
    const kit = payload.kit || {};
    const question = String(payload.question || "").trim();
    const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];
    const writer = resolveWriter(context.env || {}, payload.ai_model || "deepseek");

    if (!question) {
      return json({ error: "Missing interview question.", code: "BAD_REQUEST" }, 400);
    }

    const ai = await askAi(writer, job, profile, kit, question, history);
    return json(
      ai || {
        provider: "template",
        model: "local-interview-coach",
        writer_label: "Local interview coach",
        answer: fallbackAnswer(job, profile, question),
      },
    );
  } catch (error) {
    return json(
      {
        error: "AI Writer interview chat failed.",
        code: "AI_WRITER_CHAT_ERROR",
        detail: error && error.message ? error.message : "Unknown error",
      },
      500,
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function askAi(writer, job, profile, kit, question, history) {
  if (!writer.apiKey) return null;
  const response = await fetch(`${writer.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${writer.apiKey}`,
      "Content-Type": "application/json",
      ...openRouterHeaders(writer),
    },
    body: JSON.stringify({
      model: writer.model,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are AI Writer / AI كاتب, an interview coach for MENA job applications. Answer only from the job, profile, and generated application kit. Be practical, concise, bilingual when useful, and never invent experience.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Answer the subscriber's interview-prep question.",
            job,
            profile,
            generated_kit: {
              ar_resume: kit.ar_resume || "",
              en_resume: kit.en_resume || "",
              ar_cover_letter: kit.ar_cover_letter || "",
              en_cover_letter: kit.en_cover_letter || "",
              ar_interview_prep: kit.ar_interview_prep || [],
              en_interview_prep: kit.en_interview_prep || [],
            },
            recent_history: history,
            question,
            answer_rules: [
              "Start with a direct answer.",
              "Give a STAR-style structure when the user asks how to answer.",
              "Name likely gaps honestly and provide bridge wording.",
              "Suggest one follow-up question to ask the interviewer.",
            ],
          }),
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const answer = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!answer) return null;
  return {
    provider: writer.provider,
    model: writer.model,
    writer_label: writer.label,
    answer,
  };
}

function openRouterHeaders(writer) {
  if (String(writer.baseUrl || "").replace(/\/+$/, "") !== OPENROUTER_BASE_URL) return {};
  return {
    "HTTP-Referer": "https://jobs.wasfai.com",
    "X-Title": "JOBS.wasfai.com AI Writer",
  };
}

function fallbackAnswer(job, profile, question) {
  const skills = profile.resume_skills || "your strongest relevant skills";
  return [
    `Direct answer: connect your answer to ${job.title || "the role"} at ${job.employer || "the company"} and use evidence from your original resume.`,
    "",
    "Suggested structure:",
    `- Situation: briefly describe a project related to ${skills}.`,
    "- Task: explain the business or operational target.",
    "- Action: name what you personally led, improved, built, or coordinated.",
    "- Result: give a number, delivery outcome, cost/time reduction, quality gain, or stakeholder result.",
    "",
    `Bridge if there is a gap: \"I have not done that exact environment, but my work in ${skills} gives me the base to deliver it quickly. I would start by clarifying success metrics and mapping the first 30 days.\"`,
    "",
    `Question to ask them: \"What would make the first 90 days successful for this ${job.title || "role"}?\"`,
    "",
    `Your question was: ${question}`,
  ].join("\n");
}

function normalizeJob(job) {
  return {
    id: String(job.id || ""),
    title: String(job.title || ""),
    employer: String(job.employer || ""),
    location: String(job.location || ""),
    description: String(job.description || ""),
    fit_explanation: String(job.fit_explanation || ""),
  };
}

function normalizeProfile(profile) {
  return {
    display_name: String(profile.display_name || ""),
    resume_skills: String(profile.resume_skills || ""),
    resume_languages: String(profile.resume_languages || "Arabic, English"),
    resume_work_examples: String(profile.resume_work_examples || ""),
    resume_text: String(profile.resume_text || ""),
  };
}

function resolveWriter(env, requested) {
  const key = WRITERS[requested] ? requested : "deepseek";
  const config = WRITERS[key];
  return {
    provider: config.provider,
    label: config.label,
    apiKey: firstEnv(env, config.keyNames),
    baseUrl: firstEnv(env, config.baseUrlNames) || config.defaultBaseUrl,
    model: firstEnv(env, config.modelNames) || config.defaultModel,
  };
}

function firstEnv(env, names) {
  for (const name of names) {
    if (env[name]) return env[name];
  }
  return "";
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
