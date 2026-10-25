// Which coding agents the Assign menu offers: the ones the Agent Console's
// roster says are on this computer. The rest show greyed, with why. Assigning
// one that is installed but not ready (not signed in, still installing)
// leaves one app-log line naming the agent only.
import { logToApp } from '../../lib/appLog/browserLog.js';

/** { offered, ready, note } for one coding agent, from its roster entry. */
export function codingAgentChoice(cli, { loaded = false, unavailable = false } = {}) {
  if (unavailable) return { offered: false, ready: false, note: 'Can\'t run on this server' };
  if (!loaded) return { offered: false, ready: false, note: 'Checking this computer' };
  if (cli?.state === 'installing') return { offered: true, ready: false, note: 'Installing', why: 'installed yet' };
  if (!cli?.installed) return { offered: false, ready: false, note: 'Not installed on this computer' };
  if (cli.running > 0) return { offered: true, ready: true, note: 'Working on something' };
  if (!cli.signedIn) return { offered: true, ready: false, note: 'Installed, not signed in yet', why: 'signed in' };
  return { offered: true, ready: true, note: 'Ready' };
}

/** The app-log line for assigning a to-do to a coding agent that is not ready. */
export function logUnreadyAssign(label, choice) {
  if (!choice?.offered || choice.ready) return;
  logToApp('warn', `todos: a to-do was assigned to ${label}, which is not ${choice.why} on this computer`, { where: 'todos' });
}
