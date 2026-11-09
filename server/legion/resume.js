// Legion: picking runs up after a restart. A run saves where it is while it
// works (state.json, server/legion/checkpoint.js). When the server starts,
// every run still marked running carries on from there: done jobs stay
// done, cut-off jobs go back on the queue, planning and the questions are
// skipped. A run is not picked up when it is more than a day old or a
// restart already cut it off MAX_RESUMES times (so a run that crashes the
// app cannot crash it forever); those end with a plain message instead.
import fs from 'node:fs/promises';
import path from 'node:path';
import { STATE_FILE } from './checkpoint.js';
import { cleanModelSpec } from './modelCall.js';
import { ROLE_IDS } from './roles.js';
import { parseSpecYaml } from './spec.js';
import { runningFor, runningLegions, startRun } from './runs.js';
import { legionRoot, readJson, runFolder, saveJson } from './workspace.js';

export const MAX_RESUMES = 2;
export const RESUME_WITHIN_MS = 24 * 60 * 60_000;
export const RESTARTED = 'The app restarted while this Legion was working. The files it made so far are kept.';
export const TOO_MANY = `The app restarted ${MAX_RESUMES} times while this Legion was working, so it was not picked up again. The files it made so far are kept.`;

/** The account a Legion's model calls run as. */
export async function legionAccount(userId) {
  try {
    const [{ dbReady }, { default: pool }, { userRole }] = await Promise.all([
      import('../dbState.js'), import('../db.js'), import('../security/systemAdmin.js'),
    ]);
    if (!dbReady()) return { userId, role: 'user' };
    return { userId, role: (await userRole(userId, { db: pool })) || 'user' };
  } catch {
    return { userId, role: 'user' };
  }
}

/** Every saved run still marked running, newest first: [{ id, dir, saved }]. */
async function savedRunning(root) {
  const found = [];
  const list = (dir) => fs.readdir(dir).catch(() => []);
  for (const user of await list(root)) {
    const ids = (await list(path.join(root, user))).filter((name) => /^\d[\w-]*$/.test(name));
    for (const id of ids) {
      const dir = path.join(root, user, id);
      const saved = await readJson(path.join(dir, 'run.json'));
      if (saved?.status === 'running') found.push({ id, dir, saved });
    }
  }
  return found.sort((a, b) => b.id.localeCompare(a.id));
}

/** Why a saved run cannot be picked up, or '' when it can. */
function whyNot({ id, dir, saved }, state, root, now) {
  if (!state || state.userId == null || runFolder(state.userId, id, root) !== dir) return RESTARTED;
  if (!(now - Date.parse(saved.startedAt) < RESUME_WITHIN_MS)) return RESTARTED;
  if ((Number(state.resumes) || 0) >= MAX_RESUMES) return TOO_MANY;
  if (typeof state.goal !== 'string' || !state.goal.trim()) return RESTARTED;
  if (ROLE_IDS.some((role) => !cleanModelSpec(state.models?.[role]))) return RESTARTED;
  if (runningFor(state.userId)) return RESTARTED; // one Legion per person
  return '';
}

/** End a saved run with a plain message, keeping its log. */
async function endSaved(dir, saved, error) {
  const events = Array.isArray(saved.events) ? saved.events : [];
  events.push({ at: Date.now(), type: 'end', status: 'error', error });
  await saveJson(path.join(dir, 'run.json'), { ...saved, status: 'error', error, endedAt: new Date().toISOString(), events });
}

/**
 * At server start: carry on every Legion a restart cut off. A damaged file
 * ends that one run, never the start-up. Returns [{ id, resumed, why }].
 */
export async function resumeLegions({ root = legionRoot(), now = Date.now(), accountFor = legionAccount, ...more } = {}) {
  const out = [];
  for (const found of await savedRunning(root)) {
    const { id, dir, saved } = found;
    if (runningLegions().some((run) => run.id === id)) continue;
    try {
      const state = await readJson(path.join(dir, STATE_FILE));
      const why = whyNot(found, state, root, now);
      if (why) {
        await endSaved(dir, saved, why);
        out.push({ id, resumed: false, why });
        continue;
      }
      await startRun({
        userId: state.userId, account: await accountFor(state.userId), goal: state.goal.trim(), root, ...more,
        models: Object.fromEntries(ROLE_IDS.map((role) => [role, cleanModelSpec(state.models[role])])),
        askFirst: state.askFirst !== false, selfEducate: state.selfEducate !== false,
        spec: parseSpecYaml(state.personSpecYaml).spec || null,
        resume: { id, startedAt: saved.startedAt, viewToken: /^[0-9a-f]{32}$/.test(saved.viewToken) ? saved.viewToken : undefined, events: Array.isArray(saved.events) ? saved.events : [], state },
      });
      out.push({ id, resumed: true, why: '' });
    } catch {
      await endSaved(dir, saved, RESTARTED).catch(() => {});
      out.push({ id, resumed: false, why: RESTARTED });
    }
  }
  return out;
}
