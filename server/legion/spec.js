// Legion: the YAML spec, from the Orchestrator Engine diagram. The spec
// is the contract: the jobs the Work Queue hands out (each with its own
// UID) and the checks the Validation Engine runs against the result.
//
//   goal: A one-page tip calculator
//   jobs:
//     - id: J-001
//       owner: genesis
//       task: index.html with a bill box, tip and total
//       depends_on: [J-000]          # optional
//       files: [index.html, src/ui]  # optional: the files and folders only this job writes
//       contract: true               # optional, on one job: the shared data shapes everyone builds on
//   checks:
//     - id: C-001
//       job: J-001
//       file_exists: index.html      # or file_contains: { file, text }
//     - id: C-002                    #    page_contains: "Total"
//       job: J-001                   #    no_script_errors: true
//       page_contains: Total
//
// The person can write it, or the Orchestrator Engine writes it while
// planning; either way it is saved as legion.yaml next to the project.
import * as yaml from 'js-yaml';
import { BUILD_ORDER } from './roles.js';
import { safeRelativePath } from './parse.js';

export const MAX_JOBS = 24;
export const MAX_CHECKS = 40;
export const MAX_JOB_FILES = 20;
export const CHECK_KINDS = Object.freeze(['file_exists', 'file_contains', 'page_contains', 'no_script_errors']);

const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : typeof value === 'number' ? String(value) : '');
const cleanId = (value) => str(value, 24).replace(/[^\w-]/g, '');
const uid = (value, prefix, n) => cleanId(value) || `${prefix}-${String(n).padStart(3, '0')}`;

function cleanCheck(raw, index, jobIds) {
  const id = uid(raw?.id, 'C', index + 1);
  const job = jobIds.includes(cleanId(raw?.job)) ? cleanId(raw.job) : jobIds[jobIds.length - 1];
  if (raw?.file_exists) {
    const file = safeRelativePath(raw.file_exists);
    return file ? { id, job, kind: 'file_exists', file } : null;
  }
  if (raw?.file_contains) {
    const file = safeRelativePath(raw.file_contains.file);
    const text = str(raw.file_contains.text, 200);
    return file && text ? { id, job, kind: 'file_contains', file, text } : null;
  }
  if (raw?.page_contains) {
    const text = str(raw.page_contains, 200);
    return text ? { id, job, kind: 'page_contains', text } : null;
  }
  if (raw?.no_script_errors) return { id, job, kind: 'no_script_errors' };
  return null;
}

/** A job's owned files and folders, cleaned: project-relative, no trailing slash, no repeats. */
export function cleanFiles(value) {
  const list = (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).slice(0, MAX_JOB_FILES);
  return [...new Set(list.map((f) => safeRelativePath(String(f || '').trim().replace(/\/+$/, ''))).filter(Boolean))];
}

/** The ids of jobs that wait on each other in a circle, or null. */
function findCycle(jobs) {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const state = new Map(); // 1 = visiting, 2 = done
  const visit = (id, trail) => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return trail.slice(trail.indexOf(id));
    state.set(id, 1);
    for (const d of byId.get(id).dependsOn) {
      const found = visit(d, [...trail, id]);
      if (found) return found;
    }
    state.set(id, 2);
    return null;
  };
  for (const job of jobs) { const found = visit(job.id, []); if (found) return found; }
  return null;
}

/**
 * A spec from parsed data (the person's YAML or the Orchestrator's plan).
 * Returns { spec } or { error } in plain words.
 */
