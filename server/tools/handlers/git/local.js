import fs from 'fs';
import path from 'path';
import { resolveLocalProjectRoot } from '../../helpers.js';
import { 
  runGit, formatCommandResult, runNpm 
} from './shared.js';

async function resolveGitRoot(agentId, args = {}, context = {}) {
  let root;
  try {
    root = await resolveLocalProjectRoot(agentId, args.project || args.project_name || 'CensaiHub', context);
  } catch (error) {
    if (context.workspaceId) throw error;
    root = process.cwd();
  }
  const gitCheck = await runGit(root, ['rev-parse', '--show-toplevel']);
  if (!gitCheck.ok) throw new Error(`Not a git working tree: ${root}`);
  return gitCheck.stdout.trim();
}

async function isWorktreeDirty(cwd) {
  const status = await runGit(cwd, ['status', '--porcelain']);
  if (!status.ok) throw new Error(status.stderr || 'git status failed');
  return status.stdout.trim().length > 0;
}

export async function localGitStatus(agentId, args, context = {}) {
  const cwd = await resolveGitRoot(agentId, args, context);
  const [branch, status, recent] = await Promise.all([
    runGit(cwd, ['branch', '--show-current']),
    runGit(cwd, ['status', '--short', '--branch']),
    runGit(cwd, ['log', '--oneline', '-5']),
  ]);
  return [
    `Local git status for ${cwd}`,
    formatCommandResult('BRANCH', branch),
    formatCommandResult('STATUS', status),
    formatCommandResult('RECENT COMMITS', recent),
  ].join('\n\n');
}

export async function localGitFetch(agentId, args, context = {}) {
  const cwd = await resolveGitRoot(agentId, args, context);
  const remote = args.remote || 'origin';
  const result = await runGit(cwd, ['fetch', '--prune', remote], { timeout: 120000 });
  return formatCommandResult(`FETCH ${remote} in ${cwd}`, result);
}

export async function localGitPullFfOnly(agentId, args, context = {}) {
  const cwd = await resolveGitRoot(agentId, args, context);
  if (await isWorktreeDirty(cwd)) {
    return 'Refusing pull: local worktree has uncommitted changes. Run local_git_status and local_git_checkpoint first.';
  }
  const remote = args.remote || 'origin';
  const pullArgs = ['pull', '--ff-only'];
  if (args.branch) pullArgs.push(remote, args.branch);
  const result = await runGit(cwd, pullArgs, { timeout: 120000 });
  return formatCommandResult(`PULL --FF-ONLY ${args.branch ? `${remote} ${args.branch}` : ''} in ${cwd}`, result);
}

export async function localGitCheckpoint(agentId, args, context = {}) {
  const cwd = await resolveGitRoot(agentId, args, context);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const label = String(args.label || 'task-submission').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'task-submission';
  const outDir = path.join(cwd, '.team', 'checkpoints');
  await fs.promises.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${stamp}-${label}.patch`);
  const diff = await runGit(cwd, ['diff', '--binary']);
  const staged = await runGit(cwd, ['diff', '--cached', '--binary']);
  if (!diff.ok || !staged.ok) return formatCommandResult('CHECKPOINT FAILED', diff.ok ? staged : diff);
  const body = [
    `# Local git checkpoint ${stamp}`,
    '',
    '## Staged changes',
    staged.stdout || '(none)',
    '',
    '## Unstaged changes',
    diff.stdout || '(none)',
  ].join('\n');
  await fs.promises.writeFile(outPath, body, 'utf8');
  return `Checkpoint written: ${outPath}`;
}

export async function localGitVerify(agentId, args, context = {}) {
  const cwd = await resolveGitRoot(agentId, args, context);
  const steps = [];
  if (args.build !== false) {
    steps.push(formatCommandResult('NPM BUILD', await runNpm(cwd, ['run', 'build'], 120000)));
  }
  if (args.tests !== false) {
    const testArgs = ['test'];
    if (args.test_filter) testArgs.push('--', args.test_filter);
    steps.push(formatCommandResult('NPM TEST', await runNpm(cwd, testArgs, 120000)));
  }
  return [`Verification for ${cwd}`, ...steps].join('\n\n');
}
