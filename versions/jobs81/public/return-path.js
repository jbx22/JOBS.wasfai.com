// Shared by the sign-in screen and the server-side Google OAuth return.
export function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.length > 160) return "";
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return "";
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return ""; }
  if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded)) return "";
  const resolved = new URL(value, "https://jobs.wasfai.com");
  return resolved.origin === "https://jobs.wasfai.com" ? value : "";
}
