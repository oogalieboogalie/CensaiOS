// The questions asked in a Research window, kept on the window as their own
// list (`researchAsks`, oldest first) so the board merges them one question
// at a time (src/lib/collaboration/windowLists.js). Inside `research` they
// were one piece, and when two people asked at the same moment only the last
// writer's copy stayed. Windows saved before keep their old `research.asks`
// (newest first) until the next question moves them over.

export const RESEARCH_ASKS_FIELD = 'researchAsks';
export const MAX_ASKS = 12;
// The server reads the first 1000 letters (server/research/service.js), so
// the board keeps no more than that of a question.
export const MAX_QUESTION = 1000;

export const clipQuestion = (text) => String(text ?? '').trim().slice(0, MAX_QUESTION);

/** The window's questions, oldest first. */
function asksOf(win = {}) {
  if (Array.isArray(win[RESEARCH_ASKS_FIELD])) return win[RESEARCH_ASKS_FIELD];
  return Array.isArray(win.research?.asks) ? [...win.research.asks].reverse() : [];
}

/** Newest first, as the Ask tab shows them. */
export const asksNewestFirst = (win) => [...asksOf(win)].reverse();

export function askEntry({ question, answer, by = null }) {
  return {
    id: `ask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    question: clipQuestion(question),
    answer: answer?.answer || '',
    sources: answer?.sources || [],
    usedWeb: Boolean(answer?.usedWeb),
    by,
    at: new Date().toISOString(),
  };
}

/** The window patch that adds one question, keeping the newest MAX_ASKS. */
export function withAsk(win, entry) {
  return { [RESEARCH_ASKS_FIELD]: [...asksOf(win), entry].slice(-MAX_ASKS) };
}
