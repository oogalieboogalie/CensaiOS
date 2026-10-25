// Legion: the Validation Engine from the diagram ("checks against
// YAML"). The spec's own checks run first, with no model involved: does the
// file exist, does it say what it must, does the page show the text, did the
// page run without script errors. Echo then judges what rules cannot. Every
// failure names the job UID it belongs to, so the Orchestrator Engine sends
// exactly that job back to the Work Queue.
import fs from 'node:fs/promises';
import path from 'node:path';

async function readProjectFile(projectDir, rel) {
  const target = path.resolve(projectDir, rel);
  if (!target.startsWith(path.resolve(projectDir) + path.sep)) return null;
  try { return await fs.readFile(target, 'utf8'); } catch { return null; }
}

/** One check against the project and what the browser saw. */
async function runCheck(check, { projectDir, seen }) {
  if (check.kind === 'file_exists') {
    const ok = (await readProjectFile(projectDir, check.file)) !== null;
    return { ok, detail: ok ? `${check.file} is there.` : `${check.file} is missing.` };
  }
  if (check.kind === 'file_contains') {
    const text = await readProjectFile(projectDir, check.file);
    if (text === null) return { ok: false, detail: `${check.file} is missing.` };
    const ok = text.includes(check.text);
    return { ok, detail: ok ? `${check.file} has "${check.text}".` : `${check.file} does not have "${check.text}".` };
  }
  if (!seen?.ok) return { ok: false, detail: `The page could not be opened: ${seen?.reason || 'no page'}` };
  if (check.kind === 'page_contains') {
    const ok = String(seen.text || '').toLowerCase().includes(check.text.toLowerCase());
    return { ok, detail: ok ? `The page shows "${check.text}".` : `The page does not show "${check.text}".` };
  }
  const errors = seen.errors || [];
  return { ok: !errors.length, detail: errors.length ? `Script errors: ${errors.slice(0, 3).join(' | ')}` : 'No script errors.' };
}

/** Run every check. Returns [{ id, job, kind, ok, detail }]. */
export async function runChecks({ checks, projectDir, seen }) {
  const results = [];
  for (const check of checks) {
    const { ok, detail } = await runCheck(check, { projectDir, seen });
    results.push({ id: check.id, job: check.job, kind: check.kind, ok, detail });
  }
  return results;
}

/**
 * The jobs to send back: every job with a failed check, plus the jobs Echo's
 * to-do names (by UID, or by owner when Echo only knew the builder).
 * Returns Map(jobId -> [problems]).
 */
export function failedJobs({ results, verdict, jobs }) {
  const out = new Map();
  const add = (id, problem) => {
    if (!id || !jobs.some((j) => j.id === id)) return;
    out.set(id, [...(out.get(id) || []), problem]);
  };
  for (const r of results) if (!r.ok) add(r.job, `${r.id}: ${r.detail}`);
  if (verdict?.verdict !== 'OK') {
    for (const t of verdict?.todo || []) {
      const byId = jobs.find((j) => j.id === t.job);
      const byOwner = [...jobs].reverse().find((j) => j.owner === t.owner);
      const where = t.file ? ` (${t.file}${t.line ? `:${t.line}` : ''})` : '';
      add((byId || byOwner)?.id, `Echo: ${t.problem}${where}`);
    }
  }
  for (const job of jobs) if (job.status === 'blocked' && !out.has(job.id)) add(job.id, job.note || 'It never ran.');
  return out;
}
