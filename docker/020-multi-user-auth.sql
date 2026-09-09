-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_tokens table
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) DEFAULT 'google',
  access_token TEXT,
  refresh_token TEXT,
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  expiry_date BIGINT,
  scope TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT;
ALTER TABLE user_tokens ALTER COLUMN access_token DROP NOT NULL;

-- Create user_client_state table
CREATE TABLE IF NOT EXISTS user_client_state (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key)
);

-- Create session table for connect-pg-simple equivalent
CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);
