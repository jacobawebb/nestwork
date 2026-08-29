CREATE TRIGGER chore_instances_no_delete BEFORE DELETE ON chore_instances
BEGIN SELECT RAISE(ABORT, 'chore instances are immutable'); END;

CREATE TRIGGER sole_active_owner_no_update
BEFORE UPDATE OF role, active ON parent_users
WHEN OLD.role = 'OWNER' AND OLD.active = 1
  AND (NEW.role <> 'OWNER' OR NEW.active <> 1)
  AND NOT EXISTS (
    SELECT 1 FROM parent_users
    WHERE household_id = OLD.household_id AND id <> OLD.id AND role = 'OWNER' AND active = 1
  )
BEGIN SELECT RAISE(ABORT, 'a household must retain one active owner'); END;

CREATE TRIGGER sole_active_owner_no_delete
BEFORE DELETE ON parent_users
WHEN OLD.role = 'OWNER' AND OLD.active = 1
  AND NOT EXISTS (
    SELECT 1 FROM parent_users
    WHERE household_id = OLD.household_id AND id <> OLD.id AND role = 'OWNER' AND active = 1
  )
BEGIN SELECT RAISE(ABORT, 'a household must retain one active owner'); END;
