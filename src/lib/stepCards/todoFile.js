// The .todo file: premade to-dos a person can read, write by hand, import
// into the To-do List or open as step cards. Pure: shared by the board and the
// server (server/stepCards/translate.js checks a model's draft with it).
//
//   censaiOS to-do file
//   Title: Grok Build cards
//
//   == Card 47: Figma import lists frames inside Sections
//   For: cli:grok
//   Goal: Designs kept inside Figma Sections can be picked and imported.
//
//   -- Step 1: Make the importer look inside Sections
//   Ask Figma for the file deeper and list frames inside a Section.
//   [ ] file server/design/figmaImport.js
//   [ ] file server/design/figmaImport.js says "SECTION"
//   [ ] run npm test -- tests/figmaSections.test.js
//   [ ] ask The panel lists both frames under the Section heading
//
// "For:" holds a To-do assignee (src/lib/todos/assignees.js): an agent id,
// user:<id> or cli:<cli id>. A check line never arrives ticked: its dot turns
// green only when censaiOS checks it (server/stepCards/verify.js).

export const TODO_FILE_HEADER = 'censaiOS to-do file';
export const CHECK_KINDS = Object.freeze(['file', 'run', 'ask']);
export const MAX_CARDS = 60;
export const MAX_STEPS = 20;
export const MAX_CHECKS = 4;

// Commands a "run" check may use: the project's own tests (optionally only some test
// files, named as plain paths inside the project) or one of its npm scripts, with
// nothing after it. No flag (a leading "-") and no ".." anywhere, so a card cannot
// point jest or a script at a file outside the project.
const RUN = /^npm (?:test(?: -- [\w@][\w@./+-]*(?: [\w@][\w@./+-]*)*)?|run \w[\w:.-]*)$/;
const PLAIN_PATH = /^[\w@./+-][\w@./+ -]*$/;

const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function isAllowedCommand(command) {
  const text = String(command || '').trim();
  return RUN.test(text) && !text.includes('..');
}

/** One check from its line text ("file a.js says \"x\"", "run npm test", "ask ..."), or null. */
export function parseCheck(line) {
  const text = String(line || '').trim();
  const file = /^file\s+(\S+)(?:\s+says\s+"(.+)")?$/i.exec(text);
  if (file) {
    const path = file[1].replace(/\\/g, '/');
    if (!PLAIN_PATH.test(path) || path.split('/').includes('..') || path.startsWith('/')) return null;
    return file[2] ? { kind: 'file', path, says: clip(file[2], 200) } : { kind: 'file', path };
  }
  const run = /^run\s+(.+)$/i.exec(text);
  if (run) return isAllowedCommand(run[1].trim()) ? { kind: 'run', command: run[1].trim().replace(/\s+/g, ' ') } : null;
  const ask = /^ask\s+(.+)$/i.exec(text);
  if (ask) return { kind: 'ask', statement: clip(ask[1], 300) };
  return null;
}

/** The plain words a check shows next to its dot. */
export function checkWords(check) {
  if (check?.kind === 'file') return check.says ? `${check.path} says "${check.says}"` : `${check.path} is there`;
  if (check?.kind === 'run') return `${check.command} passes`;
  return check?.statement || '';
}

export function checkLine(check) {
  if (check?.kind === 'file') return `file ${check.path}${check.says ? ` says "${check.says}"` : ''}`;
  if (check?.kind === 'run') return `run ${check.command}`;
  return `ask ${check?.statement || ''}`;
}

/**
 * Parse a .todo file: { title, cards: [{ title, goal, assignee, steps: [{ title, text, checks }] }], skipped }.
 * skipped counts check lines that were not understood (a command that is not allowed, a path
 * outside the project), so the import can say so instead of dropping them in silence.
 */
export function parseTodoFile(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const out = { title: '', cards: [], skipped: 0 };
  let card = null;
  let step = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.toLowerCase() === TODO_FILE_HEADER.toLowerCase() || line.startsWith('#')) continue;
    let m;
    if ((m = /^==\s*(.+)$/.exec(line))) {
      if (out.cards.length >= MAX_CARDS) break;
      card = { title: clip(m[1], 160), goal: '', assignee: null, steps: [] };
      step = null;
      out.cards.push(card);
    } else if (!card && (m = /^title:\s*(.+)$/i.exec(line))) {
      out.title = clip(m[1], 120);
    } else if (card && !step && (m = /^for:\s*(.*)$/i.exec(line))) {
      card.assignee = clip(m[1], 120) || null;
    } else if (card && !step && (m = /^goal:\s*(.+)$/i.exec(line))) {
      card.goal = clip(m[1], 600);
    } else if (card && (m = /^--\s*(.+)$/.exec(line))) {
      if (card.steps.length >= MAX_STEPS) { step = null; continue; }
      step = { title: clip(m[1].replace(/^step\s*\d+\s*[:.)-]\s*/i, ''), 160), text: '', checks: [] };
      card.steps.push(step);
    } else if (step && (m = /^\[[ xX]?\]\s*(.+)$/.exec(line))) {
      const check = parseCheck(m[1]);
      if (check && step.checks.length < MAX_CHECKS) step.checks.push(check);
      else out.skipped += 1;
    } else if (step) {
      step.text = clip(`${step.text} ${line}`, 1200);
    } else if (card) {
      card.goal = clip(`${card.goal} ${line}`, 600);
    }
  }
  // A step with no check can never turn green, so it gets one Censai reads over.
  for (const c of out.cards) {
    for (const s of c.steps) if (!s.checks.length) s.checks.push({ kind: 'ask', statement: s.title });
  }
  out.cards = out.cards.filter((c) => c.steps.length);
  return out;
}

/** Write cards back out as a .todo file (what "Save as .todo" downloads). */
export function writeTodoFile({ title = '', cards = [] } = {}) {
  const parts = [TODO_FILE_HEADER];
  if (title) parts.push(`Title: ${clip(title, 120)}`);
  for (const card of cards) {
    parts.push('', `== ${clip(card.title, 160)}`);
    if (card.assignee) parts.push(`For: ${card.assignee}`);
    if (card.goal) parts.push(`Goal: ${clip(card.goal, 600)}`);
    (card.steps || []).forEach((step, index) => {
      parts.push('', `-- Step ${index + 1}: ${clip(step.title, 160)}`);
      if (step.text) parts.push(clip(step.text, 1200));
      for (const check of step.checks || []) parts.push(`[ ] ${checkLine(check)}`);
    });
  }
  return `${parts.join('\n')}\n`;
}
