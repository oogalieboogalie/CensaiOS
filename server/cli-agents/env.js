import os from 'os';
import path from 'path';

/**
 * The environment a coding CLI runs with. It starts from an allowlist, not
 * from process.env: the Homebase server holds DATABASE_URL, SESSION_SECRET,
 * JOURNAL_SECRET and friends, and none of that belongs in a third-party
 * agent's environment (or its transcript). Only what a CLI needs to find
 * its tools, its own login files, a proxy, and the one key it uses.
 */

const PASS_THROUGH = [
  'PATH', 'Path', 'PATHEXT', 'HOME', 'USER', 'USERNAME', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ',
  'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'WINDIR', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'GIT_SSH_COMMAND',
];

/** Extra variables an operator explicitly opts into, e.g. ANTHROPIC_BASE_URL. */
function operatorPassThrough(source) {
  return String(source.CENSAI_CLI_AGENT_ENV_PASS || '')
    .split(',').map((s) => s.trim()).filter((s) => /^[A-Z][A-Z0-9_]{1,63}$/.test(s));
}

export function buildAgentEnv({ source = process.env, key = null, keyEnv = null, managedBin = null } = {}) {
  const env = {};
  for (const name of [...PASS_THROUGH, ...operatorPassThrough(source)]) {
    if (source[name] != null) env[name] = source[name];
  }
  if (!env.HOME && !env.USERPROFILE) env.HOME = os.homedir();
  if (managedBin) {
    const pathKey = env.Path && !env.PATH ? 'Path' : 'PATH';
    env[pathKey] = [managedBin, env[pathKey] || ''].filter(Boolean).join(path.delimiter);
  }
  if (key && keyEnv) env[keyEnv] = key;
  env.TERM = 'dumb';
  env.NO_COLOR = '1';
  env.CI = '1';
  env.CENSAI_AGENT_CONSOLE = '1';
  return env;
}

/**
 * Replace secret values wherever they appear. Applied to every line before
 * it is parsed, stored or shown, so a CLI that echoes its environment or a
 * config file can never put a key on the board.
 */
export function createRedactor(secrets = []) {
  const values = secrets.filter((s) => typeof s === 'string' && s.length >= 8);
  if (values.length === 0) return (text) => text;
  return (text) => {
    let out = String(text);
    for (const value of values) {
      if (out.includes(value)) out = out.split(value).join('[key hidden]');
    }
    return out;
  };
}
