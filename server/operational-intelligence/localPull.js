import { readCurrentProject } from '../routes/projects/shared.js';
import { createWorkspaceEvent } from './factories.js';
import { ensureOperationalIntelligenceSchema } from './schema.js';
import { runGit } from '../tools/handlers/git/shared.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';

const actor = { kind: 'system', id: 'local-fast-forward-sync' };

async function git(cwd, args, gitRunner) {
  const result = await gitRunner(cwd, args, { timeout: 120000 });
  return {
    ok: Boolean(result.ok),
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    exitCode: result.exitCode || 0,
  };
}

function blocked(reason, detail = {}) {
  return { ok: false, status: 'blocked', reason, ...detail };
}

export async function safeFastForwardProject(project, { remote = 'origin', branch = null, gitRunner = runGit } = {}) {
  if (!project?.path) return blocked('no_current_project');
  const runtimeProjectPath = resolveProjectPathForRuntime(project.path);
  const root = await git(runtimeProjectPath, ['rev-parse', '--show-toplevel'], gitRunner);
  if (!root.ok) return blocked('not_git_worktree', { projectPath: project.path, error: root.stderr || root.stdout });
  const cwd = root.stdout;

  const status = await git(cwd, ['status', '--porcelain'], gitRunner);
  if (!status.ok) return blocked('status_failed', { cwd, error: status.stderr || status.stdout });
  if (status.stdout) return blocked('dirty_worktree', { cwd, files: status.stdout.split(/\r?\n/).slice(0, 20) });

  const head = await git(cwd, ['rev-parse', 'HEAD'], gitRunner);
  if (!head.ok) return blocked('head_unknown', { cwd, error: head.stderr || head.stdout });

  let currentBranch = branch;
  if (!currentBranch) {
    const branchResult = await git(cwd, ['branch', '--show-current'], gitRunner);
    if (!branchResult.ok || !branchResult.stdout) return blocked('detached_head', { cwd });
    currentBranch = branchResult.stdout;
  }

  const fetch = await git(cwd, ['fetch', '--prune', remote], gitRunner);
  if (!fetch.ok) return blocked('fetch_failed', { cwd, error: fetch.stderr || fetch.stdout });

  let upstream = `${remote}/${currentBranch}`;
  if (!branch) {
    const upstreamResult = await git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], gitRunner);
    if (upstreamResult.ok && upstreamResult.stdout) upstream = upstreamResult.stdout;
  }

  const upstreamSha = await git(cwd, ['rev-parse', upstream], gitRunner);
  if (!upstreamSha.ok) return blocked('upstream_missing', { cwd, branch: currentBranch, upstream, error: upstreamSha.stderr || upstreamSha.stdout });

  const remoteContainsHead = await git(cwd, ['merge-base', '--is-ancestor', head.stdout, upstream], gitRunner);
  const headContainsRemote = await git(cwd, ['merge-base', '--is-ancestor', upstream, 'HEAD'], gitRunner);
  if (headContainsRemote.ok) {
    return {
      ok: true,
      status: 'up_to_date',
      cwd,
      branch: currentBranch,
      upstream,
      beforeSha: head.stdout,
      afterSha: head.stdout,
    };
  }
  if (!remoteContainsHead.ok) {
    return blocked('not_fast_forward', { cwd, branch: currentBranch, upstream, beforeSha: head.stdout, remoteSha: upstreamSha.stdout });
  }

  const merge = await git(cwd, ['merge', '--ff-only', upstream], gitRunner);
  if (!merge.ok) return blocked('merge_failed', { cwd, branch: currentBranch, upstream, error: merge.stderr || merge.stdout });
  const after = await git(cwd, ['rev-parse', 'HEAD'], gitRunner);
  return {
    ok: true,
    status: 'pulled',
    cwd,
    branch: currentBranch,
    upstream,
    beforeSha: head.stdout,
    afterSha: after.ok ? after.stdout : upstreamSha.stdout,
    output: merge.stdout || merge.stderr,
  };
}

export async function safeFastForwardCurrentProject(options = {}) {
  return safeFastForwardProject(await readCurrentProject(), options);
}

function shouldMarkPulled(result) {
  return result?.ok && (result.status === 'pulled' || result.status === 'up_to_date');
}

export async function syncPulledTodoArtifacts(db, result, { workspaceId } = {}) {
  await ensureOperationalIntelligenceSchema(db);
  if (!shouldMarkPulled(result)) return [];
  const scope = String(workspaceId || '').trim();
  if (!scope) throw new Error('workspaceId is required');
  const { rows } = await db.query(
    `SELECT *
       FROM artifacts
      WHERE workspace_id = $1
        AND artifact_type = 'task'
        AND deleted_at IS NULL
        AND data->>'implementationStatus' = 'merged'
        AND data->>'pullRequired' = 'true'`,
    [scope]
  );
  const updated = [];
  const now = new Date().toISOString();
  for (const row of rows) {
    const data = {
      ...(row.data || {}),
      implementationStatus: 'pulled',
      pullRequired: false,
      pulledAt: now,
      pulledSha: result.afterSha || null,
      lastSyncedAt: now,
    };
    const update = await db.query(
      'UPDATE artifacts SET data = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(data), row.id]
    );
    updated.push(update.rows[0]);
    await createWorkspaceEvent({ db }, {
      workspaceId: row.workspace_id,
      type: 'todo.implementation.pulled',
      actor,
      artifactId: row.id,
      payload: { branch: result.branch || null, sha: result.afterSha || null },
    });
  }
  return updated;
}
