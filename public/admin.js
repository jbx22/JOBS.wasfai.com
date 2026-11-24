import { bindWorkspace, workspaceIds, workspaceUrl, workspaceView } from "./admin-workspaces.js?v=jobs80";

const root = document.getElementById("admin-root");
const mode = document.body.dataset.adminMode === "super" ? "super" : "admin";
const state = {
  admin: null,
  tab: "overview",
  accessError: null,
  notice: "",
  saving: false,
  loadId: 0,
  overview: null,
  users: [],
  subscribers: [],
  billing: null,
  ai: null,
  audit: [],
  admins: [],
  q: "",
  status: "",
  offset: 0,
  nextOffset: null,
  workspaceFilters: { support: { q: "", status: "" }, accounting: { days: 30 } },
  error: "",
  loading: true,
};

const OWNER_EMAIL = "jabosaag@gmail.com";
const SERVICE_EMAIL = "service@sadmin.wasfai.com";
const NAV = [
  ["overview", "Overview", "reports", "Workspace"],
  ["users", "Users", "users", "Workspace"],
  ["recruitment", "Recruitment", "jobs", "Workspace"],
  ["support", "Customer Support", "support", "Workspace"],
  ["subscribers", "Subscriptions", "subscribers", "Business"],
  ["billing", "Finance & Payments", "billing", "Business"],
  ["accounting", "Accounting", "accounting", "Business"],
  ["marketing", "Marketing", "marketing", "Business"],
  ["ai", "AI & API Usage", "ai", "Administration"],
  ["admins", "Admin Team", null, "Administration"],
  ["audit", "Audit Log", null, "Administration"],
];
const DELEGATED_SCOPES = [
  ["reports", "Overview"], ["users", "Users"], ["employers", "Employer review"], ["jobs", "Vacancy review"],
  ["support", "Customer support"], ["subscribers", "Subscriptions"], ["billing", "Finance & payments"],
  ["accounting", "Accounting"], ["marketing", "Marketing"], ["ai", "AI usage"], ["ai_controls", "AI settings"], ["sources", "Sources"],
];

function can(scope) {
  if (state.admin?.role === "super_admin") return true;
  if (!scope) return false;
  try { return JSON.parse(state.admin?.scopes || "[]").includes(scope); }
  catch { return false; }
}

function visibleNav() {
  return NAV.filter(([id, , scope]) => id === "recruitment"
    ? can("employers") || can("jobs") : (scope || mode === "super") && can(scope));
}

init();

async function init() {
  state.loading = true;
  state.accessError = null;
  render();
  try {
    const session = await api("/api/admin");
    if (mode === "super" && session.admin.role !== "super_admin") {
      state.accessError = { status: 403, message: "This Google account does not have Super Admin access." };
      return;
    }
    state.admin = session.admin;
    const requested = new URLSearchParams(location.search).get("view");
    const tabs = visibleNav();
    const tab = tabs.find(([id]) => id === requested)?.[0] || tabs[0]?.[0];
    if (tab) await refresh(tab);
  } catch (error) {
    state.accessError = error;
  } finally {
    state.loading = false;
    render();
  }
}

async function loadCurrent(tab) {
  if (tab === "overview") return api("/api/admin/overview");
  if (tab === "users") return api(`/api/admin/users?${new URLSearchParams({ q: state.q, status: state.status, offset: state.offset })}`);
  if (tab === "subscribers") return (await api("/api/admin/subscribers")).subscribers || [];
  if (tab === "billing") return api("/api/admin/payments");
  if (tab === "ai") return api("/api/admin/ai");
  if (tab === "audit") return (await api("/api/admin/audit")).audit || [];
  if (tab === "admins") return (await api("/api/admin/admins")).admins || [];
  if (workspaceIds.includes(tab)) return api(workspaceUrl(tab, state.workspaceFilters[tab] || {}));
}

