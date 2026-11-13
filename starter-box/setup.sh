#!/usr/bin/env bash
# censaiOS Starter Box: turns a fresh Ubuntu or Debian computer (or one built
# on them: Linux Mint, MX Linux) into an AI-ready vibecoding box. Safe to run again: every step checks first and
# skips what is already there.
#
#   sudo bash starter-box/setup.sh            # everything
#   sudo bash starter-box/setup.sh --list     # the steps, one per line
#   sudo bash starter-box/setup.sh --skip ollama,remote
#   sudo bash starter-box/setup.sh --only welcome,doctor
#
# Settings (all optional, set them in front of the command):
#   STARTER_BOX_USER       who the box is for (default: whoever ran sudo)
#   STARTER_BOX_HOSTNAME   rename the box, e.g. censai-box (default: keep name)
#   STARTER_BOX_MODEL      an Ollama model to download now, e.g. llama3.2:3b
#   CENSAIOS_REPO_URL      where censaiOS comes from (default: public repo)
#   CENSAIOS_BRANCH        default main
#   CENSAIOS_DIR           default /opt/censaios
#   CENSAIOS_BUILD=1       build censaiOS here instead of downloading the
#                          ready-made one (slow: 10 to 30 minutes, 8 GB)
#   NODE_MAJOR             Node.js line to install, default 22
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STEPS=(base node docker ai_tools ollama censaios browser ssh remote firewall keys welcome doctor)

CENSAIOS_REPO_URL="${CENSAIOS_REPO_URL:-https://github.com/oogalieboogalie/CensaiOS.git}"
CENSAIOS_BRANCH="${CENSAIOS_BRANCH:-main}"
CENSAIOS_DIR="${CENSAIOS_DIR:-/opt/censaios}"
NODE_MAJOR="${NODE_MAJOR:-22}"
export DEBIAN_FRONTEND=noninteractive

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
warn() { printf '    \033[33mHeads up:\033[0m %s\n' "$*" >&2; }
die()  { trap - ERR; printf '\n\033[31mStopped:\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
trap '[ "$BASH_SUBSHELL" -gt 0 ] || die "a step failed on line $LINENO. Run the same command again; it picks up where it stopped."' ERR

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

# ---------- options ----------
ONLY="" SKIP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    --only=*) ONLY="${1#*=}"; shift ;;
    --skip) SKIP="${2:-}"; shift 2 ;;
    --skip=*) SKIP="${1#*=}"; shift ;;
    --list) printf '%s\n' "${STEPS[@]}"; exit 0 ;;
    -h|--help) usage ;;
    *) die "unknown option $1 (try --help)" ;;
  esac
done
for s in ${ONLY//,/ } ${SKIP//,/ }; do
  [[ " ${STEPS[*]} " == *" $s "* ]] || die "no step called '$s' (try --list)"
done
wanted() {
  if [ -n "$ONLY" ]; then [[ ",$ONLY," == *",$1,"* ]]; return; fi
  [[ ",$SKIP," != *",$1,"* ]]
}

# ---------- who, what, where ----------
[ "$(id -u)" -eq 0 ] || die "run it with sudo: sudo bash $0"
[ -r /etc/os-release ] || die "this only works on Ubuntu or Debian"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}:${ID_LIKE:-}" in
  ubuntu:*|*:*ubuntu*) DISTRO=ubuntu; CODENAME="${UBUNTU_CODENAME:-$VERSION_CODENAME}" ;;
  debian:*|*:*debian*) DISTRO=debian; CODENAME="${DEBIAN_CODENAME:-${VERSION_CODENAME:-}}" ;;
  *) die "this only works on Ubuntu or Debian (found ${PRETTY_NAME:-unknown})" ;;
esac
# MX Linux and other Debian-based systems may carry their own release name;
# Docker's download only knows Debian's, so read it from the Debian version.
if [ "$DISTRO" = debian ]; then
  case "$CODENAME" in
    bullseye|bookworm|trixie) ;;
    *) case "$(cut -d. -f1 /etc/debian_version 2>/dev/null)" in
         11) CODENAME=bullseye ;; 12) CODENAME=bookworm ;; 13) CODENAME=trixie ;;
         *) die "could not tell which Debian this is built on (found ${PRETTY_NAME:-unknown})" ;;
       esac ;;
  esac
