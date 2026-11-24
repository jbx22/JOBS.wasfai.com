import { moyasarInvoiceRecord } from "./_moyasar.js";
import { guardedUserBatch, isWriteConflict, USER_WRITE_GUARDS_SCHEMA } from "./_db.js";

export const FREE_MONTHLY_AI_BUDGET_USD = 1;

export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Free",
    name_ar: "المجاني",
    price_sar: 0,
    billing: "monthly",
    status_after_select: "active",
    ai_monthly_limit_usd: FREE_MONTHLY_AI_BUDGET_USD,
    limits: {
      saved_jobs: 10,
      ai_matches_per_month: 20,
      application_kits_per_month: 2,
      resume_improvements_per_month: 1,
      interview_sessions_per_month: 1,
    },
    features: [
      "10 saved jobs",
      "20 AI matches per month",
      "2 AI application kits per month",
      "Basic application tracker",
    ],
  },
  {
    id: "gold_monthly",
    name: "Gold",
    name_ar: "الذهبي",
    price_sar: 50,
    billing: "monthly",
    status_after_select: "pending_payment",
    ai_monthly_limit_usd: 12,
    limits: {
      saved_jobs: 300,
      ai_matches_per_month: 200,
      application_kits_per_month: 30,
      resume_improvements_per_month: 12,
      interview_sessions_per_month: 20,
    },
    features: [
      "300 saved jobs",
      "200 AI matches per month",
      "30 bilingual application kits per month",
      "Resume improvement and tailoring",
      "Interview coach",
      "PDF/DOCX exports",
      "Follow-up reminders",
    ],
  },
  {
    id: "gold_annual",
    name: "Gold Annual",
    name_ar: "الذهبي السنوي",
    price_sar: 499,
    billing: "yearly",
    status_after_select: "pending_payment",
    ai_monthly_limit_usd: 12,
    limits: {
      saved_jobs: 300,
      ai_matches_per_month: 200,
      application_kits_per_month: 30,
      resume_improvements_per_month: 12,
      interview_sessions_per_month: 20,
    },
    features: [
      "Everything in Gold",
      "Annual discount",
      "Best value for active job seekers",
    ],
  },
];

export function publicPlans() {
  return SUBSCRIPTION_PLANS.map(({ status_after_select, ai_monthly_limit_usd, ...plan }) => plan);
}

export function planById(id) {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === id) || null;
}

