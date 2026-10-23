// Idea Foundry: a morning research loop, built in. While it is on, every
// few hours it researches the next profession and files a new skill set in
// the board's library, ready to be fine-tuned by hand. The prompt lives in
// research.js; the person only picks how often, which model and (optionally)
// which professions. Runs as the teammate who switched it on.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { researchSkillSet } from './research.js';
import { skillSetResearchDeps } from './deps.js';
import { listSkillSets, saveSkillSet } from './store.js';
import { skillSetError } from './normalize.js';

const log = createLogger('idea-foundry');

// "Surprise me": the professions the first Idea Foundry run researched, plus a
// few more, tried in order and skipping any already in the library.
export const SURPRISE_PROFESSIONS = Object.freeze([
  'Real Estate Agent', 'Product Manager', 'Sales Development Representative', 'UX Designer', 'Data Scientist',
  'Marketing Strategist', 'Copywriter', 'Customer Success Manager', 'Recruiter', 'Financial Analyst',
  'Investigative Journalist', 'Teacher', 'Negotiator', 'Operations Manager', 'Security Engineer',
  'Video Editor', 'Bookkeeper', 'Executive Assistant', 'Community Manager', 'Startup Founder',
]);

const DEFAULTS = Object.freeze({ enabled: false, intervalHours: 24, modelProvider: null, modelName: null, professions: [] });

function fromRow(row) {
  if (!row) return { ...DEFAULTS, nextRunAt: null, lastRunAt: null, lastResult: null, lastError: null };
  return {
    enabled: row.enabled,
    intervalHours: row.interval_hours,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    professions: Array.isArray(row.professions) ? row.professions : [],
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastResult: row.last_result,
    lastError: row.last_error,
  };
}

export async function getFoundrySettings(db, workspaceId) {
  const { rows } = await db.query('SELECT * FROM workspace_idea_foundry WHERE workspace_id=$1', [workspaceId]);
  return fromRow(rows[0]);
}

export function normalizeFoundryInput(input = {}) {
  const hours = Math.round(Number(input.intervalHours));
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) throw skillSetError('Pick how often: every 1 to 168 hours.');
  const clip = (v) => (String(v || '').trim().slice(0, 120) || null);
  const professions = (Array.isArray(input.professions) ? input.professions : String(input.professions || '').split(/[\n,]/))
    .map((p) => String(p).replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean).slice(0, 50);
  return { enabled: Boolean(input.enabled), intervalHours: hours, modelProvider: clip(input.modelProvider), modelName: clip(input.modelName), professions };
}

export async function saveFoundrySettings(db, workspaceId, userId, input) {
  const s = normalizeFoundryInput(input);
  await db.query(
    `INSERT INTO workspace_idea_foundry
       (workspace_id, enabled, interval_hours, model_provider, model_name, professions, armed_by, next_run_at, last_error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7, CASE WHEN $2 THEN NOW() + INTERVAL '1 minute' ELSE NULL END, NULL, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET enabled=EXCLUDED.enabled, interval_hours=EXCLUDED.interval_hours,
       model_provider=EXCLUDED.model_provider, model_name=EXCLUDED.model_name, professions=EXCLUDED.professions,
       armed_by=EXCLUDED.armed_by, last_error=NULL, updated_at=NOW(),
       next_run_at=CASE WHEN NOT EXCLUDED.enabled THEN NULL
         WHEN workspace_idea_foundry.enabled AND workspace_idea_foundry.next_run_at IS NOT NULL THEN workspace_idea_foundry.next_run_at
         ELSE NOW() + INTERVAL '1 minute' END`,
    [workspaceId, s.enabled, s.intervalHours, s.modelProvider, s.modelName, JSON.stringify(s.professions), userId]);
  return getFoundrySettings(db, workspaceId);
}

/** Pure: the next profession to research, skipping ones the library already has. */
export function pickProfession(settings, nextIndex, library) {
  const list = settings.professions?.length ? settings.professions : SURPRISE_PROFESSIONS;
  const have = new Set(library.map((set) => String(set.position || set.name).toLowerCase()));
  for (let step = 0; step < list.length; step += 1) {
    const index = (nextIndex + step) % list.length;
    if (!have.has(list[index].toLowerCase()) || settings.professions?.length) return { profession: list[index], index };
  }
  return { profession: list[nextIndex % list.length], index: nextIndex % list.length };
}

/** One Idea Foundry run for one board. Returns the new skill set. */
export async function runFoundryOnce(db, row, { research = researchSkillSet, makeDeps = skillSetResearchDeps } = {}) {
  const workspaceId = row.workspace_id;
  const userId = row.armed_by;
  await requireWorkspaceMember(db, { userId, workspaceId, roles: ['owner', 'admin'] });
  const settings = fromRow(row);
  const library = await listSkillSets(db, workspaceId);
  const { profession, index } = pickProfession(settings, row.next_index || 0, library);
  const deps = await makeDeps({ userId, workspaceId }, { modelProvider: settings.modelProvider, modelName: settings.modelName, source: 'idea-foundry' });
  const set = await research(profession, deps, { origin: 'foundry' });
  const saved = await saveSkillSet(db, workspaceId, userId, set, { origin: 'foundry', isNew: true });
  await db.query('UPDATE workspace_idea_foundry SET next_index=$2 WHERE workspace_id=$1', [workspaceId, index + 1]);
  return saved;
}

/** Claims every board whose Idea Foundry is due and runs it (one at a time). */
export async function tickIdeaFoundry(db, deps = {}) {
  const { rows } = await db.query(
    `UPDATE workspace_idea_foundry SET next_run_at = NOW() + make_interval(hours => interval_hours), last_run_at = NOW()
     WHERE enabled AND armed_by IS NOT NULL AND next_run_at <= NOW() RETURNING *`);
  for (const row of rows) {
    try {
      const saved = await runFoundryOnce(db, row, deps);
      await db.query('UPDATE workspace_idea_foundry SET last_result=$2, last_error=NULL WHERE workspace_id=$1', [row.workspace_id, saved.name]);
    } catch (error) {
      log.warn('idea foundry run failed', { workspaceId: row.workspace_id, code: safeErrorCode(error) });
      await db.query('UPDATE workspace_idea_foundry SET last_error=$2 WHERE workspace_id=$1', [row.workspace_id, String(error.message).slice(0, 300)]);
    }
  }
  return rows.length;
}
