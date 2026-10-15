// Start and collect videos for agents, the chat window and shared agent
// endpoints. The caller's own Google key is used (vault first); the server's
// key only for those allowed to spend it (security/serverKeys.js).

import { getGeminiApiKey } from '../googleKeys.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { mayUseServerKeys } from '../security/serverKeys.js';
import { VideoError, checkVeoJob, downloadVeoVideo, startVeoJob } from './veo.js';
import { canSeeVideoJob, createVideoJob, getVideoJob, saveVideoFile, updateVideoJob } from './store.js';

export async function resolveVideoKey({ userId = null, userRole = null } = {}, deps = {}) {
  const vault = deps.getUserApiKeyConfig || getUserApiKeyConfig;
  if (userId) {
    try {
      const personal = await vault(userId, 'google');
      if (personal?.apiKey) return personal.apiKey;
    } catch { /* fall through */ }
  }
  const serverKey = (deps.serverKey ?? getGeminiApiKey()) || null;
  if (!serverKey) return null;
  const allowed = await (deps.mayUseServerKeys || mayUseServerKeys)({ userId, userRole });
  return allowed ? serverKey : null;
}

export function videoUrl(id) {
  return `/api/videos/${id}/file`;
}

/** Start a clip. Returns the saved job (never the key). */
export async function startVideo({ prompt, aspectRatio, negativePrompt, fast, agentId, userId, workspaceId, userRole }, deps = {}) {
  const apiKey = await resolveVideoKey({ userId, userRole }, deps);
  if (!apiKey) throw new VideoError('Video needs your own Google key. Add one in Settings → Vault (Google Gemini).', 'VIDEO_KEY_REQUIRED');
  const started = await startVeoJob({ apiKey, prompt, aspectRatio, negativePrompt, fast, fetchImpl: deps.fetchImpl || fetch });
  return createVideoJob({ operation: started.operation, model: started.model, prompt, aspectRatio, agentId, userId, workspaceId });
}

/**
 * Check a clip once; when Veo is done, download it and keep it.
 * @returns {Promise<object>} the job, with url when ready
 */
export async function collectVideo({ id, userId, workspaceId, userRole }, deps = {}) {
  const job = await getVideoJob(String(id || '').trim());
  if (!canSeeVideoJob(job, { userId, workspaceId })) throw new VideoError('No video with that id on this board.', 'VIDEO_NOT_FOUND');
  if (job.status === 'ready') return { ...job, url: videoUrl(job.id) };
  if (job.status === 'failed') return job;
  const apiKey = await resolveVideoKey({ userId, userRole }, deps);
  if (!apiKey) throw new VideoError('Video needs your own Google key. Add one in Settings → Vault (Google Gemini).', 'VIDEO_KEY_REQUIRED');
  const fetchImpl = deps.fetchImpl || fetch;
  const state = await checkVeoJob({ apiKey, operation: job.operation, fetchImpl });
  if (!state.done) return job;
  if (state.error) return updateVideoJob(job.id, { status: 'failed', error: state.error });
  const { bytes } = await downloadVeoVideo({ apiKey, uri: state.uri, fetchImpl });
  await saveVideoFile(job.id, bytes);
  const ready = await updateVideoJob(job.id, { status: 'ready', bytes: bytes.length });
  return { ...ready, url: videoUrl(job.id) };
}

/** Poll until ready, failed, or the wait runs out. */
export async function waitForVideo(args, { waitSeconds = 45, intervalMs = 10_000, sleep, ...deps } = {}) {
  const pause = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const deadline = Date.now() + Math.max(0, Math.min(Number(waitSeconds) || 0, 120)) * 1000;
  let job = await collectVideo(args, deps);
  while (job.status === 'working' && Date.now() + intervalMs <= deadline) {
    await pause(intervalMs);
    job = await collectVideo(args, deps);
  }
  return job;
}
