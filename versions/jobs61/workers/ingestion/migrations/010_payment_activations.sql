CREATE TABLE IF NOT EXISTS payment_activations (
  invoice_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, activation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO payment_activations(invoice_id, user_id, plan, activation_id)
SELECT DISTINCT p.provider_invoice_id, p.user_id, p.plan, 'legacy:' || p.provider_invoice_id
FROM subscription_payments p JOIN subscriptions s ON s.user_id=p.user_id AND s.plan=p.plan
WHERE p.status IN ('paid', 'paid_manual') AND s.status='active' AND p.provider_invoice_id<>''
ON CONFLICT(invoice_id) DO NOTHING;