fi
ARCH="$(dpkg --print-architecture)"
case "$ARCH" in amd64|arm64) ;; *) die "this computer's chip ($ARCH) is not supported" ;; esac

BOX_USER="${STARTER_BOX_USER:-${SUDO_USER:-}}"
[ -n "$BOX_USER" ] && [ "$BOX_USER" != root ] ||
  die "run it with sudo from your own account, or set STARTER_BOX_USER=yourname"
id "$BOX_USER" >/dev/null 2>&1 || die "there is no account called $BOX_USER"
BOX_HOME="$(getent passwd "$BOX_USER" | cut -d: -f6)"
# systemd on most systems; MX Linux starts with the older sysvinit by default.
INIT=none
if [ -d /run/systemd/system ]; then INIT=systemd
elif [ "$(cat /proc/1/comm 2>/dev/null)" = init ] && [ -d /etc/init.d ] && have service; then INIT=sysv
fi

as_user() { runuser -u "$BOX_USER" -- env HOME="$BOX_HOME" "$@"; }
enable_now() {
  local s
  case "$INIT" in
    systemd) systemctl enable --now "$@" >/dev/null 2>&1 || warn "could not start $*" ;;
    sysv)
      for s in "$@"; do
        if [ -x "/etc/init.d/$s" ]; then
          update-rc.d "$s" defaults >/dev/null 2>&1 || true
          service "$s" status >/dev/null 2>&1 || service "$s" start >/dev/null 2>&1 || warn "could not start $s"
        else
          warn "$s has no start-up script on this computer; it will not start by itself"
        fi
      done ;;
    *) note "no service manager here, so $* will start on the next real boot" ;;
  esac
}
apt_install() {
  local missing=()
  for p in "$@"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  [ ${#missing[@]} -eq 0 ] && return 0
  note "installing ${missing[*]}"
  apt-get install -y -q --no-install-recommends "${missing[@]}" >/dev/null
}
# Ollama answers anyone who can reach it (no password), so it listens beyond
# this box only while the firewall is on and limits it to Docker.
OLLAMA_DROPIN="${OLLAMA_DROPIN:-/etc/systemd/system/ollama.service.d/starter-box.conf}"
firewall_active() { have ufw && ufw status 2>/dev/null | grep -q '^Status: active'; }
ollama_open_to_docker() {
  mkdir -p "$(dirname "$OLLAMA_DROPIN")"
  printf '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"\n' > "$OLLAMA_DROPIN"
  systemctl daemon-reload
  systemctl restart ollama 2>/dev/null || true
  note "Ollama reachable from censaiOS (the firewall keeps everyone else out)"
}
ollama_keep_private() {
  [ -f "$OLLAMA_DROPIN" ] || return 0
  rm -f "$OLLAMA_DROPIN"
  systemctl daemon-reload
  systemctl restart ollama 2>/dev/null || true
  note "the firewall is off, so Ollama stays on this box only"
}
installed_desktop() {
  [ -n "$(ls -A /usr/share/xsessions /usr/share/wayland-sessions 2>/dev/null)" ]
}

# ---------- steps ----------
step_base() {
  say "Basics: git, curl, box name on the network"
  apt-get update -q >/dev/null
  apt_install ca-certificates curl gnupg git jq openssl xz-utils unzip htop nano \
    avahi-daemon libnss-mdns build-essential python3 python3-venv
  if [ -n "${STARTER_BOX_HOSTNAME:-}" ] && [ "$(hostname)" != "$STARTER_BOX_HOSTNAME" ]; then
    if [ "$INIT" = systemd ]; then hostnamectl set-hostname "$STARTER_BOX_HOSTNAME"
    else echo "$STARTER_BOX_HOSTNAME" > /etc/hostname; fi
    sed -i "/^127\.0\.1\.1 /d" /etc/hosts
    echo "127.0.1.1 $STARTER_BOX_HOSTNAME" >> /etc/hosts
    note "box renamed to $STARTER_BOX_HOSTNAME"
  fi
  enable_now avahi-daemon
}

step_node() {
  say "Node.js $NODE_MAJOR (the coding helpers run on it)"
  if have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]; then
    note "already have Node.js $(node -v)"; return
  fi
  local narch=x64; [ "$ARCH" = arm64 ] && narch=arm64
  local ver tmp
  ver="$(curl -fsSL https://nodejs.org/dist/index.json |
    jq -r --arg m "v$NODE_MAJOR." 'map(select(.version|startswith($m)))[0].version')"
  [ -n "$ver" ] && [ "$ver" != null ] || die "could not find Node.js $NODE_MAJOR to download"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/node.tar.xz" "https://nodejs.org/dist/$ver/node-$ver-linux-$narch.tar.xz"
  curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$ver/SHASUMS256.txt"
  local want got
  want="$(awk -v f="node-$ver-linux-$narch.tar.xz" '$2 == f {print $1}' "$tmp/SHASUMS256.txt")"
  got="$(sha256sum "$tmp/node.tar.xz" | cut -d' ' -f1)"
  [ -n "$want" ] && [ "$want" = "$got" ] || die "the Node.js download did not match its checksum"
  tar -xJf "$tmp/node.tar.xz" -C /usr/local --strip-components=1 \
    --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md
  rm -rf "$tmp"
  note "installed Node.js $ver"
}

