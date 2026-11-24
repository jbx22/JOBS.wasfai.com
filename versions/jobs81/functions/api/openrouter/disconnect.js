import { json } from "../_state.js";
import { accountAction } from "./_shared.js";

export function onRequestPost(context) {
  return accountAction(context, "openrouter-disconnect", async (db, owner) => {
    // Removing the flow fence also prevents an in-flight exchange from reconnecting the account.
    await db.prepare("DELETE FROM user_openrouter_connections WHERE user_id=?").bind(owner).run();
    return json({ connected: false, connected_at: null });
  });
}
