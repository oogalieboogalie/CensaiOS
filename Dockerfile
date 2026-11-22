FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/ ./scripts/
COPY tools/ ./tools/
RUN apk add --no-cache python3 make g++
# Installs exactly what package-lock.json pins (npm ci checks every file's
# hash). --ignore-scripts: no package gets to run code during install; only
# our own postinstall (it swaps in the audited nanoid/qs copies) runs after.
# --loglevel=error hides the two "npm warn deprecated" lines left (sliced via
# excalidraw, node-domexception via Google's sign-in library); only those
# packages' owners can drop them. Real install errors still print.
RUN npm ci --ignore-scripts --loglevel=error --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY scripts/ ./scripts/
COPY tools/ ./tools/
# docker-cli: the Docker window and Run dev talk to the host engine through
# the mounted /var/run/docker.sock (docker-compose.yml).
# git, libgcc, libstdc++, ripgrep: the Agent Console gives each coding agent
# its own git worktree, and Claude Code on Alpine needs these to start.
RUN apk add --no-cache python3 make g++ docker-cli git libgcc libstdc++ ripgrep
# chromium, ttf-freefont: the Legion window opens what its agents built in a
# headless browser and takes a screenshot for Echo to judge (server/legion/browser.js).
RUN apk add --no-cache chromium ttf-freefont
# Grok Build, xAI's own Grok CLI: the Grok chat's "My Grok sign-in" runs on a
# person's own SuperGrok or Grok Heavy plan through it (server/grokSignin/).
# curl and bash run xAI's installer; gcompat lets a glibc build start on
# Alpine. Never fails the build: without it the Grok chat still works on an
# xAI key, and the app log says "grok cli missing" when a Grok chat opens.
RUN apk add --no-cache curl bash gcompat
RUN (curl -fsSL https://x.ai/cli/install.sh | bash) \
 || echo "Grok CLI not installed; the Grok chat still works with an xAI key."
# tailcat: Friends (server/friends/) connects this copy to a friend's
# computer with it. One program with nothing else to install, from its
# makers' own release, and only if it is byte for byte the file they
# published (the sha256 below is from that release's checksums.txt).
# To move to a newer tailcat, change the version and both sums together.
ARG TAILCAT_VERSION=0.7.0
RUN set -e; \
    case "$(uname -m)" in \
      x86_64) arch=amd64; sum=23c0b1887a5ec422f0d18a9c52b4f5357815febdaae738a1eb54036d10bd9ee6 ;; \
      aarch64) arch=arm64; sum=bbb1ab50f24f00effe1e1fd86d0501803fb80793a90785a2a16ff3428f03d8ef ;; \
      *) echo "tailcat: no build for $(uname -m); Friends will say tailcat is missing."; exit 0 ;; \
    esac; \
    curl -fsSL -o /tmp/tailcat.tgz "https://github.com/tailscale/tailcat/releases/download/v${TAILCAT_VERSION}/tailcat_${TAILCAT_VERSION}_linux_${arch}.tar.gz"; \
    echo "${sum}  /tmp/tailcat.tgz" | sha256sum -c -; \
    tar -xzf /tmp/tailcat.tgz --no-same-owner -C /usr/local/bin tailcat; \
    chmod 755 /usr/local/bin/tailcat; rm /tmp/tailcat.tgz; \
    tailcat genkey --client --force --key=/tmp/tailcat-check.json >/dev/null; rm -f /tmp/tailcat-check.json
# Tells the Agent Console to keep installs, worktrees and CLI logins in the
# state volume, which survives the rebuild at every launch.
ENV CENSAI_IN_CONTAINER=1 USE_BUILTIN_RIPGREP=0
# A real install, even one started with a plain docker run instead of
# docker-compose.yml, runs as production; test-only shortcuts stay off.
ENV NODE_ENV=production
# Project folders are mounted from the host under /workspace, so their owner
# never matches the container's user; let git work in them (and only them).
RUN git config --system --add safe.directory /workspace/CensaiHub \
 && git config --system --add safe.directory '/workspace/*'
# Same locked, no-scripts install as above. node-pty (the terminal window) is
# the one package that must build itself, so it alone is rebuilt.
RUN npm ci --omit=dev --ignore-scripts --loglevel=error --no-audit --no-fund \
 && npm rebuild node-pty
COPY server.js ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY docker/ ./docker/
COPY src/ ./src/
# The first-start database step reads which SQL files Postgres already ran.
COPY docker-compose.yml ./
COPY --from=build /app/dist ./dist
# Strip Windows line endings in case a checkout added them. The runner runs
# as the image's normal user (node) and writes its secret here; a new
# runner_secret volume takes this folder's owner.
RUN sed -i 's/\r$//' docker/entrypoint.sh \
 && mkdir -p /run/censai-runner && chown node:node /run/censai-runner
EXPOSE 3001
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
