// Chat window media endpoints:
//   GET  /api/chat/capabilities?agentId=&workspaceId=  → what the agent's model accepts
//   POST /api/chat/transcribe { agentId, workspaceId, audio }  → { text }
//   POST /api/chat/speech     { agentId, workspaceId, text }   → { audio }
// Keys never leave the server; responses carry only provider/model names.

import { resolveChatTarget } from './chatTarget.js';
import { publicChatError } from './httpErrors.js';
import { parseDataUrl } from '../../aiGateway/multimodal.js';
import { ATTACHMENT_LIMITS } from '../../../src/lib/chat/modelCapabilities.js';
import { SpeechError, synthesizeElevenLabs, synthesizeSpeech, transcribeAudio } from '../../aiGateway/speech.js';
import { getUserApiKeyConfig } from '../../security/userApiKeys.js';
import { getSecret } from '../../secrets.js';
import { mayUseServerKeys } from '../../security/serverKeys.js';

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

// Voice spends the person's own key. The server's keys (the computer
// owner's on a local install) only for those allowed (security/serverKeys.js).
async function assertSpeechKey(req, target) {
  if (target.personalKey) return;
  const allowed = await mayUseServerKeys({
    userId: req.session?.userId || null,
    userRole: req.session?.userRole || null,
  });
  if (!allowed) {
    throw new SpeechError(
      `Voice needs your own ${target.provider} key. Add one in Settings → Vault.`,
      'SPEECH_PERSONAL_KEY_REQUIRED',
      403,
    );
  }
}

// Agents imported from ElevenLabs keep their voice: it reads answers aloud
// with the person's ElevenLabs key, whatever model writes the answer.
async function elevenLabsVoice(req, target) {
  const voice = target.voice;
  if (voice?.provider !== 'elevenlabs' || !voice.voiceId) return null;
  const userId = req.session?.userId;
  let apiKey = null;
  if (userId) {
    try { apiKey = (await getUserApiKeyConfig(userId, 'elevenlabs'))?.apiKey || null; } catch { /* best effort */ }
  }
  if (!apiKey && await mayUseServerKeys({ userId, userRole: req.session?.userRole || null })) {
    apiKey = getSecret('ELEVENLABS_API_KEY') || null;
  }
  return { voiceId: voice.voiceId, model: voice.model || null, apiKey };
}

export async function handleCapabilities(req, res) {
  try {
    const target = await resolveChatTarget(targetArgs(req, req.query));
    const voice = await elevenLabsVoice(req, target);
    res.json({
      provider: target.provider,
      model: target.model,
      capabilities: voice?.apiKey ? { ...target.capabilities, voiceOutput: true } : target.capabilities,
      ...(voice ? { voice: { provider: 'elevenlabs', voiceId: voice.voiceId, ready: Boolean(voice.apiKey) } } : {}),
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
    await assertSpeechKey(req, target);
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
    const voice = await elevenLabsVoice(req, target);
    if (voice) {
      const spoken = await synthesizeElevenLabs({ apiKey: voice.apiKey, voiceId: voice.voiceId, modelId: voice.model, text });
      return res.json({ audio: `data:${spoken.mime};base64,${spoken.base64}`, model: spoken.model });
    }
    if (!target.capabilities.voiceOutput) {
      throw new SpeechError(`${target.model} has no text-to-speech.`, 'SPEECH_UNSUPPORTED', 400);
    }
    await assertSpeechKey(req, target);
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
