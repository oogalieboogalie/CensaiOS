import {
  formatSubAgentRoster,
} from '../server/memory/subagentRoster.js';
import {
  findReusableSubAgents,
  formatReuseNotice,
} from '../server/tools/handlers/subagentReuse.js';

describe('sub-agent roster awareness', () => {
  const roster = [
    {
      id: 'builder-atlas',
      name: 'Builder',
      class: 'builder',
      permission: 'worker',
      project_id: 'atlas-censaihub',
      specialty: 'Small code changes and focused edits',
    },
    {
      id: 'reviewer-atlas',
      name: 'Reviewer',
      class: 'auditor',
      permission: 'reviewer',
      project_id: 'atlas-homebase',
      specialty: 'Code review and risk detection',
    },
  ];

  test('formats every active role for persistent awareness', () => {
    const prompt = formatSubAgentRoster(roster);
    expect(prompt).toContain('You already have 2 active sub-agent');
    expect(prompt).toContain('Reuse them before creating another');
    expect(prompt).toContain('Builder');
    expect(prompt).toContain('Reviewer');
  });

  test('mandatory roster search finds exact names and equivalent roles', () => {
    const exact = findReusableSubAgents(roster, { name: 'Builder' });
    expect(exact[0].sub.id).toBe('builder-atlas');

    const equivalent = findReusableSubAgents(roster, {
      name: 'Backend Implementer',
      class: 'builder',
      permission: 'worker',
      projectId: 'atlas-censaihub',
      specialty: 'focused code changes',
    });
    expect(equivalent[0].sub.id).toBe('builder-atlas');
  });

  test('reuse notice blocks creation and directs dispatch to existing agents', () => {
    const matches = findReusableSubAgents(roster, { name: 'Reviewer' });
    const notice = formatReuseNotice(matches);
    expect(notice).toContain('Creation stopped');
    expect(notice).toContain('submit_agent_task or dispatch_squad');
    expect(notice).toContain('force_new=true');
  });
});
