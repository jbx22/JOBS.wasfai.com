export const SUBSCRIPTION_PLANS = [
  {
    id: "free",
    name: "Free",
    name_ar: "المجاني",
    price_sar: 0,
    billing: "monthly",
    status_after_select: "active",
    ai_monthly_limit_usd: 1,
    limits: {
      resumes: 1,
      saved_jobs: 10,
      ai_matches_per_month: 20,
      application_kits_per_month: 2,
      resume_improvements_per_month: 1,
      interview_sessions_per_month: 1,
    },
    features: [
      "1 resume profile",
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
      resumes: 3,
      saved_jobs: 300,
      ai_matches_per_month: 200,
      application_kits_per_month: 30,
      resume_improvements_per_month: 12,
      interview_sessions_per_month: 20,
    },
    features: [
      "3 resume profiles",
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
      resumes: 3,
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
      "Priority usage review",
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
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'trial',
      ai_monthly_limit_usd REAL NOT NULL DEFAULT 5,
      current_period_end TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
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
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_subscription_payments_invoice ON subscription_payments(provider_invoice_id)").run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL DEFAULT 'moyasar',
      event_type TEXT NOT NULL DEFAULT '',
      provider_object_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      raw_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_object ON payment_events(provider, provider_object_id) WHERE provider_object_id <> ''").run();
}

export function nextPeriodEnd(billing) {
  const days = billing === "yearly" ? 365 : 30;
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function paymentDescription(plan) {
  return plan.id === "gold_annual"
    ? "JOBS.wasfai.com Gold Annual subscription"
    : "JOBS.wasfai.com Gold monthly subscription";
}

export function planAmountHalalas(plan) {
  return Math.round(Number(plan.price_sar || 0) * 100);
}

export async function activatePaidSubscription(db, userId, plan, invoice, status = "active") {
  await ensureSubscriptionSchema(db);
  const expectedAmount = planAmountHalalas(plan);
  if (
    !invoice?.id
    || String(invoice.status) !== "paid"
    || Number(invoice.amount) !== expectedAmount
    || String(invoice.currency || "").toUpperCase() !== "SAR"
    || String(invoice.metadata?.user_id || "") !== String(userId)
    || String(invoice.metadata?.plan || "") !== String(plan.id)
  ) {
    const error = new Error("The paid invoice did not match the subscription order.");
    error.code = "PAYMENT_VERIFICATION_FAILED";
    throw error;
  }
  await db.prepare(`
    INSERT INTO subscriptions(user_id, plan, status, ai_monthly_limit_usd, current_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, status=excluded.status,
      ai_monthly_limit_usd=excluded.ai_monthly_limit_usd, current_period_end=excluded.current_period_end,
      updated_at=CURRENT_TIMESTAMP
  `).bind(userId, plan.id, status, plan.ai_monthly_limit_usd, nextPeriodEnd(plan.billing)).run();
  if (invoice?.id) {
    await db.prepare(`
      UPDATE subscription_payments SET status = ?, provider_payment_id = ?, raw_payload = ?, updated_at = CURRENT_TIMESTAMP
      WHERE provider_invoice_id = ?
    `).bind(
      invoice.status || "paid",
      invoice.payments?.[0]?.id || "",
      JSON.stringify(invoice),
      invoice.id,
    ).run();
  }
}
