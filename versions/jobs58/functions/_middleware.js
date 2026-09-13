const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "X-DNS-Prefetch-Control": "off",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://jobs-wasfai-ingestion.jabosaag.workers.dev https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; manifest-src 'self'",
};

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_API_BODY_BYTES = 2 * 1024 * 1024;
const MAX_RESUME_UPLOAD_BYTES = 10 * 1024 * 1024;

function apiError(message, code, status) {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private" },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const isApi = url.pathname.startsWith("/api/");
  const method = context.request.method.toUpperCase();

  // Cookie-authenticated API mutations are same-origin only. SameSite cookies
  // are useful defense-in-depth, but an explicit Origin/Sec-Fetch-Site check
  // also protects logout and future endpoints from CSRF.
  if (isApi && (UNSAFE_METHODS.has(method) || method === "OPTIONS")) {
    const origin = context.request.headers.get("Origin");
    const fetchSite = context.request.headers.get("Sec-Fetch-Site");
    if ((origin && origin !== url.origin) || fetchSite === "cross-site") {
      return withSecurityHeaders(apiError("Cross-origin API requests are not allowed.", "CROSS_ORIGIN_REQUEST", 403), true);
    }
  }

  if (isApi && UNSAFE_METHODS.has(method)) {
    const contentLength = Number(context.request.headers.get("Content-Length") || 0);
    const isResumeUpload = method === "POST" && url.pathname === "/api/resumes";
    const maxBodyBytes = isResumeUpload ? MAX_RESUME_UPLOAD_BYTES + 64 * 1024 : MAX_API_BODY_BYTES;
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return withSecurityHeaders(apiError("Request body is too large.", "PAYLOAD_TOO_LARGE", 413), true);
    }
    const contentType = context.request.headers.get("Content-Type") || "";
    const allowedContentType = isResumeUpload
      ? /^multipart\/form-data\s*;/i.test(contentType)
      : /^application\/json(?:\s*;|$)/i.test(contentType);
    if (contentLength > 0 && !allowedContentType) {
      return withSecurityHeaders(apiError("API requests must use application/json.", "UNSUPPORTED_MEDIA_TYPE", 415), true);
    }
  }

  const response = await context.next();
  return withSecurityHeaders(response, isApi);
}

function withSecurityHeaders(response, isApi) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (isApi) {
    headers.set("Cache-Control", "no-store, private");
    headers.delete("Access-Control-Allow-Origin");
    headers.delete("Access-Control-Allow-Credentials");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