step_docker() {
  say "Docker (censaiOS and most tools run inside it)"
  if have docker && docker compose version >/dev/null 2>&1; then
    note "already have $(docker --version)"
  else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$DISTRO/gpg" |
      gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$DISTRO $CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -q >/dev/null
    apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  enable_now docker
  if ! id -nG "$BOX_USER" | tr ' ' '\n' | grep -qx docker; then
    getent group docker >/dev/null || groupadd docker
    usermod -aG docker "$BOX_USER"
    note "$BOX_USER can use Docker after the next sign-in"
  fi
}

step_ai_tools() {
  say "AI coding helpers: Claude Code and Codex"
  have npm || die "Node.js is missing; run the node step first"
  local pkg bin
  for pair in "@anthropic-ai/claude-code:claude" "@openai/codex:codex"; do
    pkg="${pair%%:*}" bin="${pair##*:}"
    if have "$bin" && [ -z "${STARTER_BOX_UPGRADE:-}" ]; then note "already have $bin"; continue; fi
    npm install -g --no-fund --no-audit --loglevel=error "$pkg@latest" >/dev/null
    note "installed $bin"
  done
}

step_ollama() {
  say "Ollama (free AI models that run on this box, no account)"
  if have ollama && [ -z "${STARTER_BOX_UPGRADE:-}" ]; then
    note "already have Ollama"
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  # censaiOS runs in Docker and reaches Ollama through the host. Ollama has no
  # password, so it stays on this box only until the firewall is really on;
  # the firewall step opens it to Docker after that.
  if [ "$INIT" = sysv ] && ! curl -fs -o /dev/null --max-time 3 http://127.0.0.1:11434/api/version; then
    note "Ollama does not start by itself on this system; start it with: ollama serve &"
  fi
  if [ "$INIT" = systemd ] && ! firewall_active; then ollama_keep_private; fi
  if [ -n "${STARTER_BOX_MODEL:-}" ]; then
    note "downloading $STARTER_BOX_MODEL (this can take a while)"
    ollama pull "$STARTER_BOX_MODEL" || warn "could not download $STARTER_BOX_MODEL; try later with: ollama pull $STARTER_BOX_MODEL"
  fi
}

