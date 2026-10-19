// server/agentMemory/recallTurns.js
//
// The time-aware parts of the memory block (pure, no database):
//
//   Right now                   the current time, and how long ago the
//                               person last wrote and the agent last replied
//   Where you left off          the end of the last chat, word for word
//   Earlier conversations       the actual messages that match the question,
//                               with the time of each and how that chat ended
//
// Nothing here is a generated summary: every line is a real message with the
// time it was sent, clipped only when it is very long.

import { gapWords, stamp } from '../../src/lib/agentMemory/timeWords.js';

const MAX_TURN = 500;
const MAX_CHATS = 3;

function clip(text, max = MAX_TURN) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

export function turnLine(turn, timeZone) {
  const who = turn.speaker === 'agent' ? 'You' : 'Person';
  return `  [${stamp(turn.at, timeZone)}] ${who}: ${clip(turn.text)}`;
}

/** Times of the earlier messages in the chat being answered (from the run's message list). */
export function chatClock(messages = [], { agentId = null } = {}) {
  const timed = (messages || []).filter((m) => m?.at && m.from !== 'system' && !Number.isNaN(new Date(m.at).getTime()));
  const mine = timed.filter((m) => m.from === 'me');
  const current = mine[mine.length - 1] || null;
  const previous = mine[mine.length - 2] || null;
  const replies = timed.filter((m) => m.from !== 'me' && (!agentId || m.from === agentId || m.from === 'agent'));
  const lastReply = [...replies].reverse().find((m) => !current || new Date(m.at) <= new Date(current.at)) || null;
  return { currentAt: current?.at || null, previousAt: previous?.at || null, lastReplyAt: lastReply?.at || null };
}

export function nowSection({ now = new Date(), timeZone, clock = {} } = {}) {
  const lines = ['## Right now', `It is ${stamp(now, timeZone)}.`];
  if (clock.currentAt) lines.push(`The person sent their newest message at ${stamp(clock.currentAt, timeZone)}.`);
  if (clock.previousAt && clock.currentAt) {
    lines.push(`Their message before that was at ${stamp(clock.previousAt, timeZone)}, ${gapWords(clock.previousAt, clock.currentAt)} earlier.`);
  }
  if (clock.lastReplyAt && clock.currentAt) {
    lines.push(`Your last reply in this chat was at ${stamp(clock.lastReplyAt, timeZone)}; they wrote back ${gapWords(clock.lastReplyAt, clock.currentAt)} later.`);
  }
  lines.push('Times in [brackets] at the start of messages were added by censaiOS when each message was sent. Use them to reason about time; do not write them in your reply.');
  return lines.join('\n');
}

/** The end of the most recent other chat, so the agent knows where things stood. */
export function leftOffSection(chat, turns = [], timeZone) {
  if (!chat || !turns.length) return '';
  const where = chat.workspace_name ? ` on the board "${chat.workspace_name}"` : '';
  return [
    `## Where you left off last time (the actual last messages${where})`,
    `That chat started ${stamp(chat.started_at, timeZone)} and its last message was ${stamp(chat.last_at, timeZone)}.`,
    ...turns.map((t) => turnLine(t, timeZone)),
  ].join('\n');
}

/**
 * Earlier chats that match the question. `chats` is
 * [{ conversationId, turns: [...], opening: turn|null, ending: turn|null }].
 */
export function exchangesSection(chats = [], timeZone) {
  const shown = chats.filter((c) => c.turns?.length).slice(0, MAX_CHATS);
  if (!shown.length) return '';
  const blocks = shown.map((chat) => {
    const first = chat.opening && !chat.turns.some((t) => String(t.id) === String(chat.opening.id)) ? chat.opening : null;
    const lines = [`- A chat from ${stamp((first || chat.turns[0]).at, timeZone)}:`];
    if (first) lines.push('  how that chat started:', turnLine(first, timeZone), `  … ${gapWords(first.at, chat.turns[0].at)} later:`);
    lines.push(...chat.turns.map((t) => turnLine(t, timeZone)));
    const lastShown = chat.turns[chat.turns.length - 1];
    if (chat.ending && String(chat.ending.id) !== String(lastShown.id)) {
      lines.push(`  … how that chat ended (${gapWords(lastShown.at, chat.ending.at)} later):`, turnLine(chat.ending, timeZone));
    }
    return lines.join('\n');
  });
  return [
    '## Earlier conversations that look related (the actual messages, with times; not a summary)',
    ...blocks,
    'To read a whole earlier chat, or the chats from a day, use recall_conversation.',
  ].join('\n');
}

/** Group matched messages by chat, best match first, one entry per chat. */
export function pickChats(matches = [], limit = MAX_CHATS) {
  const seen = new Set();
  const picked = [];
  for (const row of matches) {
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);
    picked.push(row);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Put "[Sat 2026-10-17 18:04:12 CDT] " in front of each timed message from the person. */
export function stampMessages(chatMessages, messages = [], timeZone) {
  if (!Array.isArray(chatMessages) || !Array.isArray(messages)) return chatMessages;
  // chatMessages[0] is the system message; the rest line up with `messages`.
  if (chatMessages.length !== messages.length + 1) return chatMessages;
  return chatMessages.map((cm, i) => {
    const m = i === 0 ? null : messages[i - 1];
    if (!m?.at || cm.role !== 'user') return cm;
    const label = stamp(m.at, timeZone);
    if (!label) return cm;
    if (typeof cm.content === 'string') return { ...cm, content: `[${label}] ${cm.content}` };
    if (Array.isArray(cm.content)) return { ...cm, content: [{ type: 'text', text: `[${label}]` }, ...cm.content] };
    return cm;
  });
}
