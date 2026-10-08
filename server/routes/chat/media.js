// Chat window media endpoints:
//   GET  /api/chat/capabilities?agentId=&workspaceId=  → what the agent's model accepts
//   POST /api/chat/transcribe { agentId, workspaceId, audio }  → { text }
//   POST /api/chat/speech     { agentId, workspaceId, text }   → { audio }
// Keys never leave the server; responses carry only provider/model names.

import { resolveChatTarget } from './chatTarget.js';
import { publicChatError } from './httpErrors.js';
import { parseDataUrl } from '../../aiGateway/multimodal.js';
import { ATTACHMENT_LIMITS } from '../../../src/lib/chat/modelCapabilities.js';
import { SpeechError, synthesizeSpeech, transcribeAudio } from '../../aiGateway/speech.js';
import { requiresPersonalApiKey } from '../../security/byokPolicy.js';

function sendError(res, error) {
  const { status, body } = publicChatError(error);
  return res.status(status).json(body);
}

function targetArgs(req, source) {
  return {
    agentId: typeof source?.agentId === 'string' ? source.agentId : null,
    workspaceId: typeof source?.workspaceId === 'string' && source.workspaceId ? source.workspaceId : null,
    userId: req.session?.userId || null,
  };
}

// Hosted (cloud) users pay for their own voice calls: a server key is never
// spent on speech for them.
function assertSpeechKey(req, target) {
  if (requiresPersonalApiKey(req.session?.userRole) && !target.personalKey) {
    throw new SpeechError(
      `Voice needs your own ${target.provider} key. Add one in Settings → Vault.`,
      'SPEECH_PERSONAL_KEY_REQUIRED',
      403,
    );
  }
}

export async function handleCapabilities(req, res) {
  try {
    const target = await resolveChatTarget(targetArgs(req, req.query));
    res.json({
      provider: target.provider,
      model: target.model,
      capabilities: target.capabilities,
      limits: ATTACHMENT_LIMITS,
    });
  } catch (error) {
    sendError(res, error);
  }
}

export async function handleTranscribe(req, res) {
  try {
    const audio = parseDataUrl(req.body?.audio);
    if (!audio || !audio.mime.startsWith('audio/')) {
      throw new SpeechError('Send the recording as an audio data URL.', 'SPEECH_INVALID', 400);
    }
    if (audio.bytes > ATTACHMENT_LIMITS.audio) {
      throw new SpeechError('That recording is too long. Keep voice messages under about 4 minutes.', 'SPEECH_TOO_LARGE', 413);
    }
    const target = await resolveChatTarget(targetArgs(req, req.body));
    if (target.capabilities.voiceInput !== 'transcribe') {
      throw new SpeechError(`${target.model} has no speech-to-text.`, 'SPEECH_UNSUPPORTED', 400);
    }
    assertSpeechKey(req, target);
    const result = await transcribeAudio({
      provider: target.provider,
      apiKey: target.apiKey,
      baseUrl: target.baseUrl,
      audio,
    });
    res.json({ text: result.text, model: result.model });
  } catch (error) {
    sendError(res, error);
  }
}

export async function handleSpeech(req, res) {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) throw new SpeechError('Nothing to read aloud.', 'SPEECH_EMPTY', 400);
    const target = await resolveChatTarget(targetArgs(req, req.body));
    if (!target.capabilities.voiceOutput) {
      throw new SpeechError(`${target.model} has no text-to-speech.`, 'SPEECH_UNSUPPORTED', 400);
    }
    assertSpeechKey(req, target);
    const result = await synthesizeSpeech({
      provider: target.provider,
      apiKey: target.apiKey,
      baseUrl: target.baseUrl,
      text,
    });
    res.json({ audio: `data:${result.mime};base64,${result.base64}`, model: result.model });
  } catch (error) {
    sendError(res, error);
  }
}