async function refresh(tab = state.tab, preserveNotice = false) {
  if (state.saving || !visibleNav().some(([id]) => id === tab)) return;
  const loadId = ++state.loadId;
  state.tab = tab;
  const url = new URL(location.href);
  url.searchParams.set("view", tab);
  if (url.href !== location.href) history.replaceState(null, "", url);
  state.loading = true;
  state.error = "";
  if (!preserveNotice) state.notice = "";
  render();
  try {
    const data = await loadCurrent(tab);
    if (loadId !== state.loadId) return;
    state[tab] = tab === "users" ? data.users || [] : data;
    if (tab === "users") state.nextOffset = data.next_offset;
  } catch (error) {
    if (loadId !== state.loadId) return;
    if (error.status === 401 || error.code === "ACCOUNT_RESTRICTED" || error.code === "ADMIN_REQUIRED" || error.code === "SUPER_ADMIN_REQUIRED") {
      state.admin = null;
      state.accessError = error;
    } else {
      state.error = error.message || "Admin data could not be loaded.";
    }
  } finally {
    if (loadId === state.loadId) {
      state.loading = false;
      render();
    }
  }
}

function render() {
  if (state.loading && !state.admin) {
    root.innerHTML = `<div class="login-gate"><div class="login-box"><img src="/brand-logo-192.png" alt=""><h1>Loading admin</h1><p>Checking your Google session and permissions.</p></div></div>`;
    return;
  }
  if (!state.admin) {
    const next = encodeURIComponent(location.pathname + location.search);
    const error = state.accessError;
    const canSignIn = !error?.status || error.status < 500;
    root.innerHTML = `
      <div class="login-gate">
        <div class="login-box">
          <img src="/brand-logo-192.png" alt="JOBS.wasfai.com">
          <h1>${mode === "super" ? "Super Admin" : "Admin"} access</h1>
          <p role="status">${esc(error?.status === 401 || !error ? "Sign in with an approved Google account." : error.message)}</p>
          ${canSignIn ? `<a class="btn primary" href="/api/auth/google/start?next=${next}">${error?.status === 403 ? "Use another Google account" : "Sign in with Google"}</a>` : '<button class="btn primary" data-check-access>Retry access check</button>'}
          ${mode === "super" ? '<a class="btn" href="/admin/">Open Admin Console</a>' : ""}
          <a class="btn" href="/app">Back to website</a>
        </div>
      </div>`;
    root.querySelector("[data-check-access]")?.addEventListener("click", init);
    return;
  }
  root.innerHTML = `
    <a class="skip-link" href="#admin-main">Skip to main content</a>
    <div class="admin-app">
      <aside class="admin-sidebar">
        <a class="brand" href="/app"><img src="/brand-logo-192.png" alt=""><span><strong>JOBS.wasfai.com</strong><small>${mode === "super" ? "Super Admin" : "Admin Console"}</small></span></a>
        <nav class="admin-nav" aria-label="Admin sections">${renderNavigation()}</nav>
      </aside>
      <main class="admin-main" id="admin-main" tabindex="-1">
        <header class="admin-topbar">
          <div><h1>${pageTitle()}</h1><p>${esc(state.admin.email)} - ${esc(state.admin.role.replace("_", " "))}</p></div>
          <div class="admin-actions">
            ${mode !== "super" && state.admin.role === "super_admin" ? `<a class="btn blue" href="/super-admin/">Super Admin</a>` : ""}
            ${state.admin.email?.toLowerCase() === OWNER_EMAIL ? '<a class="btn" href="https://sadmin.wasfai.com/?site=jobs">Central Admin</a>' : ""}
            <a class="btn" href="/app">Website</a>
            <button class="btn ghost" data-refresh>Refresh</button>
            <button class="btn ghost" data-sign-out>Sign out</button>
          </div>
        </header>
        <section class="content" aria-busy="${state.loading || state.saving}">${state.notice ? `<p class="alert teal" role="status">${esc(state.notice)}</p>` : ""}${state.loading ? `<div class="loading" role="status">Loading…</div>` : state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : visibleNav().length ? renderTab() : '<div class="empty">No admin sections have been assigned to this account.</div>'}</section>
      </main>
    </div>`;
  bind();
}

