-- A lead saved from LeadHound keeps its drafts: the 7-day intro sequence
-- (one {day, channel, subject, body} per day) and the ice breaker
-- ({title, format, opening_line, deliverable, cta}). Applied at start-up by
-- server/salesLeads/schema.js, so existing databases pick it up too.

ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS outreach_sequence JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sales_leads ADD COLUMN IF NOT EXISTS ice_breaker JSONB;
