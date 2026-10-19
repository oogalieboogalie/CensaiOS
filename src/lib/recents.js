// src/lib/recents.js
//
// Recents (pure helpers): the chats and windows a person touched last, and
// how a saved chat turns back into a chat window's messages.

const HIDDEN_KINDS = new Set(['agentCursor', 'cursor']);

/** Windows on this board, most recently touched first. */
export function windowsByTouch(wins = [], limit = 12) {
  return wins
    .filter((w) => w && w.id && !HIDDEN_KINDS.has(w.kind))
    .map((w) => ({ win: w, at: w.updatedAt || w.createdAt || null }))
    .filter((row) => row.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

/** The chat id a chat window is on right now (matches the server's default). */
export function chatIdOf(win) {
  return win?.chatId || (win?.id ? `chat:${win.id}` : null);
}

/** The chat window on this board that still shows this chat, if any. */
export function windowForChat(chat, wins = []) {
  return wins.find((w) => w.id === chat.windowId && chatIdOf(w) === chat.id) || null;
}

/** Saved messages (speaker, text, at) back to chat window messages. */
export function msgsFromTurns(turns = [], agentId) {
  return turns.map((t) => ({ from: t.speaker === 'person' ? 'me' : agentId, text: t.text, at: t.at }));
}

export function windowLabel(win) {
  const name = win.title || win.data?.title || win.agentName || win.kind || win.type || 'Window';
  return String(name);
}