function renderNavigation() {
  const tabs = visibleNav();
  return ["Workspace", "Business", "Administration"].map((group) => {
    const links = tabs.filter((item) => item[3] === group);
    if (!links.length) return "";
    return `<div class="nav-section"><span class="nav-title">${group}</span><div class="nav-group">${links.map(([id, label]) => `<a class="nav-btn ${state.tab === id ? "active" : ""}" ${state.tab === id ? 'aria-current="page"' : ""} href="?view=${id}">${label}</a>`).join("")}</div></div>`;
  }).join("");
}

function renderTab() {
  if (state.tab === "overview") return renderOverview();
  if (state.tab === "users") return renderUsers();
  if (state.tab === "subscribers") return renderSubscribers();
  if (state.tab === "billing") return renderBilling();
  if (state.tab === "ai") return renderAi();
  if (state.tab === "audit") return renderAudit();
  if (state.tab === "admins") return renderAdmins();
  if (workspaceIds.includes(state.tab)) return workspaceView(state.tab, state[state.tab], state.workspaceFilters[state.tab] || {});
  return "";
}

function renderOverview() {
  const data = state.overview || {};
  const k = data.kpis || {};
  return `
    <div class="grid kpis">
      ${kpi("Users", k.users, `${k.active_users || 0} active`)}
      ${kpi("Subscribers", k.subscribers, "trial and active")}
      ${kpi("Admins", k.admins, "active operators")}
      ${kpi("Applications", k.applications, "tracked jobs")}
      ${kpi("Jobs AI cost", money(k.ai_cost_usd), "estimated platform spend")}
    </div>
    <div class="grid two">
      <section class="panel"><div class="panel-head"><h2>Work queues</h2></div><div class="panel-body overview-links">
        ${visibleNav().filter(([id]) => ["users", "recruitment", "support", "billing", "accounting", "marketing", "ai"].includes(id))
          .map(([id, label]) => `<a href="?view=${id}" class="admin-work-link">${label}<span aria-hidden="true">↗</span></a>`).join("") ||
          '<p class="empty">This role has access to the overview.</p>'}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Operational alerts</h2></div><div class="panel-body stack">
        ${(data.alerts || []).map((a) => `<div class="alert ${a.tone === "teal" ? "teal" : ""}"><strong>${esc(a.label)}</strong><br><span>${esc(a.detail)}</span></div>`).join("") || `<div class="empty">No active alerts.</div>`}
      </div></section>
      ${state.admin.role === "super_admin" ? `<section class="panel"><div class="panel-head"><h2>Recent audit</h2></div><div class="panel-body">${auditList(data.recent_audit || [])}</div></section>` : ""}
    </div>`;
}

