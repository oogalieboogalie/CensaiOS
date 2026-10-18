import { modelTable, leaders } from '../modelArena/benchmarks.js';
import { taskById } from '../modelArena/benchmarkTasks.js';
import { FAMILIES, FAMILY_ROUTES, STRENGTHS, classifyTask, familyOf, familyName } from './strengths.js';

const LIST_POINTS = 2; // per give-away phrase, for a strength on Alex's list
const BENCH_FAST_RIGHT = 1.5; // fastest right answer on this kind of task
const BENCH_PICKED = 0.5; // picked best most often on this kind of task

/** Runs of premade Arena tasks of one kind (Code, Writing, Data, Reasoning). */
export function runsOfKind(runs, kind) {
  return (Array.isArray(runs) ? runs : []).filter((run) => taskById(run?.task)?.kind === kind);
}

/** The first way to reach a family with a key, and which model to use there. */
function routeFor(family, keys, wantsSpeed) {
  const route = (FAMILY_ROUTES[family] || []).find((r) => keys.has(r.provider));
  if (!route) return null;
  return { provider: route.provider, model: (wantsSpeed && route.fast) || route.model };
}

/** What the Arena measured for this kind of task: points and a sentence per family or model. */
function benchmarkEvidence(runs, kind, keys) {
  if (!kind) return { points: new Map(), notes: new Map(), models: new Map() };
  const table = modelTable(runsOfKind(runs, kind)).filter((row) => keys.has(row.provider));
  const lead = leaders(table);
  const points = new Map();
  const notes = new Map();
  const models = new Map();
  const credit = (rowId, amount, note) => {
    const row = table.find((r) => r.id === rowId);
    if (!row) return;
    const key = familyOf(row.provider, row.model) || row.id;
    points.set(key, (points.get(key) || 0) + amount);
    if (!notes.has(key)) notes.set(key, `${note} on your ${kind} benchmarks (${row.model}, ${row.runs} run${row.runs === 1 ? '' : 's'})`);
    if (!models.has(key)) models.set(key, { provider: row.provider, model: row.model });
  };
  credit(lead.fastRight, BENCH_FAST_RIGHT, 'Fastest right answer');
  credit(lead.picked, BENCH_PICKED, 'Picked best most often');
  return { points, notes, models };
}

/**
 * Pick the model best suited to a task, from Alex's strengths list and what
 * the Arena benchmarks measured. Only models the person has a key for are
 * picked. Returns { provider, model, family, strength, why, changed } or
 * { keep: true, why } when nothing fits better than the current model.
 *
 * - text: the task (the message about to be sent)
 * - keyProviders: providers the person has a key for
 * - runs: the board's Benchmarks runs (may be empty)
 * - current: { provider, model } the chat is on now
 */
export function autoPickModel({ text, keyProviders = [], runs = [], current = {} } = {}) {
  const keys = new Set(keyProviders);
  const hits = classifyTask(text);
  const currentFamily = familyOf(current.provider, current.model);
  if (!hits.length) {
    return { keep: true, why: 'Nothing in this message points to one strength, so it stays on the current model.' };
  }
  const top = STRENGTHS[hits[0].id];
  const wantsSpeed = hits.some((h) => h.id === 'speed');
  const bench = benchmarkEvidence(runs, top.kind, keys);

  const scored = FAMILIES.map((family, order) => {
    const matched = hits.filter((h) => family.strengths.includes(h.id));
    const listScore = matched.reduce((sum, h) => sum + h.score * LIST_POINTS, 0);
    const score = listScore + (bench.points.get(family.id) || 0);
    return { family: family.id, order, matched, score, route: routeFor(family.id, keys, wantsSpeed) };
  }).sort((a, b) => (b.score - a.score)
    || ((b.family === currentFamily) - (a.family === currentFamily))
    || (a.order - b.order));

  const best = scored[0];
  const pick = scored.find((s) => s.score > 0 && s.route);
  if (!pick) {
    const missing = best.score > 0 ? `${familyName(best.family)} is best at ${top.label} on your list, but there is no ${familyName(best.family)} key yet` : 'No model on your list fits this';
    return { keep: true, why: `${missing}, so it stays on the current model.` };
  }

  // A model the benchmarks measured inside the picked family wins over the default one.
  const measured = bench.models.get(pick.family);
  const target = measured && keys.has(measured.provider) && !wantsSpeed ? measured : pick.route;
  const strength = STRENGTHS[(pick.matched[0] || hits[0]).id];
  const reasons = [];
  if (pick.matched.length) {
    reasons.push(`Your strengths list says ${familyName(pick.family)} is best at ${pick.matched.map((h) => STRENGTHS[h.id].label).join(' and ')}.`);
  }
  if (bench.notes.has(pick.family)) reasons.push(`${bench.notes.get(pick.family)}.`);
  if (best !== pick && best.score > pick.score) {
    reasons.push(`${familyName(best.family)} fits better, but there is no ${familyName(best.family)} key yet.`);
  }
  return {
    provider: target.provider,
    model: target.model,
    family: pick.family,
    strength: strength.label,
    why: reasons.join(' '),
    changed: target.provider !== current.provider || target.model !== current.model,
  };
}
