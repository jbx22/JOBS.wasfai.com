// Dynamic sitemap: only currently live, verified jobs from the public ingestion API.
const HOME = "https://jobs.wasfai.com/";
export async function onRequestGet(context) {
  const api = String(context.env?.JOBS_INGESTION_URL || "https://jobs-wasfai-ingestion.jabosaag.workers.dev").replace(/\/+$/, "");
  let jobs;
  try {
    const response = await fetch(api + "/jobs?limit=100", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Ingestion unavailable");
    const payload = await response.json();
    if (!payload?.ok || !Array.isArray(payload.jobs)) throw new Error("Invalid job feed");
    jobs = payload.jobs;
  } catch {
    // Retry later: do not replace an existing healthy sitemap with an empty one.
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const links = new Set([HOME]);
  for (const job of jobs) {
    if (job?.verification_status === "live" && job.id && job.title && job.employer && job.description && !job.closed_at) {
      links.add(HOME + "openings/" + encodeURIComponent(String(job.id)));
    }
  }
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + [...links].map((url) => '  <url><loc>' + url.replace(/&/g, "&amp;") + '</loc></url>').join("\n")
    + '\n</urlset>';
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
