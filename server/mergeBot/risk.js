// Which changed files the merge bot must never squash-merge.
// A pull request that touches any of these waits on the confirmations page.

const ORDER = ['rules', 'security', 'deploy', 'secrets', 'database', 'auth', 'dependencies', 'outside'];
const SAFE_DIRS = ['src/components/', 'src/styles/', 'src/app/', 'docs/', 'tests/'];
const SAFE_FILES = new Set(['README.md']);
const SENSITIVE = /pair|guest|invite|session|owner|vault|key|token|secret|oauth|credential|auth|password|byok|admin|permission/i;
const GUARD_TEST = /kraken|ratchet|tripwire|refactorguards|csrforiginguard|importguard|consoleguard|logerrorguard|guardnoverify|hostedagentsnetguard|ossexport|routemapshadow|securityheaders|mergebotdecide/i;
const LOCKS = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock',
  'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
]);
const WORDS = {
  rules: 'the merge rules',
  security: 'security',
  outside: 'files outside the safe list',
  deploy: 'deployments',
  secrets: 'secrets',
  database: 'the database',
  auth: 'sign-in',
  dependencies: 'dependencies',
};

function baseName(file) {
  return file.split('/').pop();
}

function hasDir(file, name) {
  return file === name || file.startsWith(`${name}/`) || file.includes(`/${name}/`);
}

function isRules(file) {
  return file.startsWith('server/mergeBot/')
    || file.startsWith('server/confirmations/')
    || file === 'server/routes/confirmations.js'
    || file.startsWith('src/components/windows/confirmations/')
    || file === 'src/lib/manifest/confirmationsWindows.js'
    || file.startsWith('scripts/merge-bot/')
    || file === 'server/boot/routeMap.js'
    || file === 'server/boot/lifecycle.js'
    || file.startsWith('scripts/kraken/')
    || file.startsWith('.kraken/')
    || file.startsWith('.claude/')
    || file === '.team/refactor/imports.lock.json';
}

function isSecurity(file) {
  const base = baseName(file);
  return file.startsWith('server/security/')
    || file.startsWith('server/middleware/')
    || file.startsWith('server/tokens/')
    || file.startsWith('server/access/')
    || file.startsWith('server/tools/rbac/')
    || hasDir(file, 'approvals')
    || hasDir(file, 'sandbox')
    || hasDir(file, 'invites')
    || file === 'server/routes/tokens.js'
    || file === 'server/github/writeToken.js'
    || file === 'server/agentEndpoints/tokens.js'
    || base === 'mergeDesk.js'
    || base === 'doorListener.js'
    || file === 'server/webOs/door.js';
}

function isDeploy(file) {
  const base = baseName(file);
  if (file.startsWith('.github/')) return true;
  if (file === 'docker/entrypoint.sh') return true;
  if (file === 'scripts/home-server.sh' || file === 'scripts/ci-install.sh') return true;
  if (file === 'public/install.sh') return true;
  if (base === 'agent-env-setup.sh' || base === 'backup.sh') return true;
  if (file.startsWith('starter-box/')) return true;
  if (base === 'tauri.conf.json') return true;
  if (file.startsWith('deploy/') || file.includes('/deploy/')) return true;
  if (file.startsWith('k8s/') || file.startsWith('kubernetes/')) return true;
  if (file.includes('/k8s/') || file.includes('/kubernetes/')) return true;
  if (/^docker-compose(\.|$)/.test(base)) return true;
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return true;
  return ['fly.toml', 'wrangler.toml', 'wrangler.json', 'vercel.json', 'netlify.toml'].includes(base);
}

function isSecret(file) {
  const base = baseName(file);
  const lower = base.toLowerCase();
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (/\.(pem|p12|key)$/i.test(base)) return true;
  if (base === 'ensure-required-secrets.mjs') return true;
  if (/^(id_rsa|id_ed25519|id_dsa)$/i.test(lower)) return true;
  const parts = file.toLowerCase().split('/');
  return parts.some((part) => part === 'secrets' || part === 'credentials' || part === 'secrets.js');
}

function isDatabase(file) {
  const base = baseName(file);
  if (file.startsWith('docker/') && base.endsWith('.sql')) return true;
  if (file.startsWith('migrations/') || file.includes('/migrations/')) return true;
  if (/migration/i.test(base)) return true;
  if (file.startsWith('server/boot/') && /schema/i.test(base)) return true;
  if (['server/boot/database.js', 'server/boot/freshDatabase.js', 'server/boot/setupLedger.js', 'server/db.js'].includes(file)) return true;
  return false;
}

function isAuth(file) {
  const base = baseName(file);
  if ([
    'server/routes/auth.js', 'server/routes/hubAuth.js', 'server/boot/authSchema.js',
    'server/boot/sessionConfig.js', 'server/security/sessionGuard.js', 'server/routes/oauth.js',
  ].includes(file)) return true;
  if (/login|sign-?in/i.test(file)) return true;
  return /session/i.test(base) && file.startsWith('server/');
}

function isDependency(file) {
  const base = baseName(file);
  return base === 'package.json' || base === 'Cargo.toml' || base === 'Cargo.lock' || base === '.npmrc' || LOCKS.has(base);
}

function isGuardTest(file) {
  return file.startsWith('tests/') && GUARD_TEST.test(file);
}

function isSensitive(file) {
  return SENSITIVE.test(file);
}

function unsafeShape(entry, file) {
  if (file.split('/').includes('..')) return true;
  if (!entry || typeof entry !== 'object') return false;
  if (entry.symlink || entry.submodule || entry.modeChange || entry.untrusted) return true;
  if (entry.status !== 'removed' && Object.prototype.hasOwnProperty.call(entry, 'mode') && !String(entry.mode || '')) return true;
  const next = String(entry.mode || '');
  const prev = String(entry.previousMode || entry.oldMode || '');
  if (next === '120000' || next === '160000' || prev === '120000' || prev === '160000') return true;
  return Boolean(next && prev && next !== prev);
}

function isSafe(file) {
  if (isGuardTest(file)) return false;
  if (SAFE_FILES.has(file)) return true;
  return SAFE_DIRS.some((dir) => file.startsWith(dir));
}

function namesOf(entry) {
  if (entry && typeof entry === 'object') {
    return [entry.filename, entry.previous_filename, entry.previousFilename];
  }
  return [entry];
}

function normalize(raw) {
  return String(raw || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function riskCategories(files) {
  const found = new Set();
  for (const raw of files || []) {
    for (const name of namesOf(raw)) {
      const file = normalize(name);
      if (!file) continue;
      let marked = false;
      const mark = (yes, id) => { if (yes) { found.add(id); marked = true; } };
      mark(isRules(file) || isGuardTest(file), 'rules');
      mark(isSecurity(file) || unsafeShape(raw, file), 'security');
      mark(isDeploy(file), 'deploy');
      mark(isSecret(file), 'secrets');
      mark(isDatabase(file), 'database');
      mark(isAuth(file) || isSensitive(file), 'auth');
      mark(isDependency(file), 'dependencies');
      if (!marked && !isSafe(file)) found.add('outside');
    }
  }
  return ORDER.filter((id) => found.has(id));
}

export function riskyDetail(categories) {
  const words = (categories || []).map((id) => WORDS[id]).filter(Boolean);
  if (!words.length) return 'The merge bot will not merge it.';
  const list = words.length === 1
    ? words[0]
    : words.length === 2
      ? `${words[0]} and ${words[1]}`
      : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `It changes ${list}. The merge bot will not merge it.`;
}
