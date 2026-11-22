// Legion: building a big project in parallel without builders stepping on
// each other (server/legion/loop.js uses both of these).
//
//   - Owned files: a job may list the files and folders it owns. A builder
//     whose job owns files cannot write a file another job owns; that file
//     is left out and the job says so. Jobs with no files work as before.
//   - Re-plan between waves: after each wave of jobs (the jobs that were
//     ready together, server/legion/queue.js), the Architect gets one short
//     turn to change the task and files of jobs still waiting. It cannot
//     add, remove or reorder jobs.
import { PROMPTS, ROLES } from './roles.js';
import { parseJsonReply } from './parse.js';
import { cleanFiles } from './spec.js';
import { listFiles } from './workspace.js';
import { ownsPath } from './queue.js';

const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Split a builder's files into the ones it may write and a plain note on the
 * ones it may not. Returns { files, leftOut } (leftOut is '' when none).
 */
export function ownFilesOnly(job, jobs, files) {
  if (!job.files?.length) return { files, leftOut: '' };
  const ownerOf = (file) => jobs.find((j) => j.id !== job.id && ownsPath(j.files, file))?.id;
  const refused = files.filter((f) => !ownsPath(job.files, f.path) && ownerOf(f.path));
  return {
    files: files.filter((f) => !refused.includes(f)),
    leftOut: refused.map((f) => `${f.path} (${ownerOf(f.path)} owns it)`).join(', '),
  };
}

/**
 * One Architect turn between waves. Changes the waiting jobs (and the same
 * jobs in `spec`, so a restart picks the change up). Returns the ids changed.
 * A reply it cannot use leaves the jobs as they were.
 */
export async function replanWaiting({ ended, jobs, spec, projectDir, turn, emit }) {
  const waiting = jobs.filter((j) => j.status === 'queued');
  const built = ended.map((j) => `- ${j.id} (${ROLES[j.owner].name}, ${j.status}): ${j.note || 'no note'}`).join('\n');
  const line = (j) => `- ${j.id} (${ROLES[j.owner].name}): ${j.task}${j.files?.length ? ` [files: ${j.files.join(', ')}]` : ''}`;
  let reply;
  try {
    reply = parseJsonReply(await turn('architect', [PROMPTS.replan, `Just built:\n${built}`,
      `Files in the project: ${(await listFiles(projectDir)).join(', ') || 'none'}`, `Jobs still waiting:\n${waiting.map(line).join('\n')}`].join('\n\n')));
  } catch (error) {
    if (error.stopped) throw error;
    emit({ type: 'note', text: `The Architect could not look over the plan between waves (${String(error.message).slice(0, 160)}), so the jobs go ahead as planned.` });
    return [];
  }
  const changed = [];
  for (const raw of Array.isArray(reply?.jobs) ? reply.jobs : []) {
    const job = waiting.find((j) => j.id === raw?.id);
    if (!job) continue;
    const task = str(raw.task, 2000);
    const files = Array.isArray(raw.files) ? cleanFiles(raw.files) : null;
    if ((!task || task === job.task) && (!files || files.join() === (job.files || []).join())) continue;
    for (const target of [job, spec.jobs.find((j) => j.id === job.id)].filter(Boolean)) {
      if (task) target.task = task;
      if (files?.length) target.files = files;
      else if (files) delete target.files;
    }
    changed.push(job.id);
  }
  return changed;
}
