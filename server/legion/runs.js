// Legion: running and remembering runs. A run lives in memory while it works
// (the window polls its events) and is saved as run.json in its folder when
// it ends, so the window can show it again after a restart.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROLE_IDS } from './roles.js';
import { cleanModelSpec } from './modelCall.js';
import { runLegion } from './loop.js';
import { parseSpecYaml } from './spec.js';
import { openMemory } from './memory.js';
import { legionRoot, makeRunFolders, pastLessons, readJson, runFolder, saveJson } from './workspace.js';

const live = new Map();
const MAX_EVENTS = 5000;
export const QUESTION_WAIT_MS = 10 * 60_000;

/** Web search with the person's own Tavily key; [] when they have none. */
async function webSearch(userId, query) {
  const { createTavilyClient, resolveTavilyKey } = await import('../leadhound/tavily.js');
  const { apiKey, source } = await resolveTavilyKey(userId);
  // Only the person's own key: never spend the server's Tavily credits.
  if (!apiKey || source !== 'byok') return [];
  const { results } = await createTavilyClient(apiKey, { purpose: 'let the Legion search the web' }).searchFull(query, { maxResults: 4 });
  return results.map((r) => ({ title: String(r.title || '').slice(0, 200), content: String(r.content || '').slice(0, 600) }));
}

/** Wait for the person to answer the team's questions ('' = let the team decide). */
function waitForAnswer(run, signal, waitMs) {
  return new Promise((resolve) => {
    const done = (text) => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      run.answer = null;
      resolve(text);
    };
    const onAbort = () => done('');
    const timer = setTimeout(() => done(''), waitMs);
    timer.unref?.();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    run.answer = done;
  });
}

/** Checks a start request. Returns { error } or { goal, models }. */
export function parseStart(body = {}) {
  const typed = typeof body.goal === 'string' ? body.goal.trim().slice(0, 4000) : '';
  // A YAML spec is optional: with one, the Orchestrator Engine skips planning.
  const parsed = parseSpecYaml(body.specYaml, typed);
  if (parsed.error) return { error: parsed.error };
  const spec = parsed.spec || null;
  const goal = typed || spec?.goal || '';
  if (!goal) return { error: 'Say what the Legion should build.' };
  const askFirst = body.askQuestions !== false;
  const selfEducate = body.selfEducate !== false;
  const fallback = cleanModelSpec(body.model);
  const models = {};
  for (const role of ROLE_IDS) {
    const picked = cleanModelSpec(body.models?.[role]) || fallback;
    if (!picked) return { error: 'Pick a model for the Legion (one for everyone, or one per role).' };
    models[role] = picked;
  }
  return { goal, models, askFirst, spec, selfEducate };
}

const summary = (run) => ({
  id: run.id, goal: run.goal, models: run.models, status: run.status, viewToken: run.viewToken, waitingForAnswer: typeof run.answer === 'function', startedAt: run.startedAt, endedAt: run.endedAt || null,
  error: run.error || null, commit: run.outcome?.commit || null, verdict: run.outcome?.verdict?.verdict || null,
});

/** Every Legion working right now, for the update check (server/appUpdate/busy.js). */
export function runningLegions() {
  return [...live.values()].filter((run) => run.status === 'running');
}

export function runningFor(userId) {
  return [...live.values()].find((run) => run.userId === userId && run.status === 'running') || null;
}

/** Start a Legion in the background. Returns the run's summary. */
export async function startRun({
  userId, account, goal, models, askFirst = true, spec = null, selfEducate = true, root = legionRoot(), runner = runLegion,
  search = (query) => webSearch(userId, query), waitMs = QUESTION_WAIT_MS,
}) {
  forgetFinishedRuns();
  const id = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = runFolder(userId, id, root);
  const controller = new AbortController();
  // In the list before the first await, so a double click cannot start two.
  const run = {
    id, userId, goal, models, dir, status: 'running', startedAt: new Date().toISOString(), events: [], controller,
    viewToken: crypto.randomBytes(16).toString('hex'), saving: Promise.resolve(), saved: false,
  };
  live.set(id, run);
  const save = () => {
    run.saving = run.saving
      .then(() => saveJson(path.join(dir, 'run.json'), { ...summary(run), reflection: run.outcome?.reflection || null, events: run.events }))
      .catch(() => undefined);
    return run.saving;
  };
  const emit = (event) => {
    if (run.events.length < MAX_EVENTS) run.events.push({ at: Date.now(), ...event });
    // Saved at every step, so a restart keeps the log so far.
    if (event.type === 'phase') save();
  };
  try {
    await makeRunFolders(dir);
  } catch (error) {
    live.delete(id);
    throw error;
  }
  save();
  const lessons = await pastLessons(path.dirname(dir));
  run.done = Promise.resolve()
    .then(() => runner({
      goal, models, account, dir, emit, signal: controller.signal, lessons, search, spec, selfEducate, memory: openMemory(path.dirname(dir)),
      askPerson: (questions, signal) => (askFirst ? waitForAnswer(run, signal, waitMs) : ''),
    }))
    .then((outcome) => { run.outcome = outcome; run.status = outcome.status; })
    .catch((error) => {
      run.status = error.stopped ? 'stopped' : 'error';
      run.error = error.stopped ? null : String(error.message || error).slice(0, 400);
    })
    .then(async () => {
      run.endedAt = new Date().toISOString();
      emit({ type: 'end', status: run.status, error: run.error || null });
      await save();
      run.saved = true;
    });
  return summary(run);
}

