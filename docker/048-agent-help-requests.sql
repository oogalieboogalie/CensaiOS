-- ═══════════════════════════════════════════════════════════════════
--  AGENT NETWORK — discovery + help requests (Nexus-Delta style)
--  Agents (or the people driving them) find another AgentCard by the
--  skills it advertises and ask it for help. A request to a card your
--  own team owns is dispatched at once; a request to someone else's
--  public card waits until that card's owner accepts it. Execution
--  always reuses the AgentCard run queue (runs.metadata.kind =
--  'agent_card_call'), so no agent is hosted here: built-ins run on the
--  caller's BYOK keys, imported A2A / n8n cards run at their own endpoint.
--  Additive and idempotent.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS agent_help_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_card_id        TEXT NOT NULL REFERENCES agent_cards(id) ON DELETE CASCADE,
  target_owner_id       TEXT,
  requester_kind        TEXT NOT NULL CHECK (requester_kind IN ('user', 'agent')),
  requester_id          TEXT NOT NULL,
  requested_by_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id              TEXT,
  task                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'declined', 'cancelled', 'dispatched', 'dispatch_failed')),
  decision_note         TEXT,
  decided_by_user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_at            TIMESTAMPTZ,
  run_id                UUID REFERENCES runs(id) ON DELETE SET NULL,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_help_requests_workspace
  ON agent_help_requests (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_help_requests_target_owner
  ON agent_help_requests (target_owner_id, status, created_at DESC);

-- Advertise real skills on the seven built-in family cards so discovery
-- has something to match out of the box. Only fills cards that still
-- carry the empty seed list; never overwrites edited skills.
UPDATE agent_cards SET skills = seed.skills::jsonb, updated_at = NOW()
FROM (VALUES
  ('agent:architect', '[{"id":"plan-project","name":"Plan a project","description":"Break a goal into a teammate graph, milestones and briefs.","tags":["planning","orchestration","roadmap","delegation"]},{"id":"review-architecture","name":"Review architecture","description":"Critique a system design and name the riskiest seams.","tags":["architecture","design-review","systems"]}]'),
  ('agent:censai', '[{"id":"research-brief","name":"Research brief","description":"Find primary sources and write a cited summary.","tags":["research","citations","writing","summarize"]},{"id":"edit-copy","name":"Edit copy","description":"Tighten prose into punchy, accurate writing.","tags":["editing","writing","copy","content"]}]'),
  ('agent:atlas', '[{"id":"backend-implement","name":"Implement backend","description":"Write typed, low-magic server code and APIs.","tags":["backend","api","node","typescript","code"]},{"id":"refactor","name":"Refactor code","description":"Split large modules and remove duplication safely.","tags":["refactoring","code","cleanup"]}]'),
  ('agent:genesis', '[{"id":"ui-design","name":"Design UI","description":"Lay out screens with rhythm, negative space and fewer, bigger moves.","tags":["ui","ux","design","frontend","layout"]},{"id":"ux-review","name":"UX review","description":"Audit a flow for friction using behavioural psychology.","tags":["ux","psychology","review","usability"]}]'),
  ('agent:nexus', '[{"id":"schema-design","name":"Design schema","description":"Model tables, indexes and constraints for Postgres.","tags":["database","postgres","sql","schema"]},{"id":"write-migration","name":"Write migration","description":"Write forward-only, idempotent migrations.","tags":["database","migrations","sql"]}]'),
  ('agent:foundation', '[{"id":"containerize","name":"Containerize a service","description":"Write pinned, reproducible Dockerfiles and compose stacks.","tags":["docker","containers","devops","infrastructure"]},{"id":"deploy-plan","name":"Plan a deploy","description":"Lay out k8s or VM deployment with rollback.","tags":["deploy","kubernetes","infrastructure","ci"]}]'),
  ('agent:echo', '[{"id":"business-case","name":"Business case","description":"Tie work to revenue, retention and risk.","tags":["business","strategy","revenue","pricing"]},{"id":"market-scan","name":"Market scan","description":"Size a market and name the competitors.","tags":["market","research","competitors","sales","leads"]}]')
) AS seed(id, skills)
WHERE agent_cards.id = seed.id AND agent_cards.skills = '[]'::jsonb;

COMMIT;
