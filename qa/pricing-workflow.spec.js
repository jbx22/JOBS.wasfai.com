const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { publicPlans } = require("../functions/api/_subscriptions.js");
const { safeReturnPath } = require("../public/return-path.js");

test.use({ serviceWorkers: "block" });

const origin = "https://billing.test";
const checkout = "https://checkout.moyasar.com/invoices/synthetic-order-2713";
const order = "2713";
const monthlyCheckout = "https://checkout.moyasar.com/invoices/synthetic-order-2714";
const paidPlan = "gold_annual";
const free = { plan: "free", effective_plan: "free", status: "active", paid_active: false, current_period_end: "2090-01-01" };
const paid = { plan: paidPlan, effective_plan: paidPlan, status: "active", paid_active: true, current_period_end: "2090-01-01" };
const returned = "/pricing/?payment=success&order=" + order;
const choose = (page, plan) => page.locator('[data-select-plan="' + plan + '"]');

async function billing(page, options = {}) {
  const state = {
    signedIn: false, current: free, enabled: true, plansOnline: true, invoiceStatus: "initiated",
    verified: true, active: false, verifyOnline: true, recent: [], pending: null, cancelOnline: true, cancellations: [], starts: [], bodies: [], checks: [], oauth: [], externalRequests: [],
    ...options,
  };
  await page.addInitScript(locale => {
    localStorage.setItem("jobs.wasfai.pricing.locale", locale);
    localStorage.setItem("jobs.wasfai.preferences", JSON.stringify({ version: 2, locale, theme: "light" }));
  }, options.locale || "en");
  await page.context().route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (data, status = 200) => route.fulfill({ status, json: data });
    if ([checkout, monthlyCheckout].includes(url.href) && req.method() === "GET") {
      const annual = url.href === checkout;
      const invoice = annual ? order : "2714";
      const plan = annual ? paidPlan : "gold_monthly";
      return route.fulfill({ contentType: "text/html", body: '<title>Simulated payment gateway</title><a href="' + origin + '/pricing/?payment=success&amp;order=' + invoice + '">Return after payment</a><a href="' + origin + '/pricing/?payment=cancelled&amp;plan=' + plan + '">Cancel and return</a>' });
    }
    if (url.origin !== origin) {
      state.externalRequests.push(req.url());
      return route.abort();
    }
    if (url.pathname === "/api/subscriptions") {
      if (req.method() === "GET") return state.plansOnline
        ? json({ plans: publicPlans(), authenticated: state.signedIn, current: state.signedIn ? state.current : null,
          user: state.signedIn ? { name: "Example", email: "subscriber@example.test" } : null, payment_ready: state.enabled, recent_payments: state.signedIn ? state.recent : [], pending_checkout: state.signedIn ? state.pending : null })
        : json({ code: "UNAVAILABLE" }, 503);
      const body = req.postDataJSON();
      const { plan } = body;
      state.bodies.push(body);
      state.starts.push(plan);
      if (!state.signedIn) return json({ code: "AUTH_REQUIRED" }, 401);
      if (plan === "free") {
        state.current = free;
        return json({ ok: true, current: free, next_action: "free_active" });
      }
      const annual = plan === paidPlan;
      state.pending = { order_id: annual ? order : "2714", plan, checkout_url: annual ? checkout : monthlyCheckout };
      return json({ ok: true, current: state.current, next_action: "redirect_to_moyasar", ...state.pending }, 201);
    }
    if (url.pathname === "/api/payments/moyasar/cancel" && req.method() === "POST") {
      const body = req.postDataJSON();
      state.cancellations.push(body);
      if (!state.signedIn || body.order !== state.pending?.order_id) return json({ code: "ORDER_NOT_FOUND" }, 404);
      if (!state.cancelOnline) return json({ code: "PAYMENT_UNAVAILABLE" }, 503);
      const previous = state.pending;
      state.pending = null;
      state.recent = [{ id: Number(previous.order_id), plan: previous.plan, status: "canceled",
        amount_sar: previous.plan === paidPlan ? 499 : 50, currency: "SAR", created_at: "2026-04-01T10:00:00Z" }];
      return json({ ok: true, order_id: body.order, status: "canceled" });
    }
    if (url.pathname === "/api/payments/moyasar/status") {
      state.checks.push(url.searchParams.get("order"));
      if (!state.verifyOnline) return json({ code: "PAYMENT_VERIFICATION_UNAVAILABLE" }, 503);
      if (state.verified && state.active && state.invoiceStatus === "paid") {
        state.current = paid;
        state.pending = null;
      }
      return json({ verified: state.verified, invoice_activated: state.active, account_paid_active: state.current?.paid_active === true, subscription_active: state.active,
        payment: { id: Number(order), invoice_id: "synthetic-2713", plan: paidPlan, amount_sar: 499, currency: "SAR", status: state.invoiceStatus } });
    }
    if (url.pathname === "/api/auth/google/start") {
      state.oauth.push(Object.fromEntries(url.searchParams));
      state.signedIn = true;
      const next = new URL(safeReturnPath(url.searchParams.get("next")) || "/app", origin);
      expect(next.origin).toBe(origin);
      return route.fulfill({ contentType: "text/html", body: "<script>location.replace(" + JSON.stringify(next.href) + ")</script>" });
    }
    if (url.pathname === "/api/auth/session") return json({ authenticated: state.signedIn, user: state.signedIn ? { sub: "synthetic-subscriber", email: "subscriber@example.test" } : null });
    if (url.pathname === "/api/me/state") return json({ authenticated: state.signedIn, state: { profile: {}, jobs: [], packages: [] }, storage: "postgres-normalized" });
    if (url.pathname === "/api/resumes") return json({ file: null });
    if (url.pathname === "/api/bootstrap") return json({ profile: {}, jobs: [], sources: [], packages: [] });
    if (url.pathname === "/api/ai-health") return json({ ready: false });
    if (url.pathname === "/api/sources") return json({ sources: [] });
    let asset = url.pathname.slice(1);
    if (asset === "pricing/") asset = "pricing/index.html";
    else if (asset === "login" || asset === "app") asset = "index.html";
    else if (!/^[a-z0-9.-]+\.(?:js|css|png|webmanifest)$/.test(asset)) return route.abort();
    return route.fulfill({ path: path.join(__dirname, "../public", asset) });
  });
  return state;
}

