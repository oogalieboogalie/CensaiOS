-- Hosted agents: an agent that lives on a vendor's platform (Claude Managed
-- Agents, OpenAI, Google Agent Engine, ElevenLabs, a LangChain deployment)
-- joins the board as a normal agent. Messages to it go to the vendor with
-- the messaging person's own saved key (never stored here). Only the
-- computer's owner can import one (server/routes/hostedAgents.js).

CREATE TABLE IF NOT EXISTS hosted_agents (
  agent_id            TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  vendor              TEXT NOT NULL CHECK (vendor IN ('anthropic', 'openai', 'google', 'elevenlabs', 'langchain')),
  remote_ref          TEXT NOT NULL CHECK (length(remote_ref) BETWEEN 1 AND 400),
  endpoint            TEXT CHECK (endpoint IS NULL OR length(endpoint) <= 400),
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The vendor's own conversation (session, thread, conversation id) for each
-- person and chat, so the hosted agent keeps its memory between messages.
CREATE TABLE IF NOT EXISTS hosted_agent_threads (
  agent_id         TEXT NOT NULL REFERENCES hosted_agents(agent_id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_key TEXT NOT NULL CHECK (length(conversation_key) BETWEEN 1 AND 200),
  remote_thread    TEXT NOT NULL CHECK (length(remote_thread) BETWEEN 1 AND 400),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, user_id, conversation_key)
);
