import { authConfig, json } from "./_auth.js";

export async function onRequestGet(context) {
  const config = authConfig(context.env || {}, context.request);
  return json({
    google_configured: Boolean(config.clientId),
    primary_provider: "google",
    terms_url: "/terms",
    privacy_url: "/privacy",
    note: "Accounts use Google OAuth first. Email/password storage is intentionally not enabled until a durable user database is added.",
  });
}
