ALTER TABLE jobs ADD COLUMN posted_at TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN valid_through TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN last_verified_at TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE jobs ADD COLUMN closed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN canonical_employer TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN role_family TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN seniority TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN sector TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_jobs_live
  ON jobs(verification_status, valid_through, last_verified_at);

CREATE TABLE IF NOT EXISTS ingestion_metrics (
  metric_key TEXT NOT NULL,
  bucket TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (metric_key, bucket)
);

-- Preserve the currently verified jobs during rollout; subsequent source scans
-- refresh this timestamp and the 14-day liveness policy archives stale rows.
UPDATE jobs SET verification_status = 'live', last_verified_at = updated_at
WHERE verification_status = 'unverified' AND closed_at = '';

-- Public boards that consistently reject automated access remain available for
-- operator review but are not retried by cron.
UPDATE sources SET enabled = 0, next_scan_at = '', updated_at = CURRENT_TIMESTAMP
WHERE id IN ('bayt', 'wazzuf') AND last_error LIKE '%403%';
