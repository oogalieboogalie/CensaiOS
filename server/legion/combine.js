// Legion: front and back at the same time (diagram 04).
//
//   Request -> Distributor -> Front (Genesis) + Back (Atlas) side by side
//   -> Synthesis -> Product.
//
// The Architect is the Distributor: it splits the goal into jobs. Atlas
// (back end) and Genesis (front end) do not wait on each other, so both run
// at once on the Work Queue. When both have built something, the Architect
// comes back once as Synthesis: it reads every file and wires the page to
// the server (matching addresses, field names, what the page shows when the
// server is not running) before the Validation Engine looks at it.
import { parseFileBlocks } from './parse.js';
import { filesForPrompt, writeFiles } from './workspace.js';

export const FRONT = 'genesis';
export const BACK = 'atlas';

export const COMBINE_PROMPT = [
  'You are Synthesis. Atlas built the back end and Genesis built the front end at the same time, without seeing each other\'s work.',
  'Read every file below and join them into one working product: the page must call the routes the server really has, with the same field names, and still show something useful when the server is not running.',
  'Change only what joining them needs. If they already fit, change nothing and say so in NOTES.',
].join('\n');

/** True when the queue has both front-end and back-end jobs, so there is something to combine. */
export function needsCombine(jobs = []) {
  return jobs.some((j) => j.owner === FRONT) && jobs.some((j) => j.owner === BACK);
}

/**
 * One Synthesis turn. `turn(role, task)` asks a model; `buildPrompt` is the
 * file format every builder uses. Returns { files, notes }.
 */
export async function combineFrontAndBack({ projectDir, turn, emit, buildPrompt }) {
  emit({ type: 'phase', phase: 'combine' });
  const task = [COMBINE_PROMPT, await filesForPrompt(projectDir), buildPrompt].join('\n\n');
  const { files, notes } = parseFileBlocks(await turn('architect', task));
  const written = await writeFiles(projectDir, files);
  emit({ type: 'files', role: 'architect', job: 'Synthesis', files: written, notes, label: 'combine' });
  return { files: written, notes };
}
