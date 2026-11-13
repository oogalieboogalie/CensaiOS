/**
 * Whether anyone is using this censaiOS right now.
 *
 * An agent mid-task, a Legion, or a workflow (the same list the Restart
 * button waits on). Also an open terminal, a console agent that is still
 * running (Claude Code and the others in the Agent Console), or a key or
 * a click in the last 10 minutes. An open window on its own does not count.
 * Open pull requests are work the crew has not landed yet; they are not
 * someone using this PC.
 */

import { busyAgents } from './busy.js';
import { recentAppInput } from './inUse.js';

async function defaultTerminals() {
  const { sessions } = await import('../terminal/shared.js');
  let count = 0;
  for (const session of sessions.values()) if (session?.alive) count += 1;
  return count;
}

async function defaultConsoleAgents() {
  const { getCliTaskManager } = await import('../cli-agents/index.js');
  return getCliTaskManager().list();
}

export async function anyoneWorking({
  busy = busyAgents,
  terminals = defaultTerminals,
  consoleAgents = defaultConsoleAgents,
  recentInput = recentAppInput,
} = {}) {
  // A failed check throws. The idle answer treats that as someone using
  // censaiOS, so a built update is left alone when it cannot tell.
  const agents = await busy();
  const agentBusy = Array.isArray(agents) && agents.length > 0;
  const terminalCount = Number(await terminals()) || 0;
  const listed = await consoleAgents();
  const consoleCount = (Array.isArray(listed) ? listed : []).filter((task) => task && task.running).length;
  const recent = (await recentInput()) === true;
  return {
    working: agentBusy || terminalCount > 0 || consoleCount > 0 || recent,
    agents: Array.isArray(agents) ? agents : [],
  };
}
