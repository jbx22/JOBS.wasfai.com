ALTER TABLE sources ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN visibility TEXT NOT NULL DEFAULT 'central';
CREATE INDEX IF NOT EXISTS idx_sources_owner ON sources(owner_user_id, enabled);
