/**
 * Cloudflare Pages Function - POST /api/resume-coach
 *
 * Improves the subscriber's uploaded master resume before job search. This is
 * resume-first: the subscriber reviews/approves the stronger master resume,
 * then the app uses it as the source for matching and job-specific AI Writer
 * packages.
 */

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

export async function onRequestPost(context) {
  try {
    const payload = await context.request.json();
    const profile = normalizeProfile(payload.profile || {});

    if (!resumeReady(profile)) {
      return json({ error: "Add the original resume text before improvement.", code: "RESUME_REQUIRED" }, 400);
    }

    const ai = await improveWithDeepSeek(context.env || {}, profile);
    return json(ai || fallbackCoach(profile));
  } catch (error) {
    return json(
      {
        error: "AI resume coach failed.",
        code: "RESUME_COACH_ERROR",
        detail: error && error.message ? error.message : "Unknown error",
      },
      500,
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function improveWithDeepSeek(env, profile) {
  const apiKey = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = String(env.DEEPSEEK_BASE_URL || env.AI_BASE_URL || DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const model = env.DEEPSEEK_MODEL || env.AI_MODEL || DEEPSEEK_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are AI Writer / AI Kateb, a senior resume strategist for MENA jobs. Return only valid JSON. Improve clarity, ATS structure, and search keywords without inventing facts.",
          },
          { role: "user", content: buildPrompt(profile) },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;

    return {
      provider: "deepseek",
      model,
      ...validateCoach(parseAiJson(text), profile),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(profile) {
  return JSON.stringify({
    task:
      "Improve this subscriber's master resume before job search. This is not for one job yet. Make it stronger, searchable, and ready to be tailored later.",
    required_json_shape: {
      ar_master_resume: "Arabic improved master resume with sections and bullets",
      en_master_resume: "English improved master resume with sections and bullets",
      improvements: ["specific changes made or still needed"],
      search_profile: {
        target_titles: ["job titles to search"],
        keywords: ["search keywords and ATS terms"],
        locations: ["target regions/locations"],
        seniority: "seniority level",
      },
      approval_note: "short note telling the subscriber what to review before approving",
    },
    rules: [
      "Do not invent employers, degrees, certificates, dates, metrics, or tools.",
      "If a metric is missing, write a placeholder like [add measurable result].",
      "Use strong section headings, bullets, ATS keywords, and measurable achievement framing.",
      "Arabic and English resumes must be separate.",
      "Keep both master resumes broad enough for job search, not over-tailored to one job.",
      "Search keywords must come from the resume, target roles, and target regions.",
    ],
    profile,
  });
}

function validateCoach(raw, profile) {
  const fallback = fallbackCoach(profile);
  const searchProfile = raw.search_profile || {};
  return {
    ar_master_resume: ensureResume(cleanText(raw.ar_master_resume), fallback.ar_master_resume),
    en_master_resume: ensureResume(cleanText(raw.en_master_resume), fallback.en_master_resume),
    improvements: cleanList(raw.improvements).length ? cleanList(raw.improvements) : fallback.improvements,
    search_profile: {
      target_titles: cleanList(searchProfile.target_titles).length
        ? cleanList(searchProfile.target_titles)
        : fallback.search_profile.target_titles,
      keywords: cleanList(searchProfile.keywords).length ? cleanList(searchProfile.keywords) : fallback.search_profile.keywords,
      locations: cleanList(searchProfile.locations).length ? cleanList(searchProfile.locations) : fallback.search_profile.locations,
      seniority: cleanText(searchProfile.seniority) || fallback.search_profile.seniority,
    },
    approval_note: cleanText(raw.approval_note) || fallback.approval_note,
  };
}

function fallbackCoach(profile) {
  const skills = profile.resume_skills || "operations, project delivery, stakeholder management";
  const roles = splitTerms(profile.target_roles || profile.resume_seniority || "Operations Manager");
  const locations = splitTerms(profile.target_locations || profile.resume_regions || "Saudi Arabia, GCC");
  const lines = summarizeResume(profile.resume_text);
  return {
    provider: "template",
    model: "local-resume-coach",
    ar_master_resume:
      `الملخص المهني\n${profile.display_name} - مرشح بخبرة قابلة للتوجيه نحو ${profile.target_roles || "الأدوار المستهدفة"} مع تركيز على ${skills}.\n\n` +
      `المهارات الأساسية\n- ${skills}\n- لغات العمل: ${profile.resume_languages || "Arabic, English"}\n- الأسواق المستهدفة: ${profile.target_locations || profile.resume_regions || "Saudi Arabia, GCC"}\n\n` +
      `إنجازات مختارة\n${lines.map((line) => `- ${line}`).join("\n")}\n- [add measurable result] اربط أقوى إنجاز برقم أو أثر واضح.\n\n` +
      `كلمات مفتاحية\n- ${skills}`,
    en_master_resume:
      `Professional Summary\n${profile.display_name} - candidate positioned for ${profile.target_roles || "target roles"} with strengths in ${skills}.\n\n` +
      `Core Skills\n- ${skills}\n- Working languages: ${profile.resume_languages || "Arabic, English"}\n- Target markets: ${profile.target_locations || profile.resume_regions || "Saudi Arabia, GCC"}\n\n` +
      `Selected Achievements\n${lines.map((line) => `- ${line}`).join("\n")}\n- [add measurable result] connect the strongest achievement to a number or business outcome.\n\n` +
      `Search Keywords\n- ${skills}`,
    improvements: [
      "Converted the resume into ATS-friendly sections.",
      "Kept missing metrics as placeholders instead of inventing facts.",
      "Extracted search terms for matching jobs after approval.",
    ],
    search_profile: {
      target_titles: roles,
      keywords: splitTerms(skills),
      locations,
      seniority: profile.resume_seniority || "Senior",
    },
    approval_note: "Review missing metrics/placeholders, then approve this as the master resume before job search.",
  };
}

function normalizeProfile(profile) {
  return {
    display_name: String(profile.display_name || "Subscriber"),
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

function resumeReady(profile) {
  return (
    profile.resume_text.trim().length > 120 ||
    profile.resume_work_examples.trim().length > 40 ||
    profile.resume_skills.trim().length > 12
  );
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
    if (start < 0 || end <= start) throw new Error("AI response did not contain JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function ensureResume(value, fallback) {
  const text = cleanText(value);
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return lines >= 6 && words >= 120 ? text : fallback;
}

function summarizeResume(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  return lines.length ? lines : ["Original resume details were limited; add role history, education, certifications, and measured achievements."];
}

function splitTerms(value) {
  return String(value || "")
    .split(/[,،;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).slice(0, 12);
  const text = cleanText(value);
  return text ? splitTerms(text) : [];
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
