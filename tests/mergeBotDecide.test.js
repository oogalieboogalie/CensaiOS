import { matchingCi } from '../server/mergeBot/clear.js';
import { mergeBotConfig } from '../server/mergeBot/config.js';
import { decideMerge } from '../server/mergeBot/decide.js';
import { riskCategories, riskyDetail } from '../server/mergeBot/risk.js';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
// Joined so a quoted folder path is not a file the public copy left out.
const pathOf = (...parts) => parts.join('/');

function ready(over = {}) {
  return {
    number: 12,
    headSha: SHA,
    base: 'master',
    draft: false,
    held: false,
    fork: false,
    files: ['src/components/Ok.jsx'],
    clear: { sha: SHA },
    ci: { sha: SHA, conclusion: 'success', status: 'completed', appId: 15368 },
    mergeable: true,
    lock: { ok: true },
    dryRun: false,
    ...over,
  };
}

describe('merge rule', () => {
  test('merges only when every gate holds and dry-run is off', () => {
    expect(decideMerge(ready())).toEqual({ action: 'merge', reason: 'clear' });
  });

  test('dry-run is the default, including when the flag is left unset', () => {
    expect(decideMerge(ready({ dryRun: true })).action).toBe('dry-run');
    const unset = ready();
    delete unset.dryRun;
    expect(decideMerge(unset)).toMatchObject({ action: 'dry-run', reason: 'dry-run' });
  });

  test.each([
    ['pull request 300', ready({ number: 300, files: ['package.json'] }), 'refuse', 'never-300'],
    ['no file list', ready({ files: null }), 'wait', 'no-files'],
    ['a fork', ready({ fork: true }), 'wait', 'fork'],
    ['a draft', ready({ draft: true }), 'wait', 'draft'],
    ['a held title', ready({ held: true }), 'wait', 'held'],
    ['a branch other than master', ready({ base: 'develop' }), 'wait', 'base'],
    ['no clear', ready({ clear: null }), 'wait', 'no-clear'],
    ['the commit moved', ready({ clear: { sha: OTHER } }), 'wait', 'head-moved'],
    ['no ci run', ready({ ci: null }), 'wait', 'ci-missing'],
    ['ci on a different commit', ready({ ci: { sha: OTHER, conclusion: 'success', status: 'completed', appId: 15368 } }), 'wait', 'ci-sha'],
    ['ci still running', ready({ ci: { sha: SHA, conclusion: '', status: 'queued', appId: 15368 } }), 'wait', 'ci-pending'],
    ['ci failed', ready({ ci: { sha: SHA, conclusion: 'failure', status: 'completed' } }), 'wait', 'ci-red'],
    ['github has not said it can merge', ready({ mergeable: null }), 'wait', 'not-mergeable'],
    ['github says it conflicts', ready({ mergeable: false }), 'wait', 'not-mergeable'],
    ['the file lock failed', ready({ lock: { ok: false } }), 'wait', 'file-lock'],
    ['the file lock did not run', ready({ lock: null }), 'wait', 'file-lock'],
  ])('refuses or waits: %s', (_name, input, action, reason) => {
    expect(decideMerge(input)).toMatchObject({ action, reason });
  });

  test.each([
    ['deployments', [pathOf('.github', 'workflows', 'ci.yml')], ['deploy']],
    ['a github action', [pathOf('.github', 'actions', 'ai-security-layer', 'action.yml')], ['deploy']],
    ['the install scripts', ['docker/entrypoint.sh', pathOf('scripts', 'home-server.sh'), 'public/install.sh', pathOf('src-tauri', 'tauri.conf.json')], ['deploy']],
    ['secrets', ['.env'], ['secrets']],
    ['the secret check', [pathOf('scripts', 'ensure-required-secrets.mjs')], ['secrets', 'auth']],
    ['the database', ['docker/091-notes.sql'], ['database']],
    ['the database module', ['server/db.js'], ['database']],
    ['sign-in', ['server/routes/auth.js'], ['auth']],
    ['security', ['server/security/systemAdmin.js', 'server/middleware/security.js', 'server/webOs/door.js', 'server/tokens/store.js'], ['security', 'auth']],
    ['dependencies', ['package.json'], ['dependencies']],
    ['a lockfile', ['package-lock.json'], ['dependencies']],
    ['rust and npm config', [pathOf('src-tauri', 'Cargo.toml'), pathOf('src-tauri', 'Cargo.lock'), '.npmrc'], ['dependencies']],
    ['the merge rules', ['server/mergeBot/risk.js', 'server/confirmations/store.js', 'server/boot/lifecycle.js', pathOf('scripts', 'kraken', 'check.mjs')], ['rules']],
    ['several of those', ['Dockerfile', 'server/boot/authSchema.js', 'yarn.lock'], ['deploy', 'database', 'auth', 'dependencies']],
  ])('a risky change goes to the owner: %s', (_name, files, categories) => {
    const got = decideMerge(ready({ files }));
    expect(got).toMatchObject({ action: 'confirm', reason: 'risky', categories });
    expect(got.action).not.toBe('merge');
  });

  test('a renamed database file is still risky under its old name', () => {
    expect(riskCategories([{ filename: 'notes/095-x.txt', previous_filename: 'docker/095-x.sql' }])).toEqual(['database', 'outside']);
    expect(decideMerge(ready({
      files: [{ filename: 'notes/095-x.txt', previous_filename: 'docker/095-x.sql' }],
      clear: { sha: SHA },
    })).action).toBe('confirm');
  });

  test.each([
    ['the confirmations route', 'server/routes/confirmations.js'],
    ['the needs-you window', 'src/components/windows/confirmations/view.jsx'],
    ['the signing tool', 'scripts/merge-bot/sign-clear.mjs'],
    ['the route map', 'server/boot/routeMap.js'],
    ['access rules', 'server/access/policy.js'],
    ['approvals', 'server/approvals/grants.js'],
    ['the sandbox', 'server/sandbox/index.js'],
    ['invites', 'server/invites/store.js'],
    ['tool permissions', 'server/tools/rbac/index.js'],
    ['the write token', 'server/github/writeToken.js'],
    ['the merge desk', 'server/github/mergeDesk.js'],
    ['endpoint tokens', 'server/agentEndpoints/tokens.js'],
    ['the door listener', 'server/webOs/doorListener.js'],
    ['the import lock', pathOf('.team', 'refactor', 'imports.lock.json')],
    ['agent setup', pathOf('scripts', 'agent-env-setup.sh')],
    ['backups', pathOf('scripts', 'backup.sh')],
    ['the starter box', pathOf('starter-box', 'setup.sh')],
    ['crew instructions', pathOf('.claude', 'skills', 'builder', 'SKILL.md')],
    ['other server code', 'server/memory/core.js'],
  ])('never auto-merges %s', (_name, file) => {
    const got = decideMerge(ready({ files: [file], clear: { sha: SHA } }));
    expect(got.action).not.toBe('merge');
    expect(got).toMatchObject({ action: 'confirm', reason: 'risky' });
    expect(got.categories.length).toBeGreaterThan(0);
  });

  test.each([
    ['a password', pathOf('src', 'components', 'ResetPassword.jsx')],
    ['a bring-your-own-key screen', pathOf('src', 'app', 'byokSettings.jsx')],
    ['an admin screen', pathOf('src', 'components', 'AdminPanel.jsx')],
    ['a permission screen', pathOf('docs', 'permissions.md')],
  ])('a %s is not merged', (_name, file) => {
    const got = decideMerge(ready({ files: [file] }));
    expect(got.action).not.toBe('merge');
    expect(got.categories).toContain('auth');
  });

  test('an ordinary source file is not risky', () => {
    expect(riskCategories(['src/components/Ok.jsx', 'README.md', 'src/app/AppContent.jsx'])).toEqual([]);
    expect(decideMerge(ready({ files: ['src/components/Ok.jsx'] })).action).toBe('merge');
  });

  test('the example env file is not merged', () => {
    const got = decideMerge(ready({ files: ['.env.example'] }));
    expect(got.action).not.toBe('merge');
    expect(got).toMatchObject({ action: 'confirm', reason: 'risky', categories: ['secrets'] });
  });

  test.each([
    ['src/app/PairApp.jsx'],
    ['src/app/GuestJoin.jsx'],
    ['src/app/GuestApp.jsx'],
    ['src/app/InviteApp.jsx'],
    ['src/app/hooks/loadSessionWithRetry.js'],
    ['src/app/hooks/useKeyGate.js'],
    ['src/components/theme/VaultSection.jsx'],
    ['src/components/theme/KeySharingSection.jsx'],
    ['src/components/windows/aiResources/KeysPanel.jsx'],
    ['src/components/windows/apiBar/KeysPanel.jsx'],
    ['src/components/guest/GuestLinkManager.jsx'],
    ['src/components/guest/GuestLinkParts.jsx'],
    ['src/components/guest/OwnerShareLayer.jsx'],
    ['src/components/guest/QuickSharePanel.jsx'],
    ['src/components/guest/ReactionIcons.jsx'],
    ['src/components/docker/useComputerOwner.js'],
  ])('a sign-in or key screen is not merged: %s', (file) => {
    const got = decideMerge(ready({ files: [file] }));
    expect(got.action).not.toBe('merge');
    expect(got).toMatchObject({ action: 'confirm', reason: 'risky' });
    expect(got.categories).toContain('auth');
  });

  test.each([
    ['a path that climbs out', pathOf('src', 'components', '..', '..', 'server', 'db.js')],
    ['a symlink', { filename: 'src/components/Ok.jsx', mode: '120000' }],
    ['a submodule', { filename: 'vendor/lib', mode: '160000' }],
    ['a permission change', { filename: 'README.md', mode: '100755', previousMode: '100644' }],
    ['a file missing from the new tree', { filename: 'src/components/Ok.jsx', status: 'modified', mode: '', previousMode: '100644' }],
  ])('never merges %s', (_name, file) => {
    const got = decideMerge(ready({ files: [file] }));
    expect(got.action).not.toBe('merge');
    expect(got).toMatchObject({ action: 'confirm', reason: 'risky' });
    expect(got.categories).toContain('security');
  });

  test.each([
    ['kraken', pathOf('tests', 'krakenCheckToken.test.js')],
    ['the size ratchet', pathOf('tests', 'refactorGuards.test.js')],
    ['a tripwire', pathOf('tests', 'claimTripwire.test.js')],
    ['csrf', pathOf('tests', 'csrfOriginGuard.test.js')],
    ['imports', pathOf('tests', 'importGuard.test.js')],
    ['console', pathOf('tests', 'consoleGuard.test.js')],
    ['log errors', pathOf('tests', 'logErrorGuard.test.js')],
    ['no verify', pathOf('tests', 'guardNoVerify.test.js')],
    ['hosted agents', pathOf('tests', 'hostedAgentsNetGuard.test.js')],
    ['the public copy', pathOf('tests', 'ossExport.test.js')],
    ['the route map', pathOf('tests', 'routeMapShadow.test.js')],
    ['security headers', pathOf('tests', 'securityHeaders.test.js')],
    ['the merge rule', pathOf('tests', 'mergeBotDecide.test.js')],
  ])('a guard test is not merged: %s', (_name, file) => {
    const got = decideMerge(ready({ files: [file] }));
    expect(got.action).not.toBe('merge');
    expect(got).toMatchObject({ action: 'confirm', reason: 'risky' });
    expect(got.categories).toContain('rules');
  });

  test('a risky pull request is not merged just because the bot wrote it or dry-run is off', () => {
    expect(decideMerge(ready({ files: ['package.json'], ownWork: true, dryRun: false })).action).toBe('confirm');
  });

  test('the owner-facing sentence names the kind of change, not a command', () => {
    expect(riskyDetail(['database', 'dependencies'])).toBe(
      'It changes the database and dependencies. The merge bot will not merge it.',
    );
  });
});

