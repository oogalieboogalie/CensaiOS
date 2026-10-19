#!/usr/bin/env bash
# Closer to a real box: boots Ubuntu with systemd inside a privileged
# container, runs setup.sh, then the doctor. Docker, SSH, the firewall and
# censaiOS really start here (censaiOS is built from this checkout).
#
#   bash starter-box/test/run-with-systemd.sh
#   SKIP=ollama,remote EXTRA_CA=/path/ca.crt bash starter-box/test/run-with-systemd.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
SKIP="${SKIP:-}"
BRANCH="$(git -C "$REPO" branch --show-current)"
work="$(mktemp -d /tmp/starter-box-systemd.XXXX)"
chmod 755 "$work"  # the box user clones from here
git clone -q --bare "$REPO" "$work/censaios.git"
cp "${EXTRA_CA:-/dev/null}" "$work/extra-ca.crt"
docker build -q -t starter-box-systemd - >/dev/null <<'DOCKERFILE'
FROM ubuntu:24.04
RUN apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q systemd systemd-sysv sudo iproute2 ca-certificates kmod iptables git && \
    useradd -m -s /bin/bash maker && echo "maker ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/maker
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
DOCKERFILE
name="starter-box-systemd-$$"
docker run -d --name "$name" --privileged --cgroupns=host -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  --tmpfs /run --tmpfs /run/lock -v "$HERE:/kit:ro" -v "$work:/work:ro" starter-box-systemd >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
sleep 5
docker exec -e SKIP="$SKIP" -e BRANCH="$BRANCH" "$name" bash -euo pipefail -c '
  if [ -s /work/extra-ca.crt ]; then
    cp /work/extra-ca.crt /usr/local/share/ca-certificates/extra.crt && update-ca-certificates >/dev/null 2>&1
    export NODE_EXTRA_CA_CERTS=/work/extra-ca.crt
  fi
  git config --system --add safe.directory /work/censaios.git  # a test copy owned by root
  export CENSAIOS_REPO_URL=/work/censaios.git CENSAIOS_BRANCH="$BRANCH"
  echo "########## setup"; SUDO_USER=maker bash /kit/setup.sh ${SKIP:+--skip "$SKIP"}
  echo "########## doctor as maker"; sudo -iu maker starter-box doctor || true
  echo "########## ssh login welcome"; sudo -iu maker bash -lc "SSH_CONNECTION=x starter-box welcome"
  echo "########## firewall"; ufw status | head -20
'
