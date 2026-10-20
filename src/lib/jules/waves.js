// Wave-by-wave Jules runs (diagram 01). Tasks are grouped into waves
// (W1-T1 ... W1-T4, then wave 2). Every task in a wave goes to Jules, opens a
// PR and goes through review; a PR the review turns down gets a fix first.
// Wave 2 starts only when every PR in wave 1 is merged.
// Pure: shared by the overnight runner (scripts/jules-overnight.mjs) and the
// Jules Tasks window.

const WAVE_TAG = /\bW(\d{1,2})-T\d{1,2}\b/i;
const BUCKETS = ['dispatched', 'inflight', 'blocked', 'pending'];

/** The wave a task belongs to: a "Wave: 2" line in its brief, or a W2-T3 tag in its title. Null when it has none. */
export function waveNumber(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const direct = Number(entry.wave);
  if (Number.isInteger(direct) && direct > 0 && direct < 100) return direct;
  const tagged = String(entry.title || entry.brief || '').match(WAVE_TAG);
  return tagged ? Number(tagged[1]) : null;
}

/** Read "Wave: 2" from a brief's text. */
export function briefWave(text) {
  const value = Number(String(text || '').match(/^Wave:\s*(\d{1,2})\b/im)?.[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Where one task stands, in the diagram's words. */
export function taskStage(entry, bucket) {
  if (bucket === 'dispatched') return /merged|complete|shipped/i.test(entry?.status || 'merged') ? 'merged' : 'with-jules';
  if (bucket === 'blocked') return 'needs-fix';
  if (bucket === 'pending') return entry?.dispatchable === false ? 'needs-split' : 'waiting';
  if (!entry?.prNumber) return 'with-jules';
  const outcome = String(entry.lastDecision?.outcome || '');
  if (entry.checkState === 'red' || entry.repairPending || /fix|repair|changes/i.test(outcome)) return 'fixing';
  return 'in-review';
}

export const STAGE_WORDS = Object.freeze({
  waiting: 'waiting its turn',
  'needs-split': 'too big, split it first',
  'with-jules': 'Jules is working',
  'in-review': 'PR open, in review',
  fixing: 'review said no, being fixed',
  'needs-fix': 'stuck, needs a fix',
  merged: 'merged',
});

function waveState(tasks) {
  if (tasks.every((task) => task.stage === 'merged')) return 'merged';
  if (tasks.some((task) => task.stage === 'needs-fix' || task.stage === 'needs-split')) return 'needs-fix';
  if (tasks.some((task) => ['with-jules', 'in-review', 'fixing'].includes(task.stage))) return 'running';
  return 'waiting';
}

/**
 * Every waved task in the queue, grouped into waves in order, each task
 * labelled W<wave>-T<n>. `current` is the first wave not fully merged; waves
 * after it are locked until it is.
 */
export function buildWaves(queue = {}) {
  const byWave = new Map();
  for (const bucket of BUCKETS) {
    for (const raw of Array.isArray(queue[bucket]) ? queue[bucket] : []) {
      const entry = typeof raw === 'string' ? { brief: raw } : raw;
      const wave = waveNumber(entry);
      if (!wave) continue;
      if (!byWave.has(wave)) byWave.set(wave, []);
      byWave.get(wave).push({ ...entry, bucket, stage: taskStage(entry, bucket) });
    }
  }
  const numbers = [...byWave.keys()].sort((a, b) => a - b);
  const current = numbers.find((n) => waveState(byWave.get(n)) !== 'merged') || null;
  const waves = numbers.map((number) => {
    const tasks = byWave.get(number).map((task, i) => ({ ...task, label: `W${number}-T${i + 1}` }));
    const state = waveState(tasks);
    const locked = current !== null && number > current;
    return { number, tasks, state: locked ? 'locked' : state, merged: tasks.filter((t) => t.stage === 'merged').length };
  });
  return { waves, current };
}

/** One plain line about a wave, for the window and the runner's log. */
export function waveSummary(wave) {
  const left = wave.tasks.length - wave.merged;
  if (wave.state === 'merged') return `Wave ${wave.number}: all ${wave.tasks.length} merged.`;
  if (wave.state === 'locked') return `Wave ${wave.number}: starts when wave ${wave.number - 1} is all merged.`;
  if (wave.state === 'needs-fix') {
    const stuck = wave.tasks.filter((t) => t.stage === 'needs-fix' || t.stage === 'needs-split').map((t) => t.label);
    return `Wave ${wave.number}: ${stuck.join(', ')} need${stuck.length === 1 ? 's' : ''} a fix before wave ${wave.number + 1} can start.`;
  }
  return `Wave ${wave.number}: ${wave.merged} of ${wave.tasks.length} merged, ${left} still going.`;
}

/**
 * Which pending task the runner may send to Jules next. Waved work comes
 * first and only from the current wave; tasks with no wave go once every
 * wave is merged. Returns { index, reason } (index -1 means wait).
 */
export function pickWaveDispatch(pending = [], queue = {}) {
  const ready = (entry) => entry && (typeof entry === 'string' || entry.dispatchable !== false);
  const { waves, current } = buildWaves({ ...queue, pending });
  if (current === null) {
    const index = pending.findIndex((entry) => ready(entry) && !waveNumber(entry));
    return { index, reason: index < 0 ? 'Nothing is ready to send.' : 'No waves waiting; sending the next task.' };
  }
  const index = pending.findIndex((entry) => ready(entry) && waveNumber(entry) === current);
  if (index >= 0) return { index, reason: `Sending the next task in wave ${current}.` };
  return { index: -1, reason: waveSummary(waves.find((wave) => wave.number === current)) };
}
