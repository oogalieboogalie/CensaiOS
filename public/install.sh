#!/bin/sh
#
# Censai installer (macOS / Linux / WSL)
#
#   curl -fsSL https://censai.app/install | sh
#
# What it does, in order:
#   1. Checks that Docker (with Compose v2) is installed and running.
#   2. Downloads the public CensaiOS source into ~/.censai/CensaiOS
#      (no git needed; an existing .env is preserved across re-runs).
#   3. Creates .env from .env.example and fills in random secrets.
#   4. Starts the stack with the prebuilt image from GHCR.
#   5. Waits for http://localhost:3002 to report ready.
#
# Re-run the same command to update. Data lives in Docker volumes and survives.
#
# Options / environment:
#   --build            build the image from source instead of pulling from GHCR
#   CENSAI_HOME=DIR    install root (default: $HOME/.censai)
#   CENSAI_REF=REF     branch or tag to download (default: main)
#   CENSAI_REPO=O/R    GitHub repo (default: oogalieboogalie/CensaiOS)

set -eu

CENSAI_REPO="${CENSAI_REPO:-oogalieboogalie/CensaiOS}"
CENSAI_REF="${CENSAI_REF:-main}"
CENSAI_HOME="${CENSAI_HOME:-$HOME/.censai}"
APP_DIR="$CENSAI_HOME/CensaiOS"
APP_URL="http://localhost:3002"
BUILD_FROM_SOURCE=0

for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FROM_SOURCE=1 ;;
    -h|--help)
      sed -n '2,22p' "$0" 2>/dev/null || true
      exit 0 ;;
    *) printf 'censai: unknown option %s\n' "$arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mcensai:\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

random_hex() {
  if have openssl; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Set KEY=value in .env, replacing an existing line or appending.
set_env() {
  key="$1"; val="$2"; file="$3"
  if grep -q "^${key}=" "$file"; then
    grep -v "^${key}=" "$file" > "$file.tmp"
    printf '%s=%s\n' "$key" "$val" >> "$file.tmp"
    mv "$file.tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}

# Fill a secret only if it is missing or empty.
ensure_secret() {
  key="$1"; file="$2"
  current="$(grep "^${key}=" "$file" 2>/dev/null | head -n 1 | cut -d= -f2- || true)"
  if [ -z "$current" ]; then
    set_env "$key" "$(random_hex)" "$file"
    ok "generated $key"
  fi
}

# ---------------------------------------------------------------- 1. checks
say "Checking prerequisites"
have curl || die "curl is required."
have tar  || die "tar is required."
have docker || die "Docker is required. Install Docker Desktop: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start Docker Desktop, then re-run this installer."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (the 'docker compose' command). Update Docker Desktop or install the compose plugin."
ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo ok)"

# -------------------------------------------------------------- 2. download
say "Downloading CensaiOS ($CENSAI_REF) into $APP_DIR"
mkdir -p "$CENSAI_HOME"
tmp="$(mktemp -d 2>/dev/null || mktemp -d -t censai)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "https://github.com/$CENSAI_REPO/archive/$CENSAI_REF.tar.gz" -o "$tmp/src.tgz" \
  || die "could not download https://github.com/$CENSAI_REPO/archive/$CENSAI_REF.tar.gz"
mkdir -p "$tmp/src"
tar -xzf "$tmp/src.tgz" -C "$tmp/src"
extracted="$(find "$tmp/src" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -n "$extracted" ] || die "archive did not contain a source directory"

# Swap the source tree in place, keeping the user's .env.
rm -rf "$APP_DIR.new" "$APP_DIR.old"
mv "$extracted" "$APP_DIR.new"
if [ -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env" "$APP_DIR.new/.env"
fi
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "$APP_DIR.old"
fi
mv "$APP_DIR.new" "$APP_DIR"
rm -rf "$APP_DIR.old"
ok "source ready"

# ------------------------------------------------------------------ 3. .env
cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  ok "created .env from .env.example"
fi
ensure_secret SESSION_SECRET .env
ensure_secret JOURNAL_SECRET .env
ensure_secret CENSAI_VAULT_SECRET .env

# Docker rejects uppercase image names; older checkouts of the override still
# spell the repo with capitals. Normalise before compose sees it.
if [ -f docker-compose.ghcr.yml ] && grep -q 'ghcr.io/oogalieboogalie/CensaiOS' docker-compose.ghcr.yml; then
  sed 's|ghcr.io/oogalieboogalie/CensaiOS|ghcr.io/oogalieboogalie/censaios|g' docker-compose.ghcr.yml > docker-compose.ghcr.yml.tmp
  mv docker-compose.ghcr.yml.tmp docker-compose.ghcr.yml
fi

# ----------------------------------------------------------------- 4. start
if [ "$BUILD_FROM_SOURCE" = "1" ]; then
  say "Building from source and starting (this takes a few minutes the first time)"
  docker compose up -d --build
else
  say "Pulling the latest public image and starting"
  docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
fi

# ------------------------------------------------------------------ 5. wait
say "Waiting for Censai to come up at $APP_URL"
i=0
until curl -fsS "$APP_URL/api/ready" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    printf '\n'
    die "timed out waiting for $APP_URL. Check logs with: (cd $APP_DIR && docker compose logs -f homebase)"
  fi
  printf '.'
  sleep 2
done
printf '\n'

if have xdg-open; then xdg-open "$APP_URL" >/dev/null 2>&1 || true
elif have open; then open "$APP_URL" >/dev/null 2>&1 || true
fi

cat <<EOF

  Censai is running:  $APP_URL

  Installed in:       $APP_DIR
  Stop:               cd "$APP_DIR" && docker compose down
  Logs:               cd "$APP_DIR" && docker compose logs -f
  Update:             re-run this installer

  Local models: install Ollama (https://ollama.com), then
    ollama pull qwen3-coder:latest
    ollama pull nomic-embed-text
  Or add a provider key in Settings inside the app.

EOF
