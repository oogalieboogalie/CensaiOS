-- Scheduler tags (diagram 02): a short label like "Maintenance" or
-- "Development" shown on each scheduled run's card. Also added at boot by
-- server/scheduler/schema.js so existing databases pick it up.
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS tag TEXT;
