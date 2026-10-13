// ElevenLabs conversational agents for the importer (see platforms.js).

import { addTools, draft, withModel } from './platformDraft.js';

// ── ElevenLabs ───────────────────────────────────────────────────────

/** ElevenLabs conversational agent JSON (GET /v1/convai/agents/:id). */
export function fromElevenLabs(obj) {
  const config = obj.conversation_config || {};
  const agent = config.agent || {};
  const prompt = agent.prompt || {};
  const carried = ['Name', 'Instructions'];
  const notCarried = [];
  const model = withModel(prompt.llm, 'google', carried, notCarried);
  const rawTools = (Array.isArray(prompt.tools) ? prompt.tools : []).map((tool) => {
    const name = tool?.system_tool_type || tool?.name || tool?.type || 'tool';
    return { name, kind: tool?.type === 'system' ? null : tool?.type };
  });
  const tools = addTools(rawTools, carried, notCarried);
  if (Array.isArray(prompt.tool_ids) && prompt.tool_ids.length) {
    notCarried.push({ name: `${prompt.tool_ids.length} saved tool(s)`, why: 'Tools saved in your ElevenLabs workspace stay there.' });
  }
  let instructions = prompt.prompt || '';
  if (agent.first_message) {
    instructions += `\n\nWhen a conversation starts, open with: "${agent.first_message}"`;
    carried.push('First message (added to the instructions)');
  }
  if (agent.language && agent.language !== 'en') {
    instructions += `\n\nSpeak ${agent.language} unless the person writes in another language.`;
    carried.push(`Language ${agent.language}`);
  }
  const tts = config.tts || {};
  let voice = null;
  if (tts.voice_id) {
    voice = { provider: 'elevenlabs', voiceId: String(tts.voice_id), model: tts.model_id || null };
    carried.push(`Voice ${tts.voice_id} (reads answers aloud with your ElevenLabs key)`);
  }
  if (prompt.knowledge_base?.length) notCarried.push({ name: 'Knowledge base', why: 'Documents stay in ElevenLabs; add them to the board\'s research window.' });
  if (config.asr || config.turn) notCarried.push({ name: 'Phone and turn-taking settings', why: 'The board chats in text, with voice read-aloud.' });
  if (obj.platform_settings?.widget) notCarried.push({ name: 'Website widget', why: 'Stays on ElevenLabs.' });
  return [draft('elevenlabs', {
    name: obj.name || agent.name,
    description: obj.metadata?.description || '',
    instructions,
    provider: model.provider,
    model: model.model,
    tools,
    voice,
    carried,
    notCarried,
  })];
}
