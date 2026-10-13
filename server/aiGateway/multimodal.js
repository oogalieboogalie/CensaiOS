// ═══════════════════════════════════════════════════════════════════
//  MULTIMODAL MESSAGE PARTS
//  Turns a chat message's attachments into OpenAI-format content parts, after
//  checking each one against the model's capability map
//  (src/lib/chat/modelCapabilities.js). The gateway then forwards those parts
//  as-is to OpenAI-compatible providers, or converts them for Gemini native.
//
//    image          → { type: 'image_url', image_url: { url } }
//    PDF            → { type: 'file', file: { filename, file_data } }
//    text file      → inlined as a text part (works for every model)
//    audio          → { type: 'input_audio', input_audio: { data, format } }
//    video          → { type: 'video_url', video_url: { url } }
// ═══════════════════════════════════════════════════════════════════

import {
  ATTACHMENT_LIMITS,
  classifyAttachment,
  isPdf,
} from '../../src/lib/chat/modelCapabilities.js';

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?((?:;[a-z0-9-]+=[^;,]*)*)(;base64)?,(.*)$/is;
const MAX_INLINE_TEXT_CHARS = 200_000;

export class AttachmentError extends Error {
  constructor(message, code = 'ATTACHMENT_UNSUPPORTED', statusCode = 400) {
    super(message);
    this.name = 'AttachmentError';
    this.code = code;
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

/** Parse a data: URL. Returns null for anything else (remote URLs are not accepted). */
export function parseDataUrl(url) {
  const match = DATA_URL.exec(String(url || ''));
  if (!match) return null;
  const mime = (match[1] || 'text/plain').toLowerCase();
  const isBase64 = Boolean(match[3]);
  const payload = match[4] || '';
  const base64 = isBase64
    ? payload.replace(/\s+/g, '')
    : Buffer.from(decodeURIComponent(payload), 'utf8').toString('base64');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return { mime, base64, bytes };
}

function audioFormat(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav') || m.includes('wave')) return 'wav';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  if (m.includes('aac')) return 'aac';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  return 'wav';
}

export function mimeForAudioFormat(format) {
  return {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    aac: 'audio/aac', m4a: 'audio/mp4', webm: 'audio/webm',
  }[String(format || '').toLowerCase()] || 'audio/wav';
}

/** Collect a message's attachments, folding the legacy `image` field in. */
export function messageAttachments(message) {
  const list = Array.isArray(message?.attachments) ? message.attachments.filter(Boolean) : [];
  if (message?.image && !list.some((a) => a?.dataUrl === message.image)) {
    return [{ kind: 'image', name: 'image', dataUrl: message.image }, ...list];
  }
  return list;
}

/**
 * Build content parts for one message. Attachments the model can't take throw
 * an AttachmentError (400) rather than being dropped silently. An attachment
 * with no data (stripped from history after it was sent) becomes a short text
 * note so the model knows it existed.
 */
export function buildContentParts({ text, attachments }, caps, { budget = null } = {}) {
  const parts = [];
  const notes = [];
  const fileTexts = [];

  for (const attachment of attachments) {
    const name = String(attachment?.name || attachment?.kind || 'attachment').slice(0, 200);
    if (!attachment?.dataUrl) {
      notes.push(`[earlier attachment: ${name}${attachment?.kind ? ` (${attachment.kind})` : ''} — no longer in context]`);
      continue;
    }
    const parsed = parseDataUrl(attachment.dataUrl);
    if (!parsed) throw new AttachmentError(`${name} must be uploaded as a file, not a link.`, 'ATTACHMENT_INVALID');

    const mime = String(attachment.mime || parsed.mime).toLowerCase();
    const verdict = classifyAttachment({ name, mime, size: parsed.bytes }, caps);
    if (!verdict.ok) throw new AttachmentError(`${verdict.reason} Remove it or switch to a model that supports it.`);
    if (budget) {
      budget.used += parsed.bytes;
      if (budget.used > ATTACHMENT_LIMITS.requestTotal) {
        throw new AttachmentError('Attachments in this conversation are over the 20 MB request limit. Remove some and try again.', 'ATTACHMENT_TOO_LARGE', 413);
      }
    }

    if (verdict.kind === 'image') {
      parts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${parsed.base64}` } });
    } else if (verdict.kind === 'audio') {
      parts.push({ type: 'input_audio', input_audio: { data: parsed.base64, format: audioFormat(mime) } });
    } else if (verdict.kind === 'video') {
      parts.push({ type: 'video_url', video_url: { url: `data:${mime};base64,${parsed.base64}` } });
    } else if (isPdf(name, mime)) {
      parts.push({ type: 'file', file: { filename: name, file_data: `data:application/pdf;base64,${parsed.base64}` } });
    } else {
      let body = Buffer.from(parsed.base64, 'base64').toString('utf8');
      if (body.length > MAX_INLINE_TEXT_CHARS) body = `${body.slice(0, MAX_INLINE_TEXT_CHARS)}\n…[truncated]`;
      fileTexts.push(`--- attached file: ${name} ---\n${body}\n--- end of ${name} ---`);
    }
  }

  const prompt = [
    ...notes,
    String(text || '').trim() || (parts.length ? 'Take a look at the attached content.' : ''),
    ...fileTexts,
  ].filter(Boolean).join('\n\n');

  return [{ type: 'text', text: prompt }, ...parts];
}

const NATIVE_ONLY_PART_TYPES = new Set(['file', 'video_url']);

/** True when a chat payload carries parts only Gemini's native API accepts. */
export function payloadNeedsGeminiNative(payload) {
  for (const message of payload?.messages || []) {
    if (!Array.isArray(message?.content)) continue;
    if (message.content.some((part) => NATIVE_ONLY_PART_TYPES.has(part?.type))) return true;
  }
  return false;
}

/** Convert one OpenAI-format content part into a Gemini `parts` entry. */
export function toGeminiPart(part) {
  if (typeof part === 'string') return part ? { text: part } : null;
  if (!part || typeof part !== 'object') return null;
  if (part.type === 'text') return part.text ? { text: part.text } : null;
  const inline = (url) => {
    const parsed = parseDataUrl(url);
    return parsed ? { inlineData: { mimeType: parsed.mime, data: parsed.base64 } } : null;
  };
  if (part.type === 'image_url') return inline(part.image_url?.url || part.image_url);
  if (part.type === 'video_url') return inline(part.video_url?.url || part.video_url);
  if (part.type === 'file') return inline(part.file?.file_data);
  if (part.type === 'input_audio' && part.input_audio?.data) {
    return { inlineData: { mimeType: mimeForAudioFormat(part.input_audio.format), data: part.input_audio.data } };
  }
  return typeof part.text === 'string' && part.text ? { text: part.text } : null;
}
