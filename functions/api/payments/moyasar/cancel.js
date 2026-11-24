import { getJobDb } from "../../_db.js";
import { cancelMoyasarInvoice } from "../../_moyasar.js";
import { requireProtectedRequest } from "../../_security.js";
import { json } from "../../_state.js";
import { ensureSubscriptionSchema } from "../../_subscriptions.js";
import { reconcileMoyasarPayment } from "./_shared.js";

export async function onRequestPost(context) {
  const access = await requireProtectedRequest(context, "cancel-unpaid-invoice", 6);
  if (access.error) return access.error;
  const body = await context.request.json().catch(() => null);
  if (!/^\d{1,15}$/.test(String(body?.order || ""))) {
    return json({ code: "BAD_ORDER", error: "Select an existing order." }, 400);
  }
  const db = getJobDb(context.env);
  await ensureSubscriptionSchema(db);
  const row = await db.prepare("SELECT * FROM subscription_payments WHERE id=? AND user_id=? AND provider='moyasar'")
    .bind(Number(body.order), access.user.sub).first();
  if (!row) return json({ code: "ORDER_NOT_FOUND", error: "Order not found." }, 404);

  const cannotCancel = () => json({ code: "PAYMENT_NOT_CANCELABLE", error: "This invoice cannot be closed. Check its payment status." }, 409);
  const unavailable = () => json({ code: "PAYMENT_UNAVAILABLE", error: "Check this invoice again once the provider is available." }, 503);
  const canceled = () => json({ ok: true, status: "canceled", order_id: String(row.id) });
  if (row.status === "canceled" || row.status === "cancelled") return canceled();
  if (!row.provider_invoice_id || row.status !== "initiated") return cannotCancel();

  const before = await reconcileMoyasarPayment(context.env, db, row);
  if (!before.ok) return unavailable();
  if (before.status === "canceled") return canceled();
  const attempts = before.invoice?.payments ?? [];
  if (before.status !== "initiated" || !Array.isArray(attempts) ||
      attempts.some(attempt => !["failed", "canceled", "expired", "voided"].includes(attempt?.status))) return cannotCancel();
  try {
    await cancelMoyasarInvoice(context.env, row.provider_invoice_id);
  } catch {
    // A timeout can follow a successful cancellation. Read the invoice before deciding what to show.
  }
  const after = await reconcileMoyasarPayment(context.env, db, row);
  if (!after.ok || after.status === "initiated") return unavailable();
  return after.status === "canceled" ? canceled() : cannotCancel();
}
