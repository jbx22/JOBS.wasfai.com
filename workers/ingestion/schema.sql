CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  connector_mode TEXT NOT NULL DEFAULT 'public_html',
  interval_minutes INTEGER NOT NULL DEFAULT 360,
  last_scanned_at TEXT NOT NULL DEFAULT '',
  next_scan_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  employer TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'discovered',
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dedupe_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_jobs_source_id ON jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score);
CREATE INDEX IF NOT EXISTS idx_sources_due ON sources(enabled, next_scan_at);

CREATE TABLE IF NOT EXISTS user_states (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sources
  (id, label, url, region, query, enabled, connector_mode, interval_minutes, next_scan_at)
VALUES
  ('wazzuf', 'WUZZUF', 'https://wuzzuf.net/search/jobs/?q=project%20manager&a=hpb', 'Egypt, MENA', 'project manager', 1, 'public_html', 360, ''),
  ('bayt', 'Bayt', 'https://www.bayt.com/en/international/jobs/project-manager-jobs/', 'MENA', 'project manager', 1, 'public_html', 360, ''),
  ('hiringcafe', 'Hiring Cafe', 'https://hiring.cafe/', 'Global', 'operations', 1, 'public_html', 1440, '');
