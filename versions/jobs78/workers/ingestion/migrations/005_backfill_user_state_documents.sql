-- Safely split existing account blobs into independently revisioned documents.
-- INSERT OR IGNORE makes this restartable and never overwrites newer normalized data.
INSERT OR IGNORE INTO user_state_documents (user_id, document_key, payload, revision, updated_at)
SELECT
  states.user_id,
  parts.key,
  CASE parts.type
    WHEN 'text' THEN json_quote(parts.value)
    WHEN 'null' THEN 'null'
    WHEN 'true' THEN 'true'
    WHEN 'false' THEN 'false'
    ELSE CAST(parts.value AS TEXT)
  END,
  1,
  states.updated_at
FROM user_states AS states, json_each(states.payload) AS parts
WHERE parts.key IN (
  'profile', 'jobs', 'messages', 'packages', 'package_history', 'sources',
  'drafts', 'draft_history', 'activity_feed', 'application_checklists',
  'ghostwriter', 'approvedKits', 'interviewChats', 'resumeCoach',
  'approvedMasterResume', 'masterResume', 'tailoringBriefs', 'aiWriterModel'
);
