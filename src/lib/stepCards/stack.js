// Step cards: where a card's stack of steps stands. Only the top unfinished
// step is open; the ones under it stay locked. A check's dot turns green only
// from a result the server sent back after checking it (server/stepCards/
// verify.js), never from a click. When every dot on the top step is green the
// step is finished, drops off the stack, and the next one unlocks.
// Pure: no React, no fetch, so the tests and the board share it.

import { MAX_CHECKS, MAX_STEPS, checkWords } from './todoFile.js';

export const DOT_STATES = Object.freeze(['open', 'checking', 'passed', 'failed', 'unknown']);

const clip = (text, max) => String(text ?? '').trim().slice(0, max);

/** A card ready for a window's state, from a parsed or translated one. makeId: newId. */
export function makeCard(raw, makeId) {
  const steps = (Array.isArray(raw?.steps) ? raw.steps : []).slice(0, MAX_STEPS).map((step) => ({
    id: makeId(),
    title: clip(step.title, 160) || 'A step',
    text: clip(step.text, 1200),
    done: false,
    doneAt: null,
    checks: (Array.isArray(step.checks) ? step.checks : []).slice(0, MAX_CHECKS).map((check) => ({
      ...check,
      id: makeId(),
      words: checkWords(check),
      state: 'open',
      line: '',
    })),
  })).filter((step) => step.checks.length);
  return {
    id: makeId(),
    title: clip(raw?.title, 160) || 'A card',
    goal: clip(raw?.goal, 600),
    assignee: raw?.assignee || null,
    assigneeName: raw?.assigneeName || null,
    steps,
    createdAt: new Date().toISOString(),
  };
}

export const stepsLeft = (card) => (card?.steps || []).filter((step) => !step.done);

/** The open step: the first one not finished, or null when the card is finished. */
export function topStep(card) {
  return stepsLeft(card)[0] || null;
}

export function cardFinished(card) {
  return Boolean(card?.steps?.length) && !topStep(card);
}

export function allGreen(step) {
  return Boolean(step?.checks?.length) && step.checks.every((check) => check.state === 'passed');
}

/** "Step 2 of 5", for the top tab. */
export function stepPosition(card, step) {
  const index = (card?.steps || []).findIndex((s) => s.id === step?.id);
  return index < 0 ? '' : `Step ${index + 1} of ${card.steps.length}`;
}

/**
 * Put the server's results on the top step. results: [{ id, ok: true|false|null, line }].
 * ok true is the only way a dot turns green. Returns a new card; when every dot is green
 * the step is marked done (it leaves the stack) and the next one is open.
 * Results for any step but the top one are ignored: a locked step cannot be checked.
 */
export function applyResults(card, stepId, results, now = () => new Date().toISOString()) {
  const top = topStep(card);
  if (!top || top.id !== stepId) return card;
  const byId = new Map((Array.isArray(results) ? results : []).map((r) => [r.id, r]));
  const checks = top.checks.map((check) => {
    const result = byId.get(check.id);
    if (!result) return check.state === 'checking' ? { ...check, state: 'open' } : check;
    const state = result.ok === true ? 'passed' : result.ok === false ? 'failed' : 'unknown';
    return { ...check, state, line: clip(result.line, 300) };
  });
  const step = { ...top, checks };
  if (allGreen(step)) Object.assign(step, { done: true, doneAt: now() });
  return { ...card, steps: card.steps.map((s) => (s.id === stepId ? step : s)) };
}

/** Mark the top step's checks as being checked (the dots pulse), before the server answers. */
export function markChecking(card, stepId, checkIds = null) {
  const top = topStep(card);
  if (!top || top.id !== stepId) return card;
  const wanted = checkIds ? new Set(checkIds) : null;
  const checks = top.checks.map((check) => (check.state !== 'passed' && (!wanted || wanted.has(check.id)) ? { ...check, state: 'checking' } : check));
  return { ...card, steps: card.steps.map((s) => (s.id === stepId ? { ...top, checks } : s)) };
}

/** A window's saved cards, cleaned: anything malformed is dropped, a reload never half-ticks a dot. */
export function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.filter((card) => card && card.id && Array.isArray(card.steps)).map((card) => ({
    ...card,
    steps: card.steps.filter((s) => s && s.id && Array.isArray(s.checks)).map((step) => ({
      ...step,
      // A check that was running when the page closed never finished: it is open again.
      checks: step.checks.map((check) => (check.state === 'checking' ? { ...check, state: 'open' } : check)),
    })),
  }));
}

/** The helper's work order for one step: what to do and exactly what will be checked. */
export function stepPrompt(card, step) {
  const checks = step.checks.map((check) => `- ${check.words || checkWords(check)}`).join('\n');
  return [
    `Card: ${card.title}`,
    card.goal ? `Goal: ${card.goal}` : null,
    '',
    `${stepPosition(card, step)}: ${step.title}`,
    step.text || null,
    '',
    'censaiOS will check these before this step counts as finished:',
    checks,
    '',
    'Do only this step in this project, then say in plain words what you changed and how each check above is met.',
  ].filter((line) => line != null).join('\n');
}
