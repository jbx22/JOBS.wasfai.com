const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://jobs-wasfai-ingestion.jabosaag.workers.dev https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; manifest-src 'self'",
};

export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (new URL(context.request.url).pathname.startsWith("/api/")) headers.set("Cache-Control", "no-store, private");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
