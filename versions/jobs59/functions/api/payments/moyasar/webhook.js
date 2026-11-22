import { json, noContent } from "../../_state.js";
import { processMoyasarPayload } from "./_shared.js";

export async function onRequestPost(context) {
  const payload = await readBody(context);
  const result = await processMoyasarPayload(context, payload, { requireWebhookSecret: true });
  return json(result, result.ok ? 200 : 401);
}

export async function onRequestOptions() {
  return noContent();
}

async function readBody(context) {
  try { return await context.request.json(); } catch { return {}; }
}
