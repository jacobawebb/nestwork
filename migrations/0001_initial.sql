PRAGMA foreign_keys = ON;

CREATE TABLE app_installation (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  setup_completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  locale TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE household_settings (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE RESTRICT,
  default_approval_mode TEXT NOT NULL CHECK (default_approval_mode IN ('PARENT_APPROVAL','AUTO_APPROVE')),
  child_release_enabled INTEGER NOT NULL DEFAULT 0 CHECK (child_release_enabled IN (0,1)),
  child_board_limit INTEGER NOT NULL DEFAULT 5 CHECK (child_board_limit BETWEEN 1 AND 20),
  savings_goals_enabled INTEGER NOT NULL DEFAULT 1 CHECK (savings_goals_enabled IN (0,1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE parent_users (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL DEFAULT 'grownup-1',
  accent_key TEXT NOT NULL DEFAULT 'teal',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER','PARENT')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (id, household_id),
  UNIQUE (household_id, email)
);
CREATE UNIQUE INDEX one_active_owner_per_household ON parent_users(household_id) WHERE role = 'OWNER' AND active = 1;

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  avatar_key TEXT NOT NULL,
  accent_key TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, household_id)
);
CREATE UNIQUE INDEX unique_active_child_name ON children(household_id, lower(display_name)) WHERE active = 1;

CREATE TABLE parent_sessions (
  token_hash TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES parent_users(id) ON DELETE CASCADE,
  last_activity_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX parent_sessions_user_expiry ON parent_sessions(parent_user_id, idle_expires_at, revoked_at);

CREATE TABLE child_sessions (
  token_hash TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  last_activity_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX child_sessions_child_expiry ON child_sessions(child_id, idle_expires_at, revoked_at);

CREATE TABLE setup_sessions (
  token_hash TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE auth_attempts (
  attempt_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX auth_attempts_lockout ON auth_attempts(locked_until);

CREATE TABLE parent_invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'PARENT' CHECK (role = 'PARENT'),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (invited_by, household_id) REFERENCES parent_users(id, household_id) ON DELETE RESTRICT
);
CREATE INDEX invitations_household_state ON parent_invitations(household_id, accepted_at, expires_at);

CREATE TABLE chore_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  instructions TEXT,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('ASSIGNED','GENERAL')),
  assigned_child_id TEXT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('PARENT_APPROVAL','AUTO_APPROVE')),
  recurrence_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, household_id),
  FOREIGN KEY (assigned_child_id, household_id) REFERENCES children(id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, household_id) REFERENCES parent_users(id, household_id) ON DELETE RESTRICT
);
CREATE INDEX templates_household_active ON chore_templates(household_id, active, created_at);

CREATE TABLE chore_template_eligibility (
  template_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  PRIMARY KEY (template_id, child_id),
  FOREIGN KEY (template_id, household_id) REFERENCES chore_templates(id, household_id) ON DELETE CASCADE,
  FOREIGN KEY (child_id, household_id) REFERENCES children(id, household_id) ON DELETE CASCADE
);

CREATE TABLE chore_instances (
  id TEXT PRIMARY KEY,
  template_id TEXT,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  occurrence_key TEXT NOT NULL,
  assigned_child_id TEXT,
  claimed_by_child_id TEXT,
  title_snapshot TEXT NOT NULL,
  instructions_snapshot TEXT,
  amount_minor_snapshot INTEGER NOT NULL CHECK (amount_minor_snapshot >= 0),
  currency_snapshot TEXT NOT NULL,
  approval_mode_snapshot TEXT NOT NULL CHECK (approval_mode_snapshot IN ('PARENT_APPROVAL','AUTO_APPROVE')),
  assignment_type_snapshot TEXT NOT NULL CHECK (assignment_type_snapshot IN ('ASSIGNED','GENERAL')),
  status TEXT NOT NULL CHECK (status IN ('SCHEDULED','AVAILABLE','CLAIMED','COMPLETED_PENDING_REVIEW','RETURNED_TO_CHILD','APPROVED','REJECTED','EXPIRED','CANCELLED')),
  available_at TEXT NOT NULL,
  due_at TEXT,
  expires_at TEXT,
  completed_at TEXT,
  reviewed_at TEXT,
  reviewer_id TEXT,
  return_reason TEXT,
  completion_note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (template_id, occurrence_key),
  UNIQUE (id, household_id),
  FOREIGN KEY (template_id, household_id) REFERENCES chore_templates(id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_child_id, household_id) REFERENCES children(id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (claimed_by_child_id, household_id) REFERENCES children(id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewer_id, household_id) REFERENCES parent_users(id, household_id) ON DELETE RESTRICT
);
CREATE INDEX instances_household_status_time ON chore_instances(household_id, status, available_at, expires_at);
CREATE INDEX instances_assigned_status ON chore_instances(assigned_child_id, status, available_at);
CREATE INDEX instances_claimed_status ON chore_instances(claimed_by_child_id, status, available_at);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  child_id TEXT NOT NULL,
  chore_instance_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('EARNING','PAYOUT','ADJUSTMENT','REVERSAL')),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by_parent_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (child_id, household_id) REFERENCES children(id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (chore_instance_id, household_id) REFERENCES chore_instances(id, household_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_parent_id, household_id) REFERENCES parent_users(id, household_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_earning_per_chore ON ledger_entries(chore_instance_id) WHERE type = 'EARNING';
CREATE INDEX ledger_child_time ON ledger_entries(household_id, child_id, created_at DESC);

CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  target_minor INTEGER NOT NULL CHECK (target_minor > 0),
  icon_key TEXT NOT NULL,
  encouragement TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, child_id)
);
CREATE INDEX goals_child_active_order ON savings_goals(child_id, active, display_order);

CREATE TABLE child_goal_preferences (
  child_id TEXT PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  spotlight_goal_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (spotlight_goal_id, child_id) REFERENCES savings_goals(id, child_id) ON DELETE SET NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('OWNER','PARENT','CHILD','SYSTEM')),
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_household_time ON audit_events(household_id, created_at DESC);

CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger entries are immutable'); END;
CREATE TRIGGER ledger_entries_no_delete BEFORE DELETE ON ledger_entries
BEGIN SELECT RAISE(ABORT, 'ledger entries are immutable'); END;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit events are immutable'); END;
