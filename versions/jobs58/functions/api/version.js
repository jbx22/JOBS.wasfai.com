/**
 * Cloudflare Pages Function — GET /api/version
 *
 * First-class, unauthenticated, secret-free release marker for the Pages deploy.
 *
 * Until now the only deployed release identity was the service worker's
 * CACHE_NAME (`public/sw.js`) — a cache key, not a release constant, and not a
 * stable contract an audit can read. This endpoint publishes `JOBS_RELEASE`,
 * the same `jobsNN` sequence recorded in `VERSION.json` / `VERSIONS.md`, so the
 * live site can be verified without credentials and without inferring a build.
 *
 * Non-sensitive by design: version strings only — no paths, tokens, provider
 * names or environment internals. Nothing else about the app is disclosed.
 */
export const JOBS_RELEASE = "jobs58";

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, private",
        Allow: "GET, HEAD",
      },
    });
  }

  return new Response(JSON.stringify({ status: "ok", release: JOBS_RELEASE }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "x-jobs-release": JOBS_RELEASE,
    },
  });
}
