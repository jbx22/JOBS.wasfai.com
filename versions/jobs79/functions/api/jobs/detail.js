import { getPublicJob } from "../_public_jobs.js";
import { json } from "../_state.js";

export async function onRequestGet({ request, env }) {
  const job = await getPublicJob(env, new URL(request.url).searchParams.get("id"));
  return job ? json({ description: job.description }) : json({ code: "JOB_UNAVAILABLE" }, 404);
}
