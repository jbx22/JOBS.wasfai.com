// Adapted from career-ops/providers/smartrecruiters.mjs at 9d61e5a457d5.
// See ../LICENSE.career-ops for the upstream MIT notice.

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
export const APPLY_NOTICE = "المتطلبات والتقديم في الإعلان الرسمي.";

function parseDate(value) {
  const date = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? new Date(date).toISOString() : "";
}

export function parseSmartRecruitersResponse(data, board) {
  if (!Array.isArray(data?.content)) throw new Error("SmartRecruiters response did not contain a postings list");
  return data.content.flatMap((posting) => {
    const location = posting?.location;
    const title = typeof posting?.name === "string" ? posting.name.replace(/[\u0000-\u001f\s]+/g, " ").trim().slice(0, 240) : "";
    const id = typeof posting?.id === "number" && !Number.isSafeInteger(posting.id) ? "" : String(posting?.id ?? "");
    if (!title || !/^\d{1,24}$/.test(id) || typeof location?.country !== "string" || location.country.toLowerCase() !== "sa"
      || (posting.visibility && posting.visibility !== "PUBLIC")) return [];

    // The listing API's ref points to JSON. The employer's public advert uses the ATS posting ID.
    const slugified = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
    const city = typeof location.city === "string" ? location.city.replace(/[\u0000-\u001f\s]+/g, " ").trim().slice(0, 180) : "";
    return [{
      requisition: id,
      title,
      employer: board.label,
      url: `https://jobs.smartrecruiters.com/${board.slug}/${id}${slugified ? `-${slugified}` : ""}`,
      location: [city, board.region, location.remote === true ? "Remote" : ""].filter(Boolean).join(", "),
      description: APPLY_NOTICE,
      posted_at: parseDate(posting.releasedDate),
      valid_through: parseDate(posting.unpublishOn),
      score: 50,
    }];
  });
}

export async function fetchSmartRecruitersJobs(board, fetchPage) {
  const jobs = new Map();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(board.url);
    const offset = page * PAGE_SIZE;
    url.searchParams.set("limit", PAGE_SIZE);
    url.searchParams.set("offset", offset);
    try {
      const data = await fetchPage(url.href);
      for (const job of parseSmartRecruitersResponse(data, board)) jobs.set(job.requisition, job);
      const pageLength = data.content.length;
      const hasTotal = Number.isSafeInteger(data.totalFound) && data.totalFound >= 0;
      if (hasTotal ? offset + pageLength >= data.totalFound : pageLength < PAGE_SIZE) {
        return { jobs: [...jobs.values()], complete: true };
      }
      if (pageLength < PAGE_SIZE) {
        if (!jobs.size) throw new Error("SmartRecruiters returned an incomplete page");
        return { jobs: [...jobs.values()], complete: false, warning: "SmartRecruiters returned an incomplete page" };
      }
    } catch (error) {
      if (!page) throw error;
      return { jobs: [...jobs.values()], complete: false, warning: `SmartRecruiters scan incomplete: ${error.message}` };
    }
  }
  return { jobs: [...jobs.values()], complete: false, warning: "SmartRecruiters scan reached its page limit" };
}