function renderUsers() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>User management</h2><form class="toolbar" data-user-search><input class="input" name="q" aria-label="Search email or name" placeholder="Search email or name" value="${esc(state.q)}"><select class="select" name="status" aria-label="Account status"><option value="">All statuses</option><option value="active" ${state.status === "active" ? "selected" : ""}>Active</option><option value="suspended" ${state.status === "suspended" ? "selected" : ""}>Suspended</option></select><button class="btn">Search</button></form></div>
      <div class="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Subscription</th><th>Last login</th><th>Actions</th></tr></thead><tbody>
        ${state.users.map((u) => `<tr><td><strong>${esc(u.display_name || "Unnamed")}</strong><small>${esc(u.email)}</small></td><td>${badge(u.account_status)}</td><td>${badge(u.plan, "blue")} ${badge(u.effective_status || u.subscription_status, "gold")}</td><td>${date(u.last_login_at)}</td><td><div class="row-actions">${userActions(u)}</div></td></tr>`).join("")}
      </tbody></table></div>${state.users.length ? "" : `<div class="panel-body"><div class="empty">No users found.</div></div>`}
      ${state.offset || state.nextOffset !== null ? `<div class="panel-body toolbar"><button class="btn" data-user-page="${Math.max(0, state.offset - 100)}" ${!state.offset ? "disabled" : ""}>Previous</button><span>Page ${state.offset / 100 + 1}</span><button class="btn" data-user-page="${state.nextOffset}" ${state.nextOffset === null ? "disabled" : ""}>Next</button></div>` : ""}
    </section>`;
}

function renderSubscribers() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Subscribers, AI limits, and spend</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Subscriber</th><th>Plan</th><th>AI limit</th><th>AI usage</th><th>Actions</th></tr></thead><tbody>
        ${state.subscribers.map((s) => `<tr>
          <td><strong>${esc(s.display_name || "Unnamed")}</strong><small>${esc(s.email)}</small></td>
          <td>${badge(s.plan, "blue")} ${badge(s.effective_status || s.subscription_status, "gold")}</td>
          <td>${money(s.ai_monthly_limit_usd)}</td>
          <td><strong>${money(s.ai_cost_usd)}</strong><small>${Number(s.ai_tokens || 0).toLocaleString()} tokens</small></td>
          <td><div class="row-actions"><button class="btn" data-sub-edit="${esc(s.id)}">Manage</button></div></td>
        </tr>`).join("")}
      </tbody></table></div>${state.subscribers.length ? "" : `<div class="panel-body"><div class="empty">No subscribers yet.</div></div>`}
    </section>`;
}

function renderBilling() {
  const data = state.billing || {};
  const gateway = data.gateway || {};
  const summary = data.summary || {};
  const canManage = state.admin?.role === "super_admin";
  return `
    <div class="grid kpis">
      ${kpi("Net collections", sar(summary.net_sar), "verified after reversals, before fees")}
      ${kpi("Gross collections", sar(summary.gross_sar), "verified charges")}
      ${kpi("Refunds", sar(summary.refunded_sar), (summary.partially_refunded || 0) + " partial · " + (summary.refunded || 0) + " full")}
      ${kpi("Voided collections", sar(summary.voided_charge_sar), (summary.voided || 0) + " voided orders")}
      ${kpi("Manual activations", summary.manual || 0, sar(summary.manual_sar) + " order value")}
      ${kpi("Paid", summary.paid || 0, "verified with no reversal")}
      ${kpi("Pending", summary.pending || 0, "awaiting confirmation")}
      ${kpi("Failed", summary.failed || 0, "failed or expired")}
      ${summary.unreconciled ? kpi("Needs reconciliation", summary.unreconciled, "excluded from collections") : ""}
      ${kpi("Gateway", gateway.configured ? "Ready" : "Setup", gateway.webhook_configured ? "webhook secured" : "webhook secret missing")}
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Moyasar gateway</h2>${badge(gateway.configured ? "configured" : "not configured", gateway.configured ? "teal" : "rose")}</div>
      <div class="panel-body stack">
        <div class="setup-grid">
          <div><small>Checkout callback</small><code>${esc(gateway.callback_url || "")}</code></div>
          <div><small>Webhook endpoint</small><code>${esc(gateway.webhook_url || "")}</code></div>
          <div><small>Required Cloudflare secrets</small><code>MOYASAR_SECRET_KEY · MOYASAR_WEBHOOK_SECRET</code></div>
        </div>
        <div class="alert ${gateway.configured && gateway.webhook_configured ? "teal" : ""}">
          ${gateway.configured && gateway.webhook_configured
            ? "Checkout credentials and the webhook secret are configured."
            : "Add the missing Cloudflare secrets, then register the webhook URL and matching secret token in Moyasar Dashboard."}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Transactions</h2><button class="btn" data-refresh>Refresh</button></div>
      <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Order amount</th><th>Status</th><th>Moyasar invoice</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        ${(data.payments || []).map((p) => `<tr>
          <td><strong>${esc(p.display_name || "Unnamed")}</strong><small>${esc(p.email || p.user_id)}</small></td>
          <td>${badge(p.plan, "blue")}</td>
          <td><strong>${p.currency === "SAR" ? sar(p.amount_sar) : "—"}</strong>${p.currency !== "SAR" ? "<small>" + esc(p.currency) + "</small>" : ""}</td>
          <td>${badge(p.status, paymentTone(p.status))}</td>
          <td><code>${esc(shortId(p.provider_invoice_id))}</code><small>${esc(p.provider_payment_id ? `Payment ${shortId(p.provider_payment_id)}` : "No payment ID")}</small></td>
          <td>${date(p.created_at)}</td>
          <td><div class="row-actions">
            ${canManage && p.provider_invoice_id ? `<button class="btn blue" data-payment-sync="${p.id}">Sync</button>` : ""}
            ${canManage && p.provider === "moyasar" && p.provider_invoice_id && ["initiated", "on_hold"].includes(p.status) ? `<button class="btn danger" data-payment-activate="${p.id}">Manual activate</button>` : ""}
          </div></td>
        </tr>`).join("")}
      </tbody></table></div>${(data.payments || []).length ? "" : `<div class="panel-body"><div class="empty">No payment attempts yet.</div></div>`}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Recent payment events</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Event</th><th>Provider object</th><th>Status</th><th>Received</th></tr></thead><tbody>
        ${(data.events || []).map((e) => `<tr><td>${esc(e.event_type)}</td><td><code>${esc(shortId(e.provider_object_id))}</code></td><td>${badge(e.status, paymentTone(e.status))}</td><td>${date(e.created_at)}</td></tr>`).join("")}
      </tbody></table></div>
    </section>`;
}

