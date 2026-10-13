import { renderProjectAsync } from '../../../lib/studio/render.js';
import { encodeWav } from '../../../lib/studio/wav.js';
import { loadAsset, saveAsset } from '../../../lib/studio/assetStore.js';
import { normalizeProject } from '../../../lib/studio/project.js';

// Files out of and into the Studio: the mix as a WAV (rendered offline by
// the same engine that plays live) and the whole project as JSON with its
// audio embedded, so it opens complete on another computer.

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSafe = s => (s || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'song';

export async function exportWav(project, decoded, sampleRate, onProgress) {
  const assets = Object.fromEntries(decoded);
  const mix = await renderProjectAsync(project, assets, { sampleRate, onProgress });
  download(new Blob([encodeWav(mix, sampleRate, 24)], { type: 'audio/wav' }), `${fileSafe(project.title)}.wav`);
  return mix.left.length / sampleRate;
}

const toBase64 = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function exportProject(project) {
  const audio = {};
  for (const id of Object.keys(project.assets)) {
    const rec = await loadAsset(id);
    if (rec?.blob) audio[id] = { name: rec.name, type: rec.blob.type, data: await toBase64(rec.blob) };
  }
  const json = JSON.stringify({ censaiStudio: 1, project, audio });
  download(new Blob([json], { type: 'application/json' }), `${fileSafe(project.title)}.studio.json`);
}

/** Reads a project file; stores its embedded audio in this browser. Returns the project. */
export async function importProject(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.censaiStudio !== 1 || !data.project) throw new Error('That file is not a Studio project.');
  for (const [id, a] of Object.entries(data.audio || {})) {
    const bin = atob(a.data || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await saveAsset(id, new Blob([bytes], { type: a.type || 'audio/wav' }), a.name);
  }
  return normalizeProject(data.project);
}

/** Microphone recording with the browser's voice processing turned off. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
      rec.stop();
    }),
  };
}
