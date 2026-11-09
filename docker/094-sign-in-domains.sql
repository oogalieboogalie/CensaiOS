-- Who can sign up: email domains an admin lets in from Settings, Sharing.
-- Anyone whose email ends in @<domain> may make an account and stay signed
-- in, on top of the people named in ALLOWED_USERS / CENSAI_ADMIN_EMAILS.
-- Applied at start-up by server/signInDomains/store.js. Safe to run twice.

CREATE TABLE IF NOT EXISTS sign_in_domains (
  domain     TEXT PRIMARY KEY CHECK (domain = lower(domain) AND length(domain) BETWEEN 3 AND 253),
  added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
