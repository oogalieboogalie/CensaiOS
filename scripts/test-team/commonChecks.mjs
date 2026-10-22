// Checks every module run ends with, whatever the module was.

import fs from 'node:fs';
import path from 'node:path';

function allLogText(logDir) {
  return fs.readdirSync(logDir, { recursive: true })
    .map((name) => path.join(logDir, String(name)))
    .filter((file) => fs.statSync(file).isFile())
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

export async function commonChecks(t) {
  await t.check('walk', 'neither browser crashed while using it', () => {
    const crashes = [...t.pat.errors.map((e) => `Pat: ${e}`), ...t.sam.errors.map((e) => `Sam: ${e}`)];
    if (crashes.length) throw new Error(`${crashes.length} page errors, first: ${crashes[0]}`);
    return 'no page errors in Pat\'s or Sam\'s browser';
  });
  await t.check('redteam', 'what the testers typed never lands in the app log', () => {
    const text = allLogText(t.logDir);
    const leaked = t.typed.filter((words) => words && text.includes(words));
    if (leaked.length) throw new Error(`${leaked.length} typed phrase(s) found in the log, e.g. "${leaked[0].slice(0, 40)}"`);
    return `${t.typed.length} typed phrases checked against the server and app logs`;
  });
}
