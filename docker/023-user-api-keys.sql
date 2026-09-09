-- Create user_api_keys table for BYOK (Bring Your Own Key)
CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  base_url VARCHAR(255),
  model_name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user
  ON user_api_keys (user_id);
