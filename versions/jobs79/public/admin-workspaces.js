const CASE_STATUSES = [["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"]];
const PRIORITIES = [["normal", "Normal"], ["high", "High"]];
const CAMPAIGN_STATUSES = [["draft", "Draft"], ["active", "Active"], ["paused", "Paused"]];
const LANDINGS = [["/", "Home"], ["/vacancies", "Vacancies"], ["/employers", "Employers"], ["/pricing/", "Pricing"]];

export const workspaceIds = ["recruitment", "support", "marketing", "accounting"];

export function workspaceUrl(tab, filters) {
  const query = new URLSearchParams();
  if (tab === "support") {
    if (filters.status) query.set("status", filters.status);
    if (filters.q) query.set("q", filters.q);
  }
  if (tab === "accounting") query.set("days", filters.days);
  return "/api/admin/" + tab + (query.size ? "?" + query : "");
}

export function workspaceView(tab, data, filters) {
  if (tab === "support") return supportView(data, filters);
  if (tab === "marketing") return marketingView(data);
  if (tab === "accounting") return accountingView(data, filters);
  return recruitmentView(data);
}

function recruitmentView(data) {
  return `
    <div class="workspace-metrics">
      ${data.companies ? metric("Employer reviews", data.companies.pending ?? 0, "Pending verification") : ""}
      ${data.companies ? metric("Verified employers", data.companies.verified ?? 0, "Approved companies") : ""}
      ${data.openings ? metric("Vacancy reviews", data.openings.pending ?? 0, "Awaiting moderation") : ""}
      ${data.openings ? metric("Published status", data.openings.published ?? 0, "Listings marked published") : ""}
    </div>
    <section class="panel"><div class="panel-head"><h2>Moderation queue</h2>
      <a class="btn primary" href="/recruitment-admin">Review employers and vacancies</a>
    </div></section>`;
}

function supportView(data, filters) {
  return `
    <div class="workspace-metrics">
      ${metric("Open", data.counts.open ?? 0, "New cases")}
      ${metric("In progress", data.counts.in_progress ?? 0, "Cases being handled")}
      ${metric("Resolved", data.counts.resolved ?? 0, "Closed cases")}
    </div>
    <details class="panel intake">
      <summary class="panel-head">Create support case</summary>
      <form class="panel-body workspace-form" data-workspace-action="case-create">
        <label>Subject<input name="subject" required maxlength="120" minlength="4"></label>
        <label>Requester email<input name="requester_email" type="email" required maxlength="160" autocomplete="off"></label>
        <label>Priority<select name="priority">${options(PRIORITIES)}</select></label>
        <label class="wide">Case description<textarea name="summary" required minlength="4" maxlength="2000" rows="3"></textarea></label>
        <div><button class="btn primary">Create case</button></div>
      </form>
    </details>
    <section class="panel">
      <div class="panel-head"><h2>Support queue</h2>
        <form class="toolbar" data-workspace-filter="support">
          <input class="input" name="q" aria-label="Search cases" placeholder="Subject or email" maxlength="160" value="${esc(filters.q || "")}">
          <select class="select" name="status" aria-label="Case status">${options([["", "All statuses"], ...CASE_STATUSES], filters.status)}</select>
          <button class="btn">Filter</button>
        </form>
      </div>
      <div class="panel-body record-list">
        ${data.cases.map(supportRecord).join("") || '<p class="empty">No cases match this view.</p>'}
        ${data.cases.length === 100 ? '<p class="helper">Showing up to 100 cases. Use filters to narrow the queue.</p>' : ""}
      </div>
    </section>`;
}

function supportRecord(row) {
  const name = CASE_STATUSES.find(([id]) => id === row.status)?.[1] || row.status;
  const id = esc(row.id);
  return `
    <details class="workspace-record">
      <summary><span><strong>${esc(row.subject)}</strong><small>${esc(row.requester_email)} · ${esc(row.assigned_to || "Unassigned")}</small></span>
        <span class="record-meta">${pill(name)}${row.priority === "high" ? pill("High priority") : ""}</span></summary>
      <div class="record-body">
        <p class="record-text">${esc(row.summary)}</p>
        ${row.last_note ? `<p><strong>Latest internal note</strong><br><span class="record-text">${esc(row.last_note)}</span></p>` : ""}
        <form class="workspace-form" data-workspace-action="case-update" data-id="${id}">
          <input type="hidden" name="version" value="${esc(row.version)}">
          <label>Status<select name="status">${options(CASE_STATUSES, row.status)}</select></label>
          <label class="check-field"><input type="checkbox" name="assign_to_me"> Assign to me</label>
          <label class="wide">Internal note<textarea name="note" maxlength="1500" rows="2" placeholder="Add a resolution note when closing the case"></textarea></label>
          <div><button class="btn primary">Save case</button></div>
        </form>
      </div>
    </details>`;
}

