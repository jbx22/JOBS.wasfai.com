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
}