step_censaios() {
  say "censaiOS (your canvas, starts on every boot)"
  have docker || die "Docker is missing; run the docker step first"
  git config --global --add safe.directory "$CENSAIOS_DIR" 2>/dev/null || true
  if [ -d "$CENSAIOS_DIR/.git" ]; then
    if [ -z "$(git -C "$CENSAIOS_DIR" status --porcelain --untracked-files=no)" ]; then
      as_user git -C "$CENSAIOS_DIR" pull --ff-only -q || warn "could not update censaiOS; keeping the copy you have"
    else
      warn "censaiOS has local edits, so it was not updated"
    fi
  elif [ -e "$CENSAIOS_DIR" ]; then
    die "$CENSAIOS_DIR is in the way and is not censaiOS; move it and run again"
  else
    mkdir -p "$CENSAIOS_DIR"
    chown "$BOX_USER:" "$CENSAIOS_DIR"
    as_user git clone -q --branch "$CENSAIOS_BRANCH" "$CENSAIOS_REPO_URL" "$CENSAIOS_DIR"
  fi
  mkdir -p "$BOX_HOME/Projects"
  chown "$BOX_USER:" "$BOX_HOME/Projects"
  # MemTotal reads a little under the sticker size: an 8 GB laptop shows ~7.6.
  local mem_gb; mem_gb=$(( ($(awk '/MemTotal/ {print $2}' /proc/meminfo) + 524288) / 1048576 ))
  if [ ! -f "$CENSAIOS_DIR/.env" ]; then
    {
      printf '# Made by the starter box. "New project" in censaiOS makes folders here.\nCENSAI_PROJECTS_FOLDER_ON_PC=%s/Projects\n' "$BOX_HOME"
      if [ "$mem_gb" -lt 7 ]; then
        printf '# This box has about %s GB of memory, so censaiOS gets smaller caps.\n' "$mem_gb"
        printf 'CENSAI_APP_MEMORY=2g\nCENSAI_DB_MEMORY=512m\nCENSAI_VECTOR_MEMORY=512m\nCENSAI_RUNNER_MEMORY=256m\n'
      fi
    } > "$CENSAIOS_DIR/.env"
    chown "$BOX_USER:" "$CENSAIOS_DIR/.env"; chmod 600 "$CENSAIOS_DIR/.env"
  fi
  [ "$mem_gb" -ge 7 ] || warn "this box has about ${mem_gb} GB of memory; censaiOS runs, but 8 GB feels quicker"
  # Download the ready-made censaiOS instead of building it on the box: a
  # build takes 10 to 30 minutes and can run out of memory on 4 GB.
  # docker-compose.override.yml is read by every plain `docker compose` here.
  local override="$CENSAIOS_DIR/docker-compose.override.yml" tag=latest
  [ "$CENSAIOS_BRANCH" = nightly ] && tag=nightly
  if [ -z "${CENSAIOS_BUILD:-}" ]; then
    printf '%s\n' '# Made by the starter box: use the ready-made censaiOS, never build it here.' \
      '# Delete this file to build from this folder instead.' 'services:' \
      '  homebase:' "    image: ghcr.io/oogalieboogalie/censaios:$tag" '    pull_policy: missing' \
      '  runner:' "    image: ghcr.io/oogalieboogalie/censaios:$tag" '    pull_policy: missing' > "$override"
    chown "$BOX_USER:" "$override"
  else
    rm -f "$override"
  fi
  if ! docker info >/dev/null 2>&1; then
    warn "Docker is not running here, so censaiOS will start on the next real boot"; return
  fi
  if [ -f "$override" ]; then
    note "downloading and starting censaiOS (about 2 GB the first time)"
    (cd "$CENSAIOS_DIR" && docker compose up -d --quiet-pull)
  else
    note "building and starting censaiOS (the first time takes 10 to 30 minutes)"
    (cd "$CENSAIOS_DIR" && docker compose up -d --build --quiet-pull)
  fi
  note "waiting for censaiOS to answer"
  for _ in $(seq 1 90); do
    if curl -fs -o /dev/null http://127.0.0.1:3002/; then note "censaiOS is up at http://localhost:3002"; return; fi
    sleep 4
  done
  warn "censaiOS is still starting; 'starter-box doctor' will say when it is ready"
}

step_browser() {
  say "Browser"
  if ! installed_desktop; then note "no desktop on this box, so no browser needed (open censaiOS from another computer)"; return; fi
  if have firefox || have chromium || have chromium-browser || have google-chrome; then note "already have a browser"; return; fi
  if [ "$DISTRO" = ubuntu ] && have snap; then snap install firefox
  else apt_install firefox-esr; fi
}

step_ssh() {
  say "SSH (reach this box from your other computers)"
  apt_install openssh-server
  mkdir -p /etc/ssh/sshd_config.d
  printf '# censaiOS Starter Box\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/50-starter-box.conf
  enable_now ssh
  service ssh reload >/dev/null 2>&1 || true
}

