CREATE TABLE IF NOT EXISTS resume_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_resume_files_user_created
  ON resume_files(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_files_one_active
  ON resume_files(user_id)
  WHERE status = 'active';
