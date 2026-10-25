// Nano-agent helpers (diagram 15, the bottom row): a sub-agent can
// start a tiny one-job helper (create, review, read, write, edit, search).
// The helper gets the diagram's ai_call prompt, answers once with a near-zero
// temperature, its answer goes into the sub-agent's data box, and it ends.
// Pure: the server tool and tests use it.

export const HELPER_JOBS = Object.freeze({
  create: 'make something new from the description',
  review: 'check the text for mistakes and say what is wrong and how to fix it',
  read: 'read the text and pull out what the task asks for',
  write: 'write the text the task asks for',
  edit: 'change the text as the task asks and return the whole new version',
  search: 'find what the task asks for inside the text and quote where it is',
});

export const HELPER_TEMPERATURE = 0.02; // 'Temp': .02 in the drawing
export const HELPER_MAX_INPUT = 12000;

/** The job name, or null when it is not one of the six. */
export function helperJob(value) {
  const job = String(value || '').trim().toLowerCase();
  return Object.hasOwn(HELPER_JOBS, job) ? job : null;
}

/** The diagram's ai_call prompt, filled in. */
export function helperPrompt({ name = 'Helper', job, parent = 'its sub-agent', task = '' }) {
  return [
    `You are ${name}, the ${job} agent for ${parent}, your task is to ${String(task).trim().replace(/\.$/, '')}.`,
    'Please make sure you are thorough, and remember correctness beats speed every time. Thank you!',
    `Your one job: ${HELPER_JOBS[job]}. You have no tools. Answer once, with only the result, then you are done.`,
  ].join('\n');
}

/** The data box key a helper's answer is saved under, e.g. "helper review 14:05:09". */
export function helperKey(job, at = new Date()) {
  return `helper ${job} ${at.toISOString().slice(11, 19)}`;
}
