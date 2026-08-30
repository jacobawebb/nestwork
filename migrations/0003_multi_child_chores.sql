PRAGMA foreign_keys = OFF;

ALTER TABLE chore_templates ADD COLUMN saved_as_template INTEGER NOT NULL DEFAULT 1 CHECK (saved_as_template IN (0,1));

DROP TRIGGER chore_instances_no_delete;
CREATE TABLE chore_instances_next (
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
  available_at TEXT NOT NULL, due_at TEXT, expires_at TEXT, completed_at TEXT, reviewed_at TEXT, reviewer_id TEXT,
  return_reason TEXT, completion_note TEXT, created_at TEXT NOT NULL,
  UNIQUE (template_id, occurrence_key, assigned_child_id), UNIQUE (id, household_id)
);
INSERT INTO chore_instances_next SELECT * FROM chore_instances;
DROP TABLE chore_instances;
ALTER TABLE chore_instances_next RENAME TO chore_instances;
CREATE INDEX instances_household_status_time ON chore_instances(household_id, status, available_at, expires_at);
CREATE INDEX instances_assigned_status ON chore_instances(assigned_child_id, status, available_at);
CREATE INDEX instances_claimed_status ON chore_instances(claimed_by_child_id, status, available_at);
CREATE TRIGGER chore_instances_no_delete BEFORE DELETE ON chore_instances
BEGIN SELECT RAISE(ABORT, 'chore instances are immutable'); END;
PRAGMA foreign_keys = ON;
