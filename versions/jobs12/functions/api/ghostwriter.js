/**
 * Cloudflare Pages Function - POST /api/ghostwriter
 *
 * Builds a bilingual application kit for one job:
 * Arabic resume, English resume, Arabic cover letter, English cover letter,
 * Arabic interview prep, and English interview prep.
 *
 * DeepSeek V4 Flash is the default AI provider. Without credentials it returns
 * a deterministic, structured draft so the subscriber workflow still works in
 * production.
 */

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const AI_WRITER_MODELS = {
  deepseek: {
    provider: "deepseek",
    label: "DeepSeek V4 Flash",
    keyNames: ["DEEPSEEK_API_KEY", "AI_API_KEY"],
    baseUrlNames: ["DEEPSEEK_BASE_URL", "AI_BASE_URL"],
    modelNames: ["DEEPSEEK_MODEL", "AI_MODEL"],
    defaultBaseUrl: DEEPSEEK_BASE_URL,
    defaultModel: DEEPSEEK_MODEL,
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
    const writer = resolveAiWriter(context.env || {}, payload.ai_model || payload.writer_model || "deepseek");

    if (!job.id || !job.title || !job.employer) {
      return json({ error: "Missing job id, title, or employer.", code: "BAD_REQUEST" }, 400);
    }

    const env = context.env || {};
    const aiResult = await maybeGenerateWithAi(env, job, profile, writer);
    const kit = aiResult || buildFallbackKit(job, profile);

    return json({
      job_id: job.id,
      generated_at: new Date().toISOString(),
      provider: aiResult ? aiResult.provider : "template",
      model: aiResult ? aiResult.model : "local-template",
      ...kit,
      checklist: [
        "Review both CV versions against the job description.",
        "Keep one measurable achievement near the top.",
        "Use the Arabic letter for MENA/local recruiters and the English letter for global teams.",
        "Practice the first five interview questions before applying.",
      ],
    });
  } catch (error) {
    return json(
      {
        error: "Ghost writer failed to generate the application kit.",
        code: "GHOSTWRITER_ERROR",
        detail: error && error.message ? error.message : "Unknown error",
      },
      500,
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function normalizeJob(job) {
  return {
    id: String(job.id || ""),
    title: String(job.title || ""),
    employer: String(job.employer || ""),
    source: String(job.source || ""),
    location: String(job.location || ""),
    score: Number(job.score || 0),
    deadline: String(job.deadline || ""),
    description: String(job.description || ""),
    fit_explanation: String(job.fit_explanation || ""),
  };
}

function normalizeProfile(profile) {
  return {
    display_name: String(profile.display_name || "Jaber"),
    target_roles: String(profile.target_roles || ""),
    target_locations: String(profile.target_locations || ""),
    resume_skills: String(profile.resume_skills || ""),
    resume_languages: String(profile.resume_languages || "Arabic, English"),
    resume_seniority: String(profile.resume_seniority || ""),
    resume_regions: String(profile.resume_regions || ""),
    resume_work_examples: String(profile.resume_work_examples || ""),
    resume_text: String(profile.resume_text || ""),
  };
}

async function maybeGenerateWithAi(env, job, profile, writer) {
  const apiKey = writer.apiKey;
  if (!apiKey) return null;

  const baseUrl = writer.baseUrl.replace(/\/+$/, "");
  const model = writer.model;
  const prompt = buildPrompt(job, profile);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...openRouterHeaders(writer),
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a precise career ghost writer for MENA job applications. Return only valid JSON. Avoid generic hype, banned AI slop, and unsupported claims.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) return null;

  try {
    return {
      provider: writer.provider || "ai",
      writer_label: writer.label || "AI Writer",
      model,
      ...validateKit(parseAiJson(text), job, profile),
    };
  } catch {
    return null;
  }
}

function parseAiJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI response did not contain a JSON object.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function openRouterHeaders(writer) {
  if (String(writer.baseUrl || "").replace(/\/+$/, "") !== OPENROUTER_BASE_URL) return {};
  return {
    "HTTP-Referer": "https://jobs.wasfai.com",
    "X-Title": "JOBS.wasfai.com AI Writer",
  };
}

function resolveAiWriter(env, requested) {
  const key = AI_WRITER_MODELS[requested] ? requested : "deepseek";
  const config = AI_WRITER_MODELS[key];
  return {
    id: key,
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

function buildPrompt(job, profile) {
  return JSON.stringify({
    task:
      "Create a subscriber-ready bilingual job application kit for this exact job.",
    required_json_shape: {
      ar_resume: "Arabic full tailored CV document with titled sections and bullets",
      en_resume: "English full tailored CV document with titled sections and bullets",
      ar_cover_letter: "Arabic cover letter",
      en_cover_letter: "English cover letter",
      ar_interview_prep: ["Arabic interview question + answer bullets"],
      en_interview_prep: ["English interview question + answer bullets"],
      keyword_gaps: ["keywords to strengthen before applying"],
      next_actions: ["short action checklist"],
    },
    style_rules: [
      "Arabic and English must be separate outputs.",
      "The resume outputs must not be one paragraph.",
      "Each resume must include titled sections, bullets, and line breaks.",
      "Each resume must cover: headline, professional summary, core skills, selected achievements, relevant experience positioning, education/certifications if present, ATS keywords, and tailoring notes.",
      "Each resume should be 450-900 words when enough source material exists.",
      "No exaggerated claims.",
      "No words like passionate, synergy, rockstar, ninja, guru.",
      "Arabic should be direct and professional, not ceremonial.",
      "Use only evidence from profile, original resume text, and job context.",
    ],
    job,
    profile,
  });
}

function validateKit(raw, job, profile) {
  const fallback = buildFallbackKit(job, profile);
  return {
    ar_resume: ensureResumeDepth(cleanText(raw.ar_resume), fallback.ar_resume),
    en_resume: ensureResumeDepth(cleanText(raw.en_resume), fallback.en_resume),
    ar_cover_letter: cleanText(raw.ar_cover_letter),
    en_cover_letter: cleanText(raw.en_cover_letter),
    ar_interview_prep: cleanList(raw.ar_interview_prep),
    en_interview_prep: cleanList(raw.en_interview_prep),
    keyword_gaps: cleanList(raw.keyword_gaps),
    next_actions: cleanList(raw.next_actions),
  };
}

function buildFallbackKit(job, profile) {
  const skills = profile.resume_skills || "operations, product work, technical delivery";
  const examples = profile.resume_work_examples || "delivered practical workflows and business systems";
  const regions = profile.resume_regions || profile.target_locations || job.location || "MENA";
  const resumeSignals = summarizeOriginalResume(profile.resume_text);

  return {
    ar_resume:
      `العنوان المهني\n` +
      `${profile.display_name} - مرشح لدور ${job.title} لدى ${job.employer} مع تركيز واضح على ${skills}.\n\n` +
      `الملخص المهني\n` +
      `مرشح يستهدف دور ${job.title} في ${job.location || regions}. تعكس هذه النسخة خبرة عملية في ${examples}، وتعيد ترتيب السيرة لإظهار أقرب نقاط القوة لاحتياج ${job.employer}. تمت صياغة المحتوى بلغة مباشرة مناسبة لأنظمة ATS ومديري التوظيف دون ادعاءات غير مثبتة.\n\n` +
      `المهارات الأساسية\n` +
      `- ${skills}.\n` +
      `- لغات العمل: ${profile.resume_languages || "Arabic, English"}.\n` +
      `- الأسواق والمناطق: ${regions}.\n` +
      `- مستوى الخبرة: ${profile.resume_seniority || "Senior"}.\n\n` +
      `إنجازات وخبرات مختارة\n` +
      `- ${examples}.\n` +
      `- ربط الخبرة السابقة باحتياج الوظيفة: ${job.description || job.fit_explanation || "تحسين التنفيذ ورفع جودة التسليم"}.\n` +
      `- إبراز المهارات الأقرب للإعلان في أعلى السيرة مع أمثلة عملية قابلة للمراجعة.\n` +
      `- توجيه السيرة نحو ${job.location || regions} مع الحفاظ على بنية واضحة: ملخص، مهارات، خبرات، تعليم، شهادات، وكلمات مفتاحية.\n\n` +
      `إشارات من السيرة الأصلية\n` +
      `${resumeSignals.ar}\n\n` +
      `كلمات مفتاحية مقترحة\n` +
      `- ${(extractKeywordGaps(job, skills).join("\n- ") || skills)}\n\n` +
      `ملاحظات التخصيص قبل الإرسال\n` +
      `- استبدال أي مثال عام برقم أو نتيجة من السيرة الأصلية.\n` +
      `- وضع أقوى إنجاز مطابق في الثلث الأول من السيرة.\n` +
      `- مراجعة المسمى والمهارات مقابل إعلان ${job.employer} قبل التقديم.`,
    en_resume:
      `Professional Headline\n` +
      `${profile.display_name} - candidate for the ${job.title} role at ${job.employer}, positioned around ${skills}.\n\n` +
      `Professional Summary\n` +
      `Candidate targeting ${job.title} in ${job.location || regions}. This version reframes the profile around ${examples} and highlights the evidence most relevant to ${job.employer}. The language stays direct, ATS-friendly, and grounded in the supplied resume/profile details.\n\n` +
      `Core Skills\n` +
      `- ${skills}.\n` +
      `- Working languages: ${profile.resume_languages || "Arabic, English"}.\n` +
      `- Regional exposure: ${regions}.\n` +
      `- Seniority: ${profile.resume_seniority || "Senior"}.\n\n` +
      `Selected Achievements and Experience Positioning\n` +
      `- ${examples}.\n` +
      `- Connect prior work to the role need: ${job.description || job.fit_explanation || "execution quality, delivery discipline, and measurable outcomes"}.\n` +
      `- Keep the strongest matching skills near the top of the CV and support them with practical examples.\n` +
      `- Adapt the CV for ${job.location || regions} with a clear structure: summary, skills, experience, education, certifications, and keywords.\n\n` +
      `Signals from Original Resume\n` +
      `${resumeSignals.en}\n\n` +
      `Suggested ATS Keywords\n` +
      `- ${(extractKeywordGaps(job, skills).join("\n- ") || skills)}\n\n` +
      `Tailoring Notes Before Sending\n` +
      `- Replace any generic example with a measured result from the original resume.\n` +
      `- Place the strongest matching achievement in the top third of the CV.\n` +
      `- Review the title and skills against ${job.employer}'s posting before applying.`,
    ar_cover_letter:
      `السادة فريق التوظيف في ${job.employer}،\n\n` +
      `أرفق اهتمامي بدور ${job.title}. ما جذبني في هذه الفرصة هو ارتباطها المباشر بخبرتي في ${skills}، ` +
      `وبالعمل على ملفات تتطلب وضوحاً في التنفيذ ونتائج قابلة للقياس.\n\n` +
      `سأركز في المقابلة على أمثلة عملية من ${examples}، وكيف يمكن تحويلها إلى أثر واضح في هذا الدور. ` +
      `يسعدني مشاركة تفاصيل أكثر عند ترتيب مقابلة.\n\n` +
      `مع التحية،\n${profile.display_name}`,
    en_cover_letter:
      `Dear ${job.employer} hiring team,\n\n` +
      `I am applying for the ${job.title} role. The opportunity aligns with my work in ${skills} and with projects where clear execution, practical judgment, and measurable outcomes matter.\n\n` +
      `In an interview, I would highlight examples from ${examples} and connect them directly to the needs of this role. I would welcome the chance to discuss how I can contribute.\n\n` +
      `Regards,\n${profile.display_name}`,
    ar_interview_prep: [
      `عرّف بنفسك لهذا الدور: ابدأ بخبرتك الأقرب لـ ${job.title} ثم اربطها باحتياج ${job.employer}.`,
      `لماذا هذه الشركة؟ اذكر السوق أو المنتج أو طبيعة الدور، ثم مثالاً عملياً من خبرتك.`,
      `ما أقوى دليل لديك؟ جهز قصة مختصرة: المشكلة، ما فعلته، النتيجة، وما ستطبقه هنا.`,
      `ما الفجوة المحتملة؟ حضّر إجابة صريحة مع خطة تعلم أو تعويض واضحة.`,
      `ما أسئلتك لهم؟ اسأل عن أول 90 يوماً، مقاييس النجاح، والفريق الذي ستعمل معه.`,
    ],
    en_interview_prep: [
      `Tell me about yourself: start with the experience closest to ${job.title}, then connect it to ${job.employer}'s need.`,
      `Why this company? Mention the market, product, or role context, then add one practical example.`,
      `What is your strongest evidence? Prepare a short story: problem, action, result, and how it applies here.`,
      `What is a possible gap? Give a direct answer with a clear learning or mitigation plan.`,
      `What will you ask them? Ask about the first 90 days, success metrics, and the team setup.`,
    ],
    keyword_gaps: extractKeywordGaps(job, skills),
    next_actions: [
      "Paste the final job description before exporting the kit.",
      "Replace generic examples with measured achievements.",
      "Choose Arabic or English letter based on recruiter language.",
      "Practice the interview opener out loud once before applying.",
    ],
  };
}

function extractKeywordGaps(job, skills) {
  const text = `${job.title} ${job.description} ${job.fit_explanation}`.toLowerCase();
  const candidates = ["leadership", "stakeholder management", "operations", "automation", "data", "arabic", "english", "cloud", "rust", "sql"];
  const known = skills.toLowerCase();
  return candidates
    .filter((term) => text.includes(term) && !known.includes(term))
    .slice(0, 5);
}

function summarizeOriginalResume(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) {
    return {
      ar: "- لم يتم إدخال نص سيرة كامل بعد؛ أضف السيرة الأصلية لتحسين الدقة والطول.\n- استخدم الحقول المتاحة كإشارات مؤقتة حتى يتم إدخال السيرة.",
      en: "- No full original resume text was provided yet; add it to improve accuracy and depth.\n- The profile fields are used as temporary signals until the resume is added.",
    };
  }
  return {
    ar: lines.map((line) => `- ${line}`).join("\n"),
    en: lines.map((line) => `- ${line}`).join("\n"),
  };
}

function ensureResumeDepth(value, fallback) {
  const text = cleanText(value);
  const lineCount = text.split(/\r?\n/).filter((line) => line.trim()).length;
  const bulletCount = (text.match(/(^|\n)\s*[-•]/g) || []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (lineCount < 8 || bulletCount < 4 || wordCount < 180) {
    return fallback;
  }
  return text;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).slice(0, 8);
  const text = cleanText(value);
  return text ? [text] : [];
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
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
