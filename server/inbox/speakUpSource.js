// Notes agents posted on their own (diagram 17, "speak up"). Each one is a
// line in the Inbox for everyone on that board; nothing to fix, only read.

import { registerInboxSource } from './sources.js';
import { FAMILY_AGENTS } from '../../src/data/family-agents.js';

const NAMES = new Map(FAMILY_AGENTS.map((agent) => [agent.id, agent.name]));

let lister = async (ctx) => {
  const [{ default: pool }, { listSpeakUpNotes }] = await Promise.all([import('../db.js'), import('../speakUp/store.js')]);
  return listSpeakUpNotes(pool, ctx);
};
export function setSpeakUpLister(fn) { lister = fn; }

/** One stored note as an Inbox report. */
export function speakUpReport(row) {
  const at = new Date(row.created_at).toISOString();
  const who = NAMES.get(row.agent_id) || row.agent_id;
  return {
    id: `note-${row.id}`,
    note: true,
    title: `${who} spoke up`,
    detail: row.note,
    agent: who,
    count: 1,
    lastHour: null,
    firstSeen: at,
    lastSeen: at,
    repo: row.workspace_name || 'this board',
    fixable: false,
  };
}

export function registerSpeakUpSource() {
  return registerInboxSource('speak-up', {
    async list({ userId }) {
      if (!userId) return [];
      return (await lister({ userId })).map(speakUpReport);
    },
  });
}
