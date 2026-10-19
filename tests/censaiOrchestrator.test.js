import { CENSAI_ORCHESTRATOR_PROMPT, withCensaiOrchestrator } from '../server/agents/censaiOrchestrator.js';
import { FAMILY_DEFAULT_TOOL_NAMES } from '../server/tools/rbac/familyBaseline.js';
import { describeHandoffs, deskEntries, handoffsFromTools } from '../src/lib/censai/handoffs.js';

describe('Censai as orchestrator', () => {
  test('only Censai gets the orchestrator prompt', () => {
    expect(withCensaiOrchestrator('censai', 'Base')).toBe(`Base\n\n${CENSAI_ORCHESTRATOR_PROMPT}`);
    expect(withCensaiOrchestrator('Censai', 'Base')).toContain('orchestrator');
    expect(withCensaiOrchestrator('atlas', 'Base')).toBe('Base');
  });

  test('the prompt names the hand-off and read-back tools Censai actually has', () => {
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('message_to');
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('read_messages');
    expect(FAMILY_DEFAULT_TOOL_NAMES.censai).toEqual(expect.arrayContaining(['message_to', 'reply_to', 'read_messages']));
  });

  test('the prompt hands real work out as a checked plan, in Censai\'s casual but thorough voice', () => {
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('hand_off_jobs');
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('jobs_status');
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('casual but thorough');
    expect(CENSAI_ORCHESTRATOR_PROMPT).toContain('something is done only once it was checked');
    expect(FAMILY_DEFAULT_TOOL_NAMES.censai).toEqual(expect.arrayContaining(['hand_off_jobs', 'jobs_status', 'stop_jobs']));
  });

  test('hand-offs come from successful family messages, once per agent', () => {
    const handoffs = handoffsFromTools([
      { tool: 'message_to', ok: true, summary: { target: 'nexus' } },
      { tool: 'message_to', ok: true, summary: { target: 'nexus' } },
      { tool: 'reply_to', summary: { target: 'echo' } },
      { tool: 'message_to', ok: false, summary: { target: 'atlas' } },
      { tool: 'recall', ok: true, summary: { target: 'genesis' } },
    ]);
    expect(handoffs).toEqual([{ agentId: 'nexus', name: 'Nexus' }, { agentId: 'echo', name: 'Echo' }]);
    expect(describeHandoffs(handoffs)).toBe('Handed to Nexus and Echo');
    expect(describeHandoffs([{ name: 'A' }, { name: 'B' }, { name: 'C' }])).toBe('Handed to A, B and C');
    expect(handoffsFromTools(undefined)).toEqual([]);
  });

  test('the Family desk keeps only mail to or from Censai', () => {
    const rows = deskEntries([
      { id: 1, from_agent: 'censai', to_agent: 'foundation', content: 'Pin the image versions.' },
      { id: 2, from_agent: 'foundation', to_agent: 'censai', content: 'Done.' },
      { id: 3, from_agent: 'censai', to_agent: null, content: 'Standup.' },
      { id: 4, from_agent: 'atlas', to_agent: 'nexus', content: 'Not ours.' },
    ]);
    expect(rows.map((r) => r.who)).toEqual(['Censai to Foundation', 'Foundation to Censai', 'Censai to everyone']);
    expect(rows.map((r) => r.direction)).toEqual(['out', 'in', 'out']);
  });
});
