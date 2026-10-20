// server/agentMemory/tools.js
//
// The memory tools every agent gets from the run engine:
//
//   remember_fact   save something true (or a change or a correction)
//   recall_memory   look through facts, connections and earlier conversations
//   fact_history    every version of one fact, with its dates
//   link_things, end_link, what_was_true   the knowledge graph (graphTools.js)
//   recall_conversation   earlier chats word for word, with times (turnTools.js)
//
// They work on the memory of the person who started the run, for the agent
// being run, and nothing else.

import { describeFact, describeHistory, factKey, matchFacts, normalizeFactInput } from './facts.js';
import { GRAPH_TOOL_DEFINITIONS, createGraphTools } from './graphTools.js';
import { TURN_TOOL_DEFINITIONS, createTurnTools } from './turnTools.js';
import { describeRelation, matchRelations } from './graph.js';
import * as graphStore from './graphStore.js';
import * as store from './store.js';
import { stamp } from '../../src/lib/agentMemory/timeWords.js';

export { matchFacts };

export const MEMORY_TOOL_NAMES = Object.freeze(['remember_fact', 'recall_memory', 'fact_history', 'link_things', 'end_link', 'what_was_true', 'recall_conversation']);

export const MEMORY_TOOL_DEFINITIONS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'remember_fact',
      description: 'Save a fact to your long-term memory so you still know it in later conversations. Use it when someone tells you something worth keeping (a preference, a name, a date, a decision). If a fact you know changed, save the new value; if it was wrong all along, save it with kind "correction". Old values are kept as dated history.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Who or what the fact is about, e.g. "Alma" or "the project". Default: the user.' },
          attribute: { type: 'string', description: 'What about them, e.g. "favorite color".' },
          value: { type: 'string', description: 'The fact itself, e.g. "green".' },
          valid_from: { type: 'string', description: 'When it became true (a date like 2026-10-12). Default: now.' },
          kind: { type: 'string', enum: ['change', 'correction'], description: '"change" if it changed over time (default), "correction" if the old value was wrong.' },
          shelf: { type: 'string', enum: ['personal', 'project', 'team', 'accomplishments', 'tooling'], description: 'Which memory shelf it goes on: personal (identity, goals, preferences), project (goals, architecture, roadmap, to-dos, state, files), team (culture, goals, purpose), accomplishments (what got done), tooling (sub-agents, tools, where things are). Default: guessed from the words.' },
        },
        required: ['attribute', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: 'Look through your long-term memory: facts you saved and short summaries of earlier conversations, with dates.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What to look for, in plain words.' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fact_history',
      description: 'Show every version of one remembered fact: what it was, from when to when, and when you learned each version.',
      parameters: {
        type: 'object',
        properties: {
          attribute: { type: 'string', description: 'What the fact is about, e.g. "favorite color".' },
          subject: { type: 'string', description: 'Who or what it is about. Leave out to match any.' },
        },
        required: ['attribute'],
      },
    },
  },
  ...GRAPH_TOOL_DEFINITIONS,
  ...TURN_TOOL_DEFINITIONS,
]);

const STATUS_WORDS = {
  same: 'I already knew that',
  new: 'Saved',
  change: 'Saved the new value; the old one stays in the history as a past value',
  correction: 'Corrected; the old value stays in the history as replaced',
};

export function createMemoryTools({ db, userId, agentId, timeZone }) {
  const handlers = {
    async remember_fact(args) {
      const input = normalizeFactInput(args);
      const result = await store.writeFact(db, { userId, agentId, input, source: 'agent' });
      const previous = result.previous ? ` (was "${result.previous.value}")` : '';
      return `${STATUS_WORDS[result.status] || 'Saved'}: ${describeFact(result.fact)}${previous}`;
    },
    async recall_memory(args) {
      const query = String(args?.query || '').slice(0, 300);
      const [facts, episodes, links] = await Promise.all([
        store.currentFacts(db, { userId, agentId, limit: 200 }),
        store.searchEpisodes(db, { userId, agentId, query, limit: 5 }),
        // Current and past connections (an ended one still answers "who was Alma's employer").
        graphStore.relationHistory(db, { userId, agentId }).then((rows) => rows.filter((r) => !r.superseded_at)).catch(() => []),
      ]);
      const found = matchFacts(facts, query).slice(0, 10);
      const linked = query.trim() ? matchRelations(links, query).slice(0, 10) : [];
      if (!found.length && !episodes.length && !linked.length) return `Nothing in memory about "${query}".`;
      const lines = [];
      if (found.length) lines.push('Facts:', ...found.map((f) => `- ${describeFact(f)}`));
      if (linked.length) lines.push('Connections:', ...linked.map((r) => `- ${describeRelation(r)}`));
      if (episodes.length) lines.push('Earlier conversations (first words; read them in full with recall_conversation):', ...episodes.map((e) => `- ${stamp(e.created_at, timeZone)}: ${e.summary}`));
      return lines.join('\n');
    },
    async fact_history(args) {
      const attribute = String(args?.attribute || '').trim();
      const rows = args?.subject
        ? await store.factHistory(db, { userId, agentId, key: factKey(args.subject, attribute) })
        : (await store.factHistory(db, { userId, agentId }))
          .filter((row) => row.attribute.toLowerCase() === attribute.toLowerCase());
      return describeHistory(rows);
    },
    ...createGraphTools({ db, userId, agentId }),
    ...createTurnTools({ db, userId, agentId, timeZone }),
  };
  return {
    definitions: MEMORY_TOOL_DEFINITIONS,
    has: (name) => Object.prototype.hasOwnProperty.call(handlers, name),
    async call(name, args) {
      try {
        return await handlers[name](args || {});
      } catch (error) {
        if (error?.statusCode) return `Memory: ${error.message}`;
        throw error;
      }
    },
  };
}
