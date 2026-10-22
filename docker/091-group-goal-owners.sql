-- Group goals and milestones belong to the person who made them. Before this
-- file a row had only a group name, so anyone signed in could read any
-- group's goals and change any goal by its id. Old rows go to this install's
-- owner (the lowest-numbered admin account), the only owner that is known.
-- Safe to run twice.
ALTER TABLE group_goals ADD COLUMN IF NOT EXISTS owner_user_id INTEGER;
ALTER TABLE group_milestones ADD COLUMN IF NOT EXISTS owner_user_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_goals_owner_user_id_fkey') THEN
    ALTER TABLE group_goals ADD CONSTRAINT group_goals_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_milestones_owner_user_id_fkey') THEN
    ALTER TABLE group_milestones ADD CONSTRAINT group_milestones_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE group_goals SET owner_user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
  WHERE owner_user_id IS NULL;
UPDATE group_milestones SET owner_user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
  WHERE owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_goals_owner_group ON group_goals (owner_user_id, group_name);
CREATE INDEX IF NOT EXISTS idx_milestones_owner_group ON group_milestones (owner_user_id, group_name);
