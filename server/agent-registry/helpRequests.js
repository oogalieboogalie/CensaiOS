// AGENT NETWORK — help request policy.
// One agent (or a person) asks another AgentCard for help with a task.
//   same team (built-in card, card owned by this workspace, or by the
//   requester)  → dispatched at once onto the AgentCard run queue.
//   someone else's public card → 'pending' until that card's owner
//   accepts (dispatch) or declines it. Cards can opt out entirely with
//   metadata.acceptsHelpRequests = false.
// Nothing is hosted: the run uses the requester's BYOK keys for built-ins
// and the card's own endpoint for imported A2A / n8n agents.

import { createAgentCardRun } from '../agent-card-runs/store.js';
import { actorWithWorkspaceAccess } from './access.js';
import { canReadCard, isSystemAgentCard } from '../agent-card-runs/contract.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { cardSkills } from './discoveryRank.js';
import { acceptsHelpRequests, executorKind, isSameTeamCard, visibleInWorkspace } from './discovery.js';
import {
  AgentHelpError, findHelpRequest, insertHelpRequest, listIncoming, listOutgoing,
  markDispatched, markDispatchFailed, publicHelpRequest, transitionPending,
} from './helpRequestStore.js';

export { AgentHelpError } from './helpRequestStore.js';

export const MAX_TASK_CHARS = 8000;
const REQUESTER_KINDS = new Set(['user', 'agent']);
const WRITER_ROLES = ['owner', 'admin', 'member'];

export function composeHelpPrompt({ task, skill, requester }) {
  const from = requester.kind === 'agent'
    ? `agent "${requester.id}" (acting for a workspace member)`
    : 'a workspace member';
  return [
    '[Help request via the Censai agent network]',
    `From: ${from}`,
    skill ? `Skill requested: ${skill.name}${skill.description ? ` (${skill.description})` : ''}` : null,
    '',
    'Task:',
    task,
    '',
    'Reply with the finished result for the requester.',
  ].filter((line) => line !== null).join('\n');
}

function normalizeInput({ task, skillId, requester }) {
  const text = String(task || '').trim();
  if (!text) throw new AgentHelpError('Describe the task you need help with.', 422, 'AGENT_HELP_TASK_REQUIRED');
  if (text.length > MAX_TASK_CHARS) {
    throw new AgentHelpError(`Task exceeds ${MAX_TASK_CHARS} characters.`, 422, 'AGENT_HELP_TASK_TOO_LARGE');
  }
  const kind = String(requester?.kind || 'user');
  const id = String(requester?.id || '').trim();
  if (!REQUESTER_KINDS.has(kind) || !id) {
    throw new AgentHelpError('Unknown requester.', 422, 'AGENT_HELP_REQUESTER_INVALID');
  }
  return { task: text, skillId: skillId ? String(skillId).trim() : null, requester: { kind, id } };
}

async function loadTarget(db, { cardId, userId, workspaceId }) {
  const { rows: [card] } = await db.query(
    'SELECT * FROM agent_cards WHERE id=$1 AND deleted_at IS NULL', [String(cardId || '')],
  );
  const actor = await actorWithWorkspaceAccess({ kind: 'user', id: String(userId) }, db);
  if (!card || !canReadCard(card, actor) || !visibleInWorkspace(card, workspaceId)) {
    throw new AgentHelpError('Agent not found.', 404, 'AGENT_HELP_TARGET_NOT_FOUND');
  }
  return card;
}

function assertCallable(card) {
  if (!acceptsHelpRequests(card)) {
    throw new AgentHelpError('This agent is not accepting help requests.', 409, 'AGENT_HELP_NOT_ACCEPTED');
  }
  if (!executorKind(card)) {
    throw new AgentHelpError(
      'This agent has no callable adapter yet. Import it from an A2A card or n8n chat workflow, or ask a built-in agent.',
      422, 'AGENT_HELP_NOT_CALLABLE',
    );
  }
}

async function isPinned(db, { cardId, workspaceId }) {
  const { rows } = await db.query(
    'SELECT 1 FROM workspace_agent_card_installs WHERE workspace_id=$1 AND card_id=$2', [workspaceId, cardId],
  );
  return rows.length > 0;
}

// Agents calling the tool act without a person watching each call (a person
// filing "on behalf of" an agent in the UI is not autonomous), so they may only reach
// built-in family cards or cards a workspace owner/admin has pinned here.
async function assertAgentMayCall(db, { card, workspaceId }) {
  if (isSystemAgentCard(card) || await isPinned(db, { cardId: card.id, workspaceId })) return;
  throw new AgentHelpError(
    'Agents can only ask built-in agents or agents pinned in this workspace. Ask an owner or admin to pin it in the Agent Registry.',
    403, 'AGENT_HELP_PIN_REQUIRED',
  );
}

