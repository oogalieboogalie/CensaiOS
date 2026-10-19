// server/agentMemory/turnTools.js
//
// recall_conversation: lets an agent read its earlier chats word for word,
// with the time of every message. Find them by words, by day, or read one
// whole chat by its id. Only the person who started the run, only this agent.

import { gapWords, stamp } from '../../src/lib/agentMemory/timeWords.js';
import * as turnStore from './turns.js';

const MAX_LINE = 1200;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const TURN_TOOL_DEFINITIONS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'recall_conversation',
      description: 'Read your earlier chats with this person word for word, with the date and time of every message. Find them by words (query), by day (day, like 2026-10-17), or read one whole chat (chat_id, shown in earlier results).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to look for in what was said.' },
          day: { type: 'string', description: 'A day like 2026-10-17: every message from that day.' },
          chat_id: { type: 'string', description: 'Read this whole chat, start to end.' },
        },
      },
    },
  },
]);

function line(turn, timeZone) {
  const text = String(turn.text || '').replace(/\s+/g, ' ').trim();
  const who = turn.speaker === 'agent' ? 'You' : 'Person';
  return `[${stamp(turn.at, timeZone)}] ${who}: ${text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text}`;
}

function chatText(turns, timeZone) {
  if (!turns.length) return '';
  const first = turns[0];
  const last = turns[turns.length - 1];
  return [
    `Chat ${first.conversation_id}: ${turns.length} messages, from ${stamp(first.at, timeZone)} to ${stamp(last.at, timeZone)} (${gapWords(first.at, last.at)}).`,
    ...turns.map((t) => line(t, timeZone)),
  ].join('\n');
}

export function createTurnTools({ db, userId, agentId, timeZone }) {
  return {
    async recall_conversation(args) {
      const chatId = String(args?.chat_id || '').trim();
      if (chatId) {
        const turns = (await turnStore.conversationTurns(db, { userId, conversationId: chatId }))
          .filter((t) => t.agent_id === String(agentId).toLowerCase());
        return chatText(turns, timeZone) || `No chat with id "${chatId}".`;
      }
      const day = String(args?.day || '').trim();
      if (DAY.test(day)) {
        const from = new Date(`${day}T00:00:00Z`);
        // A day is read wide (UTC-14 to UTC+14) so a local evening is not cut off.
        const turns = await turnStore.turnsBetween(db, {
          userId, agentId, from: new Date(from.getTime() - 14 * 3600e3), to: new Date(from.getTime() + 38 * 3600e3), limit: 120,
        });
        const onDay = turns.filter((t) => stamp(t.at, timeZone).includes(day));
        return onDay.length ? onDay.map((t) => `${line(t, timeZone)}  (chat ${t.conversation_id})`).join('\n') : `No messages on ${day}.`;
      }
      const query = String(args?.query || '').slice(0, 300);
      if (!query.trim()) return 'Give words to look for, a day, or a chat_id.';
      const matches = await turnStore.searchTurns(db, { userId, agentId, query, limit: 8 });
      if (!matches.length) return `No earlier messages about "${query}".`;
      return matches.map((t) => `${line(t, timeZone)}  (chat ${t.conversation_id})`).join('\n');
    },
  };
}
