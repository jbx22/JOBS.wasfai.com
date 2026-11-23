"use strict";

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
  error: "",
  loading: true,
};

const OWNER_EMAIL = "jabosaag@gmail.com";
const SERVICE_EMAIL = "service@sadmin.wasfai.com";
const NAV = [
  ["overview", "Overview", "reports"],
  ["users", "Users", "users"],
  ["subscribers", "Subscribers", "subscribers"],
  ["billing", "Billing & Moyasar", "billing"],
  ["ai", "AI & Cost", "ai"],
  ["audit", "Audit Log"],
  ["admins", "Admin Team"],
];

function can(scope) {
  if (state.admin?.role === "super_admin") return true;
  if (!scope) return false;
  try { return JSON.parse(state.admin?.scopes || "[]").includes(scope); }
  catch { return false; }
}

function visibleNav() {
  return NAV.filter(([id, , scope]) => (scope || mode === "super") && can(scope));
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
    const tab = visibleNav()[0]?.[0];
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
}

async function refresh(tab = state.tab, preserveNotice = false) {
  if (state.saving || !visibleNav().some(([id]) => id === tab)) return;
  const loadId = ++state.loadId;
  state.tab = tab;
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
    const next = encodeURIComponent(location.pathname);
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
    <div class="admin-app">
      <aside class="admin-sidebar">
        <a class="brand" href="/app"><img src="/brand-logo-192.png" alt=""><span><strong>JOBS.wasfai.com</strong><small>${mode === "super" ? "Super Admin" : "Admin Console"}</small></span></a>
        <nav class="nav-group" aria-label="Admin sections">${visibleNav().map(([id, label]) => `<button class="nav-btn ${state.tab === id ? "active" : ""}" ${state.tab === id ? 'aria-current="page"' : ""} data-tab="${id}">${label}</button>`).join("")}</nav>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar">
          <div><h1>${pageTitle()}</h1><p>${esc(state.admin.email)} - ${esc(state.admin.role.replace("_", " "))}</p></div>
          <div class="admin-actions">
            ${mode !== "super" && state.admin.role === "super_admin" ? `<a class="btn blue" href="/super-admin/">Super Admin</a>` : ""}
            ${can("employers") || can("jobs") ? '<a class="btn" href="/recruitment-admin">Recruitment</a>' : ""}
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

function renderTab() {
  if (state.tab === "overview") return renderOverview();
  if (state.tab === "users") return renderUsers();
  if (state.tab === "subscribers") return renderSubscribers();
  if (state.tab === "billing") return renderBilling();
  if (state.tab === "ai") return renderAi();
  if (state.tab === "audit") return renderAudit();
  if (state.tab === "admins") return renderAdmins();
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
      ${kpi("AI cost", money(k.ai_cost_usd), "recorded usage")}
    </div>
    <div class="grid two">
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
        ${state.users.map((u) => `<tr><td><strong>${esc(u.display_name || "Unnamed")}</strong><small>${esc(u.email)}</small></td><td>${badge(u.account_status)}</td><td>${badge(u.plan, "blue")} ${badge(u.subscription_status, "gold")}</td><td>${date(u.last_login_at)}</td><td><div class="row-actions">${userActions(u)}</div></td></tr>`).join("")}
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
          <td>${badge(s.plan, "blue")} ${badge(s.subscription_status, "gold")}</td>
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
      ${kpi("Gross payments", sar(summary.gross_sar), "recorded in SAR")}
      ${kpi("Paid", summary.paid || 0, "successful payments")}
      ${kpi("Pending", summary.pending || 0, "awaiting confirmation")}
      ${kpi("Failed", summary.failed || 0, "failed or expired")}
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
            ? "Server-side checkout and signed webhook verification are ready."
            : "Add the missing Cloudflare secrets, then register the webhook URL and matching secret token in Moyasar Dashboard."}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Transactions</h2><button class="btn" data-refresh>Refresh</button></div>
      <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th><th>Moyasar invoice</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        ${(data.payments || []).map((p) => `<tr>
          <td><strong>${esc(p.display_name || "Unnamed")}</strong><small>${esc(p.email || p.user_id)}</small></td>
          <td>${badge(p.plan, "blue")}</td>
          <td><strong>${sar(p.amount_sar)}</strong><small>${esc(p.currency)}</small></td>
          <td>${badge(p.status, paymentTone(p.status))}</td>
          <td><code>${esc(shortId(p.provider_invoice_id))}</code><small>${esc(p.provider_payment_id ? `Payment ${shortId(p.provider_payment_id)}` : "No payment ID")}</small></td>
          <td>${date(p.created_at)}</td>
          <td><div class="row-actions">
            ${canManage && p.provider_invoice_id ? `<button class="btn blue" data-payment-sync="${p.id}">Sync</button>` : ""}
            ${canManage && !["paid", "captured", "paid_manual"].includes(p.status) ? `<button class="btn danger" data-payment-activate="${p.id}">Manual activate</button>` : ""}
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
  return `
    <div class="grid kpis">
      ${kpi("AI requests", ai.usage?.requests || 0, "tracked calls")}
      ${kpi("Input tokens", ai.usage?.input_tokens || 0, "prompt usage")}
      ${kpi("Output tokens", ai.usage?.output_tokens || 0, "completion usage")}
      ${kpi("Total cost", money(ai.usage?.cost_usd || 0), "estimated USD")}
      ${kpi("Providers", (ai.providers || []).filter((p) => p.configured).length, "configured")}
    </div>
    <div class="grid two">
      <section class="panel"><div class="panel-head"><h2>Providers</h2></div><div class="panel-body stack">
        ${(ai.providers || []).map((p) => `<div class="alert ${p.configured ? "teal" : ""}"><strong>${esc(p.label)}</strong><br><span>${p.configured ? "Configured" : "Missing key"} - ${esc(p.model)}</span></div>`).join("")}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Budget controls</h2></div><div class="panel-body stack">
        <div class="toolbar">
          <label class="field"><span>Monthly budget USD</span><input class="input" data-ai-setting="monthly_budget_usd" value="${esc(ai.settings?.monthly_budget_usd || "100")}"></label>
          <label class="field"><span>Default provider</span><select class="select" data-ai-setting="default_provider"><option value="deepseek" ${(ai.settings?.default_provider || "deepseek") === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="openrouter" ${ai.settings?.default_provider === "openrouter" ? "selected" : ""}>OpenRouter</option>${ai.settings?.default_provider === "luna" ? '<option value="luna" selected>Luna</option>' : ""}</select></label>
          ${state.admin.role === "super_admin" ? '<button class="btn primary" data-save-ai>Save settings</button>' : ""}
        </div>
        <div class="empty">API keys stay in Cloudflare environment secrets and are never shown here.</div>
      </div></section>
    </div>
    <section class="panel"><div class="panel-head"><h2>Usage by route</h2></div><div class="table-wrap"><table><thead><tr><th>Route</th><th>Provider</th><th>Requests</th><th>Tokens</th><th>Cost</th></tr></thead><tbody>
      ${(ai.by_route || []).map((r) => `<tr><td>${esc(r.route)}</td><td>${esc(r.provider)}<small>${esc(r.model)}</small></td><td>${r.requests}</td><td>${Number(r.tokens || 0).toLocaleString()}</td><td>${money(r.cost_usd)}</td></tr>`).join("")}
    </tbody></table></div></section>`;
}

function renderAudit() {
  return `<section class="panel"><div class="panel-head"><h2>Full admin audit log</h2><button class="btn" data-refresh>Refresh</button></div><div class="panel-body">${auditList(state.audit)}</div></section>`;
}

function renderAdmins() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>Add or manage admins</h2></div>
      <div class="panel-body toolbar">
        <input class="input" data-new-admin-email placeholder="admin@example.com">
        <input class="input" data-new-admin-name placeholder="Display name">
        <select class="select" data-new-admin-role><option value="admin">Admin</option><option value="super_admin">Super admin</option></select>
        <button class="btn primary" data-add-admin>Add admin</button>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Admin</th><th>Role</th><th>Status</th><th>Last active</th><th>Actions</th></tr></thead><tbody>
        ${state.admins.map((a) => `<tr><td><strong>${esc(a.display_name || "Unnamed")}</strong><small>${esc(a.email)}</small></td><td>${badge(a.role, a.role === "super_admin" ? "teal" : "blue")}</td><td>${badge(a.status, a.status === "active" ? "teal" : "rose")}</td><td>${date(a.last_active_at)}</td><td><div class="row-actions">${adminActions(a)}</div></td></tr>`).join("")}
      </tbody></table></div>
    </section>`;
}

function bind() {
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => refresh(button.dataset.tab)));
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
  const saveAi = document.querySelector("[data-save-ai]");
  if (saveAi) saveAi.addEventListener("click", saveAiSettings);
  const addAdmin = document.querySelector("[data-add-admin]");
  if (addAdmin) addAdmin.addEventListener("click", createAdmin);
  document.querySelectorAll("[data-admin-role]").forEach((button) => button.addEventListener("click", () => updateAdmin(button.dataset.adminRole, { role: button.dataset.role, status: "active" })));
  document.querySelectorAll("[data-admin-revoke]").forEach((button) => button.addEventListener("click", () => updateAdmin(button.dataset.adminRevoke, { role: button.dataset.role, status: "revoked" })));
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

function saveAiSettings() {
  const body = {};
  document.querySelectorAll("[data-ai-setting]").forEach((input) => { body[input.dataset.aiSetting] = input.value; });
  return runAction("/api/admin/ai/settings", { method: "PUT", body });
}

function createAdmin() {
  const email = document.querySelector("[data-new-admin-email]")?.value || "";
  const display_name = document.querySelector("[data-new-admin-name]")?.value || "";
  const role = document.querySelector("[data-new-admin-role]")?.value || "admin";
  return runAction("/api/admin/admins", { method: "POST", body: { email, display_name, role } });
}

function updateAdmin(id, body) {
  if (!confirm(`Update admin ${id}?`)) return;
  return runAction(`/api/admin/admins/${encodeURIComponent(id)}`, { method: "PATCH", body });
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

function adminActions(a) {
  if ([OWNER_EMAIL, SERVICE_EMAIL].includes(a.email?.toLowerCase())) return "Protected account";
  const id = esc(a.email || a.user_id);
  const roleSwitch = a.role === "super_admin"
    ? `<button class="btn" data-admin-role="${id}" data-role="admin">Make admin</button>`
    : `<button class="btn blue" data-admin-role="${id}" data-role="super_admin">Make super</button>`;
  const revoke = a.status === "active"
    ? `<button class="btn danger" data-admin-revoke="${id}" data-role="${esc(a.role)}">Revoke</button>`
    : `<button class="btn primary" data-admin-role="${id}" data-role="${esc(a.role)}">Restore</button>`;
  return `${roleSwitch}${revoke}<button class="btn danger" data-admin-delete="${id}">Delete</button>`;
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
  return `$${Number(value || 0).toFixed(2)}`;
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
  if (["paid", "captured", "verified", "paid_manual"].includes(status)) return "teal";
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
