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
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_FALLBACK_MODEL = "gpt-4.1-mini";

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const job = normalizeJob(payload.job || {});
    const profile = normalizeProfile(payload.profile || {});

    if (!job.id || !job.title || !job.employer) {
      return json({ error: "Missing job id, title, or employer.", code: "BAD_REQUEST" }, 400);
    }

    const env = context.env || {};
    const aiResult = await maybeGenerateWithAi(env, job, profile);
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
  };
}

async function maybeGenerateWithAi(env, job, profile) {
  const usingDeepSeek = Boolean(env.DEEPSEEK_API_KEY || env.AI_API_KEY);
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (
    env.DEEPSEEK_BASE_URL ||
    env.AI_BASE_URL ||
    (usingDeepSeek ? DEEPSEEK_BASE_URL : OPENAI_BASE_URL)
  ).replace(/\/+$/, "");
  const model = env.DEEPSEEK_MODEL || env.AI_MODEL || (usingDeepSeek ? DEEPSEEK_MODEL : OPENAI_FALLBACK_MODEL);
  const prompt = buildPrompt(job, profile);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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
      provider: usingDeepSeek ? "deepseek" : "ai",
      model,
      ...validateKit(JSON.parse(text)),
    };
  } catch {
    return null;
  }
}

function buildPrompt(job, profile) {
  return JSON.stringify({
    task:
      "Create a subscriber-ready bilingual job application kit for this exact job.",
    required_json_shape: {
      ar_resume: "Arabic tailored CV summary and bullets",
      en_resume: "English tailored CV summary and bullets",
      ar_cover_letter: "Arabic cover letter",
      en_cover_letter: "English cover letter",
      ar_interview_prep: ["Arabic interview question + answer bullets"],
      en_interview_prep: ["English interview question + answer bullets"],
      keyword_gaps: ["keywords to strengthen before applying"],
      next_actions: ["short action checklist"],
    },
    style_rules: [
      "Arabic and English must be separate outputs.",
      "No exaggerated claims.",
      "No words like passionate, synergy, rockstar, ninja, guru.",
      "Arabic should be direct and professional, not ceremonial.",
      "Use only evidence from profile and job context.",
    ],
    job,
    profile,
  });
}

function validateKit(raw) {
  return {
    ar_resume: cleanText(raw.ar_resume),
    en_resume: cleanText(raw.en_resume),
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

  return {
    ar_resume:
      `ملخص مهني عربي\n` +
      `مرشح يستهدف دور ${job.title} لدى ${job.employer} مع تركيز على ${skills}. ` +
      `يعكس الملف خبرة عملية في ${examples} وسياق إقليمي مناسب لـ ${regions}.\n\n` +
      `نقاط مخصصة للسيرة\n` +
      `- ربط الخبرة السابقة باحتياج الوظيفة: ${job.description || job.fit_explanation || "تحسين التنفيذ ورفع جودة التسليم"}.\n` +
      `- إبراز المهارات الأقرب للإعلان: ${skills}.\n` +
      `- توجيه السيرة نحو ${job.location || regions} مع الحفاظ على نسخة واضحة قابلة للقراءة من أنظمة ATS.`,
    en_resume:
      `English CV Summary\n` +
      `Candidate targeting the ${job.title} role at ${job.employer}, with practical strength in ${skills}. ` +
      `The profile is positioned around ${examples} and regional context across ${regions}.\n\n` +
      `Tailored CV Bullets\n` +
      `- Connect prior work to the role need: ${job.description || job.fit_explanation || "execution quality, delivery discipline, and measurable outcomes"}.\n` +
      `- Keep the strongest matching keywords near the top: ${skills}.\n` +
      `- Adapt the CV for ${job.location || regions} while keeping an ATS-friendly, single-column structure.`,
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
