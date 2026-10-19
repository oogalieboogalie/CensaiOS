// speak_up (diagram 17): an agent posts one short note to the Inbox on its
// own, for when a scheduled check finds something worth telling. Off for
// each agent until an owner or admin turns it on in Settings > Agents.
import pool from '../../db.js';
import { postSpeakUpNote } from '../../speakUp/store.js';
import { pingSpeakUpNote } from '../../speakUp/phone.js';
import { FAMILY_AGENTS } from '../../../src/data/family-agents.js';

const NAMES = new Map(FAMILY_AGENTS.map((agent) => [agent.id, agent.name]));

const WHY = {
  off: 'Speak up is off for you on this board, so nothing was posted. Say it in your answer instead.',
  too_soon: 'You already posted a note in the last hour. Nothing was posted; save it for your next check.',
  empty: 'Write the note first (one or two short sentences).',
  no_board: 'There is no board here to post to.',
};

export async function handleSpeakUp(agentId, args = {}, context = {}, db = pool) {
  const result = await postSpeakUpNote(db, { workspaceId: context.workspaceId, agentId, note: args.note });
  if (!result.posted) return WHY[result.why] || 'Nothing was posted.';
  // The phone push (when the owner set one up) never holds up the answer.
  const agentName = NAMES.get(String(agentId).toLowerCase()) || String(agentId);
  pingSpeakUpNote(db, { workspaceId: context.workspaceId, agentName, note: result.note }).catch(() => {});
  return `Posted to the Inbox: "${result.note}"`;
}
