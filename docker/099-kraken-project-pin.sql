-- The exact project a Kraken Request works in, pinned when the person looks at
-- who gets what and checked again before anything goes out
-- (server/censaiOrchestrator/projectPin.js): the project's id, where its code
-- is (the full owner/repo, or the folder on this computer), the branch, and
-- the commit where known. Kept on the request and on each plan made for one of
-- its arms, so a project switched or renamed after the look cannot move the work.
--
-- Rows from before this have no pin: they load and show as they did.
-- Each table is changed only if it is there, so this runs after either
-- docker/073-censai-plans.sql or docker/096-kraken-requests.sql.

ALTER TABLE IF EXISTS kraken_requests ADD COLUMN IF NOT EXISTS pin JSONB;
ALTER TABLE IF EXISTS censai_plans ADD COLUMN IF NOT EXISTS pin JSONB;
