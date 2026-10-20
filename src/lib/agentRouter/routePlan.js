// Message router, step two (diagram 03): send each part of a request
// to the right agent, with the right memory and template, over one shared
// line (v1/bus/chat/agent...). Pure: the server builds the plan with it and
// the Message Router window turns each routed part into a chat message.
import { relatedWords } from '../tools/toolMeaning.js';
import { ROUTER_THINGS, readRequest, routerWords } from './readRequest.js';

const THINGS_BY_ID = new Map(ROUTER_THINGS.map((thing) => [thing.id, thing]));
export const ROUTER_FALLBACK_AGENT = 'censai';

/** The board's shared line, like the diagram's v1/bus/chat/agent8d6f4h. Same board, same line. */
export function busAddress(workspaceId) {
  let hash = 2166136261;
  for (const ch of String(workspaceId || 'board')) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `v1/bus/chat/agent${hash.toString(36).padStart(6, '0').slice(-6)}`;
}

function agentText(agent) {
  return [agent.name, agent.role, agent.specialty, agent.description, agent.personality].filter(Boolean).join(' ');
}

function scoreWords(haveWords, wantWords) {
  const have = new Set(haveWords);
  let score = 0;
  const hits = [];
  for (const word of wantWords) {
    if (have.has(word)) { score += 3; hits.push(word); continue; }
    const related = relatedWords(word).find((other) => have.has(other));
    if (related) { score += 1; hits.push(related); }
  }
  return { score, hits: [...new Set(hits)] };
}

/** Pick the agent whose name, role and specialty fit this part best. Falls back to Censai. */
export function pickAgent(intent, agents = []) {
  const thing = THINGS_BY_ID.get(intent.thing);
  const want = [...new Set([...(thing?.agentWords || [intent.action]), ...(intent.topicWords || [])].flatMap(routerWords))];
  let best = null;
  for (const agent of agents) {
    if (!agent?.id || !agent?.name) continue;
    const { score, hits } = scoreWords(routerWords(agentText(agent)), want);
    if (score > 0 && (!best || score > best.score)) best = { agent, score, hits };
  }
  if (best) return { id: String(best.agent.id), name: best.agent.name, why: `fits "${best.hits.slice(0, 3).join(', ')}"`, fallback: false };
  const home = agents.find((agent) => String(agent?.id) === ROUTER_FALLBACK_AGENT);
  return { id: ROUTER_FALLBACK_AGENT, name: home?.name || 'Censai', why: 'no agent on the board fits better, so the main agent takes it', fallback: true };
}

/** A blueprint from the board's shelf when one fits, else the starter recipe for that kind of thing. */
export function pickTemplate(intent, blueprints = []) {
  const want = [...(intent.topicWords || []), ...routerWords(intent.thing || '')];
  let best = null;
  for (const blueprint of blueprints) {
    const have = routerWords([blueprint.title, blueprint.type, blueprint.purpose].filter(Boolean).join(' '));
    const { score } = scoreWords(have, want);
    if (score >= 3 && (!best || score > best.score)) best = { blueprint, score };
  }
  if (best) return { source: 'blueprint', id: best.blueprint.id, title: best.blueprint.title, purpose: best.blueprint.purpose || '' };
  const thing = THINGS_BY_ID.get(intent.thing);
  return { source: 'starter', id: thing ? `starter:${thing.id}` : 'starter:task', title: thing?.template || 'Plain task: what, for whom, when it is done' };
}

/** The message each picked agent gets on the line: the ask, its tags, its template and its memory slot. */
export function routedMessage(part) {
  const lines = [
    `Routed to you by the board's message router (${part.line}).`,
    `Request: ${part.text}`,
    `Tags: ${part.tags.map((tag) => `[${tag}]`).join(' ')}`,
    `Template: ${part.template.title}${part.template.source === 'blueprint' ? ` (blueprint ${part.template.id})` : ''}`,
    `Memory: recall what you already know about "${part.topic || part.thing || 'this'}" first.`,
  ];
  if (part.memory?.notes?.length) lines.push(`Notes you have on it: ${part.memory.notes.join('; ')}`);
  return lines.join('\n');
}

/** The whole plan for one request: the shared line and one routed part per intent. */
export function buildRoutePlan(text, { agents = [], blueprints = [], workspaceId = '', memoryFor = null } = {}) {
  const line = busAddress(workspaceId);
  const parts = readRequest(text).map((intent, index) => {
    const agent = pickAgent(intent, agents);
    const template = pickTemplate(intent, blueprints);
    const memory = { slot: intent.memorySlot, notes: memoryFor ? memoryFor(agent.id, intent) || [] : [] };
    const part = { index: index + 1, line, ...intent, agent, template, memory };
    return { ...part, message: routedMessage(part) };
  });
  return { line, request: String(text || '').trim(), agentsOnLine: agents.length, parts };
}
