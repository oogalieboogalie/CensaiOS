// Legion: the browser step. After every build, the Legion opens the
// project's index.html in a headless browser that is already on the
// computer (Edge or Chrome on Windows, Chromium in the Docker image), takes a
// screenshot, and reads the page text and any script errors. Echo sees all
// three. No browser found means Echo judges from the files alone, and the
// window says so.
//
// The page is model-written, so the browser is locked in: every request it
// makes goes through a throwaway proxy on this computer that answers only
// for the project's own files (at http://legion.project/) and refuses
// everything else: the internet, other files, other services here.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const SHOT_TIMEOUT_MS = 45_000;
const WINDOWS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const MAC = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
const LINUX = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/microsoft-edge'];

function playwrightChromium(root = '/opt/pw-browsers') {
  try {
    const dir = fs.readdirSync(root).filter((name) => name.startsWith('chromium-')).sort().pop();
    return dir ? path.join(root, dir, 'chrome-linux', 'chrome') : null;
  } catch { return null; }
}

/** The browser the Legion will use, or null. */
export function findBrowser(env = process.env, exists = fs.existsSync, platform = process.platform) {
  if (env.CENSAI_LEGION_BROWSER) return exists(env.CENSAI_LEGION_BROWSER) ? env.CENSAI_LEGION_BROWSER : null;
  const list = platform === 'win32' ? WINDOWS : platform === 'darwin' ? MAC : [...LINUX, playwrightChromium()];
  return list.find((candidate) => candidate && exists(candidate)) || null;
}

/** The page the browser opens: index.html at the root, else the first one found. */
export function entryPage(files) {
  if (files.includes('index.html')) return 'index.html';
  return ['public/index.html', 'src/index.html', 'client/index.html', 'frontend/index.html'].find((f) => files.includes(f))
    || files.find((f) => f.endsWith('/index.html')) || null;
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

export const PROJECT_HOST = 'legion.project';

/**
 * The browser's only way out: a proxy on 127.0.0.1 at a free port that
 * serves `projectDir` as http://legion.project/ and refuses every other
 * address (and every HTTPS tunnel). Returns { port, close }.
 */
export function serveProject(projectDir) {
  const root = path.resolve(projectDir);
  const server = http.createServer((req, res) => {
    let rel = '';
    try {
      const url = new URL(String(req.url || '/'), `http://${PROJECT_HOST}`);
      if (url.host !== PROJECT_HOST) { res.writeHead(403); res.end(); return; }
      rel = decodeURIComponent(url.pathname);
    } catch { rel = ''; }
    const file = path.resolve(root, `.${rel.endsWith('/') ? `${rel}index.html` : rel}`);
    if (!file.startsWith(root + path.sep) || file.split(path.sep).includes('.git') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  // HTTPS and websockets ask for a tunnel: refuse.
  server.on('connect', (req, socket) => socket.destroy());
  server.on('upgrade', (req, socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
}

function launch(browser, args, timeout, signal) {
  return new Promise((resolve) => {
    execFile(browser, args, { timeout, signal, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

export function baseArgs(profile, port) {
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--mute-audio', `--user-data-dir=${profile}`, '--window-size=1280,800', '--virtual-time-budget=4000',
    // Every request, this computer's own addresses included, goes to the project proxy.
    `--proxy-server=http://127.0.0.1:${port}`, '--proxy-bypass-list=<-loopback>',
    '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-component-update'];
  // Chromium refuses to start as root (the Docker image) without this.
  if (process.platform === 'linux' && process.getuid?.() === 0) args.push('--no-sandbox');
  return args;
}

const pageText = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);

const scriptErrors = (stderr) => stderr.split('\n')
  .filter((line) => /CONSOLE|Uncaught|SyntaxError|ReferenceError|TypeError/.test(line))
  .map((line) => line.replace(/^\[[^\]]*\]\s*/, '').slice(0, 300)).slice(0, 10);

/**
 * Open the project's page and look at it. Returns
 * { ok, page, png (Buffer), text, errors, reason }.
 */
export async function lookAtProject({ projectDir, files, shotPath, signal, browser = findBrowser() }) {
  const page = entryPage(files);
  if (!page) return { ok: false, reason: 'There is no index.html to open yet.' };
  if (!browser) return { ok: false, page, reason: 'No browser was found on this computer, so Echo judged from the files alone.' };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'legion-browser-'));
  const site = await serveProject(projectDir);
  const url = `http://${PROJECT_HOST}/${page.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const shot = await launch(browser, [...baseArgs(profile, site.port), `--screenshot=${shotPath}`, url], SHOT_TIMEOUT_MS, signal);
    const dom = await launch(browser, [...baseArgs(profile, site.port), '--enable-logging=stderr', '--v=0', '--dump-dom', url], SHOT_TIMEOUT_MS, signal);
    const png = fs.existsSync(shotPath) ? fs.readFileSync(shotPath) : null;
    if (!png) return { ok: false, page, reason: `The browser could not take a screenshot (${String(shot.error?.message || 'no picture').slice(0, 120)}).` };
    return { ok: true, page, png, text: pageText(dom.stdout), errors: scriptErrors(dom.stderr) };
  } finally {
    site.close();
    fs.rm(profile, { recursive: true, force: true }, () => {});
  }
}
