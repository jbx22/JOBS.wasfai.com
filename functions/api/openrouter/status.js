import { json } from "../_state.js";
import { accountAction } from "./_shared.js";

export function onRequestGet(context) {
  return accountAction(context, null, async (db, owner) => {
    const row = await db.prepare("SELECT connected_at FROM user_openrouter_connections WHERE user_id=? AND credential<>''")
      .bind(owner).first();
    return json({ connected: Boolean(row), connected_at: row?.connected_at || null });
  });
}
