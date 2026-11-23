import { adminJson, auditStatement, requireAdmin } from "./_admin.js";
import { ensureRecruitmentSchema } from "./_recruitment.js";
import { ensureSubscriptionSchema, PAYMENT_ACTIVATIONS_SCHEMA } from "./_subscriptions.js";
import { AuthError, USERS_SCHEMA } from "./auth/_auth.js";

const SUPPORT = ["open", "in_progress", "resolved"];
const PRIORITIES = ["normal", "high"];
const CAMPAIGN = ["draft", "active", "paused"];
const LANDINGS = ["/", "/vacancies", "/employers", "/pricing/"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WORKSPACES = ["overview", "users", "recruitment", "support", "finance", "accounting", "ai", "marketing", "access"];
const ACCOUNTING_LIMIT = 200;

const supportSchema = `CREATE TABLE IF NOT EXISTS admin_support_cases (
  id TEXT PRIMARY KEY, subject TEXT NOT NULL, requester_email TEXT NOT NULL,
  summary TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT NOT NULL DEFAULT '', last_note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1, operation_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const campaignSchema = `CREATE TABLE IF NOT EXISTS admin_marketing_campaigns (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  landing TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1, operation_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const reviewSchema = `CREATE TABLE IF NOT EXISTS admin_payment_reviews (
  payment_id INTEGER PRIMARY KEY, status_at_review TEXT NOT NULL, reference TEXT NOT NULL, reviewed_by TEXT NOT NULL,
  amount_at_review INTEGER NOT NULL, operation_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export async function adminWorkspace(context, parts, method) {
  const [section, id] = parts;
  if (parts.length > 2) return notFound();
  if (section === "workspaces" && method === "GET" && !id) {
    const access = await requireAdmin(context, { superAdmin: true });
    if (access.error) return access.error;
    return adminJson({ workspaces: WORKSPACES });
  }
  if (section === "recruitment" && method === "GET" && !id) return recruitment(context);

  const handlers = { support, marketing, accounting };
  if (!Object.hasOwn(handlers, section)) return notFound();
  const access = await requireAdmin(context, { scope: section });
  if (access.error) return access.error;
  return handlers[section](context, access, method, id);
}

async function recruitment(context) {
  const access = await requireAdmin(context);
  if (access.error) return access.error;
  let scopes;
  try { scopes = JSON.parse(access.admin.scopes); } catch { scopes = []; }
  const canReview = (scope) => access.admin.role === "super_admin" || (Array.isArray(scopes) && scopes.includes(scope));
  if (!canReview("employers") && !canReview("jobs")) throw invalid("Recruitment permission is required.", 403, "SCOPE_REQUIRED");
  const { db } = access;
  await ensureRecruitmentSchema(db);
  const companies = canReview("employers") ? await statusCounts(db, "employer_profiles") : null;
  const openings = canReview("jobs") ? await statusCounts(db, "recruitment_jobs") : null;
  return adminJson({ companies, openings });
}

async function support(context, access, method, id) {
  const { db } = access;
  await db.prepare(supportSchema).run();
  if (method === "GET" && !id) {
    const params = new URL(context.request.url).searchParams;
    const status = params.get("status");
    if (status && !SUPPORT.includes(status)) throw invalid("Select a valid case status.");
    const q = String(params.get("q") || "").trim().toLowerCase().slice(0, 160);
    const where = status ? " AND status = ?" : "";
    const { results } = await db.prepare("SELECT * FROM admin_support_cases WHERE (LOWER(subject) LIKE ? OR LOWER(requester_email) LIKE ?)" + where +
      " ORDER BY CASE WHEN status = 'resolved' THEN 1 ELSE 0 END, CASE WHEN priority = 'high' THEN 0 ELSE 1 END, updated_at DESC, id LIMIT 100")
      .bind("%" + q + "%", "%" + q + "%", ...(status ? [status] : [])).all();
    return adminJson({ cases: results, counts: await statusCounts(db, "admin_support_cases") });
  }
  if (method === "POST" && !id) {
    const body = await input(context);
    const subject = field(body.subject, 4, 120, "Subject");
    const email = field(body.requester_email, 3, 160, "Requester email").toLowerCase();
    if (!EMAIL.test(email)) throw invalid("Enter a valid requester email.");
    const summary = field(body.summary, 4, 2000, "Case description");
    const priority = choice(body.priority, PRIORITIES, "priority");
    const newId = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO admin_support_cases (id, subject, requester_email, summary, priority) VALUES (?, ?, ?, ?, ?)")
        .bind(newId, subject, email, summary, priority),
      auditStatement(context, access, "support.create", "support_case", newId, { priority }),
    ]);
    return adminJson({ id: newId }, 201);
  }
  if (method === "PATCH" && id) {
    const body = await input(context);
    const status = choice(body.status, SUPPORT, "case status");
    const note = field(body.note ?? "", 0, 1500, "Internal note");
    const revision = version(body.version);
    const operation = crypto.randomUUID();
    const claim = body.assign_to_me === true;
    if (status === "resolved" && !note) throw invalid("Enter a resolution note.");
    await change(db, db.prepare(`UPDATE admin_support_cases SET status = ?, assigned_to = CASE WHEN ? = 1 THEN ? ELSE assigned_to END,
        last_note = CASE WHEN ? <> '' THEN ? ELSE last_note END, version = version + 1, operation_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?`).bind(status, Number(claim), access.admin.email, note, note, operation, id, revision),
    auditStatement(context, access, "support.update", "support_case", id, { status, assigned: claim, note_added: Boolean(note) },
      { table: "admin_support_cases", key: "id", id, operation }));
    return adminJson({ ok: true });
  }
  return notFound();
}

async function marketing(context, access, method, id) {
  const { db } = access;
  await db.prepare(campaignSchema).run();
  if (method === "GET" && !id) {
    await db.prepare(USERS_SCHEMA).run();
    const since = windowStart(30);
    const funnel = await db.prepare(`SELECT COUNT(*) AS signups,
      SUM(CASE WHEN onboarding_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed
      FROM users WHERE created_at >= ? AND provider = 'google'`).bind(since).first();
    const { results } = await db.prepare("SELECT id, name, source, medium, slug, landing, status, version FROM admin_marketing_campaigns ORDER BY updated_at DESC, id LIMIT 100").all();
    return adminJson({ since, funnel, campaigns: results.map((campaign) => ({ ...campaign, url: campaignUrl(campaign) })) });
  }
  if (method === "POST" && !id) {
    const body = await input(context);
    const name = field(body.name, 2, 120, "Campaign name");
    const source = slugField(body.source, "Source");
    const medium = slugField(body.medium, "Medium");
    const slug = slugField(body.slug, "Campaign tag");
    const landing = choice(body.landing, LANDINGS, "landing page");
    const newId = crypto.randomUUID();
    const operation = crypto.randomUUID();
    await change(db, db.prepare(`INSERT INTO admin_marketing_campaigns (id, name, source, medium, slug, landing, operation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING`).bind(newId, name, source, medium, slug, landing, operation),
    auditStatement(context, access, "marketing.create", "campaign", newId, { slug },
      { table: "admin_marketing_campaigns", key: "id", id: newId, operation }), "That campaign tag already exists.");
    return adminJson({ id: newId, url: campaignUrl({ landing, slug, source, medium }) }, 201);
  }
  if (method === "PATCH" && id) {
    const body = await input(context);
    const status = choice(body.status, CAMPAIGN, "campaign status");
    const revision = version(body.version);
    const operation = crypto.randomUUID();
    await change(db, db.prepare(`UPDATE admin_marketing_campaigns SET status = ?, version = version + 1,
      operation_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?`).bind(status, operation, id, revision),
    auditStatement(context, access, "marketing.update", "campaign", id, { status },
      { table: "admin_marketing_campaigns", key: "id", id, operation }));
    return adminJson({ ok: true });
  }
  return notFound();
}

async function accounting(context, access, method, id) {
  const { db } = access;
  await ensureSubscriptionSchema(db);
  await db.prepare(PAYMENT_ACTIVATIONS_SCHEMA).run();
  await db.prepare(reviewSchema).run();

  if (method === "GET" && (!id || id === "export")) {
    const params = new URL(context.request.url).searchParams;
    const days = Number(params.get("days") || 30);
    if (![30, 90].includes(days)) throw invalid("Select a 30-day or 90-day window.");
    const since = windowStart(days);
    const exporting = id === "export";
    const { results } = await db.prepare(`SELECT p.id, p.created_at, p.provider, p.provider_invoice_id, p.provider_payment_id,
      p.plan, p.amount_halalas, p.currency, p.status, a.created_at AS verified_at,
      CASE WHEN r.status_at_review = p.status AND r.amount_at_review = p.amount_halalas THEN r.reviewed_at END AS reviewed_at,
      CASE WHEN r.status_at_review = p.status AND r.amount_at_review = p.amount_halalas THEN r.reference END AS review_reference
      FROM subscription_payments p
      LEFT JOIN payment_activations a ON a.invoice_id = p.provider_invoice_id AND a.user_id = p.user_id AND p.status = 'paid'
      LEFT JOIN admin_payment_reviews r ON r.payment_id = p.id
      WHERE p.created_at >= ? ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).bind(since, (exporting ? 5000 : ACCOUNTING_LIMIT) + 1).all();
    if (exporting) {
      if (results.length > 5000) throw invalid("This window exceeds the export limit. Select a shorter period.", 409, "EXPORT_LIMIT");
      return csvResponse(results);
    }
    const totals = await db.prepare(`SELECT COUNT(*) AS records,
      COALESCE(SUM(CASE WHEN p.currency = 'SAR' AND p.status = 'paid' AND a.invoice_id IS NOT NULL THEN p.amount_halalas ELSE 0 END), 0) AS verified_halalas,
      COALESCE(SUM(CASE WHEN p.currency = 'SAR' AND p.status = 'paid_manual' THEN p.amount_halalas ELSE 0 END), 0) AS manual_halalas
      FROM subscription_payments p LEFT JOIN payment_activations a
        ON a.invoice_id = p.provider_invoice_id AND a.user_id = p.user_id
      WHERE p.created_at >= ?`).bind(since).first();
    return adminJson({ since, rows: results.slice(0, ACCOUNTING_LIMIT), truncated: results.length > ACCOUNTING_LIMIT, totals });
  }
  if (method === "POST" && /^\d{1,18}$/.test(id || "")) {
    const body = await input(context);
    const status = field(body.status, 2, 30, "Payment status");
    const amount = Number(body.amount_halalas);
    if (!Number.isSafeInteger(amount) || amount < 0) throw invalid("Invalid payment amount.");
    const reference = field(body.reference, 3, 120, "Statement reference");
    const operation = crypto.randomUUID();
    await change(db, db.prepare(`INSERT INTO admin_payment_reviews
      (payment_id, status_at_review, amount_at_review, reference, reviewed_by, operation_id)
      SELECT id, status, amount_halalas, ?, ?, ? FROM subscription_payments
        WHERE id = ? AND status = ? AND amount_halalas = ?
      ON CONFLICT(payment_id) DO UPDATE SET status_at_review = excluded.status_at_review,
        amount_at_review = excluded.amount_at_review, reference = excluded.reference,
        reviewed_by = excluded.reviewed_by, operation_id = excluded.operation_id, reviewed_at = CURRENT_TIMESTAMP
      WHERE admin_payment_reviews.status_at_review <> excluded.status_at_review
        OR admin_payment_reviews.amount_at_review <> excluded.amount_at_review`)
      .bind(reference, access.admin.email, operation, id, status, amount),
    auditStatement(context, access, "accounting.review", "subscription_payment", id, { status, amount_halalas: amount },
      { table: "admin_payment_reviews", key: "payment_id", id, operation }), "The payment changed or was already reviewed. Refresh before trying again.");
    return adminJson({ ok: true });
  }
  return notFound();
}

async function statusCounts(db, table) {
  const { results } = await db.prepare("SELECT status, COUNT(*) AS count FROM " + table + " GROUP BY status").all();
  return Object.fromEntries(results.map((row) => [row.status, Number(row.count)]));
}

async function change(db, statement, audit, message = "This record changed or is unavailable. Refresh and try again.") {
  const [result] = await db.batch([statement, audit]);
  if (!result?.meta?.changes) throw invalid(message, 409, "RECORD_CHANGED");
}

function campaignUrl(campaign) {
  const url = new URL(campaign.landing, "https://jobs.wasfai.com");
  url.search = new URLSearchParams({ utm_source: campaign.source, utm_medium: campaign.medium, utm_campaign: campaign.slug });
  return url.href;
}

function windowStart(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
}

function csvResponse(rows) {
  const columns = ["id", "created_at", "provider", "provider_invoice_id", "provider_payment_id", "plan", "amount_halalas",
    "currency", "status", "verified_at", "reviewed_at", "review_reference"];
  const csv = [columns.join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\r\n");
  return new Response(csv + "\r\n", { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="jobs-payment-register.csv"', "Cache-Control": "no-store",
  } });
}

function csvCell(value) {
  const text = String(value ?? "");
  const neutral = /^\s*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + neutral.replaceAll('"', '""') + '"';
}

async function input(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Enter valid form data.");
  return body;
}

function field(value, min, max, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) throw invalid(label + " must be " + min + "–" + max + " characters.");
  return text;
}

function choice(value, options, label) {
  if (!options.includes(value)) throw invalid("Select a valid " + label + ".");
  return value;
}

function slugField(value, label) {
  const slug = field(value, 2, 60, label).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]+$/.test(slug)) throw invalid(label + " must use letters a–z, numbers, hyphens or underscores.");
  return slug;
}

function version(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid("Refresh the record before editing.");
  return value;
}

function invalid(message, status = 400, code = "INVALID_INPUT") {
  return new AuthError(code, status, message);
}

function notFound() {
  return adminJson({ error: "Workspace route was not found.", code: "NOT_FOUND" }, 404);
}
