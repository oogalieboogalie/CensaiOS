// What a project folder can do, read from its own files. The words on the
// button are the outcome. The small line under them is the real command.

const PLACEHOLDER_TEST = /no test specified/i;

function parsed(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function runner(pkg) {
  const manager = String(pkg?.packageManager || '');
  if (manager.startsWith('pnpm')) return 'pnpm';
  if (manager.startsWith('yarn')) return 'yarn';
  return 'npm';
}

function startCommand(scripts, tool) {
  if (scripts.dev) return `${tool} run dev`;
  if (scripts.start) return tool === 'npm' ? 'npm start' : `${tool} start`;
  if (scripts.serve) return `${tool} run serve`;
  return '';
}

export function changesOutsideThisComputer(command) {
  const line = String(command || '').trim();
  if (!line) return false;
  if (/\b(git\s+push|npm\s+publish|pnpm\s+publish|yarn\s+publish|docker\s+push)\b/i.test(line)) return true;
  return /(?:^|[;&|]\s*)(?:[\w.-]+\s+)*deploy\b/i.test(line);
}

function hookNames(name) {
  if (!name || name.startsWith('-')) return [];
  if (name === 'install') return ['preinstall', 'install', 'postinstall', 'prepare'];
  return [`pre${name}`, name, `post${name}`];
}

function commandRoots(command) {
  const line = String(command || '').trim();
  const run = /\b(?:npm|pnpm|yarn)\s+run\s+([^\s&|;]+)/i.exec(line);
  if (run) return hookNames(run[1]);
  if (/\b(?:npm|pnpm|yarn)\s+test\b/i.test(line)) return hookNames('test');
  if (/\b(?:npm|pnpm)\s+start\b|\byarn\s+start\b/i.test(line)) return hookNames('start');
  if (/\b(?:npm|pnpm|yarn)\s+(?:install|ci)\b/i.test(line)) return hookNames('install');
  return [];
}

function chainedHooks(body, scripts) {
  const text = String(body || '');
  const names = [];
  const run = /\b(?:npm|pnpm|yarn)\s+run\s+([^\s&|;]+)/gi;
  let match = run.exec(text);
  while (match) {
    names.push(...hookNames(match[1]));
    match = run.exec(text);
  }
  if (/\b(?:npm|pnpm|yarn)\s+test\b/i.test(text)) names.push(...hookNames('test'));
  if (/\b(?:npm|pnpm)\s+start\b|\byarn\s+start\b/i.test(text)) names.push(...hookNames('start'));
  if (/\b(?:npm|pnpm|yarn)\s+(?:install|ci)\b/i.test(text)) names.push(...hookNames('install'));
  const yarn = /\byarn\s+([^\s&|;]+)/gi;
  match = yarn.exec(text);
  while (match) {
    if (scripts?.[match[1]] && !/^(?:run|install|ci|test|start)$/.test(match[1])) {
      names.push(...hookNames(match[1]));
    }
    match = yarn.exec(text);
  }
  return names;
}

// npm runs pre and post scripts, and a script can call another script.
// Follow both until the real command, so a deploy hidden under "npm test" still asks.
export function outsideWork(scripts, command) {
  if (changesOutsideThisComputer(command)) return { outside: true, notice: '' };
  const seen = new Set();
  const queue = commandRoots(command);
  while (queue.length) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const body = scripts?.[name];
    if (!body) continue;
    const text = String(body).trim();
    if (changesOutsideThisComputer(text)) return { outside: true, notice: text };
    queue.push(...chainedHooks(text, scripts));
  }
  return { outside: false, notice: '' };
}

// Clear a half-typed line, write the command, then send Enter on its own.
// One paste of the command and Enter is bracketed by bash and zsh, so the
// Enter never runs the line.
export function typeCommand(term, command) {
  const text = String(command ?? '');
  if (!term || !text || typeof term.input !== 'function') return;
  term.input('\x15');
  term.input(text);
  term.input('\r');
}

export function commandsFromProject(files = {}) {
  const pkg = parsed(files['package.json']);
  const scripts = pkg?.scripts || {};
  const tool = runner(pkg);
  const buttons = [];

  const start = startCommand(scripts, tool);
  if (start) {
    const flag = outsideWork(scripts, start);
    buttons.push({
      id: 'start', label: 'Start the app', command: start, outside: flag.outside, notice: flag.notice,
    });
  }

  if (scripts.test && !PLACEHOLDER_TEST.test(String(scripts.test))) {
    const command = `${tool} test`;
    const flag = outsideWork(scripts, command);
    buttons.push({
      id: 'checks', label: 'Run the checks', command, outside: flag.outside, notice: flag.notice,
    });
  } else if (files['Cargo.toml']) {
    buttons.push({ id: 'checks', label: 'Run the checks', command: 'cargo test', outside: false });
  } else if (/pytest/.test(String(files['pyproject.toml'] || ''))) {
    buttons.push({ id: 'checks', label: 'Run the checks', command: 'pytest', outside: false });
  }

  buttons.push({ id: 'pull', label: 'Get the latest code', command: 'git pull', outside: false });
  buttons.push({ id: 'save', label: 'Save my changes', command: 'git commit', outside: false });

  let install = '';
  if (pkg) install = `${tool} install`;
  else if (files['requirements.txt']) install = 'pip install -r requirements.txt';
  else if (files['pyproject.toml']) install = 'pip install .';
  else if (files['Cargo.toml']) install = 'cargo fetch';
  else if (files['go.mod']) install = 'go mod download';
  if (install) {
    const flag = outsideWork(scripts, install);
    buttons.push({
      id: 'install', label: 'Install what it needs', command: install, outside: flag.outside, notice: flag.notice,
    });
  }

  return buttons;
}

export function projectFilePath(cwd, name) {
  const root = String(cwd || '').replace(/[\\/]+$/, '');
  if (!root || !name) return '';
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root}${sep}${name}`;
}

const FILE_NAMES = ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod'];

async function readProjectFile(path) {
  const res = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return typeof body?.content === 'string' ? body.content : null;
}

export async function loadProjectButtons(cwd, readFile = readProjectFile) {
  const files = {};
  await Promise.all(FILE_NAMES.map(async (name) => {
    const path = projectFilePath(cwd, name);
    if (!path) return;
    try {
      const text = await readFile(path);
      if (text != null) files[name] = text;
    } catch { /* a missing file just hides that button */ }
  }));
  return commandsFromProject(files);
}
