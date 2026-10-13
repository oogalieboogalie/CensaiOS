# Homebase agent/user sandbox image.
# A portable Linux toolchain that the in-app terminal and agent shell run
# inside. One container per project; the project is bind-mounted at /workspace.
# Build:  docker build -f docker/sandbox.Dockerfile -t homebase-sandbox:latest .
# (The server also builds this automatically on first use.)
FROM node:22-bookworm-slim

# Common build/dev tooling agents and users expect in a working shell.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      ca-certificates \
      python3 \
      python3-pip \
      build-essential \
      ripgrep \
      jq \
      less \
      procps \
      openssh-client \
 && rm -rf /var/lib/apt/lists/*

# ── AI CLI Toolchains (feature-flagged via build args) ──────────────────────
# Each defaults to false — only installed when explicitly enabled.
# The server reads SANDBOX_TOOLCHAINS from .env and passes the right
# --build-arg flags when building this image.

ARG INSTALL_OPENCODE=false
ARG INSTALL_GEMINI_CLI=false
ARG INSTALL_CODEX=false
ARG INSTALL_CLAUDE_CODE=false

# OpenCode — multi-provider AI coding CLI
RUN if [ "$INSTALL_OPENCODE" = "true" ]; then \
      echo "Installing OpenCode CLI..." && \
      npm install -g opencode-ai; \
    fi

# Gemini CLI — Google's agentic terminal AI
RUN if [ "$INSTALL_GEMINI_CLI" = "true" ]; then \
      echo "Installing Gemini CLI..." && \
      npm install -g @google/gemini-cli; \
    fi

# Codex CLI — OpenAI lightweight coding agent
RUN if [ "$INSTALL_CODEX" = "true" ]; then \
      echo "Installing Codex CLI..." && \
      npm install -g @openai/codex; \
    fi

# Claude Code — Anthropic CLI (bring-your-own ANTHROPIC_API_KEY)
RUN if [ "$INSTALL_CLAUDE_CODE" = "true" ]; then \
      echo "Installing Claude Code CLI..." && \
      npm install -g @anthropic-ai/claude-code; \
    fi

# A friendly default prompt and a stable working directory.
ENV TERM=xterm-256color
WORKDIR /workspace

# Keep the container alive; the server execs shells/commands into it on demand.
CMD ["sleep", "infinity"]
