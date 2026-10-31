// Files no agent may write, and commands no agent may run against them. Each
// one either holds keys (.env, secrets.json, git's own folder) or makes the
// computer run something the next time censaiOS, an agent app or a shell
// starts: config/mcp_servers.json starts every command it lists at launch
// (server/tools/mcpClient.js, the CVE-2025-53098 pattern), and the agent apps'
// settings, shell profiles and startup folders do the same. Trust mode leaves
// everyday writes alone; these few always stop and tell the person to make
// the change by hand.

// Text around a name: start or end, a slash, a space, a quote or a shell sign.
const EDGE = String.raw`(?:^|[\s/"'\`=;|&<>(),:])`;
const END = String.raw`(?=$|[\s/"'\`;|&<>(),:])`;
const NAME = String.raw`[\w.@+-]*`;

export const PROTECTED_FILE_RULES = Object.freeze([
  // Keys and logins
  { what: 'a keys file (.env)', pattern: String.raw`(?:\.env${NAME}|${NAME}\.env)` },
  { what: 'a secrets file', pattern: String.raw`${NAME}secrets\.json` },
  { what: "git's own folder", pattern: String.raw`\.git${NAME}` },
  // Add-on (MCP) and agent app settings: each can start a program
  { what: 'the add-on settings (MCP)', pattern: String.raw`(?:mcp_servers|\.?mcp|claude_desktop_config)\.json` },
  { what: 'an agent app settings file', pattern: String.raw`\.(?:claude|cursor|codex|gemini|windsurf)(?:/${NAME})?` },
  // Files a shell or the computer runs at start
  { what: 'a shell start file', pattern: String.raw`\.(?:bashrc|bash_profile|bash_login|bash_logout|profile|zshrc|zprofile|zshenv|zlogin)` },
  { what: 'a PowerShell profile', pattern: String.raw`${NAME}profile\.ps1` },
  { what: 'a startup folder', pattern: String.raw`(?:start menu/programs/startup|\.config/autostart|launchagents|launchdaemons)` },
  { what: 'a scheduled job', pattern: String.raw`(?:crontab|cron\.d|cron\.daily|cron\.hourly|schtasks(?:\.exe)?)` },
].map(rule => Object.freeze({ ...rule, regex: new RegExp(`${EDGE}${rule.pattern}${END}`, 'i') })));

// The tools that write a file or run a command, and where each keeps its target.
const PATH_FIELDS = ['file_path', 'path', 'filter', 'project_path'];
const COMMAND_FIELDS = ['command', 'cmd', 'script', 'input'];
export const CHECKED_TOOLS = Object.freeze(new Set([
  'local_write_file', 'project_write', 'project_edit', 'project_multi_edit', 'github_write_file',
  'generate_tests', 'sandbox_exec', 'terminal_run', 'run_tests', 'run_linter',
  'run_shell_command', 'run_host_script',
]));

function targetsOf(args = {}) {
  const out = [];
  const take = (source) => {
    for (const field of [...PATH_FIELDS, ...COMMAND_FIELDS]) {
      if (typeof source?.[field] === 'string' && source[field]) out.push(source[field]);
    }
  };
  take(args);
  if (Array.isArray(args?.edits)) args.edits.forEach(take);
  return out;
}

/** The first protected file this call would touch, or null. */
export function protectedTarget(name, args) {
  if (!CHECKED_TOOLS.has(name)) return null;
  for (const raw of targetsOf(args)) {
    const text = String(raw).replace(/\\/g, '/');
    const rule = PROTECTED_FILE_RULES.find(r => r.regex.test(text));
    if (rule) return { target: raw, what: rule.what };
  }
  return null;
}
