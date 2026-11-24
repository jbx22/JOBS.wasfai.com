// The pricing page needs the owner's order references, amounts, and states only.
export async function recentSubscriptionPayments(db, userId) {
  const { results } = await db.prepare(`
    SELECT p.id, p.plan, p.amount_halalas, p.amount_sar, p.currency, p.status, p.created_at, r.refunded_halalas
    FROM subscription_payments p
    LEFT JOIN payment_refunds r ON r.provider_invoice_id = p.provider_invoice_id
    WHERE p.user_id = ? AND p.provider = 'moyasar'
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 10
  `).bind(userId).all();
  return results.map(row => ({
    id: Number(row.id),
    plan: row.plan,
    amount_sar: Number(row.amount_halalas) > 0 ? Number(row.amount_halalas) / 100 : Number(row.amount_sar),
    refunded_sar: row.refunded_halalas == null ? null : Number(row.refunded_halalas) / 100,
    currency: row.currency,
    status: row.status,
    created_at: row.created_at,
  }));
}