async function dispatch(db, row, card, createRun) {
  const skill = cardSkills(card).find((entry) => entry.id === row.skill_id) || null;
  const requester = { kind: row.requester_kind, id: row.requester_id };
  try {
    const queued = await createRun({
      db, card, callerId: row.requested_by_user_id,
      payload: { prompt: composeHelpPrompt({ task: row.task, skill, requester }) },
      options: { workspaceId: row.workspace_id },
      clientTaskId: `help:${row.id}`,
      runMetadata: { helpRequestId: row.id, requester },
    });
    await markDispatched(db, row.id, queued.runId);
  } catch (error) {
    await markDispatchFailed(db, row.id, error.message);
  }
}

export async function createHelpRequest(db, {
  workspaceId, userId, cardId, task, skillId, requester, autonomous = false, createRun = createAgentCardRun,
}) {
  await requireWorkspaceMember(db, { workspaceId, userId, roles: WRITER_ROLES });
  const input = normalizeInput({ task, skillId, requester });
  const card = await loadTarget(db, { cardId, userId, workspaceId });
  if (input.requester.kind === 'agent' && card.id === `agent:${input.requester.id.toLowerCase()}`) {
    throw new AgentHelpError('An agent cannot request help from itself.', 422, 'AGENT_HELP_SELF');
  }
  assertCallable(card);
  if (autonomous) await assertAgentMayCall(db, { card, workspaceId });
  if (input.skillId && !cardSkills(card).some((skill) => skill.id === input.skillId)) {
    throw new AgentHelpError('That agent does not advertise this skill.', 422, 'AGENT_HELP_SKILL_UNKNOWN');
  }
  const sameTeam = isSameTeamCard(card, { workspaceId, userId });
  const row = await insertHelpRequest(db, {
    workspaceId, cardId: card.id, targetOwnerId: card.owner_id == null ? null : String(card.owner_id),
    requesterKind: input.requester.kind, requesterId: input.requester.id, userId,
    skillId: input.skillId, task: input.task, status: sameTeam ? 'dispatched' : 'pending',
  });
  if (sameTeam) await dispatch(db, row, card, createRun);
  return publicHelpRequest(await findHelpRequest(db, row.id), 'outgoing');
}

export async function listHelpRequests(db, { workspaceId, userId }) {
  await requireWorkspaceMember(db, { workspaceId, userId });
  const [outgoing, incoming] = await Promise.all([
    listOutgoing(db, workspaceId),
    listIncoming(db, { userId, workspaceId }),
  ]);
  return {
    outgoing: outgoing.map((row) => publicHelpRequest(row, 'outgoing')),
    incoming: incoming.map((row) => publicHelpRequest(row, 'incoming')),
  };
}

export async function getHelpRequest(db, { id, workspaceId, userId }) {
  await requireWorkspaceMember(db, { workspaceId, userId });
  const row = await findHelpRequest(db, id);
  if (!row || row.workspace_id !== workspaceId) {
    throw new AgentHelpError('Help request not found.', 404, 'AGENT_HELP_NOT_FOUND');
  }
  return publicHelpRequest(row, 'outgoing');
}

/** Card owner accepts or declines a pending request from another workspace. */
export async function decideHelpRequest(db, {
  id, userId, decision, note, createRun = createAgentCardRun,
}) {
  if (decision !== 'accept' && decision !== 'decline') {
    throw new AgentHelpError('Decision must be accept or decline.', 422, 'AGENT_HELP_DECISION_INVALID');
  }
  const row = await transitionPending(db, {
    id, where: 'target_owner_id=$5', params: [String(userId)],
    status: decision === 'accept' ? 'dispatched' : 'declined', userId, note,
  });
  if (!row) throw new AgentHelpError('No pending request to decide.', 409, 'AGENT_HELP_NOT_PENDING');
  if (decision === 'accept') {
    const { rows: [card] } = await db.query(
      'SELECT * FROM agent_cards WHERE id=$1 AND deleted_at IS NULL', [row.target_card_id],
    );
    if (card && acceptsHelpRequests(card) && executorKind(card)) await dispatch(db, row, card, createRun);
    else await markDispatchFailed(db, row.id, 'The agent is no longer callable.');
  }
  return publicHelpRequest(await findHelpRequest(db, row.id), 'incoming');
}

/** The requesting workspace withdraws a request that is still pending. */
export async function cancelHelpRequest(db, { id, workspaceId, userId }) {
  await requireWorkspaceMember(db, { workspaceId, userId, roles: WRITER_ROLES });
  const row = await transitionPending(db, {
    id, where: 'workspace_id=$5', params: [workspaceId], status: 'cancelled', userId,
  });
  if (!row) throw new AgentHelpError('No pending request to cancel.', 409, 'AGENT_HELP_NOT_PENDING');
  return publicHelpRequest(await findHelpRequest(db, row.id), 'outgoing');
}
