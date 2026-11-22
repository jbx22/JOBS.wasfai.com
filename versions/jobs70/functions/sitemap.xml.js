import { countPublicJobs } from "./api/_public_jobs.js";

export async function onRequestGet(context) {
  try {
    const count = await countPublicJobs(context.env);
    const names = ["static.xml", ...Array.from({ length: Math.ceil(count / 1000) }, (_, i) => "jobs-" + (i + 1) + ".xml")];
    return new Response('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      names.map((name) => "<sitemap><loc>https://jobs.wasfai.com/sitemaps/" + name + "</loc></sitemap>").join("") + "</sitemapindex>",
      { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=60" } });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
}
