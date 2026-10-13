#!/bin/sh
# Start-up for the censaiOS container.
#
# With CENSAI_SELF_SETUP=1 (set by docker-compose.yml) a plain
# `docker compose up` needs no .env file:
#   1. Any of the three secrets the server requires that is not set gets made
#      once and kept in the state volume, so sign-ins and saved keys survive
#      restarts and updates. Secrets you set yourself in .env always win.
#   2. A brand-new database gets every table before the server starts
#      (server/boot/freshDatabase.js). Existing databases are left alone.
set -e

if [ "${CENSAI_SELF_SETUP:-}" = "1" ]; then
  state_dir="${CENSAI_STATE_DIR:-/app/.homebase-state}"
  secrets_file="$state_dir/generated-secrets.env"
  mkdir -p "$state_dir"
  touch "$secrets_file"
  chmod 600 "$secrets_file"
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

exec "$@"
