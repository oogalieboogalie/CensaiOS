import { recallMemories } from '../../memory/core/memory.js';
import { queryBrain } from '../../memory/duckbrain/index.js';
import { rankMemories } from '../../memory/duckbrain/bellman.js';

const BRAIN_ACTIONS = new Set([
  'recall', 'associations', 'timeline', 'entity', 'collective', 'compression', 'core',
]);

function formatBundle(agentId, action, ranked, brainOk) {
  if (ranked.length === 0) {
    return brainOk
      ? `deep_memory (${action}): the brain holds nothing on that yet.`
      : `deep_memory (${action}): brain offline — showing live store only, nothing found.`;
  }
  const lines = ranked.map((r, i) => {
    const head = `${i + 1}. [${r.source || 'live'}] ${r.title || '(untitled)'}`;
    const body = String(r.content || '').slice(0, 600);
    return body ? `${head}\n   ${body}` : head;
  });
  return `deep_memory (${action}) for ${agentId}${brainOk ? '' : ' [brain offline]'}:\n${lines.join('\n')}`;
}

export async function handleDeepMemoryTool(agentId, name, args, context = {}) {
  const action = String(args?.action || 'recall').toLowerCase();
  if (!BRAIN_ACTIONS.has(action)) {
    return `Unknown deep_memory action "${args?.action}". Use recall, associations, timeline, entity, collective, compression, or core.`;
  }
  const query = String(args?.query || '').slice(0, 500);
  const limit = Math.max(1, Math.min(Number(args?.limit) || 8, 25));
  if ((action === 'recall' || action === 'associations' || action === 'entity' || action === 'collective') && !query.trim()) {
    return `deep_memory (${action}) needs a query — what should I look up?`;
  }

  const brainAgent = String(agentId || '').toLowerCase();
  const [brain, live] = await Promise.all([
    queryBrain({ agent: brainAgent, action, query, limit }),
    (action === 'recall' || action === 'entity')
      ? recallMemories(agentId, query, { ...context, limit }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const brainRows = (brain.rows || []).map((r) => ({ ...r, source: r.source || 'brain' }));
  const liveRows = (Array.isArray(live) ? live : []).map((r) => ({
    source: 'live',
    title: r.title || r.memory_title || '(live memory)',
    content: r.content || r.memory_content || '',
    importance: r.importance ?? r.importance_level,
    emotional_weight: r.emotional_weight,
    timestamp: r.created_at || r.timestamp,
  }));

  const ranked = rankMemories([...brainRows, ...liveRows], limit);
  return formatBundle(agentId, action, ranked, brain.ok);
}
