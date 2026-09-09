-- ═══════════════════════════════════════════════════════════════════
--  TENANT ID PROPAGATION — workspaces.tenant_id column + index
--  Nullable so existing rows are unaffected. Idempotent.
--
--  Filename: brief specified 024-tenant-id.sql. docker/024-agent-wakeups.sql
--  and docker/025-agent-cards.sql were already in use. Picked 026 first, then
--  discovered a sibling session had taken 026-execution-ledger.sql, so this
--  file landed at 027 (next unused slot after 026). The brief divergence log
--  calls this out explicitly.
--  See brief: .team/handoffs/2026-06-24-p1-tenant-id-propagation.md
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces (tenant_id);

COMMIT;