// Finds shared words deep inside a window, by a path written with slashes:
// "leadBrief/market" is one box of a form, and
// "leadHound/result/leads/0/sequence/2/body" is Day 3's message of the first
// LeadHound lead. A number steps into a list, a name into a set of fields.
// Only words (a Y.Text) count: a path that ends anywhere else, or runs past
// the words, finds nothing. Read only: walking a path never changes the board.
import * as Y from 'yjs';

const MAX_STEPS = 8;
const INDEX = /^(0|[1-9]\d{0,5})$/;

/** The Y.Text at `path` inside a window's shared fields, or null. */
export function textAtPath(win, path) {
  if (!(win instanceof Y.Map) || typeof path !== 'string') return null;
  const steps = path.split('/');
  if (steps.length < 2 || steps.length > MAX_STEPS || steps.some((s) => !s)) return null;
  let node = win;
  for (const s of steps) {
    if (node instanceof Y.Map) node = node.has(s) ? node.get(s) : null;
    else if (node instanceof Y.Array && INDEX.test(s) && Number(s) < node.length) node = node.get(Number(s));
    else return null;
  }
  return node instanceof Y.Text ? node : null;
}
