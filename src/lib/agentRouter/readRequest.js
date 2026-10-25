// Message router, step one (diagram 03): read a plain request like
// "can we make some documents for work and create a microapp for invoices?"
// and cut it into parts, each with tags like [create] [docs] [work].
// Pure: shared by the server route, the Message Router window and tests.
import { stem } from '../tools/toolMeaning.js';

// What the person wants done. The first word of each list is the tag.
export const ROUTER_ACTIONS = Object.freeze([
  ['create', 'make', 'build', 'write', 'draft', 'generate', 'add', 'start', 'set', 'design', 'prepare'],
  ['find', 'search', 'look', 'research', 'discover'],
  ['fix', 'repair', 'debug', 'solve'],
  ['review', 'check', 'audit', 'proofread'],
  ['send', 'email', 'tell', 'post', 'reply'],
  ['plan', 'schedule', 'organize', 'organise', 'book'],
  ['summarize', 'summarise', 'sum', 'explain'],
]);

// What kind of thing it is. The id is the tag; `template` is the starter
// recipe used when the board has no blueprint for it yet.
export const ROUTER_THINGS = Object.freeze([
  { id: 'docs', words: ['doc', 'docs', 'document', 'report', 'memo', 'letter', 'policy', 'note', 'proposal', 'contract'], template: 'Starter document: title, purpose, sections, sign-off', agentWords: ['document', 'write', 'writer', 'office', 'note', 'policy'] },
  { id: 'microapp', words: ['microapp', 'app', 'tool', 'calculator', 'tracker', 'dashboard', 'form', 'widget'], template: 'Starter micro-app: one screen, inputs, a saved list, export', agentWords: ['app', 'code', 'developer', 'build', 'builder', 'engineer'] },
  { id: 'script', words: ['script', 'code', 'program', 'function', 'bot'], template: 'Starter script: what it reads, what it does, what it prints', agentWords: ['code', 'coding', 'developer', 'script', 'engineer'] },
  { id: 'workflow', words: ['workflow', 'automation', 'routine', 'pipeline', 'process'], template: 'Starter workflow: trigger, steps, who checks, where it lands', agentWords: ['workflow', 'automation', 'operation', 'process', 'manager'] },
  { id: 'team', words: ['team', 'squad', 'crew', 'agents'], template: 'Starter team: lead, helpers, who checks whose work', agentWords: ['team', 'lead', 'manager', 'orchestrator', 'coordinator'] },
  { id: 'sheet', words: ['spreadsheet', 'sheet', 'budget', 'table', 'ledger', 'books'], template: 'Starter sheet: columns, totals, a chart', agentWords: ['sheet', 'finance', 'money', 'book', 'budget', 'account'] },
  { id: 'email', words: ['email', 'emails', 'message', 'outreach', 'intro', 'newsletter'], template: 'Starter email: hello, why you, one ask, sign-off', agentWords: ['sales', 'outreach', 'email', 'message', 'write'] },
  { id: 'leads', words: ['lead', 'leads', 'prospect', 'prospects', 'customer', 'customers', 'client', 'clients'], template: 'Starter lead list: name, why they fit, how to reach them', agentWords: ['lead', 'sales', 'research', 'scout', 'hound'] },
]);

const FILLER = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'my', 'me', 'i', 'it', 'in', 'on', 'at', 'with', 'this', 'that',
  'some', 'please', 'can', 'could', 'would', 'will', 'you', 'we', 'us', 'our', 'do', 'does', 'something', 'up', 'new',
  'let', 'lets', 'want', 'need', 'like', 'also', 'then', 'about', 'few', 'couple', 'into', 'from', 'by', 'be', 'get', 'go',
  'just', 'quick', 'little', 'maybe', 'help', 'hey', 'is', 'are', 'all', 'any', 'one', 'two', 'out',
  'them', 'they', 'him', 'her', 'everyone', 'there', 'here', 'so', 'what', 'how', 'should', 'have', 'has',
]);

const ACTION_BY_WORD = new Map(ROUTER_ACTIONS.flatMap((group) => group.map((word) => [stem(word), group[0]])));
const THING_BY_WORD = new Map(ROUTER_THINGS.flatMap((thing) => thing.words.map((word) => [stem(word), thing.id])));

function rawWords(text) {
  return String(text || '').toLowerCase().replace(/micro[\s-]app/g, 'microapp').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).filter(Boolean);
}

/** Plain lowercase words with their endings trimmed ("documents" -> "document"). */
export function routerWords(text) {
  return rawWords(text).map(stem);
}

const hasAction = (text) => routerWords(text).some((w) => ACTION_BY_WORD.has(w));
const thingOf = (text) => routerWords(text).map((w) => THING_BY_WORD.get(w)).find(Boolean) || null;

/**
 * Cut one request into the parts that need different agents. "and", "then",
 * commas and full stops start a new part only when what follows asks for
 * a new job: its own action, or a different kind of thing. "notes and
 * letters" (both documents) stays one part.
 */
export function splitRequest(text) {
  const pieces = String(text || '').slice(0, 2000)
    .split(/\b(?:and then|and also|as well as|and|then|also|plus)\b|[;,.?!\n]+/i)
    .map((piece) => piece.trim())
    .filter((piece) => routerWords(piece).length > 0);
  const parts = [];
  for (const piece of pieces) {
    const thing = thingOf(piece);
    const standsAlone = hasAction(piece) || (thing && thing !== thingOf(parts.at(-1)));
    if (parts.length === 0 || standsAlone) parts.push(piece);
    else parts[parts.length - 1] = `${parts[parts.length - 1]} and ${piece}`;
  }
  return parts.slice(0, 8);
}

/** Make a tag safe for {{$recall_<topic>_memory}}. */
export function slotWord(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'general';
}

/**
 * Read one part: the action, the kind of thing, and the topic words left
 * over. Returns the tags the router shows, like the diagram:
 * [create] [docs] [work] [work={{$recall_work_memory}}].
 */
export function readIntent(part, { previousAction = null } = {}) {
  const raw = rawWords(part);
  const words = raw.map(stem);
  const action = words.map((w) => ACTION_BY_WORD.get(w)).find(Boolean) || previousAction || 'create';
  const thing = words.map((w) => THING_BY_WORD.get(w)).find(Boolean) || null;
  // Topic words keep their own spelling ("invoices", "dale city"); matching uses the trimmed form.
  const topicRaw = [...new Set(raw.filter((w, i) => !FILLER.has(w) && !FILLER.has(words[i]) && !ACTION_BY_WORD.has(words[i]) && !THING_BY_WORD.has(words[i])))].slice(0, 3);
  const topicWords = topicRaw.map(stem);
  const topic = topicRaw.join(' ') || null;
  const slot = slotWord(topicRaw.join('_') || thing || 'general');
  const memorySlot = `{{$recall_${slot}_memory}}`;
  const tags = [action, thing, ...topicRaw].filter(Boolean);
  return { text: String(part || '').trim(), action, thing, topic, topicWords, memorySlot, tags: [...tags, `${slot}=${memorySlot}`] };
}

/** The whole request read into intents. A part that names a new kind of thing but no action means make it. */
export function readRequest(text) {
  return splitRequest(text).map((part) => readIntent(part));
}
