import { recentSubscriptionPayments } from "../_billing_history.js";
import { getAuthenticatedUser, json, noContent } from "../_state.js";
import { requireProtectedRequest } from "../_security.js";
import { createMoyasarInvoice, moyasarCheckoutUrl, moyasarStatus } from "../_moyasar.js";
import {
  ensureSubscriptionSchema,
  effectiveSubscription,
  readSubscriptionRecord,
  paymentDescription,
  planAmountHalalas,
  planById,
  publicPlans,
} from "../_subscriptions.js";
import { getJobDb, guardedUserBatch } from "../_db.js";
import { checkoutReference, linkMoyasarInvoice, openMoyasarOrder, pendingMoyasarCheckout, reconcileMoyasarPayment, recoverUnlinkedOrder } from "../payments/moyasar/_shared.js";

export async function onRequestGet(context) {
  const db = getJobDb(context.env);
  const session = await getAuthenticatedUser(context);
  let current = null;
  let recentPayments = [];
  let pendingCheckout = null;
  if (db && session) {
    await ensureSubscriptionSchema(db);
    [current, recentPayments, pendingCheckout] = await Promise.all([
      readCurrentSubscription(db, session.sub), recentSubscriptionPayments(db, session.sub), pendingMoyasarCheckout(db, session.sub),
    ]);
  }
  return json({
    plans: publicPlans(),
    current,
    recent_payments: recentPayments,
    pending_checkout: pendingCheckout,
    authenticated: Boolean(session),
    user: session ? { email: session.email, name: session.name } : null,
    payment_ready: moyasarStatus(context.env || {}, context.request).configured,
    payment_gateway: publicGatewayStatus(context),
    currency: "SAR",
    vat_note: "Prices can be shown VAT-inclusive at checkout.",
  });
}

export async function onRequestPost(context) {
  const db = getJobDb(context.env);
  if (!db) return json({ error: "Subscription storage is not configured.", code: "STORAGE_NOT_CONFIGURED" }, 503);
  const access = await requireProtectedRequest(context, "subscription-checkout", 6);
  if (access.error) return access.error;
  const session = access.user;
  const body = await readBody(context);
  const plan = planById(String(body.plan || ""));
  if (!plan) return json({ error: "Unknown subscription plan.", code: "BAD_PLAN", plans: publicPlans() }, 400);
  await ensureSubscriptionSchema(db);
  if (plan.id === "free") {
    await guardedUserBatch(db, session.sub, "1 = 1", [], [db.prepare(`
      INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
      VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
        ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
        updated_at=CURRENT_TIMESTAMP
      WHERE subscriptions.plan='free' OR subscriptions.status<>'active'
        OR COALESCE(substr(subscriptions.current_period_end,1,10),'')<=?
    `).bind(session.sub, plan.id, plan.status_after_select, plan.ai_monthly_limit_usd, new Date().toISOString().slice(0,10))]);
    const current = await readCurrentSubscription(db, session.sub);
    if (current?.plan !== "free") return json({ code: "PAID_PLAN_ACTIVE", error: "Your paid subscription stays active until the end of its term." }, 409);
    return json({
      ok: true,
      current,
      selected_plan: publicPlans().find((item) => item.id === plan.id),
      next_action: "free_active",
      message: "Free plan is active.",
    });
  }

  if (!moyasarStatus(context.env, context.request).configured) {
    return json({ code: "MOYASAR_NOT_CONFIGURED", error: "Paid checkout is temporarily unavailable." }, 503);
  }
  return checkout(context, db, session, plan, body.renew === true ? String(body.renew_from || "") : "");
}

