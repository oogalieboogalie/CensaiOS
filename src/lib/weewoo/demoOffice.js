// WeeWoo demo office: a pretend company for boards with no agents yet, or
// for showing the floor off. Ported from the WeeWoo prototype's mock roster
// and its scripted exchanges. It is a pure function of the clock, so every
// teammate watching the same demo sees the same thing at the same time.
// Never mixed with real agents: the window shows one or the other.

import { HELP_CARD_KIND } from '../../../server/agent-registry/helpCardShape.js';

const ROSTER = [
  ['a-secretary', 'Secretary', 'Inbox triage and calendar', 'ops', 'slime', '#7fb3d5', 'check the inbox'],
  ['a-billing', 'Billing', 'Invoice processor', 'ops', 'loaf', '#e8b56b', 'match invoice 1141 to its PO'],
  ['a-scheduler', 'Scheduler', 'Meeting wrangler', 'ops', 'bird', '#d28aa8', 'move the 11:00 to 11:30'],
  ['a-bughunter', 'Bug Hunter', 'Finds and fixes bugs in the code', 'engineering', 'crab', '#86c39a', 'scan open PRs'],
  ['a-reviewer', 'Reviewer', 'Reviews code changes', 'engineering', 'owl', '#9aa6b2', 'review PR #311'],
  ['a-deployer', 'Deployer', 'Ships builds to production', 'engineering', 'rocket', '#e48f6e', 'soak test v3.4.1'],
  ['a-scout', 'Scout', 'Research: reads the web every morning', 'research', 'compass', '#b59ad8', 'count HN mentions'],
  ['a-vibes', 'Vibes', 'Research: sentiment and social listening', 'research', 'book', '#7ec7c0', 'summarise the week'],
  ['a-prospector', 'Prospector', 'Finds sales leads', 'growth', 'fox', '#e6c34f', 'find 9 new leads'],
  ['a-drip', 'Drip', 'Outreach and drip sequences', 'growth', 'droplet', '#a3c46b', 'queue day-1 emails'],
  ['a-hr', 'HR', 'People and onboarding', 'people', 'heart', '#d97a7a', 'prep the new hire pack'],
  ['a-greeter', 'Greeter', 'Says hi to new hires', 'people', 'egg', '#c8a76b', 'welcome the new hire'],
];

const EXCHANGES = [
  ['a-secretary', 'a-billing', 'new invoice 1141. yours?', 'got it, matching to PO.'],
  ['a-bughunter', 'a-reviewer', 'did you touch the retry logic?', 'yeah, last week. PR #311.'],
  ['a-scout', 'a-vibes', '4 HN mentions today.', 'logged. mostly positive.'],
  ['a-prospector', 'a-drip', 'adding 9 leads to your queue.', 'thx, day-1 goes out at 09:00.'],
  ['a-hr', 'a-greeter', 'new hire arriving, say hi!', 'on it, balloons ready.'],
  ['a-deployer', 'a-bughunter', 'v3.4.1 soak clean so far.', 'hold prod till I confirm #2418.'],
  ['a-scheduler', 'a-secretary', 'meeting moved to 11:30.', 'calendar updated.'],
];

const TOOLS = ['shell.exec git status', 'gmail.search', 'file.read README.md', 'web.fetch', 'calendar.update', 'crm.add_lead'];
const TICK_MS = 2300;
const SLOT_MS = 20000;

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const DEMO_DEPT_FOR = Object.fromEntries(ROSTER.map((r) => [`demo-${r[0]}`, r[3]]));
const AGENT_RECORDS = new Map(ROSTER.map(([id, name, role]) => [id, { id, name, role, model_name: 'demo' }]));

/** The demo agent record for an agent id (for listBoardAgents). */
export function demoAgentFor(agentId) {
  return AGENT_RECORDS.get(agentId) || null;
}

/** Windows (agents + help cards) for the demo floor at time `now`. */
export function demoWindows(now = Date.now()) {
  const tick = Math.floor(now / TICK_MS);
  const slot = Math.floor(now / SLOT_MS);
  const wins = ROSTER.map(([id, , , , body, color, intent]) => {
    const h = hash(`${id}:${slot}`);
    const roll = h % 10;
    const at = slot * SLOT_MS + (h % 5000);
    const log = [{ at: at - 60000, kind: 'start', text: intent }, { at: at - 30000, kind: 'done', text: 'done.' }];
    let agentRun;
    if (roll < 5) agentRun = { state: roll < 2 ? 'thinking' : 'tool', task: intent, tool: TOOLS[h % TOOLS.length], startedAt: at, at, log: [...log, { at, kind: 'start', text: intent }] };
    else if (roll < 6) agentRun = { state: 'error', at, log: [...log, { at, kind: 'error', text: 'rate limited, retrying soon' }] };
    else if (roll < 8) agentRun = { state: 'done', at, log };
    else agentRun = { state: 'done', at: at - 30 * 60000, log: [] };
    return { id: `demo-${id}`, kind: 'chat', agentId: id, avatar: { body, color, eyes: 'dots', accessory: 'none' }, agentRun };
  });
  const cards = [];
  for (let back = 0; back < 3; back += 1) {
    const t = tick - back;
    const [from, to, ask, answer] = EXCHANGES[((t % EXCHANGES.length) + EXCHANGES.length) % EXCHANGES.length];
    const at = new Date(t * TICK_MS).toISOString();
    const fromName = AGENT_RECORDS.get(from).name;
    const toName = AGENT_RECORDS.get(to).name;
    cards.push({
      id: `demo-card-${t}`, kind: HELP_CARD_KIND, fromWindowId: `demo-${from}`, toWindowId: `demo-${to}`,
      fromLabel: fromName, toLabel: toName, task: ask, status: back === 0 ? 'working' : 'completed',
      result: back === 0 ? null : answer, createdAt: at, updatedAt: back === 0 ? at : new Date((t + 1) * TICK_MS).toISOString(),
    });
  }
  return [...wins, ...cards];
}