describe('ci pick', () => {
  test('ci (22.x) has to be a finished green Actions run on that exact commit', () => {
    const row = (over) => ({ name: 'ci (22.x)', sha: SHA, conclusion: 'success', status: 'completed', completedAt: '2', appId: 15368, ...over });
    const checks = [
      { name: 'ci', sha: SHA, conclusion: 'success', status: 'completed', completedAt: '3', appId: 15368 },
      row({ conclusion: 'failure', completedAt: '1' }),
      row({ completedAt: '2' }),
      row({ sha: OTHER, completedAt: '4' }),
    ];
    expect(matchingCi(checks, { sha: SHA })).toMatchObject({ sha: SHA, conclusion: 'success' });
    expect(matchingCi(checks, { sha: 'c'.repeat(40) })).toBeNull();
  });
});

describe('merge bot switches', () => {
  test('dry-run stays on unless it is turned off on purpose', () => {
    expect(mergeBotConfig({}).dryRun).toBe(true);
    expect(mergeBotConfig({ MERGE_BOT_DRY_RUN: '1' }).dryRun).toBe(true);
    expect(mergeBotConfig({ MERGE_BOT_DRY_RUN: '0' }).dryRun).toBe(false);
    expect(mergeBotConfig({ MERGE_BOT_DRY_RUN: 'false' }).dryRun).toBe(false);
    expect(mergeBotConfig({ MERGE_BOT_ENABLED: '1' }).enabled).toBe(true);
    expect(mergeBotConfig({}).enabled).toBe(false);
    expect(mergeBotConfig({ GH_TOKEN: 'from-env', GITHUB_TOKEN: 'shared' }).token).toBe('');
    expect(mergeBotConfig({ MERGE_BOT_GITHUB_TOKEN: 'bot' }).token).toBe('bot');
    expect(mergeBotConfig({}).publicKey).toBe('');
  });
});
