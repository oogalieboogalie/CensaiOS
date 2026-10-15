// Runs INSIDE the dev-server container (node image), never on the host.
// It finds the project's dev command in package.json, installs packages
// when they changed, and starts the dev server on 0.0.0.0:$PORT so the
// published port reaches it. Lines it prints start with "[censai]" so the
// Run dev window can tell its own notes from the dev server's output.
const fs = require('fs');
const cp = require('child_process');

const say = (m) => console.log(`[censai] ${m}`);
const port = process.env.PORT || '3000';
process.chdir(process.env.CENSAI_APP_DIR || '/app');

// Plain pages (index.html, no package.json): serve the folder as it is.
function servePlainFolder() {
  const http = require('http');
  const path = require('path');
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
  const root = process.cwd();
  http.createServer((req, res) => {
    let rel = decodeURIComponent(String(req.url || '/').split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, path.normalize(rel).replace(/^([/\\]*\.\.)+/, ''));
    if (!file.startsWith(root)) { res.statusCode = 403; return res.end('Not allowed'); }
    fs.readFile(file, (err, body) => {
      if (err) { res.statusCode = 404; return res.end('Not found'); }
      res.setHeader('content-type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.setHeader('cache-control', 'no-store');
      res.end(body);
    });
  }).listen(Number(port), '0.0.0.0', () => say(`Serving this folder's pages on port ${port}. Save a file and reload to see it.`));
}

if (!fs.existsSync('package.json')) {
  const typed = (process.env.CENSAI_DEV_CMD || '').trim();
  if (typed) {
    say(`Starting: ${typed}`);
    const child = cp.spawn('sh', ['-c', typed], { stdio: 'inherit', env: process.env });
    child.on('exit', (code) => process.exit(code ?? 0));
  } else if (fs.existsSync('index.html')) {
    servePlainFolder();
  } else {
    say('This folder has no package.json and no index.html, so there is nothing to run. Pick the folder that holds them.');
    process.exit(2);
  }
} else {
  runPackageProject();
}

function runPackageProject() {
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); } catch (err) {
    say(`package.json could not be read: ${err.message}`);
    process.exit(2);
  }
  const scripts = pkg.scripts || {};
  const pm = fs.existsSync('pnpm-lock.yaml') ? 'pnpm' : fs.existsSync('yarn.lock') ? 'yarn' : 'npm';

  // Dev servers that ignore HOST/PORT need flags to listen where Docker
  // forwards. npm needs "--" before script flags; pnpm and yarn pass them on.
  function hostFlags(body) {
    const sep = pm === 'npm' ? ' --' : '';
    if (/\bnext\b/.test(body)) return `${sep} -H 0.0.0.0 -p ${port}`;
    if (/\b(vite|astro|nuxt|nuxi|remix vite:dev)\b/.test(body)) return `${sep} --host 0.0.0.0 --port ${port}`;
    if (/\bng serve\b/.test(body)) return `${sep} --host 0.0.0.0 --port ${port}`;
    return '';
  }

  let cmd = (process.env.CENSAI_DEV_CMD || '').trim();
  if (!cmd) {
    const name = ['dev', 'start', 'serve', 'develop'].find((n) => scripts[n]);
    if (!name) {
      say('package.json has no dev, start or serve script. Type the command to run in the Command box and press Run dev again.');
      process.exit(2);
    }
    cmd = `${pm} run ${name}${hostFlags(scripts[name])}`;
  }

  // Install only when package.json or the lockfile changed since the last
  // install into this project's package volume.
  const stamp = 'node_modules/.censai-install-stamp';
  const inputs = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']
    .filter((f) => fs.existsSync(f))
    .map((f) => `${f}:${fs.statSync(f).size}:${fs.statSync(f).mtimeMs}`)
    .join('|');
  const installed = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === inputs;

  function run(line) {
    say(`$ ${line}`);
    const r = cp.spawnSync('sh', ['-c', line], { stdio: 'inherit', env: process.env });
    return r.status === 0;
  }

  if (!installed) {
    if (pm !== 'npm' && !run('corepack enable')) say('corepack could not be enabled; trying anyway.');
    const install = pm === 'npm' ? 'npm install --no-audit --no-fund' : `${pm} install`;
    say(`Installing packages with ${pm}. The first run takes a while; later runs reuse them.`);
    if (!run(install)) {
      say('Installing packages failed. The lines above say why.');
      process.exit(3);
    }
    try { fs.writeFileSync(stamp, inputs); } catch { /* read-only node_modules: install every time */ }
  } else {
    say('Packages are up to date.');
  }

  say(`Starting: ${cmd}`);
  const child = cp.spawn('sh', ['-c', cmd], { stdio: 'inherit', env: process.env });
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => {
    say(`The dev server stopped (${signal || `exit code ${code}`}).`);
    process.exit(code ?? 0);
  });
}