async function expectFits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.locator("[data-select-plan]").all()) {
    const bounds = await button.boundingBox();
    const width = page.viewportSize().width;
    expect(bounds.x).toBeGreaterThanOrEqual(-1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  }
}

for (const [width, locale] of [[320, "ar"], [390, "en"]]) {
  test("a guest returns to the chosen annual plan and verifies activation at " + width + "px in " + locale, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
    const f = await billing(page, { locale });
    await page.goto(origin + "/pricing/");
    await expect(choose(page, paidPlan)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
    await expectFits(page);
    await choose(page, paidPlan).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(new URL(next, origin).searchParams.get("plan")).toBe(paidPlan);
    const consent = page.locator("[data-terms-consent]");
    const login = page.locator("[data-google-login]");
    await expect(login).toHaveAttribute("aria-disabled", "true");
    await consent.check();
    await login.click();
    await expect(page).toHaveURL(origin + next);
    await expect(page.locator("[data-plan-intent]")).toBeVisible();
    await expect(page.getByRole("link", { name: locale === "ar" ? "الملف الشخصي" : "User profile" })).toHaveAttribute("href", "/profile?lang=" + locale);
    expect(f.starts).toEqual([]);
    expect(f.oauth).toEqual([{ terms: "1", next }]);
    await choose(page, paidPlan).click();
    await expect(page).toHaveURL(checkout);
    await page.getByRole("link", { name: "Return after payment" }).click();
    const retry = page.locator("[data-retry-payment]");
    await expect(retry).toBeVisible();
    await expect(page.locator("[data-current-plan]")).toContainText(/مجاني|Free/i);
    f.invoiceStatus = "paid";
    f.active = true;
    await retry.click();
    await expect(page.locator("[data-current-plan]")).toContainText(/السنوي|Annual/i);
    await expect(page.locator("[data-payment-status]")).toContainText(/تفعيل|تفعّل|مفعّل|نشط|active|activated/i);
    await expect(choose(page, "free")).toBeDisabled();
    await expect(choose(page, "gold_monthly")).toBeDisabled();
    await expect(choose(page, paidPlan)).toBeEnabled();
    expect(f.bodies).toEqual([{ plan: paidPlan }]);
    expect(f.checks.length).toBeGreaterThanOrEqual(2);
    expect([...new Set(f.checks)]).toEqual([order]);
    expect(f.externalRequests).toEqual([]);
  });
}

test("canceling an unpaid invoice returns to the selected interval without changing entitlement", async ({ page }) => {
  const f = await billing(page, { signedIn: true });
  await page.goto(origin + "/pricing/");
  await choose(page, paidPlan).click();
  await page.getByRole("link", { name: "Cancel and return" }).click();
  await expect(page.locator("[data-current-plan]")).toContainText(/Free/i);
  await expect(page.locator("[data-plan-intent]")).toContainText(/cancel|resume|complete|left/i);
  await expect(choose(page, paidPlan)).toBeEnabled();
  expect(f.starts).toEqual([paidPlan]);
  expect(f.checks).toEqual([]);
  await page.locator("[data-open-checkout]").getByRole("link", { name: /resume checkout/i }).click();
  await expect(page).toHaveURL(checkout);
  expect(f.starts).toEqual([paidPlan]);
});

