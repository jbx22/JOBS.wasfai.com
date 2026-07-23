INSERT OR IGNORE INTO sources
  (id, label, url, region, query, enabled, connector_mode, interval_minutes, next_scan_at)
VALUES
  ('remotive', 'Remotive', 'https://remotive.com/api/remote-jobs?limit=100', 'Remote, Global', 'project manager operations engineering', 1, 'public_json', 720, '');
