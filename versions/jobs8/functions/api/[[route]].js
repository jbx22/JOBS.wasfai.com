/**
 * Cloudflare Pages Function — catch-all /api/*
 *
 * Returns structured JSON errors for any unimplemented API route so the PWA
 * can surface a clear message instead of receiving index.html fallback.
 *
 * Routes with dedicated handlers (e.g. /api/bootstrap) take priority — this
 * catch-all only fires when no more-specific function file matches.
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  const error = {
    error:
      "هذه الميزة غير متاحة حالياً. ستتوفر النسخة الكاملة قريباً إن شاء الله.",
    code: "STATIC_DEPLOY",
    path: url.pathname,
    method,
  };

  // Map HTTP methods to sensible status codes for a static-only deploy
  const status = {
    GET: 404,       // reading a resource that doesn't exist here
    POST: 405,      // creating resources is unsupported
    PUT: 405,       // updating is unsupported
    PATCH: 405,     // partial updates unsupported
    DELETE: 405,    // deletion unsupported
  }[method] || 405;

  return new Response(JSON.stringify(error), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
