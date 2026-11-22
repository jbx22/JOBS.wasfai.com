import { escapeHtml as e, listPublicJobs } from "../api/_public_jobs.js";

export async function onRequestGet(context) {
  const name = String(context.params.page);
  const match = /^jobs-(\d+)\.xml$/.exec(name);
  if (name !== "static.xml" && (!match || Number(match[1]) < 1 || Number(match[1]) > 1000)) return new Response("Not found", { status: 404 });
  try {
    let urls;
    if (name === "static.xml") urls = ["/", "/vacancies", "/pricing/"].map((path) => ({ path }));
    else {
      const jobs = await listPublicJobs(context.env, {}, 1000, (Number(match[1]) - 1) * 1000);
      if (!jobs.length) return new Response("Not found", { status: 404 });
      urls = jobs.map((job) => ({ path: "/vacancies/" + encodeURIComponent(job.public_id), updated: job.updated_at }));
    }
    const body = urls.map((item) => "<url><loc>" + e("https://jobs.wasfai.com" + item.path) + "</loc>" +
      (item.updated && Number.isFinite(new Date(item.updated).getTime()) ? "<lastmod>" + new Date(item.updated).toISOString() + "</lastmod>" : "") + "</url>").join("");
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + body + "</urlset>", {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=60" },
    });
  } catch { return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }); }
}
