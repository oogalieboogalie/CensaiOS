-- Versioned workspace availability boundary for reviewed family tool modules.

CREATE TABLE IF NOT EXISTS workspace_tool_package_installs (
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  package_id           TEXT NOT NULL CHECK (package_id ~ '^censai/[a-z0-9-]+$'),
  module_id            TEXT NOT NULL,
  package_version      TEXT NOT NULL CHECK (package_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  manifest_hash        TEXT NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  installed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  installed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, package_id),
  UNIQUE (workspace_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_tool_package_installs_user
  ON workspace_tool_package_installs (installed_by_user_id)
  WHERE installed_by_user_id IS NOT NULL;

-- Preserve only already-scoped, reviewed capability behavior during upgrade.
-- Legacy global capability rows remain quarantined and are never imported.
INSERT INTO workspace_tool_package_installs
  (workspace_id,package_id,module_id,package_version,manifest_hash,installed_by_user_id,installed_at)
SELECT c.workspace_id,
  'censai/' || c.module_id,
  c.module_id,
  '1.0.0',
  CASE c.module_id
    WHEN 'web-research' THEN '7c2d8e947300d6bc6081eeab92379f03c48cc98d1dba75ad94b968a4863fc416'
    WHEN 'project-reader' THEN '6f9245392f3d8e671eeb5aa1769a582b04005b264e61b44b24274e4f4336aeae'
    WHEN 'github-reader' THEN '8dff0188a0feabec18ca04ddeeadf95437e408ae1461817822590bbda9b1c148'
    WHEN 'project-writer' THEN '6b80abe68a8f0fabe740a8ac273da8ac84cf7ef5ee14061f3153b1d3bbc8b1c0'
    WHEN 'workspace-reader' THEN '2fb363bf3f1aef42a0a3e892109c337b3170bc7f502ac9baec634b57850f6394'
    WHEN 'memory-reader' THEN '23a0054ad14fc5674d5fd9599b0e8b4e1e24dc441de15cc4187ede3f8fe461f9'
    WHEN 'canvas-observer' THEN '91028c6f7337ee980ea6203ce38c54e50fbbf5bff1f02738706eb4bd14446f47'
    WHEN 'canvas-collaborator' THEN '5258deb09a3a353674490df594d4829589f1a9ea190e2745d8fe9ffbf589346e'
    WHEN 'canvas-projector' THEN 'c98e28fdb5a02313c7924faf870bd9d3eef02fbc4a4985379f40714472e63470'
    WHEN 'canvas-design-reader' THEN '9e404e5dbff3b04ccc4248c8b83b69bed2dab3b5c43f8dd5bd4fa07a97275018'
    WHEN 'canvas-designer' THEN 'cd764ac0b441d933de71a666326d45e5c69af56cee571bd61a04e506da2b2cb6'
    WHEN 'pdf-reader' THEN 'ef44d265bdd6481124b730f0b48bb1db1e36833bf37a55f1e93100f4ca74b077'
    WHEN 'pdf-filler' THEN '267284c5cac3bbaf2e0908e78aecac92f549c663a041e3732a2581d44f55d2eb'
    WHEN 'cad-reader' THEN '3dc13c10549c9f69f07d4a2e607eb0563b6d69e0e9c8bc735a566756f0488e17'
    WHEN 'cad-maker' THEN '8a0ebe56b92ff4d29d93ab3809828bdc247f1aa7be297b4695c965f8db236928'
  END,
  MIN(c.equipped_by_user_id),
  MIN(c.created_at)
FROM workspace_agent_capabilities c
WHERE c.module_id IN (
    'web-research','project-reader','github-reader','project-writer','workspace-reader','memory-reader',
    'canvas-observer','canvas-collaborator','canvas-projector','canvas-design-reader','canvas-designer',
    'pdf-reader','pdf-filler','cad-reader','cad-maker'
)
GROUP BY c.workspace_id,c.module_id
ON CONFLICT (workspace_id,package_id) DO NOTHING;
