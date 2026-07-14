CREATE TABLE IF NOT EXISTS user_state_documents (
  user_id TEXT NOT NULL,
  document_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, document_key)
);

CREATE INDEX IF NOT EXISTS idx_user_state_documents_updated
  ON user_state_documents(user_id, updated_at);
