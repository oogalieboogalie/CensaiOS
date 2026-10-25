// Sending a card's open step to whoever the card is for, the same three ways a
// to-do goes out (src/lib/todos/assignees.js): a coding agent (Claude Code,
// Grok, ...) starts headless in the open project through the Agent Console,
// and later steps resume that same run so they see the earlier steps' work;
// a board agent gets a project hand-off; a person just has it on their list.
// Returns the fields to save on the card and the step.

import { cliAgentsApi } from '../../agentConsole/cliAgentsApi.js';
import { createProjectHandoff } from '../../../lib/api/projects.js';
import { codingAgentLabel, parseAssignee } from '../../../lib/todos/assignees.js';
import { stepPrompt } from '../../../lib/stepCards/stack.js';

const now = () => new Date().toISOString();

async function sendToCodingAgent({ card, step, cli, folder, api }) {
  const label = codingAgentLabel(cli);
  const prompt = stepPrompt(card, step);
  // The next step goes to the same run, in the same worktree, when it is still there and idle.
  if (card.cliTaskId && card.cliId === cli) {
    try {
      const { task } = await api.message(card.cliTaskId, prompt);
      if (task?.id) return { card: {}, step: { sentAt: now(), sentTo: label, sentNote: `${label} is working on it in the same run.` } };
    } catch (err) {
      if (err.status === 403) throw new Error(`Only this computer's owner account can start ${label}.`, { cause: err });
      if (err.status === 409) throw new Error(`${label} is still working on the last step. Wait for it, then send again.`, { cause: err });
      // The run is gone: start a fresh one below.
    }
  }
  if (!folder) throw new Error('Open the project this card is about first (project picker in the top bar), then send again.');
  try {
    const { task } = await api.start({ cli, folder, prompt });
    if (!task?.id) throw new Error('The Agent Console did not say which task it started.');
    return {
      card: { cliTaskId: task.id, cliId: cli },
      step: { sentAt: now(), sentTo: label, sentNote: `${label} is working on it. Follow along in the Agent Console.` },
    };
  } catch (err) {
    const why = err.status === 403 ? `Only this computer's owner account can start ${label}.`
      : err.status === 404 ? `${label} can only run on the computer that runs censaiOS.` : err.message;
    throw new Error(`${label} did not start. ${why}`, { cause: err });
  }
}

/** { card: patch, step: patch, log } for the open step, or throws a plain-words error. */
export async function sendStep({ card, step, folder, workspaceId, api = cliAgentsApi, handoff = createProjectHandoff }) {
  const who = parseAssignee(card.assignee);
  if (!who) throw new Error('Pick who does this card first.');
  if (who.type === 'cli') {
    const out = await sendToCodingAgent({ card, step, cli: who.id, folder, api });
    return { ...out, log: `sent a step to ${codingAgentLabel(who.id)}` };
  }
  if (who.type === 'person') {
    return { card: {}, step: { sentAt: now(), sentTo: card.assigneeName || 'a teammate', sentNote: `It is on ${card.assigneeName || 'their'} list. Paste what they did below, then check.` }, log: 'gave a step to a person' };
  }
  const result = await handoff({
    workspaceId,
    projectPath: folder,
    title: step.title,
    text: stepPrompt(card, step),
    assignee: card.assignee,
    sourceTitle: 'Step cards',
    priority: 'normal',
    sourceId: `step-cards:${card.id}:${step.id}`,
  });
  const name = card.assigneeName || 'The agent';
  return {
    card: {},
    step: { sentAt: now(), sentTo: name, sentNote: result?.taskSkipped || `${name} has it. Paste what it said below, then check.` },
    log: 'handed a step to a board agent',
  };
}
