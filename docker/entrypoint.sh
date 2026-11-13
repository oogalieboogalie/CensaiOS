#!/bin/sh
# Start-up for the censaiOS container.
#
# With CENSAI_SELF_SETUP=1 (set by docker-compose.yml) a plain
# `docker compose up` needs no .env file:
#   1. Any of the three secrets the server requires that is not set gets made
#      once and kept in the state volume, so sign-ins and saved keys survive
#      restarts and updates. Secrets you set yourself in .env always win.
#      A missing journal or vault key is not replaced when the database
#      already holds rows those keys encrypted. Startup stops and asks for
#      the original key back (server/boot/lostKeys.js).
#   2. A brand-new database gets every table before the server starts
#      (server/boot/freshDatabase.js). Existing databases are left alone.
set -e

if [ "${CENSAI_SELF_SETUP:-}" = "1" ]; then
  state_dir="${CENSAI_STATE_DIR:-/app/.homebase-state}"
  secrets_file="$state_dir/generated-secrets.env"
  mkdir -p "$state_dir"
  touch "$secrets_file"
  chmod 600 "$secrets_file"
  # Ask before writing. The generate loop below is what used to mint a new
  # key over a database that was restored without its state volume.
  missing_secret() {
    name="$1"
    eval "current=\${$name:-}"
    if [ -n "$current" ]; then return 1; fi
    saved=$(sed -n "s/^$name=//p" "$secrets_file" | head -n 1)
    [ -z "$saved" ]
  }
  needs_journal=0
  needs_vault=0
  if missing_secret JOURNAL_SECRET; then needs_journal=1; fi
  if missing_secret CENSAI_VAULT_SECRET; then needs_vault=1; fi
  if [ "$needs_journal" = 1 ] && [ "$needs_vault" = 1 ]; then
    node server/boot/lostKeys.js --journal --vault
  elif [ "$needs_journal" = 1 ]; then
    node server/boot/lostKeys.js --journal
  elif [ "$needs_vault" = 1 ]; then
    node server/boot/lostKeys.js --vault
  fi
  for name in SESSION_SECRET JOURNAL_SECRET CENSAI_VAULT_SECRET; do
    eval "current=\${$name:-}"
    if [ -n "$current" ]; then continue; fi
    saved=$(sed -n "s/^$name=//p" "$secrets_file" | head -n 1)
    if [ -z "$saved" ]; then
      saved=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
      echo "$name=$saved" >> "$secrets_file"
      echo "[censaiOS] Made $name (kept in the state volume)"
    fi
    export "$name=$saved"
  done
  node server/boot/freshDatabase.js
fi

# Revokes live in the state volume. That folder is gitignored and mounted
# inside /app, so name it here instead of the container's home directory.
if [ -z "${CENSAI_STATE_DIR:-}" ]; then
  export CENSAI_STATE_DIR=/app/.homebase-state
fi

exec "$@"
