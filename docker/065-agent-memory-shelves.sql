-- Memory shelves (diagram 20): which shelf a remembered fact sits on
-- (personal, project, team, accomplishments, tooling). Empty on older rows;
-- the app guesses those from the fact's words (src/lib/agentMemory/shelves.js).
ALTER TABLE agent_facts ADD COLUMN IF NOT EXISTS shelf TEXT;
