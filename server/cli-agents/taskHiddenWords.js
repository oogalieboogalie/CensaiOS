// The words a teammate never sees anywhere in a coding agent's task: those
// that look like a key, a password or a token (server/cli-agents/hiddenWords.js)
// in what they could not see in it (server/cli-agents/ownerOnlySteps.js),
// worked out again only when the task changes.

import { linkLoginWords, secretLookingWords, stepTexts } from './hiddenWords.js';
import { ownerOnlyStepPath, taskForTeammate, touchesOwnerOnly } from './ownerOnlySteps.js';
import { linesCut } from './teammateOutput.js';

// Words gathered per task at most.
const MAX_HIDDEN = 500;

/** Adds secretLookingWords of `texts` to `into` ({ values, tokens }). */
function gather(into, texts, options) {
  for (const text of texts) {
    const { values, tokens } = secretLookingWords(text, options);
    into.values.push(...values);
    into.tokens.push(...tokens);
  }
  return into;
}

/** Of the lines a teammate does not see in `text`, the words that look like a key: only settings' and links' values on a line from a hidden folder's file. */
function cutWords(into, text, { root, said = false }) {
  const cut = linesCut(text, { root, said, ownerOnly: (p) => ownerOnlyStepPath(p, { root }) });
  const keys = new Set(cut.length ? linesCut(text, { root, said, ownerOnly: (p) => ownerOnlyStepPath(p, { root, keysOnly: true }) }) : []);
  gather(into, [cut.filter((line) => keys.has(line)).join('\n')], { root });
  return gather(into, [cut.filter((line) => !keys.has(line)).join('\n')], { root, settingsOnly: true });
}

/**
 * The words of one step a teammate does not see that look like a key, a
 * password or a token ({ values, tokens }): every word of a step on such a
 * file, only settings' and links' values when it reaches only a hidden folder;
 * of another, those of the lines cut from what it printed or said, and the
 * login of each link in it.
 */
function unseenWords(item, root) {
  const into = { values: [], tokens: [] };
  if (touchesOwnerOnly(item, root)) return gather(into, stepTexts(item), { root, settingsOnly: !touchesOwnerOnly(item, root, { keysOnly: true }) });
  if (item.output) cutWords(into, String(item.output), { root });
  if (typeof item.text === 'string') cutWords(into, item.text, { root, said: !item.printed });
  for (const text of stepTexts(item)) into.values.push(...linkLoginWords(text));
  return into;
}

// Worked out again only when a step or its task changes (its rev); a request's words never change.
const unseenOf = new WeakMap();
const hiddenOf = new WeakMap();

const wordsIn = (list) => (Array.isArray(list) ? list.filter((word) => typeof word === 'string' && word) : []);

function unseenWordsOnce(item, root) {
  const known = unseenOf.get(item);
  if (known && known.rev === item.rev && known.root === root) return known.words;
  const words = unseenWords(item, root);
  unseenOf.set(item, { rev: item.rev, root, words });
  return words;
}

/** The words a teammate could not see in `task` that look like a key, a password or a token, longest first. */
export function taskHiddenWords(task) {
  if (!task || typeof task !== 'object') return [];
  const root = task.worktree?.dir || '';
  const steps = [...(Array.isArray(task.items) ? task.items : []), ...(Array.isArray(task.permissions) ? task.permissions : [])]
    .filter((step) => step && typeof step === 'object');
  const known = hiddenOf.get(task);
  if (known && known.rev === task.rev && known.count === steps.length && known.summary === task.summary) return known.hidden;
  // A word stays hidden once it was, though its step falls off the end of a long transcript,
  // and so do the words hidden in the task that handed this one its changes, in their place.
  const handed = task.handoffHidden || {};
  const found = { values: [...wordsIn(handed.values), ...(known?.values || [])], tokens: [...wordsIn(handed.tokens), ...(known?.tokens || [])] };
  for (const step of steps) {
    const { values, tokens } = unseenWordsOnce(step, root);
    found.values.push(...values);
    found.tokens.push(...tokens);
  }
  if (typeof task.summary === 'string') cutWords(found, task.summary, { root });
  const values = [...new Set(found.values)];
  const tokens = [...new Set(found.tokens)];
  // Past MAX_HIDDEN, settings' and links' values come first: a pile of long words never crowds out a password.
  const hidden = [...new Set([...values, ...tokens])].slice(0, MAX_HIDDEN).sort((a, b) => b.length - a.length);
  hiddenOf.set(task, { rev: task.rev, count: steps.length, summary: task.summary, values, tokens, hidden });
  return hidden;
}

/** The words hidden in `task` as { values, tokens }, at most MAX_HIDDEN, for a task it hands its changes to. */
export function taskHiddenTiers(task) {
  taskHiddenWords(task);
  const { values = [], tokens = [] } = (task && typeof task === 'object' && hiddenOf.get(task)) || {};
  return { values: values.slice(0, MAX_HIDDEN), tokens: tokens.slice(0, Math.max(0, MAX_HIDDEN - values.length)) };
}

/** The words hidden in the task `manager` has under `id`, none when it has no such task. */
export function hiddenWordsOf(manager, id) {
  try {
    return taskHiddenWords(manager.get(id));
  } catch {
    return [];
  }
}

/** What a teammate reads as `task`'s summary, from the task itself (its steps say which words are hidden). */
export function teammateSummary(task) {
  if (typeof task?.summary !== 'string') return task?.summary ?? null;
  return taskForTeammate({ summary: task.summary, worktree: task.worktree }, { hidden: taskHiddenWords(task) }).summary;
}

/** For the task manager's list of tasks: each as a teammate sees it, with the words hidden in the task itself. */
export const listedForTeammate = (manager) => (listed) => taskForTeammate(listed, { hidden: hiddenWordsOf(manager, listed?.id) });
