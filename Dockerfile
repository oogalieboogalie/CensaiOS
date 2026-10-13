FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY scripts/ ./scripts/
COPY tools/ ./tools/
RUN apk add --no-cache python3 make g++
RUN npm ci
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
# Tells the Agent Console to keep installs, worktrees and CLI logins in the
# state volume, which survives the rebuild at every launch.
ENV CENSAI_IN_CONTAINER=1 USE_BUILTIN_RIPGREP=0
# Project folders are mounted from the host under /workspace, so their owner
# never matches the container's user; let git work in them (and only them).
RUN git config --system --add safe.directory /workspace/CensaiHub \
 && git config --system --add safe.directory '/workspace/*'
RUN npm ci --omit=dev
COPY server.js ./
COPY server/ ./server/
COPY docker/ ./docker/
COPY src/ ./src/
# The first-start database step reads which SQL files Postgres already ran.
COPY docker-compose.yml ./
COPY --from=build /app/dist ./dist
# Strip Windows line endings in case a checkout added them.
RUN sed -i 's/\r$//' docker/entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
