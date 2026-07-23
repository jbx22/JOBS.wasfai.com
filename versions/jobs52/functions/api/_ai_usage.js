const TOKEN_PRICES_PER_MILLION = {
  "deepseek-v4-flash": { input: 0.20, output: 0.80 },
  "minimax/minimax-m3": { input: 0.20, output: 1.10 },
  "z-ai/glm-5.2": { input: 0.30, output: 1.20 },
};

export async function recordAiUsage(context, user, details = {}) {
  const db = context.env?.JOBS_DB;
  if (!db || !user) return;
  const usage = details.usage || {};
  const inputTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
  const outputTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
  const cost = estimateCost(details.model, inputTokens, outputTokens);
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        route TEXT NOT NULL DEFAULT '',
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await db.prepare(`
      INSERT INTO ai_usage(user_id, provider, model, route, input_tokens, output_tokens, cost_usd, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.sub || "",
      String(details.provider || ""),
      String(details.model || ""),
      String(details.route || ""),
      inputTokens,
      outputTokens,
      cost,
      String(details.status || "ok"),
    ).run();
  } catch {
    // Usage analytics should never break the subscriber's AI workflow.
  }
}

function estimateCost(model, inputTokens, outputTokens) {
  const price = TOKEN_PRICES_PER_MILLION[String(model || "").toLowerCase()] || { input: 0, output: 0 };
  return Number((((inputTokens * price.input) + (outputTokens * price.output)) / 1_000_000).toFixed(6));
}
