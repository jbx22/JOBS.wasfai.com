// Server-rendered public page for verified job openings.
// A private candidate pipeline entry must never be represented as a public job.
const CANONICAL = "https://jobs.wasfai.com";

function escapeHtml(input) {
  return String(input ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeSourceUrl(input) {
  try {
    const url = new URL(String(input || ""));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function countryFor(location) {
  const text = String(location || "").toLowerCase();
  if (/saudi arabia|السعودية|riyadh|الرياض|jeddah|jedda|جدة|dammam|الدمام|najran|نجران/.test(text)) return "SA";
  if (/egypt|مصر|cairo|القاهرة/.test(text)) return "EG";
  if (/united arab emirates|الإمارات|dubai|دبي|abu dhabi|أبوظبي/.test(text)) return "AE";
  return "";
}

function dateIsValid(value) {
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(value || ""))
    && Number.isFinite(Date.parse(value));
}

function jobPostingJsonLd(job, canonical) {
  // Never synthesize an employer publication date from our ingestion date.
  // Google requires the ORIGINAL posted date and a known physical location.
  const country = countryFor(job.location);
  if (!dateIsValid(job.published_at) || !country || !job.description || String(job.description).length >= 1200) return "";
  const data = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: String(job.title),
    description: "<p>" + escapeHtml(job.description).replace(/\r?\n/g, "<br>") + "</p>",
    identifier: { "@type": "PropertyValue", name: String(job.employer), value: String(job.id) },
    datePosted: String(job.published_at),
    hiringOrganization: { "@type": "Organization", name: String(job.employer) },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: country, addressLocality: String(job.location) } },
    url: canonical,
  };
  if (dateIsValid(job.valid_through)) data.validThrough = String(job.valid_through);
  return '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, "\\u003c") + '</script>';
}

function errorPage(message, status) {
  const body = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>فرصة غير متاحة | JOBS.wasfai.com</title></head><body><main><h1>'
    + escapeHtml(message) + '</h1><a href="/app">العودة إلى البحث</a></main></body></html>';
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function onRequestGet(context) {
  const id = String(context.params?.id || "");
  if (!id || id.length > 180 || id.includes("/")) return errorPage("رابط الوظيفة غير صالح", 400);
  const api = String(context.env?.JOBS_INGESTION_URL || "https://jobs-wasfai-ingestion.jabosaag.workers.dev").replace(/\/+$/, "");
  let payload;
  try {
    const response = await fetch(api + "/jobs/" + encodeURIComponent(id), { headers: { Accept: "application/json" } });
    if (response.status === 404) return errorPage("هذه الفرصة غير متاحة أو انتهت", 404);
    if (!response.ok) return errorPage("تعذر تحميل الوظيفة حالياً", 503);
    payload = await response.json();
  } catch {
    return errorPage("تعذر تحميل الوظيفة حالياً", 503);
  }
  const job = payload?.job;
  if (!payload?.ok || !job || job.verification_status !== "live" || !job.title || !job.employer || !job.description) {
    return errorPage("هذه الفرصة غير متاحة أو انتهت", 404);
  }
  const canonical = CANONICAL + "/openings/" + encodeURIComponent(id);
  const description = String(job.description).slice(0, 30000);
  const excerpt = description.slice(0, 155).replace(/\s+/g, " ");
  const external = safeSourceUrl(job.source_url);
  const structuredData = jobPostingJsonLd({ ...job, description }, canonical);
  const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(job.title)} | ${escapeHtml(job.employer)} | JOBS.wasfai.com</title>
<meta name="description" content="${escapeHtml(excerpt)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(job.title)}">
<meta property="og:description" content="${escapeHtml(excerpt)}">
${structuredData}
<style>body{margin:0;background:#f7faf9;color:#15332e;font-family:system-ui,sans-serif;line-height:1.75}
main{max-width:850px;margin:24px auto;padding:22px}article{background:white;border:1px solid #d9e8e5;border-radius:16px;padding:26px}
h1{line-height:1.35}a{color:#0f766e}.button{display:inline-block;padding:10px 20px;background:#0f766e;color:white;text-decoration:none;border-radius:9px}
.meta{color:#56635f;margin-bottom:22px}.description{white-space:pre-line;overflow-wrap:anywhere}</style>
</head><body><main><p><a href="/app">JOBS.wasfai.com — العودة للبحث</a></p><article>
<h1>${escapeHtml(job.title)}</h1><p class="meta">${escapeHtml(job.employer)} · ${escapeHtml(job.location || "")}</p>
<h2>الوصف الوظيفي</h2><div class="description">${escapeHtml(description)}</div>
${external ? `<p><a class="button" href="${escapeHtml(external)}" target="_blank" rel="noopener noreferrer nofollow">التقديم لدى المصدر الأصلي</a></p>` : ""}
</article></main></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
