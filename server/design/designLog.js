// One 'design' app log line per Figma or remix step: the file key, how many
// frames or which frame, how faithful an import was, the model a remix used,
// and done, refused or failed with why. Never the Figma token, the design's
// text, the code or what the person asked the model to change.

import { createLogger } from '../logger.js';

const log = createLogger('design');
const SAFE = /^[\w:;,.-]{1,80}$/;
const safe = (value) => (SAFE.test(String(value ?? '')) ? String(value) : '(unreadable)');
const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function logDesignDone(step, { fileKey, nodeId, frames, fidelity, nodes, sourceType, model } = {}) {
  const parts = [];
  if (fileKey) parts.push(`file ${safe(fileKey)}`);
  if (nodeId) parts.push(`frame ${safe(nodeId)}`);
  const extra = [];
  if (frames != null) extra.push(`${Number(frames) || 0} frames`);
  if (fidelity) extra.push(`fidelity ${safe(fidelity)}`);
  if (nodes != null) extra.push(`${Number(nodes) || 0} layers`);
  if (sourceType) extra.push(`${safe(sourceType)} code`);
  if (model) extra.push(`model ${safe(model)}`);
  log.info(`${step}${parts.length ? ` ${parts.join(' ')}` : ''}: done${extra.length ? ` (${extra.join(', ')})` : ''}`);
}

export function logDesignFailed(step, err, { fileKey, nodeId } = {}) {
  const parts = [fileKey && `file ${safe(fileKey)}`, nodeId && `frame ${safe(nodeId)}`].filter(Boolean);
  const refused = err?.code === 'FIGMA_TOKEN_INVALID' || err?.code === 'FIGMA_TOKEN_REQUIRED' || [401, 403].includes(Number(err?.statusCode || err?.status));
  const why = err?.code === 'FIGMA_TOKEN_INVALID' ? 'Figma did not accept the token'
    : err?.code === 'FIGMA_TOKEN_REQUIRED' ? 'no Figma token connected'
      : clip(err?.code || err?.message, 80) || 'no reason given';
  log.warn(`${step}${parts.length ? ` ${parts.join(' ')}` : ''}: ${refused ? 'refused' : 'failed'} (${why})`);
}
