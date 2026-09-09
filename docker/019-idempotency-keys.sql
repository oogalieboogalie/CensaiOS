-- Add idempotency key to prevent duplicate messages
ALTER TABLE agent_messages ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_msg_idempotency ON agent_messages(idempotency_key) WHERE idempotency_key IS NOT NULL;