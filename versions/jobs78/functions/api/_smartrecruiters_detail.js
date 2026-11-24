// Selected-posting detail enrichment adapted from the MIT-licensed Career-Ops provider,
// revision 9d61e5a457d575cb57372aca116650933f32809e. See workers/ingestion/LICENSE.career-ops.
import { SMARTRECRUITERS_BOARDS } from "../../workers/ingestion/src/boards.js";
import { fetchPublicPayload, jobDescription } from "../../workers/ingestion/src/index.js";
import { APPLY_NOTICE } from "../../workers/ingestion/src/smartrecruiters.js";

function publicPostingId(job, board) {
  if (!board || job.kind !== "ingested" || !job.id.startsWith(board.id + "-")) return "";
  const id = job.id.slice(board.id.length + 1);
  if (!/^\d{1,24}$/.test(id)) return "";
  let url;
  try { url = new URL(job.source_url); } catch { return ""; }
  const [, slug, advert, ...extra] = url.pathname.split("/");
  if (url.origin !== "https://jobs.smartrecruiters.com" || url.username || url.password || extra.length ||
      slug !== board.slug || !(advert === id || advert?.startsWith(id + "-"))) return "";
  return id;
}

// Use a short, contiguous excerpt from each job-specific section. Preserve technical
// names and qualifications in the employer's language and leave the full advert at source.
function sectionExcerpt(raw) {
  if (typeof raw !== "string") return "";
  const text = jobDescription(raw).replace(/(?:^|\n)- /g, " ").replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/u);
  if (words.length <= 36 && text.length <= 320) return text;
  const excerpt = words.slice(0, 36).join(" ");
  return (excerpt.length > 320 ? excerpt.slice(0, 320).replace(/\s+\S*$/u, "") : excerpt) + "…";
}

function postingSummary(detail, id) {
  if (String(detail?.id || "") !== id || (detail.visibility && detail.visibility !== "PUBLIC") ||
      (detail.location?.country && String(detail.location.country).toLowerCase() !== "sa") || detail.active === false) return "";
  const sections = detail.jobAd?.sections;
  const metadata = ["department", "function", "experienceLevel", "typeOfEmployment"].map(field => {
    const label = detail[field]?.label;
    return typeof label === "string" ? jobDescription(label).slice(0, 100) : "";
  }).filter((value, index, values) => value && values.indexOf(value) === index);
  return [
    metadata.join(" · "),
    sectionExcerpt(sections?.jobDescription?.text),
    sectionExcerpt(sections?.qualifications?.text),
  ].filter(Boolean).join("\n\n");
}

export async function selectedPostingDescription(job) {
  const previous = String(job.description || "");
  if (previous && previous !== APPLY_NOTICE) return previous;
  const board = SMARTRECRUITERS_BOARDS.find(board => board.id === job.source_id);
  const id = publicPostingId(job, board);
  if (!id) return previous;
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(`https://jobs.wasfai.com/_cache/public-posting/v1/${board.slug}/${id}`);
  const cached = await cache?.match(cacheKey).catch(() => null);
  if (cached) return (await cached.text()) || previous;
  let summary = "";
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${board.slug}/postings/${id}`;
    const payload = await fetchPublicPayload(url, /application\/json/, { official: true, timeoutMs: 3000 });
    summary = postingSummary(JSON.parse(payload), id);
  } catch { /* The verified listing and its official link remain available during upstream outages. */ }
  if (cache) {
    await cache.put(cacheKey, new Response(summary, {
      headers: { "Cache-Control": `public, max-age=${summary ? 21600 : 300}`, "Content-Type": "text/plain; charset=utf-8" },
    })).catch(() => {});
  }
  return summary || previous;
}
