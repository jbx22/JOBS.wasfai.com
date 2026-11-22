/**
 * Cloudflare Pages Function - POST /api/export-package
 *
 * Generates downloadable application files from an approved AI Writer kit.
 * DOCX is a minimal Office Open XML document. PDF is rendered by the
 * authenticated Rust/Typst service so Arabic shaping and font embedding remain correct.
 */
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
    const content = packageText(job, profile, kit);

    if (format === "docx") {
      const bytes = buildDocx(content);
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${base}.docx"`,
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
    "",
    "KEYWORD GAPS",
    ...(kit.keyword_gaps || []),
    "",
    "NEXT ACTIONS",
    ...(kit.next_actions || []),
  ]
    .filter((x) => x != null)
    .join("\n");
}

function buildDocx(text) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${text
      .split(/\r?\n/)
      .map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line || " ")}</w:t></w:r></w:p>`)
      .join("\n")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  return zipStore([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`],
    ["word/document.xml", documentXml],
  ]);
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

function zipStore(entries) {
  const encoder = new TextEncoder();
  const files = entries.map(([name, content]) => ({
    name,
    nameBytes: encoder.encode(name),
    data: encoder.encode(content),
  }));
  let offset = 0;
  const localParts = [];
  const centralParts = [];
  for (const file of files) {
    const crc = crc32(file.data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(file.nameBytes.length), u16(0),
      file.nameBytes, file.data,
    ]);
    localParts.push(local);
    centralParts.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(file.nameBytes.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), file.nameBytes,
    ]));
    offset += local.length;
  }
  const central = concatBytes(centralParts);
  return concatBytes([
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
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

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
