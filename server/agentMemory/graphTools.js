// server/agentMemory/graphTools.js
//
// The knowledge-graph memory tools every agent gets next to remember_fact:
//
//   link_things     remember how two things are connected, and since when
//   end_link        a connection stopped being true (kept as a past one)
//   what_was_true   facts and connections that were true on a given date
//
// Same scope as tools.js: the person who started the run, this agent only.

import { day, describeFact, factsAsOf, matchFacts, parseWhen } from './facts.js';
import { describeRelation, matchRelations, nameKey, normalizeLinkInput } from './graph.js';
import * as graphStore from './graphStore.js';
import * as store from './store.js';

const fn = (name, description, properties, required) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});

export const GRAPH_TOOL_DEFINITIONS = Object.freeze([
  fn('link_things',
    'Remember how two things are connected (a person, company, place or project), e.g. "Alex" "works at" "Iowa AI LLC". Connections are kept with the dates they were true, so you can later answer what was true on any date. Set replaces to true when the new connection replaces an old one of the same kind (a new job, a move); the old one is kept as a past connection.',
    {
      from: { type: 'string', description: 'The first thing, e.g. "Alex". Default: the user.' },
      relation: { type: 'string', description: 'How they are connected, e.g. "works at", "lives in", "is the sister of".' },
      to: { type: 'string', description: 'The second thing, e.g. "Iowa AI LLC".' },
      since: { type: 'string', description: 'When it became true (a date like 2026-01-01). Default: now.' },
      until: { type: 'string', description: 'When it stopped being true, if it already has.' },
      replaces: { type: 'boolean', description: 'True if this replaces the earlier connection of the same kind from the same thing.' },
      from_kind: { type: 'string', enum: ['person', 'company', 'place', 'project', 'thing'] },
      to_kind: { type: 'string', enum: ['person', 'company', 'place', 'project', 'thing'] },
    },
    ['relation', 'to']),
  fn('end_link',
    'A connection you remembered stopped being true (someone left a job, moved away). It is kept as a past connection with its end date.',
    {
      from: { type: 'string', description: 'The first thing. Default: the user.' },
      relation: { type: 'string', description: 'How they were connected.' },
      to: { type: 'string', description: 'The second thing.' },
      ended: { type: 'string', description: 'When it stopped (a date). Default: now.' },
    },
    ['relation', 'to']),
  fn('what_was_true',
    'Look back in your memory: the facts and connections that were true on a given date, as you know them now.',
    {
      date: { type: 'string', description: 'The date to look at, e.g. 2025-06-01.' },
      about: { type: 'string', description: 'Only things matching these words. Leave out for everything.' },
    },
    ['date']),
]);

const STATUS_WORDS = { same: 'I already knew that', new: 'Saved the connection', ended: 'Marked as ended' };

export function createGraphTools({ db, userId, agentId }) {
  const scope = { userId, agentId };
  return {
    async link_things(args) {
      const input = normalizeLinkInput(args);
      const result = await graphStore.writeRelation(db, { ...scope, input, source: 'agent' });
      const closed = result.status === 'new' && result.closed.length
        ? ` (kept as past: ${result.closed.map((r) => `${r.from_name} ${r.relation} ${r.to_name}`).join('; ')})`
        : '';
      return `${STATUS_WORDS[result.status]}: ${describeRelation(result.relation)}${closed}`;
    },
    async end_link(args) {
      const from = nameKey(args.from || 'the user');
      const to = nameKey(args.to);
      const relation = String(args.relation || '').trim().toLowerCase();
      const open = (await graphStore.currentRelations(db, { ...scope, limit: 500 }))
        .find((r) => nameKey(r.from_name) === from && nameKey(r.to_name) === to && r.relation_key === relation);
      if (!open) return `Memory: I have no current connection "${args.from || 'the user'} ${args.relation} ${args.to}".`;
      const row = await graphStore.endRelation(db, { ...scope, id: open.id, endAt: parseWhen(args.ended, new Date()), source: 'agent' });
      return `${STATUS_WORDS.ended}: ${describeRelation(row)}`;
    },
    async what_was_true(args) {
      const at = parseWhen(args.date, new Date());
      const [history, links] = await Promise.all([
        store.factHistory(db, scope),
        graphStore.relationsOn(db, { ...scope, trueAt: at }),
      ]);
      const about = String(args.about || '').slice(0, 200);
      const facts = factsAsOf(history, { trueAt: at });
      const factsFound = about ? matchFacts(facts, about) : facts;
      const linksFound = matchRelations(links, about);
      if (!factsFound.length && !linksFound.length) return `Nothing in memory was true on ${day(at)}${about ? ` about "${about}"` : ''}.`;
      const lines = [`True on ${day(at)}:`];
      if (factsFound.length) lines.push('Facts:', ...factsFound.slice(0, 20).map((f) => `- ${describeFact(f)}`));
      if (linksFound.length) lines.push('Connections:', ...linksFound.slice(0, 30).map((r) => `- ${describeRelation(r)}`));
      return lines.join('\n');
    },
  };
}