test("keeping an unpaid invoice makes no change, while confirming cancellation allows a different interval", async ({ page }) => {
  const pending = { order_id: order, plan: paidPlan, checkout_url: checkout };
  const f = await billing(page, { signedIn: true, pending });
  await page.goto(origin + "/pricing/");
  const open = page.locator("[data-open-checkout]");
  await open.locator("[data-cancel-invoice]").click();
  await page.locator("[data-keep-invoice]").click();
  await expect(page.locator("[data-confirm-cancel-invoice]")).toHaveCount(0);
  await expect(open.getByRole("link", { name: /resume checkout/i })).toHaveAttribute("href", checkout);
  expect(f.cancellations).toEqual([]);
  expect(f.bodies).toEqual([]);
  await open.locator("[data-cancel-invoice]").click();
  await page.locator("[data-confirm-cancel-invoice]").click();
  await expect(open).toHaveCount(0);
  await expect(page.locator("[data-cancel-result]")).toContainText(/cancelled.*#2713/i);
  await expect(page.locator("[data-current-plan]")).toContainText(/Free/i);
  expect(f.cancellations).toEqual([{ order }]);
  expect(f.bodies).toEqual([]);
  await choose(page, "gold_monthly").click();
  await expect(page).toHaveURL(monthlyCheckout);
  expect(f.bodies).toEqual([{ plan: "gold_monthly" }]);
});

test("an unsuccessful cancellation leaves the original unpaid invoice available to retry", async ({ page }) => {
  const pending = { order_id: order, plan: paidPlan, checkout_url: checkout };
  const f = await billing(page, { signedIn: true, pending, cancelOnline: false });
  await page.goto(origin + "/pricing/");
  const open = page.locator("[data-open-checkout]");
  await open.locator("[data-cancel-invoice]").click();
  await page.locator("[data-confirm-cancel-invoice]").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(open.getByRole("link", { name: /resume checkout/i })).toHaveAttribute("href", checkout);
  expect(f.cancellations).toEqual([{ order }]);
  expect(f.bodies).toEqual([]);
  f.cancelOnline = true;
  const confirm = page.locator("[data-confirm-cancel-invoice]");
  if (!(await confirm.isVisible())) await open.locator("[data-cancel-invoice]").click();
  await confirm.click();
  await expect(open).toHaveCount(0);
  await expect(page.locator("[data-cancel-result]")).toContainText(/cancelled.*#2713/i);
  await expect(page.locator("[data-current-plan]")).toContainText(/Free/i);
  expect(f.cancellations).toEqual([{ order }, { order }]);
  expect(f.bodies).toEqual([]);
});

test("selecting Free uses the subscription service without opening hosted checkout", async ({ page }) => {
  const f = await billing(page, { signedIn: true, current: null });
  await page.goto(origin + "/pricing/");
  await choose(page, "free").click();
  await expect(page.locator("[data-plan-intent]")).toContainText(/Free plan is active/i);
  await expect(choose(page, "free")).toBeDisabled();
  await expect(page).toHaveURL(origin + "/pricing/");
  expect(f.bodies).toEqual([{ plan: "free" }]);
  expect(f.checks).toEqual([]);
  expect(f.externalRequests).toEqual([]);
});

test("renewing an active plan sends explicit renewal consent and keeps the other intervals unavailable", async ({ page }) => {
  const f = await billing(page, { signedIn: true, current: paid });
  await page.goto(origin + "/pricing/");
  await expect(choose(page, "free")).toBeDisabled();
  await expect(choose(page, "gold_monthly")).toBeDisabled();
  await expect(choose(page, paidPlan)).toHaveText(/renew/i);
  await choose(page, paidPlan).click();
  await expect(page).toHaveURL(checkout);
  expect(f.bodies).toEqual([{ plan: paidPlan, renew: true, renew_from: paid.current_period_end }]);
});

test("unverified, interrupted, and failed payment checks preserve access and recover without a second checkout", async ({ page }) => {
  const f = await billing(page, { signedIn: true, invoiceStatus: "paid", verified: false });
  await page.goto(origin + returned);
  const retry = page.locator("[data-retry-payment]");
  await expect(retry).toBeVisible();
  await expect(page.locator("[data-current-plan]")).toContainText(/Free/i);
  f.verifyOnline = false;
  await retry.click();
  await expect(page.locator("[data-payment-status]")).toContainText(/couldn.t verify|could not verify|unable to verify/i);
  f.verifyOnline = true;
  f.verified = true;
  f.invoiceStatus = "failed";
  await retry.click();
  await expect(page.locator("[data-payment-status]")).toContainText(/failed|not activate|unsuccessful|not completed|did not|wasn.t/i);
  await expect(page.locator("[data-current-plan]")).toContainText(/Free/i);
  await expect(choose(page, paidPlan)).toBeEnabled();
  expect(f.starts).toEqual([]);
  expect([...new Set(f.checks)]).toEqual([order]);
});

test("a paid invoice alone cannot activate an expired plan", async ({ page }) => {
  const expired = { ...paid, effective_plan: "free", paid_active: false, current_period_end: "2020-01-01" };
  const f = await billing(page, { signedIn: true, current: expired, invoiceStatus: "paid", verified: true, active: false });
  await page.goto(origin + returned);
  await expect(page.locator("[data-current-plan]")).toContainText(/Free/i);
  await expect(page.locator("[data-payment-status]")).toContainText(/no current active term|not active/i);
  expect(f.starts).toEqual([]);
  expect(f.checks).toEqual([order]);
});

test("a guest payment return goes through sign-in before checking the specific invoice", async ({ page }) => {
  const f = await billing(page);
  await page.goto(origin + returned);
  const signIn = page.locator("[data-pricing-signin]").first();
  await expect(signIn).toBeVisible();
  expect(f.checks).toEqual([]);
  const next = new URL(await signIn.getAttribute("href"), origin).searchParams.get("next");
  expect(next).toBe(returned);
  await signIn.click();
  await page.locator("[data-terms-consent]").check();
  await page.locator("[data-google-login]").click();
  await expect(page.locator("[data-retry-payment]")).toBeVisible();
  expect(f.checks).toEqual([order]);
  expect(f.starts).toEqual([]);
});

for (const destination of [returned, "/pricing/?plan=gold_monthly"]) {
  test("signed-in stale sign-in link returns to standalone pricing at " + destination, async ({ page }) => {
    const f = await billing(page, { signedIn: true });
    await page.goto(origin + "/login?" + new URLSearchParams({ next: destination }));
    await expect(page).toHaveURL(origin + destination);
    const pricing = page.locator("#pricing-root");
    await expect(pricing.locator("[data-select-plan=gold_monthly]")).toBeVisible();
    if (destination === returned) {
      await expect(pricing.locator("[data-retry-payment]")).toBeVisible();
      expect(f.checks).toEqual([order]);
    } else {
      await expect(pricing.locator("[data-plan-intent]")).toBeVisible();
      expect(f.checks).toEqual([]);
    }
    expect(f.oauth).toEqual([]);
    expect(f.starts).toEqual([]);
  });
}

test("unavailable pricing can reload, and paid checkout stays disabled when the gateway is unavailable", async ({ page }) => {
  const f = await billing(page, { signedIn: true, plansOnline: false, enabled: false });
  await page.goto(origin + "/pricing/");
  await expect(page.locator("[data-retry-plans]")).toBeVisible();
  f.plansOnline = true;
  await page.locator("[data-retry-plans]").click();
  await expect(page.locator("[data-checkout-unavailable]")).toBeVisible();
  for (const plan of ["gold_monthly", paidPlan]) await expect(choose(page, plan)).toBeDisabled();
  expect(f.checks).toEqual([]);
  expect(f.starts).toEqual([]);
});


test("payment history displays the most recent ten orders and distinguishes partial and full refunds", async ({ page }) => {
  const history = Array.from({ length: 11 }, (_, i) => ({
    id: 5000 - i, plan: paidPlan, amount_sar: 499, currency: "SAR", status: "paid",
    refunded_sar: 0, created_at: "2026-04-01T10:00:00.000Z",
  }));
  history[0] = { ...history[0], status: "partially_refunded", refunded_sar: 25 };
  history[1] = { ...history[1], status: "refunded", refunded_sar: 499 };
  const f = await billing(page, { signedIn: true, recent: history });
  await page.goto(origin + "/pricing/");
  const panel = page.locator("[data-payment-history]");
  await expect(panel.locator("summary")).toBeVisible();
  await expect(panel).not.toHaveAttribute("open", "");
  await panel.locator("summary").click();
  const payments = panel.locator("li");
  await expect(payments).toHaveCount(10);
  await expect(payments.first()).toContainText(/partial/i);
  await expect(payments.first()).toContainText(/25/);
  await expect(payments.nth(1)).toContainText(/refund/i);
  await expect(payments.nth(1)).not.toContainText(/partial/i);
  await expect(panel).not.toContainText("#4990");
  expect(f.starts).toEqual([]);
  expect(f.checks).toEqual([]);
});