async function checkout(context, db, session, plan, renewalFrom) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS subscription_checkout_locks (
    user_id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, expires_at TEXT NOT NULL
  )`).run();
  const now = new Date().toISOString();
  const claim = crypto.randomUUID();
  const lock = await db.prepare(`INSERT INTO subscription_checkout_locks(user_id, claim_id, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET claim_id=excluded.claim_id, expires_at=excluded.expires_at
    WHERE subscription_checkout_locks.expires_at<=? RETURNING claim_id`)
    .bind(session.sub, claim, new Date(Date.now() + 60000).toISOString(), now).first();
  if (lock?.claim_id !== claim) return json({ code: "CHECKOUT_IN_PROGRESS", pending_checkout: await pendingMoyasarCheckout(db, session.sub), error: "Checkout is being prepared. Try again in a moment." }, 409);
  try {
    const current = await readCurrentSubscription(db, session.sub);
    if (current?.status === "active" && current.plan !== "free" && current.plan !== plan.id && current.current_period_end > now.slice(0,10)) {
      return json({ code: "PAID_PLAN_ACTIVE", error: "You can change paid plans after your current term ends." }, 409);
    }
    const previous = await openMoyasarOrder(db, session.sub);
    if (previous) {
      const pending = await resumeCheckout(context, db, previous, plan, current);
      if (pending) return pending;
    }
    if (current?.plan === plan.id && current.status === "active" && current.current_period_end > now.slice(0,10)
      && current.current_period_end !== renewalFrom) {
      return json({ code: "PLAN_ALREADY_ACTIVE", current, error: "This plan is active. Select renewal to purchase another term." }, 409);
    }
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const order = await db.prepare(`INSERT INTO subscription_payments(user_id,plan,amount_halalas,amount_sar,currency,description,status,raw_payload)
      VALUES (?, ?, ?, ?, 'SAR', ?, 'creating', ?) RETURNING *`)
      .bind(session.sub, plan.id, planAmountHalalas(plan), plan.price_sar, paymentDescription(plan), JSON.stringify({ expired_at: expiresAt })).first();
    let invoice;
    try { invoice = await createCheckoutInvoice(context, session, plan, order.id, expiresAt); }
    catch (error) {
      // An explicit rejection proves that no hosted invoice was issued. A dropped response does not.
      if (error.code === "MOYASAR_INVOICE_FAILED" && [400, 401, 403, 404, 422, 429].includes(error.status)) {
        await db.prepare("UPDATE subscription_payments SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='creating'").bind(order.id).run();
      }
      throw error;
    }
    if (!await linkMoyasarInvoice(db, order, invoice)) throw new Error("Invalid invoice returned.");
    return checkoutResponse(plan, current, moyasarCheckoutUrl(invoice.url), order.id);
  } catch {
    return json({ code: "CHECKOUT_UNAVAILABLE", error: "Moyasar checkout could not be opened. Try again shortly." }, 502);
  } finally {
    await db.prepare("DELETE FROM subscription_checkout_locks WHERE user_id=? AND claim_id=?").bind(session.sub, claim).run();
  }
}

function checkoutResponse(plan, current, url, orderId) {
  return json({ ok: true, current, selected_plan: publicPlans().find((item) => item.id === plan.id),
    next_action: "redirect_to_moyasar", checkout_url: url, order_id: String(orderId) }, 201);
}

async function resumeCheckout(context, db, row, plan, current) {
  if (!row.provider_invoice_id) {
    row = await recoverUnlinkedOrder(context.env, db, row);
    if (row?.status === "expired") return null;
    if (!row?.provider_invoice_id) return json({ code: "CHECKOUT_IN_PROGRESS", pending_checkout: row ? checkoutReference(row) : null,
      error: "Checking whether the previous invoice was created." }, 409);
  }
  const verified = await reconcileMoyasarPayment(context.env, db, row);
  if (!verified.ok) return json({ code: verified.code, error: "Could not verify your existing invoice. Try again." }, 503);
  if (verified.status === "paid" || verified.status === "paid_manual") {
    return json({ ok: true, next_action: "payment_confirmed", order_id: String(row.id) });
  }
  const url = moyasarCheckoutUrl(verified.invoice.url) || moyasarCheckoutUrl(row.checkout_url);
  if (verified.status === "on_hold" || (verified.status === "initiated" && !url)) {
    return json({ code: "CHECKOUT_IN_PROGRESS", pending_checkout: { order_id: String(row.id), plan: row.plan, checkout_url: "" },
      error: "Your invoice is pending confirmation." }, 409);
  }
  if (verified.status !== "initiated") return null;
  if (row.plan !== plan.id) return json({ code: "OTHER_ORDER_OPEN", pending_checkout: {
    order_id: String(row.id), plan: row.plan, checkout_url: url }, error: "A checkout is open for another plan." }, 409);
  return checkoutResponse(plan, current, url, row.id);
}

export async function onRequestOptions() {
  return noContent();
}

async function readBody(context) {
  try { return await context.request.json(); } catch { return {}; }
}

async function readCurrentSubscription(db, userId) {
  return effectiveSubscription(await readSubscriptionRecord(db, userId));
}

async function createCheckoutInvoice(context, session, plan, orderId, expiresAt) {
  const origin = context.env?.ENVIRONMENT === "production" ? "https://jobs.wasfai.com" : new URL(context.request.url).origin;
  const amount = planAmountHalalas(plan);
  const invoice = await createMoyasarInvoice(context.env || {}, {
    amount,
    currency: "SAR",
    description: paymentDescription(plan),
    callback_url: `${origin}/api/payments/moyasar/callback`,
    success_url: `${origin}/pricing/?payment=success&order=${orderId}`,
    back_url: `${origin}/pricing/?payment=cancelled&plan=${encodeURIComponent(plan.id)}&order=${orderId}`,
    expired_at: expiresAt,
    metadata: {
      user_id: session.sub,
      plan: plan.id,
      app: "jobs-wasfai",
      order: String(orderId),
    },
  });
  const url = moyasarCheckoutUrl(invoice?.url);
  if (!url || !invoice?.id || Number(invoice.amount) !== amount || invoice.currency !== "SAR" || invoice.status !== "initiated") {
    throw new Error("Moyasar returned an invalid invoice.");
  }
  return { ...invoice, url, expired_at: invoice.expired_at || expiresAt };
}

function publicGatewayStatus(context) {
  const gateway = moyasarStatus(context.env || {}, context.request);
  return { configured: gateway.configured };
}
