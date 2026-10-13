// Browser-side helpers for chat attachments: reading files, encoding mic
// recordings as WAV (the one format every audio-capable API accepts), and
// keeping what we send and what we persist within budget.

import { ATTACHMENT_LIMITS } from './modelCapabilities.js';

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/** Approximate raw byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl) {
  const s = String(dataUrl || '');
  const comma = s.indexOf(',');
  if (comma < 0) return 0;
  const b64 = s.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/** Encode mono/stereo float channels as 16-bit PCM WAV bytes. */
export function encodeWav(channels, sampleRate) {
  const numChannels = Math.max(1, channels.length);
  const length = channels[0]?.length || 0;
  const buffer = new ArrayBuffer(44 + length * numChannels * 2);
  const view = new DataView(buffer);
  const writeString = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numChannels * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const sample = Math.max(-1, Math.min(1, channels[c][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}

/** Downmix to mono and resample (linear) to keep voice clips small. */
export function downmixAndResample(channels, fromRate, toRate = 16000) {
  const length = channels[0]?.length || 0;
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i += 1) mono[i] += channel[i] / channels.length;
  }
  if (!fromRate || fromRate === toRate) return mono;
  const ratio = fromRate / toRate;
  const outLength = Math.floor(length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(length - 1, left + 1);
    const frac = pos - left;
    out[i] = mono[left] * (1 - frac) + mono[right] * frac;
  }
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Turn a MediaRecorder blob (webm/ogg/mp4) into a 16 kHz mono WAV data URL. */
export async function recordingToWavDataUrl(blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const mono = downmixAndResample(channels, decoded.sampleRate, 16000);
    return `data:audio/wav;base64,${bytesToBase64(encodeWav([mono], 16000))}`;
  } finally {
    ctx.close?.();
  }
}

/**
 * Prepare the visible conversation for one request. Attachment data is sent
 * newest-first until the request budget is used; older attachments past the
 * budget go as data-less stubs, which the server turns into a short note.
 */
export function messagesForSend(msgs, budget = ATTACHMENT_LIMITS.requestTotal) {
  let remaining = budget;
  const out = new Array(msgs.length);
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    let next = m;
    if (m?.image) {
      const size = dataUrlBytes(m.image);
      if (size > remaining) {
        next = { ...next, image: undefined, attachments: [{ kind: 'image', name: 'image' }, ...(next.attachments || [])] };
      } else {
        remaining -= size;
      }
    }
    if (Array.isArray(m?.attachments) && m.attachments.length) {
      next = {
        ...next,
        attachments: (next.attachments || []).map((a) => {
          if (!a?.dataUrl) return a;
          const size = a.size || dataUrlBytes(a.dataUrl);
          if (size > remaining) return stub(a);
          remaining -= size;
          return a;
        }),
      };
    }
    out[i] = next;
  }
  return out;
}

function stub(attachment) {
  const { dataUrl: _dataUrl, ...rest } = attachment;
  return rest;
}

// What stays in workspace state after a send. Images up to this size keep their
// data (so follow-up questions can still see them); everything else keeps only
// its name, kind and size, so canvases don't fill browser storage.
export const PERSISTED_IMAGE_LIMIT = 1.5 * 1024 * 1024;

export function persistableMessage(message) {
  if (!Array.isArray(message?.attachments) || message.attachments.length === 0) return message;
  return {
    ...message,
    attachments: message.attachments.map((a) => {
      if (!a?.dataUrl) return a;
      if (a.kind === 'image' && (a.size || dataUrlBytes(a.dataUrl)) <= PERSISTED_IMAGE_LIMIT) return a;
      return stub(a);
    }),
  };
}
