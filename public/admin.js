"use strict";

const root = document.getElementById("admin-root");
const mode = document.body.dataset.adminMode === "super" ? "super" : "admin";
const state = {
  admin: null,
  tab: mode === "super" ? "audit" : "overview",
  overview: null,
  users: [],
  subscribers: [],
  ai: null,
  audit: [],
  admins: [],
  q: "",
  error: "",
  loading: true,
};

const NAV = mode === "super"
  ? [
      ["audit", "Audit Log", "AL"],
      ["admins", "Admin Team", "AT"],
      ["users", "Users", "US"],
      ["subscribers", "Subscribers", "SB"],
      ["ai", "AI & Cost", "AI"],
    ]
  : [
      ["overview", "Overview", "OV"],
      ["users", "Users", "US"],
      ["subscribers", "Subscribers", "SB"],
      ["ai", "AI & Cost", "AI"],
    ];

init();

async function init() {
  try {
    const session = await api("/api/admin");
    state.admin = session.admin;
    await loadCurrent();
  } catch (error) {
    state.error = error.code || "AUTH_REQUIRED";
  } finally {
    state.loading = false;
    render();
  }
}

async function loadCurrent() {
  if (state.tab === "overview") state.overview = await api("/api/admin/overview");
  if (state.tab === "users") state.users = (await api(`/api/admin/users?q=${encodeURIComponent(state.q)}`)).users || [];
  if (state.tab === "subscribers") state.subscribers = (await api("/api/admin/subscribers")).subscribers || [];
  if (state.tab === "ai") state.ai = await api("/api/admin/ai");
  if (state.tab === "audit") state.audit = (await api("/api/admin/audit")).audit || [];
  if (state.tab === "admins") state.admins = (await api("/api/admin/admins")).admins || [];
}

async function refresh(tab = state.tab) {
  state.tab = tab;
  state.loading = true;
  state.error = "";
  render();
  try {
    await loadCurrent();
  } catch (error) {
    state.error = error.message || "Admin data could not be loaded.";
  } finally {
    state.loading = false;
    render();
  }
}

function render() {
  if (state.loading && !state.admin) {
    root.innerHTML = `<div class="login-gate"><div class="login-box"><img src="/brand-logo-192.png" alt=""><h1>Loading admin</h1><p>Checking your Google session and permissions.</p></div></div>`;
    return;
  }
  if (!state.admin) {
    const next = encodeURIComponent(location.pathname);
    root.innerHTML = `
      <div class="login-gate">
        <div class="login-box">
          <img src="/brand-logo-192.png" alt="JOBS.wasfai.com">
          <h1>${mode === "super" ? "Super Admin" : "Admin"} access</h1>
          <p>Sign in with an approved Google account. Super admin is reserved for jabosaag@gmail.com.</p>
          <a class="btn primary" href="/api/auth/google/start?next=${next}">Sign in with Google</a>
          <a class="btn" href="/app">Back to website</a>
        </div>
      </div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-app">
      <aside class="admin-sidebar">
        <a class="brand" href="/app"><img src="/brand-logo-192.png" alt=""><span><strong>JOBS.wasfai.com</strong><small>${mode === "super" ? "Super Admin" : "Admin Console"}</small></span></a>
        <div class="nav-title">Workspace</div>
        <nav class="nav-group">${NAV.map(([id, label, ico]) => `<button class="nav-btn ${state.tab === id ? "active" : ""}" data-tab="${id}"><span class="ico">${ico}</span><span>${label}</span></button>`).join("")}</nav>
      </aside>
      <main class="admin-main">
        <header class="admin-topbar">
          <div><h1>${pageTitle()}</h1><p>${esc(state.admin.email)} - ${esc(state.admin.role.replace("_", " "))}</p></div>
          <div class="admin-actions">
            ${mode !== "super" && state.admin.role === "super_admin" ? `<a class="btn blue" href="/super-admin/">Super Admin</a>` : ""}
            <a class="btn" href="/app">Website</a>
            <button class="btn ghost" data-refresh>Refresh</button>
          </div>
        </header>
        <section class="content">${state.loading ? `<div class="loading">Loading...</div>` : state.error ? `<div class="error">${esc(state.error)}</div>` : renderTab()}</section>
      </main>
    </div>`;
  bind();
}

function renderTab() {
  if (state.tab === "overview") return renderOverview();
  if (state.tab === "users") return renderUsers();
  if (state.tab === "subscribers") return renderSubscribers();
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
      <section class="panel"><div class="panel-head"><h2>Recent audit</h2></div><div class="panel-body">${auditList(data.recent_audit || [])}</div></section>
    </div>`;
}

function renderUsers() {
  return `
    <section class="panel">
      <div class="panel-head"><h2>User management</h2><div class="toolbar"><input class="input" data-search placeholder="Search email or name" value="${esc(state.q)}"><button class="btn" data-run-search>Search</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Subscription</th><th>Last login</th><th>Actions</th></tr></thead><tbody>
        ${state.users.map((u) => `<tr><td><strong>${esc(u.display_name || "Unnamed")}</strong><small>${esc(u.email)}</small></td><td>${badge(u.account_status)}</td><td>${badge(u.plan, "blue")} ${badge(u.subscription_status, "gold")}</td><td>${date(u.last_login_at)}</td><td><div class="row-actions">${userActions(u)}</div></td></tr>`).join("")}
      </tbody></table></div>${state.users.length ? "" : `<div class="panel-body"><div class="empty">No users found.</div></div>`}
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
          <label class="field"><span>Default provider</span><select class="select" data-ai-setting="default_provider"><option value="deepseek">DeepSeek</option><option value="openrouter">OpenRouter</option></select></label>
          <button class="btn primary" data-save-ai>Save settings</button>
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
  const search = document.querySelector("[data-search]");
  if (search) search.addEventListener("input", (event) => { state.q = event.target.value; });
  const runSearch = document.querySelector("[data-run-search]");
  if (runSearch) runSearch.addEventListener("click", () => refresh("users"));
  document.querySelectorAll("[data-user-status]").forEach((button) => button.addEventListener("click", () => updateUser(button.dataset.userStatus, button.dataset.status)));
  document.querySelectorAll("[data-sub-edit]").forEach((button) => button.addEventListener("click", () => editSubscriber(button.dataset.subEdit)));
  const saveAi = document.querySelector("[data-save-ai]");
  if (saveAi) saveAi.addEventListener("click", saveAiSettings);
  const addAdmin = document.querySelector("[data-add-admin]");
  if (addAdmin) addAdmin.addEventListener("click", createAdmin);
  document.querySelectorAll("[data-admin-role]").forEach((button) => button.addEventListener("click", () => updateAdmin(button.dataset.adminRole, { role: button.dataset.role, status: "active" })));
  document.querySelectorAll("[data-admin-revoke]").forEach((button) => button.addEventListener("click", () => updateAdmin(button.dataset.adminRevoke, { role: button.dataset.role, status: "revoked" })));
  document.querySelectorAll("[data-admin-delete]").forEach((button) => button.addEventListener("click", () => deleteAdmin(button.dataset.adminDelete)));
}

async function updateUser(id, status) {
  if (!confirm(`Set this user to ${status}?`)) return;
  await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { account_status: status } });
  refresh("users");
}

