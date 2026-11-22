-- A project is where its files live, not what it is called
-- (server/workspaces/projectIdentity.js). Two projects from different places
-- may share a name: acme/shop and beta/shop, or a repo and a folder both
-- called shop. Each has its own row and its own id.
--
-- Safe on an install with data, and safe to run at every start: it deletes no
-- row, changes no id and rewrites no repo or folder. On a database with no
-- projects table yet it does nothing.

-- 1. The first projects table let one agent hold only one project per name
--    (UNIQUE(owner_agent_id, name), docker/005-workspaces.sql). With that rule
--    a second "shop" from somewhere else cannot be saved at all. It goes,
--    whatever name the database gave it.
DO $$
DECLARE
  rule RECORD;
BEGIN
  IF to_regclass('projects') IS NULL THEN RETURN; END IF;
  FOR rule IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'projects'::regclass
       AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
           = ARRAY['name', 'owner_agent_id']
  LOOP
    EXECUTE format('ALTER TABLE projects DROP CONSTRAINT %I', rule.conname);
  END LOOP;
END $$;

-- 2. One row per GitHub repo, so the database itself refuses a second row for
--    a repo that is already here (GitHub reads Acme/Shop and acme/shop as one
--    repo). An install that already has two rows for one repo keeps both,
--    since boards and tasks may point at either; there the index is left out
--    and server/workspaces/projects.js alone keeps new rows apart.
--    Folders get no such index: capitals matter in a folder on Linux and not
--    on Windows, and the family's read-only past keeps its own row for a
--    folder (server/workspaces/familyPast.js).
DO $$
BEGIN
  IF to_regclass('projects') IS NULL THEN RETURN; END IF;
  -- Finding a project by its name stays quick as the list grows.
  CREATE INDEX IF NOT EXISTS idx_projects_name_lower ON projects (lower(name));
  IF NOT EXISTS (
    SELECT 1 FROM projects
     WHERE COALESCE(repo, '') <> ''
     GROUP BY lower(repo)
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_one_row_per_repo
      ON projects (lower(repo))
      WHERE repo IS NOT NULL AND repo <> '';
  END IF;
END $$;

