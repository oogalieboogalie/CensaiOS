// ═══════════════════════════════════════════════════════════════════
//  VIDEO: Google Veo through the Gemini API (BYOK Google key)
//
//    start  POST {base}/models/{model}:predictLongRunning  → { name: operation }
//    poll   GET  {base}/{operation}                         → { done, response }
//    fetch  GET  {video.uri} with the same key              → mp4 bytes
//
//  A clip takes one to several minutes, so a tool call starts the job and a
//  second call collects it. Keys never leave the server and are never stored
//  with the job: every call resolves the caller's key again.
// ═══════════════════════════════════════════════════════════════════

export const VEO_BASE_URL = process.env.VEO_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
export const VEO_MODEL = process.env.VEO_MODEL || 'veo-3.0-generate-001';
export const VEO_FAST_MODEL = process.env.VEO_FAST_MODEL || 'veo-3.0-fast-generate-001';
const MAX_PROMPT_CHARS = 4000;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export class VideoError extends Error {
  constructor(message, code = 'VIDEO_FAILED') {
    super(message);
    this.name = 'VideoError';
    this.code = code;
  }
}

async function failure(res, label) {
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  if (res.status === 401 || res.status === 403) {
    return new VideoError(`${label} was refused. Check the Google key in Settings → Vault and that Veo is enabled for it.`, 'VIDEO_AUTH_FAILED');
  }
  if (res.status === 429) return new VideoError(`${label} is rate-limited or out of quota. Try again later.`, 'VIDEO_RATE_LIMITED');
  return new VideoError(`${label} failed (${res.status}). ${detail}`.trim(), 'VIDEO_FAILED');
}

/**
 * Start a Veo job.
 * @returns {Promise<{operation:string, model:string}>}
 */
export async function startVeoJob({ apiKey, prompt, aspectRatio = '16:9', negativePrompt = '', fast = false, fetchImpl = fetch }) {
  if (!apiKey) throw new VideoError('Video needs a Google key. Add one in Settings → Vault (Google Gemini).', 'VIDEO_KEY_REQUIRED');
  const text = String(prompt || '').trim().slice(0, MAX_PROMPT_CHARS);
  if (!text) throw new VideoError('Describe the video you want.', 'VIDEO_EMPTY');
  const model = fast ? VEO_FAST_MODEL : VEO_MODEL;
  const parameters = { aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9' };
  if (negativePrompt) parameters.negativePrompt = String(negativePrompt).slice(0, 1000);
  const res = await fetchImpl(`${VEO_BASE_URL}/models/${model}:predictLongRunning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ instances: [{ prompt: text }], parameters }),
  });
  if (!res.ok) throw await failure(res, 'Starting the Veo video');
  const data = await res.json();
  if (!data?.name) throw new VideoError('Veo did not return a job id.');
  return { operation: data.name, model };
}

/**
 * Check a Veo job once.
 * @returns {Promise<{done:false}|{done:true, uri:string}|{done:true, error:string}>}
 */
export async function checkVeoJob({ apiKey, operation, fetchImpl = fetch }) {
  if (!/^(models\/[\w.-]+\/)?operations\/[\w.-]+$/.test(String(operation || ''))) {
    throw new VideoError('That is not a Veo job id.', 'VIDEO_BAD_JOB');
  }
  const res = await fetchImpl(`${VEO_BASE_URL}/${operation}`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) throw await failure(res, 'Checking the Veo video');
  const data = await res.json();
  if (!data?.done) return { done: false };
  if (data.error) return { done: true, error: String(data.error.message || 'Veo could not make that video.') };
  const response = data.response || {};
  const sample = response.generateVideoResponse?.generatedSamples?.[0] || response.generatedVideos?.[0];
  const uri = sample?.video?.uri;
  if (!uri) {
    const filtered = response.generateVideoResponse?.raiMediaFilteredReasons?.[0];
    return { done: true, error: filtered ? `Veo held the video back: ${filtered}` : 'Veo finished but returned no video.' };
  }
  return { done: true, uri };
}

/** Download a finished clip. Only Google's own file host is accepted. */
export async function downloadVeoVideo({ apiKey, uri, fetchImpl = fetch }) {
  let url;
  try { url = new URL(uri); } catch { throw new VideoError('Veo returned a broken video link.'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('googleapis.com')) {
    throw new VideoError('Veo returned a video link outside Google; refusing to fetch it.', 'VIDEO_BAD_LINK');
  }
  const res = await fetchImpl(url.toString(), { headers: { 'x-goog-api-key': apiKey }, redirect: 'follow' });
  if (!res.ok) throw await failure(res, 'Downloading the Veo video');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_VIDEO_BYTES) throw new VideoError('That video is too large to keep.');
  return { bytes, mime: res.headers?.get?.('content-type') || 'video/mp4' };
}
