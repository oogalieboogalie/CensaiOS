// Video jobs and finished clips, kept on disk next to the image gallery:
//   .homebase-state/videos/jobs.json   job list (no keys, ever)
//   .homebase-state/videos/<id>.mp4    finished clips, served by /api/videos/:id

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MAX_JOBS = 500;
let queue = Promise.resolve();

export function videoDir() {
  return process.env.VIDEO_STATE_DIR || path.resolve(process.cwd(), '.homebase-state', 'videos');
}

function jobsFile() {
  return path.join(videoDir(), 'jobs.json');
}

async function readJobs() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(jobsFile(), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function mutate(update) {
  const op = queue.then(async () => {
    const jobs = await readJobs();
    const { next, result } = update(jobs);
    await fs.promises.mkdir(videoDir(), { recursive: true });
    const tmp = `${jobsFile()}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(next.slice(0, MAX_JOBS), null, 2));
    await fs.promises.rename(tmp, jobsFile());
    return result;
  });
  queue = op.catch(() => {});
  return op;
}

export function newVideoId() {
  return `vid_${crypto.randomBytes(9).toString('hex')}`;
}

export async function createVideoJob({ operation, model, prompt, aspectRatio, agentId, userId, workspaceId }) {
  const job = {
    id: newVideoId(),
    operation,
    model,
    prompt: String(prompt || '').slice(0, 500),
    aspectRatio,
    agentId: agentId || null,
    userId: userId ?? null,
    workspaceId: workspaceId || null,
    status: 'working',
    createdAt: new Date().toISOString(),
  };
  return mutate(jobs => ({ next: [job, ...jobs], result: job }));
}

export async function getVideoJob(id) {
  return (await readJobs()).find(job => job.id === id) || null;
}

export async function listVideoJobs({ userId, workspaceId } = {}) {
  return (await readJobs()).filter(job => String(job.userId) === String(userId ?? null)
    && (!workspaceId || job.workspaceId === workspaceId));
}

export async function updateVideoJob(id, patch) {
  return mutate((jobs) => {
    let updated = null;
    const next = jobs.map((job) => {
      if (job.id !== id) return job;
      updated = { ...job, ...patch, updatedAt: new Date().toISOString() };
      return updated;
    });
    return { next, result: updated };
  });
}

export function videoFilePath(id) {
  if (!/^vid_[a-f0-9]{18}$/.test(String(id))) return null;
  return path.join(videoDir(), `${id}.mp4`);
}

export async function saveVideoFile(id, bytes) {
  const file = videoFilePath(id);
  if (!file) throw new Error('bad video id');
  await fs.promises.mkdir(videoDir(), { recursive: true });
  await fs.promises.writeFile(file, bytes);
  return file;
}

/** The person (or agent acting for them) may see this job. */
export function canSeeVideoJob(job, { userId, workspaceId } = {}) {
  if (!job) return false;
  if (String(job.userId ?? null) !== String(userId ?? null)) return false;
  return !workspaceId || !job.workspaceId || job.workspaceId === workspaceId;
}
