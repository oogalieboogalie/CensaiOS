#!/usr/bin/env bash
# Runs setup.sh inside a throwaway Ubuntu (or Debian) container, twice, to
# prove it installs cleanly and that a second run changes nothing.
#
#   bash starter-box/test/run-in-docker.sh                     # ubuntu:24.04
#   IMAGE=debian:12 bash starter-box/test/run-in-docker.sh
#   SKIP=ollama,remote bash starter-box/test/run-in-docker.sh  # steps to leave out
#   WITH_CENSAIOS=1 bash ...   also builds and starts censaiOS on this
#                              computer's Docker, from this checkout
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
IMAGE="${IMAGE:-ubuntu:24.04}"
SKIP="${SKIP:-}"
args=(--rm -v "$HERE:/kit:ro")
if [ -n "${WITH_CENSAIOS:-}" ]; then
  # Same path inside and outside, because censaiOS's compose file mounts its
  # own folder and the host's Docker resolves that path.
  work="$(mktemp -d /tmp/starter-box-test.XXXX)"
  chmod 755 "$work"
  git clone -q --bare "$REPO" "$work/censaios.git"
  git -C "$work/censaios.git" symbolic-ref HEAD "refs/heads/$(git -C "$REPO" branch --show-current)"
  # Trust the test copy, which root owns (system-level git config).
  printf '[safe]\n\tdirectory = %s\n' "$work/censaios.git" > "$work/gitconfig"
  args+=(--network host -v /var/run/docker.sock:/var/run/docker.sock -v "$work:$work"
    -e "GIT_CONFIG_SYSTEM=$work/gitconfig"
    -e "CENSAIOS_REPO_URL=$work/censaios.git" -e "CENSAIOS_DIR=$work/censaios"
    -e "CENSAIOS_BRANCH=$(git -C "$REPO" branch --show-current)")
else
  SKIP="${SKIP:+$SKIP,}censaios"
fi
# Behind a company proxy that re-signs HTTPS, pass its certificate: EXTRA_CA=/path/ca.crt
if [ -n "${EXTRA_CA:-}" ]; then
  args+=(-v "$EXTRA_CA:/extra-ca.crt:ro" -e NODE_EXTRA_CA_CERTS=/extra-ca.crt)
fi
docker run "${args[@]}" -e SKIP="$SKIP" "$IMAGE" bash -euo pipefail -c '
  apt-get update -q >/dev/null && apt-get install -y -q sudo iproute2 ca-certificates >/dev/null
  if [ -f /extra-ca.crt ]; then cp /extra-ca.crt /usr/local/share/ca-certificates/extra.crt && update-ca-certificates >/dev/null; fi
  useradd -m -s /bin/bash maker
  # As if maker typed "sudo bash setup.sh" (env kept so a proxy certificate reaches npm).
  run() { SUDO_USER=maker bash /kit/setup.sh ${SKIP:+--skip "$SKIP"}; }
  echo "maker ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/maker
  echo "########## first run"; run
  echo "########## second run (should skip everything)"; run 2>&1 | tee /tmp/second.log
  echo "########## checks"
  for t in node npm claude codex git docker ufw sshd starter-box; do command -v $t >/dev/null && echo "found $t" || { echo "MISSING $t"; exit 1; }; done
  grep -c "starter-box/keys.env" /home/maker/.bashrc | grep -qx 1 && echo "keys line added once"
  stat -c "%a %U" /home/maker/.config/starter-box/keys.env
  grep -q "installing" /tmp/second.log && { echo "second run installed something again"; exit 1; } || echo "second run installed nothing new"
  sudo -u maker bash -lc "starter-box help >/dev/null && echo helper works"
'