step_remote() {
  say "Tailscale (reach this box from anywhere, off until you sign in)"
  if have tailscale; then note "already have Tailscale"
  else curl -fsSL https://tailscale.com/install.sh | sh; fi
  enable_now tailscaled
  note "turn it on any time with: starter-box remote"
}

step_firewall() {
  say "Firewall (nothing gets in except SSH and censaiOS 'Open anywhere')"
  apt_install ufw
  if [ "$INIT" = none ]; then
    note "no service manager here; after a real boot run: sudo bash $0 --only firewall"; return
  fi
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow OpenSSH >/dev/null
  ufw allow 5353/udp comment 'box name on the network' >/dev/null
  ufw allow 3004/tcp comment 'censaiOS Open anywhere' >/dev/null
  ufw allow in on tailscale0 comment 'your own devices on Tailscale' >/dev/null
  ufw allow from 172.16.0.0/12 to any port 11434 proto tcp comment 'censaiOS to Ollama' >/dev/null
  ufw --force enable >/dev/null || die "could not turn the firewall on; Ollama stays on this box only. Run: sudo bash $0 --only firewall"
  note "firewall on"
  # Only now, with the firewall on and limiting it to Docker, may Ollama
  # listen beyond this box (censaiOS in Docker reaches it that way).
  if [ "$INIT" = systemd ] && have ollama && firewall_active; then ollama_open_to_docker; fi
}

step_keys() {
  say "Your AI keys (stay on this box, never sent to us)"
  local dir="$BOX_HOME/.config/starter-box" file
  file="$dir/keys.env"
  install -d -m 700 -o "$BOX_USER" -g "$(id -gn "$BOX_USER")" "$dir"
  if [ ! -f "$file" ]; then
    install -m 600 -o "$BOX_USER" -g "$(id -gn "$BOX_USER")" "$HERE/keys.env.example" "$file"
    note "made $file (open it with: starter-box keys)"
  else
    note "keeping your keys file as it is"
  fi
  local rc="$BOX_HOME/.bashrc" line='[ -f ~/.config/starter-box/keys.env ] && { set -a; . ~/.config/starter-box/keys.env; set +a; }'
  touch "$rc"; chown "$BOX_USER:" "$rc"
  grep -qF "$line" "$rc" || printf '\n# censaiOS Starter Box: your AI keys\n%s\n' "$line" >> "$rc"
}

step_welcome() {
  say "Welcome screen and the starter-box command"
  install -m 755 "$HERE/starter-box" /usr/local/bin/starter-box
  # shellcheck disable=SC2016 # written as-is, expanded at sign-in
  printf '%s\n' \
    '# censaiOS Starter Box welcome (turn off: touch ~/.config/starter-box/quiet)' \
    'case $- in *i*) [ -f "$HOME/.config/starter-box/quiet" ] || starter-box welcome 2>/dev/null ;; esac' \
    > /etc/profile.d/starter-box.sh
  # The box's own screen, before anyone signs in (\n is the box name).
  mkdir -p /etc/issue.d
  printf '%s\n' '' '  censaiOS Starter Box' \
    '  Sign in, then open http://localhost:3002' \
    '  From another computer: ssh yourname@\n.local' '' > /etc/issue.d/starter-box.issue
  # On a desktop, open censaiOS in the browser the first time you sign in.
  mkdir -p /etc/xdg/autostart
  printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=censaiOS welcome' \
    'Exec=starter-box first-login' 'X-GNOME-Autostart-enabled=true' 'NoDisplay=true' \
    > /etc/xdg/autostart/starter-box-welcome.desktop
  note "welcome set up; type 'starter-box' any time to see it again"
}

step_doctor() {
  say "Final check"
  as_user /usr/local/bin/starter-box doctor || true
}

# ---------- run ----------
printf '\033[1mcensaiOS Starter Box setup\033[0m for %s on %s (%s)\n' "$BOX_USER" "${PRETTY_NAME:-Linux}" "$ARCH"
for s in "${STEPS[@]}"; do
  if wanted "$s"; then "step_$s"; fi
done
if wanted welcome || [ -x /usr/local/bin/starter-box ]; then
  say "All done"
  as_user /usr/local/bin/starter-box welcome || true
  note "Sign out and back in once so Docker and your keys are picked up."
fi