function marketingView(data) {
  const registered = Number(data.funnel.signups ?? 0);
  const completed = Number(data.funnel.completed ?? 0);
  return `
    <div class="workspace-metrics">
      ${metric("New Google accounts", registered, "Last 30 days")}
      ${metric("Onboarding completed", completed, "Same signup cohort")}
      ${metric("Onboarding rate", registered ? Math.round(completed / registered * 100) + "%" : "—", "Same signup cohort")}
    </div>
    <details class="panel intake"><summary class="panel-head">Create campaign link</summary>
      <form class="panel-body workspace-form" data-workspace-action="campaign-create">
        <label>Campaign name<input name="name" required minlength="2" maxlength="120"></label>
        <label>Campaign tag<input name="slug" required minlength="2" maxlength="60" placeholder="winter-hiring"></label>
        <label>Source<input name="source" required minlength="2" maxlength="60" placeholder="newsletter"></label>
        <label>Medium<input name="medium" required minlength="2" maxlength="60" placeholder="email"></label>
        <label>Landing page<select name="landing">${options(LANDINGS)}</select></label>
        <div><button class="btn primary">Save campaign</button></div>
      </form>
    </details>
    <section class="panel"><div class="panel-head"><h2>Campaign links</h2></div>
      <div class="panel-body record-list">
        <p class="helper">Signup metrics cover all channels. Campaign attribution needs an analytics integration. Campaign status is an internal label.</p>
        ${data.campaigns.map(campaignRecord).join("") || '<p class="empty">No campaign links yet.</p>'}
        ${data.campaigns.length === 100 ? '<p class="helper">Showing the most recently updated 100 campaigns.</p>' : ""}
      </div>
    </section>`;
}

function campaignRecord(row) {
  const label = CAMPAIGN_STATUSES.find(([id]) => id === row.status)?.[1] || row.status;
  return `
    <details class="workspace-record"><summary><span><strong>${esc(row.name)}</strong><small>${esc(row.source)} / ${esc(row.medium)}</small></span>${pill(label)}</summary>
      <div class="record-body">
        <label>Tagged link<input class="campaign-link" type="url" readonly value="${esc(row.url)}"></label>
        <form class="toolbar" data-workspace-action="campaign-update" data-id="${esc(row.id)}">
          <input name="version" type="hidden" value="${esc(row.version)}">
          <label>Status <select class="select" name="status">${options(CAMPAIGN_STATUSES, row.status)}</select></label>
          <button class="btn">Save status</button>
        </form>
      </div>
    </details>`;
}

function accountingView(data, filters) {
  return `
    <div class="workspace-metrics">
      ${metric("Payment records", data.totals.records, "Orders created in this period")}
      ${metric("Verified collections", money(data.totals.gross_halalas, "SAR"), "Gross charges on these orders")}
      ${metric("Refunds", money(data.totals.refunded_halalas, "SAR"), data.totals.partially_refunded + " partial · " + data.totals.refunded + " full")}
      ${metric("Voided collections", money(data.totals.voided_charge_halalas, "SAR"), data.totals.voided + " voided orders")}
      ${metric("Net collections", money(data.totals.verified_halalas, "SAR"), "After verified reversals, before processor fees")}
      ${metric("Manual activations", money(data.totals.manual_halalas, "SAR"), "Order value recorded separately")}
    </div>
    <section class="panel"><div class="panel-head"><h2>Payment register</h2>
      <form class="toolbar" data-workspace-filter="accounting">
        <label>Period <select class="select" name="days">${options([["30", "Last 30 days"], ["90", "Last 90 days"]], String(filters.days))}</select></label>
        <button class="btn">Apply</button>
        <a class="btn primary" href="/api/admin/accounting/export?days=${filters.days === 90 ? "90" : "30"}">Download CSV</a>
      </form>
    </div><div class="panel-body record-list">
      <p class="helper">Figures reflect the current status of orders created in the selected period. Use a gateway or bank statement to record a review.</p>
      ${data.totals.unreconciled ? '<p class="helper">' + esc(data.totals.unreconciled) + ' order(s) require payment reconciliation and are excluded from collections.</p>' : ""}
      ${data.totals.duplicates ? '<p class="helper">' + esc(data.totals.duplicates) + ' duplicate invoice record(s) are excluded from collections.</p>' : ""}
      ${data.rows.map(paymentRecord).join("") || '<p class="empty">No payments in this period.</p>'}
      ${data.truncated ? '<p class="helper">Showing the newest 200 payments. Download CSV for additional rows.</p>' : ""}
    </div></section>`;
}