/** A run's summary and its events after `after`, for the person who owns it. */
export async function readRun({ userId, id, after = 0, root = legionRoot() }) {
  const run = live.get(id);
  if (run && run.userId === userId) return { ...summary(run), events: run.events.slice(after), next: run.events.length };
  const saved = await readJson(path.join(runFolder(userId, id, root), 'run.json'));
  if (!saved) return null;
  const events = Array.isArray(saved.events) ? saved.events : [];
  if (saved.status === 'running') {
    // Saved mid-run, and the app restarted before it finished.
    const error = 'The app restarted while this Legion was working. The files it made so far are kept.';
    events.push({ type: 'end', status: 'error', error });
    Object.assign(saved, { status: 'error', error });
  }
  return { ...saved, events: events.slice(after), next: events.length };
}

/** The person's answer to the team's questions ('' lets the team decide). */
export function answerRun({ userId, id, text }) {
  const run = live.get(id);
  if (!run || run.userId !== userId || typeof run.answer !== 'function') return false;
  run.answer(typeof text === 'string' ? text.trim().slice(0, 3000) : '');
  return true;
}

export function stopRun({ userId, id }) {
  const run = live.get(id);
  if (!run || run.userId !== userId || run.status !== 'running') return false;
  run.controller.abort();
  return true;
}

/** Newest runs first, without their events. */
export async function listRuns({ userId, limit = 12, root = legionRoot() }) {
  const userDir = path.dirname(runFolder(userId, 'x', root));
  let ids = [];
  try { ids = (await fs.readdir(userDir)).filter((name) => /^\d/.test(name)).sort().reverse().slice(0, limit); } catch { return []; }
  const out = [];
  for (const id of ids) {
    const run = live.get(id);
    if (run) { out.push(summary(run)); continue; }
    const saved = await readJson(path.join(userDir, id, 'run.json'));
    if (saved) out.push({ ...saved, events: undefined, reflection: undefined });
  }
  return out;
}

/** The absolute path of a file in a run's folder, or null. */
export function runFilePath({ userId, id, kind, rel, root = legionRoot() }) {
  const base = path.join(runFolder(userId, id, root), kind === 'shot' ? 'shots' : 'project');
  const target = path.resolve(base, String(rel || ''));
  return target.startsWith(base + path.sep) ? target : null;
}

export function forgetFinishedRuns() {
  for (const [id, run] of live) if (run.saved) live.delete(id);
}

/**
 * A built file for the "Open what it built" link. The link carries the run's
 * secret view token instead of a sign-in, because the page is shown in a
 * sandbox that sends no cookies. Returns the absolute path or null.
 */
export async function viewFilePath({ id, token, rel, root = legionRoot() }) {
  if (!/^[\w-]+$/.test(String(id)) || !/^[0-9a-f]{32}$/.test(String(token))) return null;
  let users = [];
  try { users = await fs.readdir(root); } catch { return null; }
  for (const user of users) {
    const dir = path.join(root, user, id);
    const saved = live.get(id)?.dir === dir ? live.get(id) : await readJson(path.join(dir, 'run.json'));
    if (!saved?.viewToken) continue;
    const a = Buffer.from(saved.viewToken);
    const b = Buffer.from(String(token));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const base = path.join(dir, 'project');
    const target = path.resolve(base, String(rel || 'index.html'));
    return target.startsWith(base + path.sep) && !target.split(path.sep).includes('.git') ? target : null;
  }
  return null;
}
