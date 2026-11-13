#!/usr/bin/env bash
# Lets censaiOS on a home server see the devices on your Tailscale, so
# "My Tailscale devices" (Settings, Open anywhere) can list them and let the
# ones you switch on open the board with no code.
#
#   bash scripts/home-server-tailnet.sh        turn it on (safe to run again)
#   bash scripts/home-server-tailnet.sh off    turn it off and remove the list
#   bash scripts/home-server-tailnet.sh once   write the list one time
#
# Why it is needed: on a home server censaiOS runs inside Docker, and from in
# there it cannot ask Tailscale anything. This asks Tailscale on the box
# itself and writes the answer to
#   <censaiOS folder>/.homebase-state/tailnet-status.json
# once a minute. censaiOS reads that file. If the file stops updating for
# three minutes, censaiOS lets no Tailscale device in until it updates again.
#
# Settings (environment):
#   CENSAI_HOME_DIR        the censaiOS folder (default: the folder this script is in)
#   CENSAI_HOME_DRY_RUN=1  print the timer line instead of installing it
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${CENSAI_HOME_DIR:-$HERE}"
STATE_DIR="$HOME_DIR/.homebase-state"
FILE="$STATE_DIR/tailnet-status.json"
MARK="# censaiOS: list of Tailscale devices"
SELF="$HOME_DIR/scripts/home-server-tailnet.sh"
LINE="* * * * * /usr/bin/env bash \"$SELF\" once >/dev/null 2>&1 $MARK"
DRY="${CENSAI_HOME_DRY_RUN:-}"
ACTION="${1:-on}"

say() { printf '%s\n' "$*"; }
stop() { say ""; say "Not set up: $*"; exit 1; }

write_once() {
  command -v tailscale >/dev/null 2>&1 || stop "Tailscale is not on this box. Install it (https://tailscale.com/download/linux), run: sudo tailscale up, then run this again."
  mkdir -p "$STATE_DIR"
  local tmp="$FILE.tmp.$$"
  # A signed-out Tailscale still prints its state, and exits with 1.
  ( umask 077; tailscale status --json > "$tmp" 2>/dev/null ) || true
  if [ -s "$tmp" ]; then mv -f "$tmp" "$FILE"; else rm -f "$tmp"; stop "Tailscale gave no answer. Is it running? Try: sudo tailscale up"; fi
}

without_our_line() { crontab -l 2>/dev/null | grep -vF "$MARK" || true; }

case "$ACTION" in
  once)
    write_once ;;
  off)
    if [ -n "$DRY" ]; then say "Would remove the timer line and $FILE"; exit 0; fi
    command -v crontab >/dev/null 2>&1 && without_our_line | crontab -
    rm -f "$FILE"
    say "Stopped. censaiOS no longer sees your Tailscale devices, so none of them gets in without a code." ;;
  on)
    write_once
    if [ -n "$DRY" ]; then say "Would add this timer line:"; say "$LINE"; exit 0; fi
    command -v crontab >/dev/null 2>&1 || stop "this box has no crontab. Install it (sudo apt install cron), then run this again."
    { without_our_line; say "$LINE"; } | crontab -
    say "Done. censaiOS on this box now sees your Tailscale devices, and the list updates every minute."
    say "Next, on the board: Settings, Open anywhere, My Tailscale devices. Turn it on and switch on your devices." ;;
  *)
    say "Unknown option: $ACTION (use nothing, off, or once)"; exit 2 ;;
esac