async function editSubscriber(id) {
  const plan = prompt("Plan: free, gold_monthly, gold_annual, pro, business, vip", "gold_monthly");
  if (!plan) return;
  const status = prompt("Status: trial, active, pending_payment, past_due, paused, cancelled", "active") || "active";
  const limit = prompt("Monthly AI limit USD", "10") || "10";
  await api(`/api/admin/subscribers/${encodeURIComponent(id)}`, { method: "PATCH", body: { plan, status, ai_monthly_limit_usd: Number(limit) } });
  refresh("subscribers");
}

async function saveAiSettings() {
  const body = {};
  document.querySelectorAll("[data-ai-setting]").forEach((input) => { body[input.dataset.aiSetting] = input.value; });
  await api("/api/admin/ai/settings", { method: "PUT", body });
  refresh("ai");
}

async function createAdmin() {
  const email = document.querySelector("[data-new-admin-email]")?.value || "";
  const display_name = document.querySelector("[data-new-admin-name]")?.value || "";
  const role = document.querySelector("[data-new-admin-role]")?.value || "admin";
  await api("/api/admin/admins", { method: "POST", body: { email, display_name, role } });
  refresh("admins");
}

async function updateAdmin(id, body) {
  if (!confirm(`Update admin ${id}?`)) return;
  await api(`/api/admin/admins/${encodeURIComponent(id)}`, { method: "PATCH", body });
  refresh("admins");
}

async function deleteAdmin(id) {
  if (!confirm(`Delete admin ${id}? This removes admin access.`)) return;
  await api(`/api/admin/admins/${encodeURIComponent(id)}`, { method: "DELETE" });
  refresh("admins");
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
    throw error;
  }
  return data;
}

function kpi(label, value, trend) {
  return `<section class="panel kpi"><small>${esc(label)}</small><strong>${esc(value ?? 0)}</strong><span class="trend">${esc(trend || "")}</span></section>`;
}

function userActions(u) {
  return u.account_status === "active"
    ? `<button class="btn danger" data-user-status="${esc(u.id)}" data-status="suspended">Suspend</button>`
    : `<button class="btn primary" data-user-status="${esc(u.id)}" data-status="active">Reactivate</button>`;
}

function adminActions(a) {
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

function date(value) {
  if (!value) return "Never";
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