function renderAi() {
  const ai = state.ai || {};
  const settings = ai.settings || {};
  const monthly = ai.monthly?.cost_usd;
  const budget = settings.monthly_budget_usd;
  return `
    <div class="grid kpis">
      ${kpi("AI requests", ai.usage?.requests ?? 0, "Last 30 days")}
      ${kpi("Input tokens", ai.usage?.input_tokens || 0, "prompt usage")}
      ${kpi("Output tokens", ai.usage?.output_tokens || 0, "completion usage")}
      ${kpi("Jobs AI cost", money(ai.usage?.cost_usd ?? 0), "Estimated · last 30 days")}
      ${kpi("Customer-funded requests", ai.usage?.personal_metered_requests ?? 0, "OpenRouter calls with reported tokens · last 30 days")}
      ${kpi("Providers", (ai.providers || []).filter((p) => p.configured).length, "configured")}
    </div>
    <div class="grid two">
      <section class="panel"><div class="panel-head"><h2>Providers</h2></div><div class="panel-body stack">
        ${(ai.providers || []).map((p) => `<div class="alert ${p.configured ? "teal" : ""}"><strong>${esc(p.label)}</strong><br><span>${p.configured ? "Configured" : "Missing key"} - ${esc(p.model)}</span></div>`).join("")}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Usage settings</h2></div><div class="panel-body stack">
        <p class="helper">At DeepSeek Flash peak, uncached rates, the tokens used on personal accounts in the last 30 days would cost ${money(ai.usage?.personal_comparison_usd ?? 0)}. Actual savings depend on which requests Jobs would have paid for.</p>
        <p class="helper">This month’s estimated Jobs spend is ${money(monthly ?? 0)}. ${budget == null ? "No monthly budget target is saved." : "Budget target " + money(budget) + "."}</p>
        <form class="workspace-form" data-ai-form>
          <label>Monthly budget target USD <input name="monthly_budget_usd" type="number" min="0" max="100000" step="0.01" value="${esc(budget ?? "")}"></label>
          <label>Daily requests per user target <input name="per_user_daily_limit" type="number" min="0" max="100000" step="1" value="${esc(settings.per_user_daily_limit ?? "")}"></label>
          <label>Preferred provider <select name="default_provider"><option value="">Select provider</option>
            ${(ai.providers || []).map((p) => `<option value="${esc(p.id)}"${settings.default_provider === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}
          </select></label>
          ${can("ai_controls") ? '<div><button class="btn primary">Save usage settings</button></div>' : ""}
        </form>
        <p class="helper">These settings record operating targets. Provider routing and enforcement depend on each AI workflow. Configure credentials in Cloudflare.</p>
      </div></section>
    </div>
    <section class="panel"><div class="panel-head"><h2>Usage by route</h2></div><div class="table-wrap"><table><thead><tr><th>Route</th><th>Paid by</th><th>Provider</th><th>Requests</th><th>Tokens</th><th>Jobs cost estimate</th></tr></thead><tbody>
      ${(ai.by_route || []).map((r) => `<tr><td>${esc(r.route)}</td><td>${r.payer === "customer" ? "Customer" : "Jobs"}</td><td>${r.payer === "customer" ? "OpenRouter" : esc(r.provider)}<small>${esc(r.model)}</small></td><td>${r.requests}</td><td>${Number(r.tokens || 0).toLocaleString()}</td><td>${money(r.cost_usd)}</td></tr>`).join("")}
    </tbody></table></div></section>`;
}

function renderAudit() {
  return `<section class="panel"><div class="panel-head"><h2>Full admin audit log</h2><button class="btn" data-refresh>Refresh</button></div><div class="panel-body">${auditList(state.audit)}</div></section>`;
}

function renderAdmins() {
  return `
    <details class="panel intake">
      <summary class="panel-head">Add administrator</summary>
      <form class="panel-body workspace-form" data-new-admin>
        <label>Google account email<input name="email" type="email" maxlength="160" required></label>
        <label>Display name<input name="display_name" maxlength="120"></label>
        <label>Role<select name="role"><option value="admin">Administrator</option><option value="super_admin">Super administrator</option></select></label>
        ${permissionFields(["reports"])}
        <div><button class="btn primary">Add administrator</button></div>
      </form>
    </details>
    <section class="panel">
      <div class="panel-head"><h2>Administrator access</h2></div>
      <div class="panel-body record-list">${state.admins.map(adminRecord).join("") || '<p class="empty">No administrators found.</p>'}</div>
    </section>`;
}

function permissionFields(scopes) {
  return `<fieldset class="wide permission-grid"><legend>Administrator permissions</legend>${DELEGATED_SCOPES.map(([id, label]) =>
    `<label class="check-field"><input type="checkbox" name="scopes" value="${id}" ${scopes.includes(id) ? "checked" : ""}>${label}</label>`).join("")}</fieldset>`;
}

function adminRecord(admin) {
  let scopes = [];
  try { const parsed = JSON.parse(admin.scopes); if (Array.isArray(parsed)) scopes = parsed; } catch { /* Invalid grants provide no permissions. */ }
  const protectedIdentity = [OWNER_EMAIL, SERVICE_EMAIL].includes(admin.email?.toLowerCase());
  return `<details class="workspace-record"><summary>
    <span><strong>${esc(admin.display_name || admin.email)}</strong><small>${esc(admin.email)}</small></span>
    <span class="record-meta">${badge(admin.role, "blue")}${badge(admin.status)}</span></summary>
    <div class="record-body"><p>Last active · ${date(admin.last_active_at)}</p>
    ${protectedIdentity ? "<p>Protected account</p>" : `
      <form class="workspace-form" data-permissions="${esc(admin.email)}">
        <label>Role<select name="role"><option value="admin" ${admin.role === "admin" ? "selected" : ""}>Administrator</option><option value="super_admin" ${admin.role === "super_admin" ? "selected" : ""}>Super administrator</option></select></label>
        <label>Status<select name="status"><option value="active" ${admin.status === "active" ? "selected" : ""}>Active</option><option value="revoked" ${admin.status === "revoked" ? "selected" : ""}>Revoked</option></select></label>
        ${permissionFields(scopes)}
        <div><button class="btn primary">Save access</button></div>
      </form>
      <button class="btn danger" data-admin-delete="${esc(admin.email)}">Delete membership</button>`}
    </div></details>`;
}

function bind() {
  bindWorkspace(root, {
    filter(tab, values) {
      state.workspaceFilters[tab] = tab === "accounting" ? { days: Number(values.days) } : values;
      refresh(tab);
    },
    action: runAction,
  });
  document.querySelectorAll("[data-refresh]").forEach((button) => button.addEventListener("click", () => refresh()));
  root.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      location.reload();
    } catch (error) {
      reportActionError(error);
    }
  });
  root.querySelector("[data-user-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.q = String(form.get("q") || "").trim();
    state.status = String(form.get("status") || "");
    state.offset = 0;
    refresh("users");
  });
  root.querySelectorAll("[data-user-page]").forEach((button) => button.addEventListener("click", () => {
    state.offset = Number(button.dataset.userPage);
    refresh("users");
  }));
  document.querySelectorAll("[data-user-status]").forEach((button) => button.addEventListener("click", () => updateUser(button.dataset.userStatus, button.dataset.status)));
  document.querySelectorAll("[data-sub-edit]").forEach((button) => button.addEventListener("click", () => editSubscriber(button.dataset.subEdit)));
  document.querySelectorAll("[data-payment-sync]").forEach((button) => button.addEventListener("click", () => paymentAction(button.dataset.paymentSync, "sync")));
  document.querySelectorAll("[data-payment-activate]").forEach((button) => button.addEventListener("click", () => paymentAction(button.dataset.paymentActivate, "activate")));
  root.querySelector("[data-ai-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!can("ai_controls")) return;
    const body = Object.fromEntries([...new FormData(event.currentTarget)].filter(([, value]) => value !== ""));
    if (!Object.keys(body).length) return reportActionError(new Error("Enter at least one usage setting."));
    return runAction("/api/admin/ai/settings", { method: "PUT", body });
  });
  root.querySelectorAll("[data-new-admin], [data-permissions]").forEach((form) => {
    const role = form.elements.role;
    const permissions = form.querySelector("fieldset");
    const syncRole = () => { permissions.disabled = permissions.hidden = role.value === "super_admin"; };
    role.addEventListener("change", syncRole);
    syncRole();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = new FormData(form);
      const body = Object.fromEntries(fields);
      if (body.role === "admin") body.scopes = fields.getAll("scopes");
      const id = form.dataset.permissions;
      if ((id || body.role === "super_admin") && !confirm("Apply these administrator permissions?")) return;
      const path = "/api/admin/admins" + (id ? "/" + encodeURIComponent(id) : "");
      return runAction(path, { method: id ? "PATCH" : "POST", body });
    });
  });
  document.querySelectorAll("[data-admin-delete]").forEach((button) => button.addEventListener("click", () => deleteAdmin(button.dataset.adminDelete)));
}

function reportActionError(error) {
  const alert = root.querySelector("[data-action-error]") || document.createElement("p");
  alert.className = "error";
  alert.dataset.actionError = "";
  alert.setAttribute("role", "alert");
  alert.textContent = error.message || "The change could not be saved.";
  root.querySelector(".content").prepend(alert);
}

async function runAction(path, options) {
  if (state.saving) return;
  state.saving = true;
  state.notice = "";
  root.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try {
    await api(path, options);
  } catch (error) {
    state.saving = false;
    if (error.status === 401 || error.code === "ACCOUNT_RESTRICTED" || error.code === "ADMIN_REQUIRED" || error.code === "SUPER_ADMIN_REQUIRED") {
      state.admin = null;
      state.accessError = error;
      render();
      return;
    }
    root.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    root.querySelectorAll("[data-user-page]").forEach((button) => {
      button.disabled = button.textContent === "Previous" ? !state.offset : state.nextOffset === null;
    });
    reportActionError(error);
    return;
  }
  state.saving = false;
  state.notice = "Change saved.";
  await refresh(state.tab, true);
}

function updateUser(id, status) {
  if (!confirm(`Set this user to ${status}?`)) return;
  return runAction(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { account_status: status } });
}

function editSubscriber(id) {
  const subscriber = state.subscribers.find((item) => item.id === id);
  if (!subscriber) return;
  const plan = prompt("Plan: free, gold_monthly, gold_annual, pro, business, vip", subscriber.plan);
  if (plan === null) return;
  const status = prompt("Status: trial, active, pending_payment, past_due, paused, cancelled", subscriber.subscription_status);
  if (status === null) return;
  const limit = prompt("Monthly AI limit USD", String(subscriber.ai_monthly_limit_usd));
  if (limit === null) return;
  return runAction(`/api/admin/subscribers/${encodeURIComponent(id)}`, { method: "PATCH", body: { plan, status, ai_monthly_limit_usd: Number(limit) } });
}

function paymentAction(id, action) {
  if (action === "activate" && !confirm("Manually activate this subscription without a verified online payment? This action is audited.")) return;
  return runAction(`/api/admin/payments/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

function deleteAdmin(id) {
  if (!confirm(`Delete admin ${id}? This removes admin access.`)) return;
  return runAction(`/api/admin/admins/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed: ${response.status}`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function kpi(label, value, trend) {
  return `<section class="panel kpi"><small>${esc(label)}</small><strong>${esc(value ?? 0)}</strong><span class="trend">${esc(trend || "")}</span></section>`;
}

function userActions(u) {
  if ([OWNER_EMAIL, SERVICE_EMAIL].includes(u.email?.toLowerCase())) return "Protected account";
  return u.account_status === "active"
    ? `<button class="btn danger" data-user-status="${esc(u.id)}" data-status="suspended">Suspend</button>`
    : `<button class="btn primary" data-user-status="${esc(u.id)}" data-status="active">Reactivate</button>`;
}

function auditList(items) {
  if (!items.length) return `<div class="empty">No audit entries yet.</div>`;
  return `<div class="stack">${items.map((item) => `<div class="audit-row"><div><strong>${esc(item.actor_email)}</strong><small>${esc(item.actor_role)}</small></div><div><strong>${esc(item.action)}</strong><small>${esc(item.resource_type)} ${esc(item.resource_id)}</small></div><div><small>${esc(item.metadata || "{}")}</small></div><small>${date(item.created_at)}</small></div>`).join("")}</div>`;
}

function badge(value, tone = "") {
  const text = String(value || "none");
  const auto = text.includes("active") || text === "super_admin" ? "teal" : text.includes("suspend") || text.includes("revoked") || text.includes("cancel") ? "rose" : tone;
  return `<span class="badge ${auto}">${esc(text.replace("_", " "))}</span>`;
}

function pageTitle() {
  return NAV.find(([id]) => id === state.tab)?.[1] || "Admin";
}

function money(value) {
  const amount = Number(value || 0);
  if (amount > 0 && amount < 0.0001) return "<$0.0001";
  return `$${amount.toFixed(amount > 0 && amount < 0.01 ? 4 : 2)}`;
}

function sar(value) {
  return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text || "—";
}

function paymentTone(value) {
  const status = String(value || "");
  if (["paid", "captured", "verified"].includes(status)) return "teal";
  if (["failed", "expired", "canceled", "voided", "refunded"].includes(status)) return "rose";
  return "gold";
}

function date(value) {
  if (!value) return "Never";
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
