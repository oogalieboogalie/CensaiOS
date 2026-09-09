export const devExecutionTools = [
  {
    meta: { scope: 'project', destructive: false, requires_approval_above: 'worker', audit_log: true },
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run the project test suite and return the output. Detects the test runner from package.json scripts. Optionally filter to a specific test file or pattern.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Optional test file path or pattern to filter which tests run' },
          timeout_ms: { type: 'integer', default: 30000, description: 'Timeout in milliseconds for the test run (default: 30000)' },
          project: { type: 'string', description: 'Optional open project name such as "CensaiHub"; defaults to the server project root' },
          project_path: { type: 'string', description: 'Optional absolute/relative project root path, or an open project name such as "CensaiHub"' },
        },
      },
    },
  },
  {
    meta: { scope: 'project', destructive: true, requires_approval_above: 'worker', audit_log: true },
    type: 'function',
    function: {
      name: 'sandbox_exec',
      description: 'Run a shell command inside the project\'s Docker sandbox (a Linux container with the project bind-mounted at /workspace). Use this to install deps, run builds/tests/scripts, use git, or edit files via shell — changes land in the real project tree. The same container backs the in-app Terminal. Returns stdout, stderr, and the exit code.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run (executed with bash -lc inside the container). e.g. "npm test", "python3 script.py", "git status".' },
          cwd: { type: 'string', description: 'Optional working directory relative to the project root (/workspace). Defaults to the project root.' },
          project: { type: 'string', description: 'Optional open project name (e.g. "CensaiHub"). Selects which project\'s sandbox to use; defaults to the server project root.' },
          project_path: { type: 'string', description: 'Optional absolute host path to the project root to mount, instead of resolving by name.' },
          timeout_ms: { type: 'integer', default: 120000, description: 'Timeout in milliseconds (default 120000, max 600000).' },
        },
        required: ['command'],
      },
    },
  },
  {
    meta: { scope: 'project', destructive: true, requires_approval_above: 'worker', audit_log: true },
    type: 'function',
    function: {
      name: 'terminal_run',
      description: 'Run a shell command in the user\'s SHARED in-app terminal — the same live terminal window the user is watching. They see your command (attributed to you) and its output appear in their terminal, and you get the captured stdout/stderr and exit code back. Only works when the user has attached you to a terminal window AND turned on its agent toggle. Runs in the project\'s Docker sandbox when available. Prefer this over sandbox_exec when you want the user to watch what you do live; use sandbox_exec for silent background work.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run, e.g. "npm test", "ls -la", "git status".' },
          session_id: { type: 'string', description: 'Optional terminal session id. Only needed if you are attached to more than one agent-enabled terminal.' },
          timeout_ms: { type: 'integer', default: 120000, description: 'Timeout in milliseconds (default 120000, max 600000).' },
        },
        required: ['command'],
      },
    },
  },
  {
    meta: { scope: 'project', destructive: false, requires_approval_above: 'researcher', audit_log: true },
    type: 'function',
    function: {
      name: 'run_linter',
      description: 'Run the project linter (eslint or npm run lint) and return the output. Optionally scope to a specific path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', default: '.', description: 'Path to lint inside the resolved project (default: "." — entire project). If this is an open project name such as "CensaiHub", the tool lints that project root.' },
          project: { type: 'string', description: 'Optional open project name such as "CensaiHub"; use this to choose the project root and keep path for file/folder scope' },
          project_path: { type: 'string', description: 'Optional absolute/relative project root path, or an open project name such as "CensaiHub"' },
        },
      },
    },
  },
];
