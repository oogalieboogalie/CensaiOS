export { isDockerAvailable } from './availability.js';
export { sandboxNameForPath } from './naming.js';
export { ensureSandboxImage } from './images.js';
export { ensureSandbox, stopSandbox, listSandboxes } from './lifecycle.js';
export { execInSandbox, spawnSandboxShell, sandboxShellArgv, sandboxAgentArgv, OPENCODE_RUN_MAX_PROMPT_CHARS, OPENCODE_DEFAULT_MODEL } from './execution.js';
