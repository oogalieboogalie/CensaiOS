-- One English ↔ French translation on a board comment, so both people
-- see the original and the translation. Applied at startup by
-- ensureShareLinkSchema (server/shareLinks/schema.js) so an existing
-- database picks the column up too.

BEGIN;

ALTER TABLE canvas_comments
  ADD COLUMN IF NOT EXISTS translation JSONB;

COMMIT;
