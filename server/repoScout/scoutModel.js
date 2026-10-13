// The scout's one model call: given the places the map found, pick the exact
// file, line and column for the change and say why in one sentence. The
// scout runs on the person's own key and never on the core agent's model.

import { callModel, createModelAccessContext, resolveChatModelConfig, workspaceUsageSink } from '../aiGateway/index.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';

const SOURCE = 'repo-scout';

export function buildScoutMessages(request, candidates) {
  const places = candidates.map((c, i) => [
    `### Place ${i + 1}: ${c.path}${c.symbol ? ` (inside ${c.symbol})` : ''}, used by ${c.usedBy} file(s)`,
    c.snippet,
  ].join('\n')).join('\n\n');
  return [
    {
      role: 'system',
      content: [
        'You are a scout. You do not edit code. You read the places a repo map found and point to the',
        'single best spot where the requested change should be made, so the main agent can make it.',
        'Answer with JSON only: {"file": "<path from a place heading>", "line": <number shown in that place>,',
        '"column": <1-based column on that line>, "reason": "<one plain sentence>", "confidence": "high"|"medium"|"low"}.',
      ].join(' '),
    },
    { role: 'user', content: `Change wanted: ${request}\n\n${places}` },
  ];
}

export function parseScoutAnswer(text) {
  const raw = String(text || '').trim();
  const body = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)?.[1] || /\{[\s\S]*\}/.exec(raw)?.[0] || raw;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed.file !== 'string') return null;
    return {
      file: parsed.file.trim(),
      line: Math.floor(Number(parsed.line)) || null,
      column: Math.floor(Number(parsed.column)) || 1,
      reason: String(parsed.reason || '').slice(0, 400),
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    };
  } catch {
    return null;
  }
}

/** A function that sends messages to the scout's model and returns its text. */
export async function scoutCompleter({ userId, workspaceId, provider, model }) {
  let apiKey;
  if (provider !== 'ollama') {
    const key = await getUserApiKeyConfig(userId, provider);
    if (!key?.apiKey) return null;
    apiKey = key.apiKey;
  }
  const base = resolveChatModelConfig({ modelProvider: provider, modelName: model });
  const config = { ...base, model, ...(apiKey ? { apiKey } : {}) };
  const accessContext = workspaceId ? createModelAccessContext({ userId, workspaceId, source: SOURCE }) : null;
  return async (messages) => {
    const data = await callModel({
      config,
      modelProvider: provider,
      modelName: model,
      accessContext,
      body: { model, messages, max_tokens: 300, temperature: 0 },
      timeoutMs: 30000,
      logContext: { source: SOURCE },
      usageAttribution: workspaceId ? { workspaceId, actor: { kind: 'user', id: userId }, source: SOURCE } : null,
      usageSink: workspaceId ? workspaceUsageSink : null,
    });
    return data?.choices?.[0]?.message?.content || '';
  };
}
