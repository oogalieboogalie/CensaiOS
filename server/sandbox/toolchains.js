/**
 * AI CLI Toolchain Registry
 *
 * Defines which AI coding CLIs can be baked into the sandbox image.
 * Each entry maps a short tool ID to:
 *   - label:      Human-readable display name
 *   - arg:        Docker build ARG name in sandbox.Dockerfile
 *   - envKey:     The env var name that holds the CLI's API key (injected at
 *                 container runtime so the CLI can authenticate)
 *   - description: Short blurb shown in the UI
 *   - homepage:   Official project URL
 *   - installNote: Optional caveat shown in the UI
 */
export const TOOLCHAIN_REGISTRY = Object.freeze({
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    arg: 'INSTALL_OPENCODE',
    envKey: 'OPENCODE_API_KEY',
    description: 'AI coding assistant with multi-provider support.',
    homepage: 'https://opencode.ai',
    installNote: null,
    binaryName: 'opencode',
    detectCmd: 'which opencode && opencode --version 2>&1 | head -1',
    installCmd: 'npm install -g opencode-ai',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini CLI',
    arg: 'INSTALL_GEMINI_CLI',
    envKey: 'GEMINI_API_KEY',
    description: 'Google\'s Gemini CLI — agentic AI from your terminal.',
    homepage: 'https://github.com/google-gemini/gemini-cli',
    installNote: null,
    binaryName: 'gemini',
    detectCmd: 'which gemini && gemini --version 2>&1 | head -1',
    installCmd: 'npm install -g @google/gemini-cli',
  },
  codex: {
    id: 'codex',
    label: 'Codex CLI',
    arg: 'INSTALL_CODEX',
    envKey: 'OPENAI_API_KEY',
    description: 'OpenAI Codex CLI — lightweight AI coding agent.',
    homepage: 'https://github.com/openai/codex',
    installNote: null,
    binaryName: 'codex',
    detectCmd: 'which codex && codex --version 2>&1 | head -1',
    installCmd: 'npm install -g @openai/codex',
  },
  claudecode: {
    id: 'claudecode',
    label: 'Claude Code',
    arg: 'INSTALL_CLAUDE_CODE',
    envKey: 'ANTHROPIC_API_KEY',
    description: 'Anthropic\'s agentic coding CLI. Bring your own API key.',
    homepage: 'https://github.com/anthropics/claude-code',
    installNote: null,
    binaryName: 'claude',
    detectCmd: 'which claude && claude --version 2>&1 | head -1',
    installCmd: 'npm install -g @anthropic-ai/claude-code',
  },
});

/** Ordered list of all tool IDs for iteration / display. */
export const TOOLCHAIN_IDS = Object.freeze(Object.keys(TOOLCHAIN_REGISTRY));

/**
 * Parse the SANDBOX_TOOLCHAINS env var (comma-separated tool IDs)
 * and return the matching registry entries.
 * Unknown IDs are silently skipped.
 *
 * @returns {Array<{id, label, arg, envKey, description, homepage, installNote}>}
 */
export function getEnabledToolchains() {
  const raw = process.env.SANDBOX_TOOLCHAINS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((id) => TOOLCHAIN_REGISTRY[id])
    .filter(Boolean);
}

/**
 * Build the --build-arg flags to pass to `docker build` for enabled toolchains.
 * Returns a flat array like: ['--build-arg', 'INSTALL_OPENCODE=true', ...]
 *
 * @param {string[]} [toolIds] Override list of tool IDs. Defaults to SANDBOX_TOOLCHAINS env.
 * @returns {string[]}
 */
export function toolchainBuildArgs(toolIds) {
  const ids = toolIds
    ? toolIds.map((s) => s.trim().toLowerCase()).filter(Boolean)
    : getEnabledToolchains().map((t) => t.id);

  return ids.flatMap((id) => {
    const entry = TOOLCHAIN_REGISTRY[id];
    return entry ? ['--build-arg', `${entry.arg}=true`] : [];
  });
}

/**
 * Build --env flags to inject per-CLI API keys into a running sandbox container.
 * Returns a flat array like: ['--env', 'GEMINI_API_KEY=sk-...', ...]
 * Keys with no value in process.env are omitted.
 *
 * @param {string[]} [toolIds] Override list of tool IDs. Defaults to SANDBOX_TOOLCHAINS env.
 * @returns {string[]}
 */
export function toolchainEnvArgs(toolIds) {
  const ids = toolIds
    ? toolIds.map((s) => s.trim().toLowerCase()).filter(Boolean)
    : getEnabledToolchains().map((t) => t.id);

  return ids.flatMap((id) => {
    const entry = TOOLCHAIN_REGISTRY[id];
    if (!entry) return [];
    const val = process.env[entry.envKey];
    return val ? ['--env', `${entry.envKey}=${val}`] : [];
  });
}