export async function ensureSubscriptionSchema(db) {
  await db.batch([
    `
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'trial',
      ai_monthly_limit_usd REAL NOT NULL DEFAULT ${FREE_MONTHLY_AI_BUDGET_USD},
      current_period_end TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
    `
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'moyasar',
      provider_invoice_id TEXT NOT NULL DEFAULT '',
      provider_payment_id TEXT NOT NULL DEFAULT '',
      amount_halalas INTEGER NOT NULL DEFAULT 0,
      amount_sar REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'SAR',
      status TEXT NOT NULL DEFAULT 'initiated',
      checkout_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      raw_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
    "CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_subscription_payments_invoice ON subscription_payments(provider_invoice_id)",
    `
    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'moyasar',
      event_type TEXT NOT NULL DEFAULT '',
      provider_object_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      raw_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_object ON payment_events(provider, provider_object_id) WHERE provider_object_id <> ''",
    USER_WRITE_GUARDS_SCHEMA,
    PAYMENT_ACTIVATIONS_SCHEMA,
    `CREATE TABLE IF NOT EXISTS payment_refunds (
      provider_invoice_id TEXT PRIMARY KEY, refunded_halalas INTEGER NOT NULL DEFAULT 0
    )`,
  ].map((sql) => db.prepare(sql)));
}

export function effectiveSubscription(row, today = new Date().toISOString().slice(0, 10)) {
  const free = planById("free");
  if (!row) return { plan: free.id, effective_plan: free.id, status: "active", paid_active: false,
    ai_monthly_limit_usd: free.ai_monthly_limit_usd, current_period_end: null };
  const end = row.current_period_end;
  const dated = typeof end === "string" && /^\d{4}-\d{2}-\d{2}/.test(end);
  const paid = row.plan !== free.id && row.status === "active" && dated && end.slice(0, 10) > today;
  const expired = row.plan !== free.id && row.status === "active" && dated && end.slice(0, 10) <= today;
  return { ...row, effective_plan: paid ? row.plan : free.id, paid_active: paid, status: expired ? "expired" : row.status,
    ai_monthly_limit_usd: row.plan !== free.id && !paid ? free.ai_monthly_limit_usd : row.ai_monthly_limit_usd,
    current_period_end: row.plan === free.id ? null : row.current_period_end };
}

export function readSubscriptionRecord(db, userId) {
  return db.prepare("SELECT plan, status, ai_monthly_limit_usd, current_period_end, updated_at FROM subscriptions WHERE user_id=?")
    .bind(userId).first();
}

export function subscriptionSnapshot(row, userId) {
  if (!row) return { sql: "NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id=?)", params: [userId] };
  return { sql: "EXISTS (SELECT 1 FROM subscriptions WHERE user_id=? AND plan=? AND status=? AND COALESCE(current_period_end,'')=?)",
    params: [userId, row.plan, row.status, row.current_period_end || ""] };
}

export function nextPeriodEnd(billing, current, now = Date.now()) {
  // Both Gold billing intervals buy the same access. Preserve any unused verified term.
  const existingEnd = current?.status === "active" && planById(current.plan)?.price_sar > 0
    ? Date.parse(current.current_period_end) : NaN;
  const start = Number.isFinite(existingEnd) ? Math.max(now, existingEnd) : now;
  return new Date(start + (billing === "yearly" ? 365 : 30) * 86400000).toISOString().slice(0, 10);
}

export function paymentDescription(plan) {
  return plan.id === "gold_annual"
    ? "JOBS.wasfai.com Gold Annual subscription"
    : "JOBS.wasfai.com Gold monthly subscription";
}

export function planAmountHalalas(plan) {
  return Math.round(Number(plan?.price_sar || 0) * 100);
}

export async function activatePaidSubscription(db, userId, plan, invoice, status = "active", expectedAmount = planAmountHalalas(plan)) {
  await ensureSubscriptionSchema(db);
  if (
    !invoice?.id || !plan?.price_sar
    || String(invoice.status) !== "paid"
    || !Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 || Number(invoice.amount) !== expectedAmount
    || String(invoice.currency || "").toUpperCase() !== "SAR"
    || String(invoice.metadata?.user_id || "") !== String(userId)
    || String(invoice.metadata?.plan || "") !== String(plan.id)
  ) {
    const error = new Error("The paid invoice did not match the subscription order.");
    error.code = "PAYMENT_VERIFICATION_FAILED";
    throw error;
  }
  const invoiceRecord = moyasarInvoiceRecord(invoice);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const previous = await db.prepare("SELECT invoice_id FROM payment_activations WHERE invoice_id=?").bind(invoice.id).first();
    if (previous) return { activated: false, already_activated: true };
    const current = await readSubscriptionRecord(db, userId);
    const snapshot = subscriptionSnapshot(current, userId);
    const periodEnd = nextPeriodEnd(plan.billing, current);
    const activationId = crypto.randomUUID();
    try {
      const [, , activation] = await guardedUserBatch(db, userId, snapshot.sql, snapshot.params, [
        db.prepare(`INSERT INTO payment_activations(invoice_id, user_id, plan, activation_id)
          SELECT ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM payment_refunds WHERE provider_invoice_id=? AND refunded_halalas>0)
            AND NOT EXISTS (SELECT 1 FROM subscription_payments WHERE provider_invoice_id=? AND status IN ('partially_refunded','refunded','voided','canceled','cancelled'))
          ON CONFLICT(invoice_id) DO NOTHING`).bind(invoice.id, userId, plan.id, activationId, invoice.id, invoice.id),
        db.prepare(`
          INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
          SELECT ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
          WHERE EXISTS (SELECT 1 FROM payment_activations WHERE invoice_id=? AND activation_id=?)
            AND NOT EXISTS (SELECT 1 FROM subscription_payments WHERE provider_invoice_id=? AND user_id=? AND status IN ('paid_manual','paid'))
          ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
            ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
            updated_at=CURRENT_TIMESTAMP
        `).bind(userId, plan.id, status, plan.ai_monthly_limit_usd, periodEnd, invoice.id, activationId, invoice.id, userId),
        db.prepare(`UPDATE subscription_payments SET status=?, provider_payment_id=?, raw_payload=?, updated_at=CURRENT_TIMESTAMP
          WHERE provider_invoice_id=? AND user_id=?
            AND EXISTS (SELECT 1 FROM payment_activations WHERE invoice_id=? AND activation_id=?)`)
          .bind(invoice.status, invoiceRecord.payment_id || "", JSON.stringify(invoiceRecord), invoice.id, userId, invoice.id, activationId),
      ]);
      const activated = Number(activation?.meta?.changes || 0) === 1;
      if (activated) return { activated: true, already_activated: false };
      const receipt = await db.prepare("SELECT invoice_id FROM payment_activations WHERE invoice_id=?").bind(invoice.id).first();
      return receipt ? { activated: false, already_activated: true } : { activated: false, already_activated: false, blocked: true };
    } catch (error) {
      if (attempt === 3 || !isWriteConflict(error)) throw error;
    }
  }
}

export const PAYMENT_ACTIVATIONS_SCHEMA = `CREATE TABLE IF NOT EXISTS payment_activations (
  invoice_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, activation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
