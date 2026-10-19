// An in-memory stand-in for the censai_plans table (server/censaiOrchestrator/store.js),
// the workspace member check, the computer-owner check, and the Project Writer and
// trust mode lookups (server/approvals), for the orchestrator's tests.
import { getToolPackageForModule } from '../../server/capabilities/packageCatalog.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const FILE_CHANGERS = ['architect', 'atlas', 'genesis', 'nexus', 'phoenix'];

function projectWriterRow() {
  const pkg = getToolPackageForModule('project-writer');
  return {
    module_id: 'project-writer', capability_id: 'files.write.approved', mode: 'execute_with_approval', equipped_slot: 'mainHand',
    package_id: pkg.id, package_version: pkg.version, manifest_hash: pkg.manifestHash,
  };
}

export function fakePlanDb({
  members = { 'ws-1': { 7: 'owner', 8: 'viewer', 9: 'member' } },
  roles = { 7: 'admin', 8: 'user', 9: 'admin' },
  writers = FILE_CHANGERS,
  trust = [],
} = {}) {
  const plans = new Map();
  let clock = Date.parse('2026-10-18T21:30:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();
  const out = (row) => ({ ...clone(row) });

  async function query(sql, params = []) {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.startsWith('INSERT INTO censai_plans')) {
      const [id, workspaceId, userId, goal, project, jobs] = params;
      const at = tick();
      const row = {
        id, workspace_id: workspaceId, user_id: userId, goal, project, status: 'queued', summary: null,
        jobs: JSON.parse(jobs), created_at: at, updated_at: at, finished_at: null, reported_at: null,
      };
      plans.set(id, row);
      return { rows: [out(row)] };
    }
    if (text.startsWith('UPDATE censai_plans SET status')) {
      const [id, status, summary, jobs, finished] = params;
      const row = plans.get(id);
      if (!row || !['queued', 'running'].includes(row.status)) return { rows: [] };
      Object.assign(row, {
        status, summary, jobs: JSON.parse(jobs), updated_at: tick(), finished_at: finished ? row.finished_at || tick() : null,
      });
      return { rows: [out(row)] };
    }
    if (text.startsWith('UPDATE censai_plans SET reported_at')) {
      const [id, workspaceId, userId] = params;
      const row = plans.get(id);
      const ok = row && row.workspace_id === workspaceId && row.user_id === userId && !row.reported_at
        && ['done', 'stuck', 'stopped'].includes(row.status);
      if (!ok) return { rows: [] };
      row.reported_at = tick();
      return { rows: [{ id }] };
    }
    if (text.includes('count(*)::int AS open')) {
      const [workspaceId, userId] = params;
      const open = [...plans.values()].filter((row) => row.workspace_id === workspaceId && row.user_id === userId
        && ['queued', 'running'].includes(row.status)).length;
      return { rows: [{ open }] };
    }
    if (text.includes("WHERE status IN ('queued', 'running') ORDER BY created_at")) {
      return { rows: [...plans.values()].filter((row) => ['queued', 'running'].includes(row.status)).map(out) };
    }
    if (text.includes('WHERE id = $1 AND workspace_id = $2 AND user_id = $3')) {
      const [id, workspaceId, userId] = params;
      const row = plans.get(id);
      return { rows: row && row.workspace_id === workspaceId && row.user_id === userId ? [out(row)] : [] };
    }
    if (text.includes('FROM censai_plans WHERE id = $1')) {
      const row = plans.get(params[0]);
      return { rows: row ? [out(row)] : [] };
    }
    if (text.includes('FROM censai_plans WHERE workspace_id = $1 AND user_id = $2')) {
      const [workspaceId, userId, limit] = params;
      const open = text.includes('reported_at IS NULL');
      const rows = [...plans.values()]
        .filter((row) => row.workspace_id === workspaceId && row.user_id === userId)
        .filter((row) => !open || ['queued', 'running'].includes(row.status) || !row.reported_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
      return { rows: rows.map(out) };
    }
    if (text === 'SELECT role FROM users WHERE id = $1') {
      const role = roles[params[0]];
      return { rows: role ? [{ role }] : [] };
    }
    if (text.includes('FROM workspace_agent_capabilities c')) {
      const [, agentId] = params;
      return { rows: writers.includes(agentId) ? [projectWriterRow()] : [] };
    }
    if (text.startsWith('SELECT agent_id, trusted FROM workspace_agent_trust')) return { rows: clone(trust) };
    if (text.includes('FROM workspaces w JOIN workspace_members wm')) {
      const [workspaceId, userId] = params;
      const role = members[workspaceId]?.[userId];
      return { rows: role ? [{ id: workspaceId, name: 'Stand-in board', role }] : [] };
    }
    throw new Error(`fakePlanDb: unexpected SQL: ${text.slice(0, 120)}`);
  }

  return { query, plans, row: (id) => plans.get(id) };
}
