// Terminals and coding CLIs (Agent Console, Alt-hotkey terminals): is each
// one signed in, how (its own sign-in, a key from the vault, the Toolchains
// settings or .env), which account, and what its runs reported spending.
//
// The account name comes from the CLI's own settings file and is only an
// email or login name. Tokens are never read: Claude Code's sign-in token,
// Codex's and Grok's stay where the CLI keeps them (Anthropic's terms forbid
// any other app reusing a Claude Pro or Max sign-in).
// Only the computer's owner sees account names.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { cliRoster, getCliTaskManager } from '../cli-agents/index.js';
import { agentHome } from '../cli-agents/paths.js';
import { createLogger } from '../logger.js';

const log = createLogger('ai-resources');

// A settings file that is missing is normal (no name); one that is there but
// cannot be read or parsed throws, so the caller logs which CLI it was.
function readJson(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(raw);
}

const ACCOUNT_READERS = {
  claudecode: (home) => {
    const account = readJson(path.join(home, '.claude.json'))?.oauthAccount;
    return account?.emailAddress || null;
  },
  gemini: (home) => readJson(path.join(home, '.gemini', 'google_accounts.json'))?.active || null,
  copilot: (home) => {
    const config = readJson(path.join(home, '.copilot', 'config.json'));
    return config?.last_logged_in_user?.login || config?.logged_in_users?.[0]?.login || null;
  },
};

// Codex (~/.codex/auth.json) and Grok Build (~/.grok/auth.json) keep the
// account only inside the file that holds the sign-in tokens, and their
// settings files (config.toml) never name it. censaiOS never opens a token
// file, so for these two the owner sees why there is no name instead.
const ACCOUNT_IN_TOKEN_FILE = new Set(['codex', 'grok']);

export function accountKeptWithToken(cliId) {
  return ACCOUNT_IN_TOKEN_FILE.has(cliId);
}

/** The account a CLI's own sign-in belongs to, or null when it does not say. */
export function cliAccountName(cliId, home = agentHome() || os.homedir()) {
  const reader = ACCOUNT_READERS[cliId];
  if (!reader) return null;
  try {
    const name = reader(home);
    return typeof name === 'string' && name.length <= 200 ? name : null;
  } catch {
    log.warn('could not read a CLI account name', { cli: cliId });
    return null;
  }
}

function spendByCli(tasks, userId, owner) {
  const out = {};
  for (const task of tasks) {
    if (!owner && String(task.createdBy?.userId) !== String(userId)) continue;
    const row = out[task.cli] || (out[task.cli] = { runs: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, lastKeySource: null, lastAt: 0 });
    row.runs += 1;
    row.costUsd += Number(task.costUsd) || 0;
    row.tokensIn += Number(task.usage?.input) || 0;
    row.tokensOut += Number(task.usage?.output) || 0;
    if (task.createdAt > row.lastAt) { row.lastAt = task.createdAt; row.lastKeySource = task.keySource || null; }
  }
  return out;
}

export async function cliResources({ userId, owner, roster = cliRoster, tasks = () => getCliTaskManager().list() }) {
  const rows = await roster({ userId });
  const spend = spendByCli(tasks(), userId, owner);
  return rows.map((cli) => ({
    id: cli.id,
    label: cli.label,
    vendor: cli.vendor,
    installed: cli.installed,
    signedIn: cli.signedIn,
    signedInVia: cli.signedInVia,
    account: owner && cli.signedInVia === 'cli-login' ? cliAccountName(cli.id) : null,
    accountHidden: !owner && cli.signedInVia === 'cli-login',
    accountWithToken: owner && cli.signedInVia === 'cli-login' && accountKeptWithToken(cli.id),
    running: cli.running,
    spend: spend[cli.id] || { runs: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, lastKeySource: null, lastAt: 0 },
  }));
}
