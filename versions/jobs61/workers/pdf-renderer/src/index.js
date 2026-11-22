import { Container } from "@cloudflare/containers";

export class TypstContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "jobs-typst-renderer" });
    }
    if (url.pathname !== "/render-pdf" || request.method !== "POST") {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const expected = String(env.TYPST_RENDER_TOKEN || "").trim();
    const actual = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!expected || !safeEqual(actual, expected)) {
      return Response.json({ error: "authorization required" }, { status: 401 });
    }
    if (Number(request.headers.get("Content-Length") || 0) > 2_000_000) {
      return Response.json({ error: "payload too large" }, { status: 413 });
    }
    return env.TYPST_CONTAINER.getByName("renderer").fetch(request);
  },
};

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