export function cleanSpec(data, fallbackGoal = '') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'The spec must be a YAML map with goal, jobs and checks.' };
  const goal = str(data.goal, 4000) || fallbackGoal;
  if (!goal) return { error: 'The spec needs a goal.' };
  const rawJobs = Array.isArray(data.jobs) ? data.jobs.slice(0, MAX_JOBS) : [];
  const jobs = [];
  const seen = new Set();
  rawJobs.forEach((raw, i) => {
    const owner = str(raw?.owner, 20).toLowerCase();
    const task = str(raw?.task, 2000);
    if (!BUILD_ORDER.includes(owner) || !task) return;
    let id = uid(raw?.id, 'J', i + 1);
    while (seen.has(id)) id = `${id}b`;
    seen.add(id);
    const files = cleanFiles(raw?.files);
    jobs.push({
      id, owner, task, dependsOn: (Array.isArray(raw?.depends_on) ? raw.depends_on : []).map(cleanId),
      ...(files.length ? { files } : {}), ...(raw?.contract === true ? { contract: true } : {}),
    });
  });
  if (!jobs.length) return { error: 'The spec needs at least one job with an owner (foundation, nexus, atlas or genesis) and a task.' };
  const ids = jobs.map((j) => j.id);
  for (const job of jobs) job.dependsOn = job.dependsOn.filter((d) => ids.includes(d) && d !== job.id);
  // Contract first: one job writes the shared data shapes, waits on nobody,
  // and every job that names no depends_on waits on it.
  const contract = jobs.find((j) => j.contract);
  for (const job of jobs) {
    if (job === contract) { job.dependsOn = []; continue; }
    delete job.contract;
    if (contract && !job.dependsOn.length) job.dependsOn = [contract.id];
  }
  const loop = findCycle(jobs);
  if (loop) return { error: `Jobs ${loop.join(' and ')} wait on each other, so neither could ever start. Remove one of the depends_on lines.` };
  const checks = (Array.isArray(data.checks) ? data.checks : []).slice(0, MAX_CHECKS)
    .map((raw, i) => cleanCheck(raw, i, ids)).filter(Boolean);
  return { spec: { goal, jobs, checks } };
}

/** Parse the person's YAML. Returns { spec } or { error }. */
export function parseSpecYaml(text, fallbackGoal = '') {
  if (!String(text || '').trim()) return { spec: null };
  let data;
  try {
    data = yaml.load(String(text).slice(0, 40_000), { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    return { error: `The YAML could not be read: ${String(error.reason || error.message).slice(0, 160)}` };
  }
  return cleanSpec(data, fallbackGoal);
}

/** The spec as YAML, for legion.yaml and the window. */
export function specToYaml(spec) {
  const check = (c) => {
    const base = { id: c.id, job: c.job };
    if (c.kind === 'file_exists') return { ...base, file_exists: c.file };
    if (c.kind === 'file_contains') return { ...base, file_contains: { file: c.file, text: c.text } };
    if (c.kind === 'page_contains') return { ...base, page_contains: c.text };
    return { ...base, no_script_errors: true };
  };
  return yaml.dump({
    goal: spec.goal,
    jobs: spec.jobs.map((j) => ({
      id: j.id, owner: j.owner, task: j.task, ...(j.contract ? { contract: true } : {}),
      ...(j.dependsOn.length ? { depends_on: j.dependsOn } : {}), ...(j.files?.length ? { files: j.files } : {}),
    })),
    checks: spec.checks.map(check),
  }, { lineWidth: 100, noRefs: true });
}

/**
 * Jobs without their own depends_on wait for every job of the builders
 * before them, so the build order (Foundation, Nexus, Atlas, Genesis) holds
 * while jobs of the same builder run side by side.
 */
// Front and back at the same time (diagram 04): Genesis (front end) does not
// wait for Atlas (back end); Synthesis joins them after both are done.
// The contract job waits on nobody.
export function withBuildOrder(jobs) {
  return jobs.map((job) => {
    if (job.dependsOn.length || job.contract) return job;
    const before = BUILD_ORDER.slice(0, BUILD_ORDER.indexOf(job.owner)).filter((role) => !(job.owner === 'genesis' && role === 'atlas'));
    return { ...job, dependsOn: jobs.filter((j) => before.includes(j.owner)).map((j) => j.id) };
  });
}
