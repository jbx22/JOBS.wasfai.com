/**
 * Cloudflare Pages Function - POST /api/export-package
 *
 * Generates downloadable application files from an approved AI Writer kit.
 * DOCX is a minimal Office Open XML document. PDF is rendered by the
 * authenticated Rust/Typst service so Arabic shaping and font embedding remain correct.
 */
import { buildDocx } from "../../public/resume-docx.mjs";
import { requireProtectedRequest } from "./_security.js";

export async function onRequestPost(context) {
  try {
    const access = await requireProtectedRequest(context, "export-package", 10);
    if (access.error) return access.error;
    const payload = await context.request.json();
    const format = String(payload.format || "docx").toLowerCase();
    const job = payload.job || {};
    const profile = payload.profile || {};
    const kit = payload.kit || {};
    const validation = validatePayload(job, profile, kit);
    if (validation) return validation;
    const base = safeFilename(`${profile.display_name || "subscriber"}-${job.employer || "company"}-${job.title || "application"}`);
    const document = payload.document || "package";
    if (!["package", "ar_resume", "en_resume"].includes(document) || (document !== "package" && format !== "docx")) {
      return json({ error: "Unsupported export selection.", code: "BAD_FORMAT" }, 400);
    }

    if (format === "docx") {
      const standalone = document !== "package";
      const content = standalone ? kit[document] : packageText(job, profile, kit);
      if (!String(content || "").trim()) {
        return json({ error: "The selected résumé is empty.", code: "PACKAGE_REQUIRED" }, 400);
      }
      const language = standalone ? document.slice(0, 2) : "";
      const bytes = buildDocx(content, language);
      const filename = standalone ? `${base}-cv-${language}` : base;
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${filename}.docx"`,
        },
      });
    }

    if (format === "pdf") {
      const rendererUrl = String(context.env?.TYPST_RENDER_URL || "").replace(/\/+$/, "");
      const rendererToken = String(context.env?.TYPST_RENDER_TOKEN || "");
      if (!rendererUrl || !rendererToken) {
        return json({ error: "Arabic PDF renderer is not configured.", code: "PDF_RENDERER_UNAVAILABLE" }, 503);
      }
      const response = await fetch(`${rendererUrl}/render-pdf`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${rendererToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ job, profile, kit }),
      });
      if (!response.ok) {
        return json({ error: "Arabic PDF rendering failed.", code: "PDF_RENDER_FAILED" }, 502);
      }
      return new Response(response.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}.pdf"`,
          "Cache-Control": "no-store, private",
        },
      });
    }

    return json({ error: "Unsupported export format.", code: "BAD_FORMAT" }, 400);
  } catch (error) {
    return json(
      {
        error: "Failed to export approved application package.",
        code: "EXPORT_FAILED",
        detail: error && error.message ? error.message : "Unknown error",
      },
      500,
    );
  }
}

function validatePayload(job, profile, kit) {
  const requiredJob = ["id", "title", "employer"];
  const missingJob = requiredJob.filter((key) => !String(job[key] || "").trim());
  if (missingJob.length) {
    return json({ error: "Missing job id, title, or employer.", code: "BAD_REQUEST", missing: missingJob }, 400);
  }
  if (kit.job_id && String(kit.job_id) !== String(job.id)) {
    return json({ error: "This application kit belongs to a different job.", code: "BAD_REQUEST" }, 400);
  }
  if (!String(profile.display_name || "").trim()) {
    return json({ error: "Missing subscriber profile name.", code: "BAD_REQUEST", missing: ["profile.display_name"] }, 400);
  }
  const sections = [
    kit.ar_resume,
    kit.en_resume,
    kit.ar_cover_letter,
    kit.en_cover_letter,
    ...(Array.isArray(kit.ar_interview_prep) ? kit.ar_interview_prep : []),
    ...(Array.isArray(kit.en_interview_prep) ? kit.en_interview_prep : []),
  ];
  const hasContent = sections.some((section) => String(section || "").trim().length > 40);
  if (!hasContent) {
    return json({ error: "Approved application package content is required before export.", code: "PACKAGE_REQUIRED" }, 400);
  }
  if (kit.quality_review?.approved !== true) {
    return json({ error: "The independent factual/ATS review must pass before export.", code: "QUALITY_REVIEW_REQUIRED" }, 409);
  }
  const english = `${kit.en_resume || ""}\n${kit.en_cover_letter || ""}\n${(kit.en_interview_prep || []).join("\n")}`;
  const latin = (english.match(/[A-Za-z]/g) || []).length;
  const arabic = (english.match(/[\u0600-\u06FF]/g) || []).length;
  if (latin < 100 || arabic > Math.max(2, Math.floor(latin * 0.03))) {
    return json({ error: "English application content failed the language gate.", code: "LANGUAGE_GATE_FAILED" }, 409);
  }
  const sourceEvidence = `${profile.approved_master_resume || ""} ${profile.resume_text || ""} ${profile.master_resume_en || ""} ${profile.master_resume_ar || ""}`.trim();
  if (sourceEvidence.length < 120) {
    return json({ error: "Approved resume evidence is required before export.", code: "SOURCE_EVIDENCE_REQUIRED" }, 409);
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function packageText(job, profile, kit) {
  return [
    `حزمة التقديم`,
    `${profile.display_name || "المرشح"} | ${job.title || "الدور"} | ${job.employer || "جهة العمل"}`,
    "",
    "ARABIC RESUME",
    kit.ar_resume || "",
    "",
    "ENGLISH RESUME",
    kit.en_resume || "",
    "",
    "ARABIC COVER LETTER",
    kit.ar_cover_letter || "",
    "",
    "ENGLISH COVER LETTER",
    kit.en_cover_letter || "",
    "",
    "INTERVIEW PREP - AR",
    ...(kit.ar_interview_prep || []),
    "",
    "INTERVIEW PREP - EN",
    ...(kit.en_interview_prep || []),
  ]
    .filter((x) => x != null)
    .join("\n");
}

function buildPdf(text) {
  const pages = chunkLines(
    text
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u0600-\u06FF]/g, " ")
      .split(/\r?\n/)
      .flatMap((line) => wrapLine(line, 86)),
    42,
  );
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  for (const lines of pages.length ? pages : [["حزمة التقديم"]]) {
    const stream = lines
      .map((line, index) => `BT /F1 10 Tf 50 ${770 - index * 17} Td (${pdfEscape(toPdfSafe(line))}) Tj ET`)
      .join("\n");
    const contentId = add(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  for (const id of pageIds) {
    objects[id - 1] = objects[id - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function chunkLines(lines, size) {
  const chunks = [];
  for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size));
  return chunks;
}

function wrapLine(line, width) {
  const value = String(line || " ");
  const out = [];
  for (let i = 0; i < value.length; i += width) out.push(value.slice(i, i + width));
  return out.length ? out : [" "];
}

function toPdfSafe(line) {
  return String(line || " ").replace(/[\u0600-\u06FF]+/g, "[Arabic text available in DOCX]");
}

function pdfEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function safeFilename(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "application-package";
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
