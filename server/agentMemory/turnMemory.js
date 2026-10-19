// server/agentMemory/turnMemory.js
//
// Loads the real earlier messages an agent sees before it answers: the end of
// the last other chat ("where you left off") and the chats whose messages
// share words with the question, each with the messages around the match and
// how that chat started and ended. Returns the two memory-block sections as text.

import { exchangesSection, leftOffSection, pickChats } from './recallTurns.js';
import * as turnStore from './turns.js';

export async function loadTurnMemory(db, { userId, agentId, question, conversationId, timeZone }) {
  const [recent, matches] = await Promise.all([
    turnStore.recentConversations(db, { userId, agentId, exclude: conversationId, limit: 1 }),
    question
      ? turnStore.searchTurns(db, { userId, agentId, query: question, excludeConversation: conversationId, limit: 12 })
      : [],
  ]);
  const lastChat = recent[0] || null;
  const picked = pickChats(matches);
  const [leftOffTurns, chats] = await Promise.all([
    lastChat ? turnStore.lastTurns(db, { userId, conversationId: lastChat.conversation_id, limit: 4 }) : [],
    Promise.all(picked.map(async (match) => {
      const [turns, ending, opening] = await Promise.all([
        turnStore.turnsAround(db, { userId, conversationId: match.conversation_id, at: match.at }),
        turnStore.lastTurns(db, { userId, conversationId: match.conversation_id, limit: 1 }),
        turnStore.conversationTurns(db, { userId, conversationId: match.conversation_id, limit: 1 }),
      ]);
      return { conversationId: match.conversation_id, turns, ending: ending[0] || null, opening: opening[0] || null };
    })),
  ]);
  const leftOff = leftOffSection(lastChat, leftOffTurns, timeZone);
  const exchanges = exchangesSection(chats, timeZone);
  return { found: Boolean(leftOff || exchanges), leftOff, exchanges };
}
