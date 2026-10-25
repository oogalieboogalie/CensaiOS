// The test team's report: every step a tester took, whether it held up, the
// exact step that broke, and the pictures taken on the way.
//
// Three parts per module:
//   walk     the obvious things a real person does; a broken step is "fail"
//   hunt     the wrong things on purpose; a broken step is "bug"
//   redteam  the server's checks (signed out, teammate, raw errors, logs);
//            a broken step is "gap" (a security gap, goes to the coordinator)
// A step can also be "skip" (this machine cannot try it) or "note" (worth
// knowing, not broken).

import fs from 'node:fs';
import path from 'node:path';

const BROKEN = { walk: 'fail', hunt: 'bug', redteam: 'gap' };
const STEP_TIMEOUT_MS = 90_000;

export class Outcome extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Ends a step as "skip": this machine cannot try it. */
export const skip = (why) => new Outcome('skip', why);
/** Ends a step as "note": not broken, but worth a reader's eye. */
export const note = (what) => new Outcome('note', what);

/** TEST_TEAM_THEMES=dark,light runs each module once per theme; dark alone by default. */
export function pickThemes(value = process.env.TEST_TEAM_THEMES) {
  const themes = String(value || 'dark').split(/[\s,]+/).filter((t) => t === 'dark' || t === 'light');
  return themes.length ? [...new Set(themes)] : ['dark'];
}

const oneLine = (text) => String(text || '').split('\n')[0].slice(0, 300);

export function createReport({ module, label, outDir, theme = '', now = () => new Date() }) {
  const checks = [];
  let shots = 0;
  const report = {
    module,
    label,
    theme,
    startedAt: now().toISOString(),
    checks,
    /** Runs one step; never throws, so one broken step does not hide the rest. */
    async check(part, name, fn) {
      if (!BROKEN[part]) throw new Error(`unknown part ${part}`);
      const entry = { part, step: name, status: 'pass', detail: '', shots: [] };
      checks.push(entry);
      const started = Date.now();
      const shot = async (page, title) => {
        shots += 1;
        // The entry keeps the plain name; the file on disk carries the theme.
        const name = `${String(shots).padStart(2, '0')}-${title}.png`;
        const file = theme ? `${theme}-${name}` : name;
        if (outDir) await page.screenshot({ path: path.join(outDir, file) });
        entry.shots.push(name);
        return file;
      };
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`took longer than ${STEP_TIMEOUT_MS / 1000}s`)), STEP_TIMEOUT_MS);
        });
        entry.detail = oneLine(await Promise.race([fn({ shot }), timeout]));
      } catch (error) {
        entry.status = error instanceof Outcome ? error.status : BROKEN[part];
        entry.detail = oneLine(error?.message);
      } finally {
        clearTimeout(timer);
      }
      entry.ms = Date.now() - started;
      console.log(`test-team ${module} ${part} "${name}": ${entry.status} (${entry.ms} ms)`);
      return entry;
    },
  };
  return report;
}

export function summarize(checks) {
  const count = (status) => checks.filter((c) => c.status === status).length;
  const totals = { pass: count('pass'), fail: count('fail'), bug: count('bug'), gap: count('gap'), skip: count('skip'), note: count('note') };
  const verdict = totals.fail ? 'broken' : (totals.bug || totals.gap) ? 'works, with problems found' : 'works';
  return { totals, verdict };
}

const MARK = { pass: 'passed', fail: 'FAILED', bug: 'BUG', gap: 'SECURITY GAP', skip: 'skipped', note: 'note' };
const PART_TITLE = { walk: 'Using it like a real person', hunt: 'Bug hunt (doing it wrong on purpose)', redteam: 'Red team (server checks)' };
const cell = (text) => String(text || '').replace(/\|/g, '/').replace(/\s+/g, ' ');

/** One picture's links: one per theme it was taken in, matching the files on disk. */
function pictureLinks(name, themes) {
  if (!themes.length) return `[${name}](${name})`;
  return `${name.replace(/\.png$/, '')}: ${themes.map((t) => `[${t}](${t}-${name})`).join(' ')}`;
}

function otherThemeLine(other) {
  const { verdict } = summarize(other.checks);
  const broken = other.checks.filter((c) => !['pass', 'skip', 'note'].includes(c.status)).map((c) => `"${cell(c.step)}" (${MARK[c.status]})`);
  return `In the ${other.theme} theme: ${verdict}${broken.length ? `; ${broken.join(', ')}` : ''}.`;
}

/** The report as plain Markdown, the file a person reads. */
/** The report as plain Markdown; `others` are the same module's runs in other themes. */
export function renderMarkdown(report, finishedAt = new Date().toISOString(), others = []) {
  const { totals, verdict } = summarize(report.checks);
  const themes = [report.theme, ...others.map((o) => o.theme)].filter(Boolean);
  const lines = [
    `# Test team: ${report.label}`,
    '',
    `Run ${report.startedAt} to ${finishedAt}, by made-up people Pat Example (owner) and Sam Example (teammate).`,
    '',
    `**Verdict: ${verdict}.** ${totals.pass} passed, ${totals.fail} failed, ${totals.bug} bugs, ${totals.gap} security gaps, ${totals.note} notes, ${totals.skip} skipped.${report.theme ? ` (${report.theme} theme)` : ''}`,
    ...others.map((o) => ['', otherThemeLine(o)]).flat(),
  ];
  for (const part of Object.keys(PART_TITLE)) {
    const rows = report.checks.filter((c) => c.part === part);
    if (!rows.length) continue;
    lines.push('', `## ${PART_TITLE[part]}`, '', '| Step | Result | What happened | Pictures |', '| --- | --- | --- | --- |');
    for (const c of rows) {
      lines.push(`| ${cell(c.step)} | ${MARK[c.status]} | ${cell(c.detail)} | ${c.shots.map((s) => pictureLinks(s, themes)).join('<br>')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export function writeReport(report, outDir, others = []) {
  const finishedAt = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.md'), renderMarkdown(report, finishedAt, others));
  const { totals, verdict } = summarize(report.checks);
  const otherThemes = others.map((o) => ({ theme: o.theme, ...summarize(o.checks), checks: o.checks }));
  const json = { module: report.module, theme: report.theme, startedAt: report.startedAt, finishedAt, verdict, totals, checks: report.checks, otherThemes };
  fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(json, null, 2)}\n`);
  return { totals, verdict };
}