function paymentRecord(row) {
  const reference = row.provider_invoice_id || row.provider_payment_id || "Order " + row.id;
  const collectionNote = {
    pending: "Awaiting payment confirmation.", manual: "Access granted manually. No verified collection is recorded.",
    failed: "No collection recorded.", duplicate: "Duplicate invoice record excluded from collections.",
    unreconciled: "Payment evidence is incomplete. Reconcile the invoice before reviewing it.",
  }[row.collection] || "No verified collection recorded.";
  return `<details class="workspace-record">
    <summary><span><strong>${esc(reference)}</strong><small>${esc(row.created_at)} UTC · ${esc(row.plan)} · ${esc(row.provider)}</small></span>
      <span class="record-meta"><strong>${esc(money(row.amount_halalas, row.currency))}</strong>${pill(row.status)}${row.reviewed_at ? pill("Reviewed") : ""}</span>
    </summary>
    <div class="record-body">
      ${row.net_halalas != null ? `<p>Net collected <strong>${esc(money(row.net_halalas, row.currency))}</strong>${row.refunded_halalas > 0 ? " · refunded " + esc(money(row.refunded_halalas, row.currency)) : ""}${row.voided_charge_halalas > 0 ? " · voided " + esc(money(row.voided_charge_halalas, row.currency)) : ""}</p>` : `<p>${collectionNote}</p>`}
      ${row.verified_at ? '<p>Payment activation recorded ' + esc(row.verified_at) + ' UTC.</p>' : ""}
      ${row.reviewed_at ? `<p>Reviewed ${esc(row.reviewed_at)} UTC · ${esc(row.review_reference)}</p>` : ["unreconciled", "duplicate"].includes(row.collection) ? "" : `
        <form class="toolbar" data-workspace-action="payment-review" data-id="${esc(row.id)}">
          <input type="hidden" name="status" value="${esc(row.status)}"><input type="hidden" name="amount_halalas" value="${esc(row.amount_halalas)}">
          <input type="hidden" name="review_amount_halalas" value="${esc(row.net_halalas ?? row.amount_halalas)}">
          <label>Statement reference <input class="input" name="reference" required minlength="3" maxlength="120"></label>
          <button class="btn primary">Record review</button>
        </form>`}
    </div>
  </details>`;
}

const actions = {
  "case-create": ["/api/admin/support", "POST"],
  "case-update": ["/api/admin/support", "PATCH"],
  "campaign-create": ["/api/admin/marketing", "POST"],
  "campaign-update": ["/api/admin/marketing", "PATCH"],
  "payment-review": ["/api/admin/accounting", "POST"],
};

export function bindWorkspace(root, operations) {
  root.querySelectorAll("[data-workspace-filter]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    operations.filter(form.dataset.workspaceFilter, values);
  }));
  root.querySelectorAll("[data-workspace-action]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const [path, method] = actions[form.dataset.workspaceAction];
    const id = form.dataset.id;
    const body = Object.fromEntries(new FormData(form));
    if (body.version) body.version = Number(body.version);
    if (body.assign_to_me) body.assign_to_me = true;
    if (form.dataset.workspaceAction === "payment-review" && !confirm("Record that you checked this payment against the referenced statement?")) return;
    operations.action(path + (id ? "/" + encodeURIComponent(id) : ""), { method, body });
  }));
}

function options(values, selected) {
  return values.map(([id, label]) => `<option value="${esc(id)}"${id === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
}

function metric(label, value, detail) {
  return `<section class="panel kpi"><small>${esc(label)}</small><strong>${esc(value)}</strong><span class="trend">${esc(detail)}</span></section>`;
}

function pill(text) {
  return `<span class="badge blue">${esc(String(text || "").replaceAll("_", " "))}</span>`;
}

function money(halalas, currency) {
  if (!/^[A-Z]{3}$/.test(currency || "")) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(halalas || 0) / 100);
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
