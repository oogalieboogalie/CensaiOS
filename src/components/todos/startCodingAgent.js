// The send arrow on a to-do assigned to a coding agent (Claude Code, Codex,
// ...): start that agent headless in the open project, through the Agent
// Console (POST /api/cli-agents/tasks). Its work shows in the Agent Console
// and the Inbox. Starting one needs this computer's owner account, the same
// as the Agent Console's own Start button.

import { cliAgentsApi } from '../agentConsole/cliAgentsApi.js';
import { codingAgentLabel, parseAssignee } from '../../lib/todos/assignees.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

export function codingAgentPrompt(item, listTitle) {
  const from = listTitle ? ` from the to-do list "${listTitle}"` : '';
  return `A teammate assigned you this to-do${from}:\n\n${item.text}\n\nDo it in this project, then say in plain words what you changed.`;
}

/**
 * Item fields to save when the to-do went to a coding agent, or null when the
 * to-do isn't assigned to one (the caller hands it off the usual way).
 * Throws a plain-words error when the agent could not start.
 */
export async function startCodingAgent({ item, folder, listTitle, api = cliAgentsApi }) {
  const who = parseAssignee(item?.assignee);
  if (who?.type !== 'cli') return null;
  const label = codingAgentLabel(who.id);
  if (!folder) throw new Error('Open a local project first, then send the to-do again.');
  try {
    const { task } = await api.start({ cli: who.id, folder, prompt: codingAgentPrompt(item, listTitle) });
    if (!task?.id) throw new Error('The Agent Console did not say which task it started.');
    logToApp('info', `todos: ${label} started on a to-do (task ${task.id})`, { where: 'todos' });
    return {
      cliTaskId: task.id,
      handedOffAt: new Date().toISOString(),
      implementationStatus: 'cli_started',
      implementationTarget: item.assignee,
      handoffWarning: `${label} is working on it. Follow along in the Agent Console or the Inbox.`,
    };
  } catch (err) {
    logToApp('warn', `todos: ${label} could not start on a to-do: ${err.message}`, { where: 'todos' });
    const why = err.status === 403
      ? `Only this computer's owner account can start ${label}.`
      : err.status === 404 ? `${label} can only run on the computer that runs censaiOS.` : err.message;
    throw new Error(`${label} did not start. ${why}`, { cause: err });
  }
}
