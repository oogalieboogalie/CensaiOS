import express from 'express';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { resolveWorkspaceContext } from '../workspaces/context.js';
import { sendPublicModelError } from './chat/httpErrors.js';
import { callModel, createModelAccessContext, resolveChatModelConfig } from '../aiGateway/index.js';

// The Studio window's "ask a model" box (mounted by design.js at /api/design/studio): one request in plain words ("build
// a gritty delay and put it on this track"), answered with effects and
// settings from the Studio's own catalog, or notes for a synth track. The
// model is the person's own (the key saved in Settings first, in callModel).
// The browser checks and clamps everything before it touches the song
// (src/lib/studio/assist.js). The log line never carries what was asked.

export const studioRouter = express.Router();
const log = createLogger('studio');

const MAX_PROMPT = 600;
const MAX_CONTEXT = 8000;

const SYSTEM = `You are the mix and arrangement assistant inside a music studio app.
The person asks for a change to one track. Answer ONLY with one JSON object, no markdown:
{"say": "one short sentence on what you did, plain words",
 "fx": [{"type": "<effect type from the list>", "params": {"<setting>": <value>}}],
 "fxMode": "add" or "replace",
 "notes": [{"p": <MIDI pitch 0-127>, "t": <start in beats from the clip start>, "d": <length in beats>, "v": <loudness 0-1>}],
 "len": <clip length in beats, whole bars>,
 "preset": "<synth sound name, only to change it>"}
Rules: use only effect types and settings from the list, inside their ranges; leave out settings you keep at default.
"add" puts new effects after the ones already there; "replace" swaps the whole list.
Write "notes" only when the person asks for notes, a melody, chords, a bassline or a beat AND the track is a synth track; keep them in the song's key unless asked otherwise.
Leave out any field you do not use. If the request cannot be done with these tools, return {"say": "<why, briefly>"}.`;

/** The first JSON object in the model's answer, or null. */
export function parseAssistReply(text) {
  const raw = String(text || '').replace(/```(?:json)?/gi, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** Only the fields the Studio reads, at sane sizes. The browser clamps every value. */
export function shapeReply(data) {
  const out = { say: String(data?.say || '').replace(/\s+/g, ' ').trim().slice(0, 300) };
  if (Array.isArray(data?.fx)) {
    out.fx = data.fx.slice(0, 8).filter(f => f && typeof f.type === 'string')
      .map(f => ({ type: f.type.slice(0, 40), on: f.on !== false, params: f.params && typeof f.params === 'object' && !Array.isArray(f.params) ? f.params : {} }));
  }
  if (data?.fxMode === 'replace' || data?.fxMode === 'add') out.fxMode = data.fxMode;
  if (Array.isArray(data?.notes)) out.notes = data.notes.slice(0, 512).filter(n => n && typeof n === 'object');
  if (Number.isFinite(+data?.len)) out.len = +data.len;
  if (typeof data?.preset === 'string') out.preset = data.preset.slice(0, 40);
  return out;
}

studioRouter.post('/assist', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  const context = typeof req.body?.context === 'string' ? req.body.context.slice(0, MAX_CONTEXT) : '';
  if (!req.session?.userId) return res.status(401).json({ error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' });
  if (!prompt) return res.status(400).json({ error: 'Say what you want done to the track.', code: 'STUDIO_PROMPT_REQUIRED' });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: `Keep it under ${MAX_PROMPT} characters.`, code: 'STUDIO_PROMPT_TOO_LONG' });

  try {
    const workspace = await resolveWorkspaceContext(pool, { userId: req.session.userId, workspaceId: req.body?.workspaceId || null });
    const config = resolveChatModelConfig({ modelProvider: req.body?.modelProvider || null, modelName: req.body?.modelName || null });
    const completion = await callModel({
      accessContext: createModelAccessContext({ userId: req.session.userId, workspaceId: workspace.id, source: 'studio-assist' }),
      config,
      body: {
        model: config.model,
        temperature: 0.3,
        max_tokens: 2000,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${context}\n\nRequest: ${prompt}` }],
      },
      timeoutMs: 90000,
      logContext: { source: 'studio-assist' },
    });
    const data = parseAssistReply(completion?.choices?.[0]?.message?.content);
    if (!data) {
      log.warn(`assist: failed (model ${config.model || 'default'} answered without JSON)`);
      return res.status(502).json({ error: 'The model did not answer in a form the Studio can use. Try again or rephrase.', code: 'STUDIO_ASSIST_UNREADABLE' });
    }
    const reply = shapeReply(data);
    log.info(`assist: done (model ${config.model || 'default'}, ${reply.fx?.length || 0} effects, ${reply.notes?.length || 0} notes)`);
    res.json({ ...reply, model: config.model || null, provider: config.provider || null });
  } catch (err) {
    log.warn(`assist: failed (${safeErrorCode(err) || 'no reason given'})`);
    sendPublicModelError(res, err, 'STUDIO_ASSIST_FAILED');
  }
});
