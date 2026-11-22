// Each family agent has the tools of its role with nothing equipped. Trust
// mode off makes the ones that change things wait; the owner-only list keeps
// the computer, its database, Docker and mail to the computer's owner.
import { jest } from '@jest/globals';
import { FAMILY_AGENTS } from '../src/data/family-agents.js';
import { familyAsksFirst, familyDefaultToolNames, familyToolPolicy } from '../server/tools/rbac/familyBaseline.js';
import { FAMILY_ROLE_TOOL_NAMES, FAMILY_ROLE_TOOL_POLICIES } from '../server/tools/rbac/familyRoleTools.js';
import { changesHost } from '../server/tools/rbac/hostOwnerOnly.js';
import { findApprovalGrant, roleModuleIds } from '../server/approvals/grants.js';
import { TOOL_DEFINITIONS } from '../server/tools/definitions.js';

const has = (agentId, tool) => familyDefaultToolNames(agentId).includes(tool);
const nothingEquipped = () => ({ query: jest.fn(async () => ({ rows: [] })) });

test('every role tool is a real tool, listed once', () => {
  const real = new Set(TOOL_DEFINITIONS.map((tool) => tool.function.name));
  const names = FAMILY_ROLE_TOOL_POLICIES.map((entry) => entry.name);
  expect(names.filter((name) => !real.has(name))).toEqual([]);
  expect(new Set(names).size).toBe(names.length);
  for (const agent of FAMILY_AGENTS) expect(FAMILY_ROLE_TOOL_NAMES[agent.id]?.length).toBeGreaterThan(0);
});

test('everyone looks things up; the powerful tools go to the roles they belong to', () => {
  for (const { id } of FAMILY_AGENTS) {
    for (const tool of ['web_search', 'github_read_file', 'read_calendar', 'read_journal', 'run_tests', 'submit_pr']) {
      expect(has(id, tool)).toBe(true);
    }
  }
  const who = (tool) => FAMILY_AGENTS.map((agent) => agent.id).filter((id) => has(id, tool)).sort();
  expect(who('terminal_run')).toEqual(['architect', 'atlas', 'foundation', 'genesis', 'nexus', 'phoenix']);
  expect(who('postgres_query')).toEqual(['atlas', 'nexus']);
  expect(who('restart_service')).toEqual(['foundation', 'nexus', 'phoenix']);
  expect(who('mailcow_add_mailbox')).toEqual(['foundation']);
});

test('tools that change things ask first with Trust mode off; tools that look never do', async () => {
  for (const tool of ['terminal_run', 'sandbox_exec', 'local_write_file', 'merge_pr', 'postgres_query', 'restart_service']) {
    const agentId = tool.startsWith('postgres') ? 'nexus' : tool === 'restart_service' ? 'foundation' : 'atlas';
    expect(familyAsksFirst(agentId, tool)).toBe(true);
    const db = nothingEquipped();
    expect(await findApprovalGrant(db, { workspaceId: 'ws-1', agentId, toolName: tool }))
      .toEqual({ moduleId: 'role', capabilityId: `role.${tool}`, mode: 'execute_with_approval' });
    expect(db.query).not.toHaveBeenCalled();
  }
  for (const tool of ['web_search', 'container_logs', 'db_inspect', 'run_tests']) {
    expect(familyAsksFirst('nexus', tool)).toBe(false);
    expect(await findApprovalGrant(nothingEquipped(), { workspaceId: 'ws-1', agentId: 'nexus', toolName: tool })).toBeNull();
  }
  // Not her role: no grant, and no policy.
  expect(familyToolPolicy('echo', 'terminal_run')).toBeNull();
  expect(await findApprovalGrant(nothingEquipped(), { workspaceId: 'ws-1', agentId: 'echo', toolName: 'terminal_run' })).toBeNull();
});

test('the computer, its database, Docker and mail stay with the computer\'s owner', () => {
  for (const tool of ['terminal_run', 'sandbox_exec', 'local_read_file', 'local_write_file', 'run_tests',
    'db_inspect', 'postgres_table_sample', 'postgres_schema_audit', 'postgres_query', 'postgres_exec_file',
    'container_status', 'container_logs', 'restart_service', 'mailcow_domains', 'mailcow_add_mailbox',
    'github_write_file', 'merge_pr', 'submit_pr']) {
    expect(changesHost(tool, {})).toBe(true);
  }
});

test('an approval filed under a role is kept when the agent\'s modules change', () => {
  expect(roleModuleIds('atlas')).toEqual(expect.arrayContaining(['role', 'project-writer', 'canvas-designer']));
});
