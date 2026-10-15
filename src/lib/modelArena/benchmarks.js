// Recorded arena runs ("benchmarks"): what was asked, how each model did,
// and which answer the person marked best or right. Records live on the
// board, in the Benchmarks window, so teammates see them live. Nothing here
// leaves this censaiOS; see docs/specs/15-arena-benchmarks.md for the
// future opt-in share format. Pure data and math, so it can be tested.
import { CUT_OFF_REASONS, estimateCost, tokensPerSecond } from './arenaCatalog.js';
import { taskById } from './benchmarkTasks.js';

// Every record is synced to everyone on the board, so keep them modest.
export const MAX_RUNS = 30;
export const SAVED_PROMPT_LIMIT = 4_000;
export const SAVED_REPLY_LIMIT = 2_000;
export const MARKS = Object.freeze(['right', 'wrong']);

const clip = (text, limit) => String(text || '').slice(0, limit);
const newId = () => `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const emptyMarks = () => ({ best: null, lanes: {}, judge: null });

/** Keeps only marks that make sense for this many lanes. */
export function cleanMarks(marks, laneCount) {
  const base = emptyMarks();
  if (!marks || typeof marks !== 'object') return base;
  const inRange = (i) => Number.isInteger(i) && i >= 0 && i < laneCount;
  if (inRange(marks.best)) base.best = marks.best;
  Object.entries(marks.lanes || {}).forEach(([key, value]) => {
    if (inRange(Number(key)) && MARKS.includes(value)) base.lanes[Number(key)] = value;
  });
  const judge = marks.judge;
  if (judge && inRange(judge.best) && typeof judge.model === 'string') {
    base.judge = { model: judge.model.slice(0, 120), best: judge.best, reason: clip(judge.reason, 400) };
  }
  return base;
}

/** One lane's numbers as they are kept in a record. */
function laneRecord(lane, result = {}) {
  const usage = result.usage || null;
  // An answer cut off at its length limit never finished, so it keeps no
  // finish time and can never count as right.
  const cutOff = result.status === 'done' && CUT_OFF_REASONS.has(result.finishReason);
  return {
    provider: lane.provider,
    model: lane.model,
    status: result.status || 'stopped',
    firstTokenMs: Number.isFinite(result.firstTokenMs) ? result.firstTokenMs : null,
    totalMs: result.status === 'done' && !cutOff && Number.isFinite(result.totalMs) ? result.totalMs : null,
    ...(cutOff ? { cutOff: true } : {}),
    usage: usage ? { input: usage.input || 0, output: usage.output || 0, ...(usage.estimated ? { estimated: true } : {}) } : null,
    cost: estimateCost(lane.provider, lane.model, usage),
    tokensPerSecond: tokensPerSecond(result),
    text: clip(result.text, SAVED_REPLY_LIMIT),
    ...(result.status === 'error' ? { error: clip(result.error?.message, 300) } : {}),
  };
}

/**
 * Turns a finished race into a record for the Benchmarks window. `task` is
 * the premade benchmark task's id; a typed-in request has none and is kept
 * as the person's own note, never ranked.
 */
export function makeRecord({ prompt, system, lanes, results, marks, task = null, at = new Date().toISOString() }) {
  return {
    id: newId(),
    at,
    prompt: clip(prompt, SAVED_PROMPT_LIMIT),
    system: clip(system, SAVED_PROMPT_LIMIT),
    ...(task ? { task, taskVersion: taskById(task)?.version || 1 } : {}),
    lanes: lanes.map((lane, i) => laneRecord(lane, results[i])),
    marks: cleanMarks(marks, lanes.length),
  };
}

/** Newest first, capped, so the board stays light. */
export function addRecord(runs, record) {
  const list = Array.isArray(runs) ? runs.filter((r) => r?.id !== record.id) : [];
  return [record, ...list].slice(0, MAX_RUNS);
}

export function updateRecordMarks(runs, id, marks) {
  if (!Array.isArray(runs)) return [];
  return runs.map((r) => (r?.id === id ? { ...r, marks: cleanMarks(marks, r.lanes?.length || 0) } : r));
}

export function removeRecord(runs, id) {
  return Array.isArray(runs) ? runs.filter((r) => r?.id !== id) : [];
}

function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

const average = (values) => {
  const list = values.filter(Number.isFinite);
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
};

// A lane counts as "right" when a person marked it right, or picked it
// as best without marking it wrong, and it was not cut off.
const isRight = (marks, index, lane) => !lane.cutOff
  && (marks.lanes[index] === 'right' || (marks.best === index && marks.lanes[index] !== 'wrong'));

/** Only runs of a premade task are ranked, so every model faced the same job. */
export const isRanked = (run) => Boolean(run?.task && taskById(run.task)
  && (run.taskVersion || 1) === taskById(run.task).version);

/**
 * One row per model across every recorded run: how often it raced, was
 * picked best (by a person, or by the judge), was marked right or wrong,
 * and its typical speed and cost. The headline is "fast and right": the
 * typical finish time counting only answers that were right, so a fast
 * model with wrong answers does not win. Sorted by that, then by picks.
 * Only premade-task runs count; pass `task` to look at one task alone.
 */
export function modelTable(runs, { task = null } = {}) {
  const rows = new Map();
  (Array.isArray(runs) ? runs : []).filter((run) => isRanked(run) && (!task || run.task === task)).forEach((run) => {
    const marks = cleanMarks(run?.marks, run?.lanes?.length || 0);
    (run?.lanes || []).forEach((lane, index) => {
      const id = `${lane.provider}:${lane.model}`;
      if (!rows.has(id)) {
        rows.set(id, { id, provider: lane.provider, model: lane.model, runs: 0, errors: 0, picks: 0, judgePicks: 0, right: 0, wrong: 0, first: [], total: [], rightTotal: [], speed: [], cost: [] });
      }
      const row = rows.get(id);
      row.runs += 1;
      if (lane.status === 'error') row.errors += 1;
      if (marks.best === index) row.picks += 1;
      if (marks.judge?.best === index) row.judgePicks += 1;
      if (isRight(marks, index, lane)) { row.right += 1; row.rightTotal.push(lane.totalMs); }
      if (marks.lanes[index] === 'wrong' || (lane.cutOff && marks.lanes[index] === 'right')) row.wrong += 1;
      row.first.push(lane.firstTokenMs);
      row.total.push(lane.totalMs);
      row.speed.push(lane.tokensPerSecond);
      row.cost.push(lane.cost);
    });
  });
  return [...rows.values()].map(({ first, total, rightTotal, speed, cost, ...row }) => {
    const marked = row.right + row.wrong;
    return {
      ...row,
      accuracy: marked ? row.right / marked : null,
      medianFirstMs: median(first),
      medianTotalMs: median(total),
      fastRightMs: median(rightTotal),
      averageSpeed: average(speed),
      averageCost: average(cost),
    };
  }).sort((a, b) => ((a.fastRightMs ?? Infinity) - (b.fastRightMs ?? Infinity)) || (b.picks - a.picks)
    || ((a.medianTotalMs ?? Infinity) - (b.medianTotalMs ?? Infinity)));
}

/** The model ahead on each measure, once at least two models have raced. */
export function leaders(table) {
  if (!Array.isArray(table) || table.length < 2) return {};
  const lowest = (key) => {
    const scored = table.filter((row) => Number.isFinite(row[key]));
    return scored.length ? scored.reduce((best, row) => (row[key] < best[key] ? row : best)).id : null;
  };
  const highest = (key, floor = 1) => {
    const scored = table.filter((row) => Number.isFinite(row[key]) && row[key] >= floor);
    return scored.length ? scored.reduce((best, row) => (row[key] > best[key] ? row : best)).id : null;
  };
  return {
    fastRight: lowest('fastRightMs'),
    firstWord: lowest('medianFirstMs'),
    finish: lowest('medianTotalMs'),
    cheapest: lowest('averageCost'),
    picked: highest('picks'),
    accurate: highest('accuracy', Number.MIN_VALUE),
  };
}
