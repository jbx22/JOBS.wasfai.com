CREATE TABLE IF NOT EXISTS employer_profiles (
  user_id TEXT PRIMARY KEY, company_name TEXT NOT NULL, registration_number TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recruitment_jobs (
  id TEXT PRIMARY KEY, employer_id TEXT NOT NULL, title TEXT NOT NULL, city TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'SA', profession TEXT NOT NULL DEFAULT '',
  experience_min INTEGER NOT NULL DEFAULT 0, salary_min INTEGER, salary_max INTEGER,
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME', description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', published_at TEXT NOT NULL DEFAULT '',
  valid_through TEXT NOT NULL, review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recruitment_applications (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, candidate_id TEXT NOT NULL,
  resume_file_id TEXT NOT NULL, cover_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted', consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, candidate_id)
);
CREATE TABLE IF NOT EXISTS recruitment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL,
  resource_id TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employer_profiles_status ON employer_profiles(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_public ON recruitment_jobs(status, valid_through, published_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_employer ON recruitment_jobs(employer_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_candidate ON recruitment_applications(candidate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_job ON recruitment_applications(job_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_events_resource ON recruitment_events(resource_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_status_login ON users(account_status, last_login_at);
