// Spec 5b's "benchmark before listing", for modules. An agent is graded on
// real tasks; a module is a sandboxed page, so its suite is a fixed set of
// checks that a buyer's copy will actually work on their board: it is
// described, fits, matches their theme, needs nothing from outside the
// sandbox, and asks for every permission it uses. Same pass bar as agents
// (80%), and the required checks must all pass.

import { MAX_MODULE_SOURCE_BYTES, normalizeManifest, sourceBytes } from '../../src/lib/modules/moduleFormat.js';

export const MODULE_SUITE = Object.freeze({ id: 'module-basics', version: 2, passBar: 0.8 });

// Spec 5b, step 1: uses refused automatically, whatever the score.
const PROHIBITED = [
  { use: 'surveillance', pattern: /\b(spy(ing|ware)?|stalk(er|ing)?|track (someone|a person|my (wife|husband|partner|girlfriend|boyfriend|ex))|keylog(ger|ging)?|covert(ly)? (record|monitor))\b/i },
  { use: 'disinformation', pattern: /\b(disinformation|fake news|deepfakes?|astroturf(ing)?)\b/i },
  { use: 'political manipulation', pattern: /\b(voter suppression|election (manipulation|interference)|political (manipulation|propaganda))\b/i },
  { use: 'financial fraud', pattern: /\b(phishing|carding|money launder(ing)?|ponzi|pump and dump|fake (invoice|receipt)s?|credit card generator)\b/i },
  { use: 'weapons', pattern: /\b(build (a )?(bomb|gun|weapon)|explosives?|ghost gun|bioweapons?|nerve agent)\b/i },
  { use: 'getting around AI safety', pattern: /\b(jailbreak(s|ing)?|bypass (the )?(ai )?(safety|guardrails|filters?)|prompt injection kit)\b/i },
];

/** The prohibited use a listing's words describe, or null. */
export function prohibitedUse(...texts) {
  const text = texts.filter(Boolean).join(' \n ');
  return PROHIBITED.find(p => p.pattern.test(text))?.use || null;
}

const NETWORK_USE = /\b(fetch\s*\(|XMLHttpRequest|new\s+WebSocket|new\s+EventSource|navigator\.sendBeacon)/;
const AGENT_USE = /censai\s*\.\s*agent\s*\.\s*ask\s*\(/;
const STORAGE_WRITE = /censai\s*\.\s*storage\s*\.\s*(set|remove)\s*\(/;
const ESCAPES = /\b(top|parent)\s*\.\s*(location|document)|window\s*\.\s*open\s*\(|document\s*\.\s*cookie/;
const BROWSER_STORAGE = /\b(localStorage|sessionStorage|indexedDB)\b/;
const HARD_COLORS = /#[0-9a-f]{3,8}\b|rgba?\s*\(/gi;

function check(id, label, passed, { required = false, detail = '' } = {}) {
  return { id, label, passed: Boolean(passed), required, ...(detail && !passed ? { detail } : {}) };
}

/** Run the suite. `now` is injectable for tests. */
export function runModuleChecks({ manifest, source, request = '' }, { now = new Date() } = {}) {
  const body = String(source || '');
  const clean = normalizeManifest(manifest, { request });
  const declared = new Set(clean.permissions);
  const tokenUses = (body.match(/var\(--[\w-]+/g) || []).length;
  const hardColors = (body.match(HARD_COLORS) || []).length;

  const results = [
    check('has-code', 'Has a module to run', body.trim().length > 0, { required: true, detail: 'There is no code.' }),
    check('size', 'Fits the 200 KB module limit', sourceBytes(body) <= MAX_MODULE_SOURCE_BYTES, { required: true, detail: 'Too large for a module.' }),
    check('described', 'Says what it does in one line', clean.description.length >= 12, { detail: 'Add a one-line description.' }),
    check('self-contained', 'Needs no outside scripts or stylesheets',
      !/<script[^>]+\bsrc\s*=/i.test(body) && !/<link[^>]+stylesheet/i.test(body) && !/^\s*import\s.+from\s/m.test(body),
      { required: true, detail: 'Outside code is blocked in the sandbox, so the buyer would get a broken copy.' }),
    check('stays-in-sandbox', 'Stays inside its window',
      !ESCAPES.test(body), { required: true, detail: 'It reaches for the page around it (top/parent, window.open or cookies).' }),
    check('network-declared', 'Asks before it uses the internet',
      !NETWORK_USE.test(body) || declared.has('network'), { required: true, detail: 'It calls the network without the "network" permission.' }),
    check('agent-declared', 'Asks before it calls an agent',
      !AGENT_USE.test(body) || declared.has('agent'), { required: true, detail: 'It calls censai.agent.ask without the "agent" permission.' }),
    check('storage-declared', 'Asks before it saves data',
      !STORAGE_WRITE.test(body) || declared.has('storage'), { required: true, detail: 'It saves data without the "storage" permission (manifest v3).' }),
    check('tools-handled', 'Answers every tool it offers agents',
      clean.tools.every(t => new RegExp(`censai\\s*\\.\\s*tools\\s*\\.\\s*handle\\(\\s*['"]${t.name}['"]`).test(body)),
      { detail: 'A tool in the manifest has no censai.tools.handle in the code.' }),
    check('board-storage', 'Keeps its data on the board',
      !BROWSER_STORAGE.test(body), { detail: 'Browser storage is not shared and fails in the sandbox; use censai.storage.' }),
    check('theme', 'Follows the board theme',
      hardColors <= tokenUses, { detail: 'Use the theme tokens (var(--ink), var(--accent)…) instead of fixed colors.' }),
  ];

  const score = results.filter(r => r.passed).length;
  const total = results.length;
  const requiredOk = results.every(r => !r.required || r.passed);
  return {
    suite: MODULE_SUITE.id,
    version: MODULE_SUITE.version,
    passBar: MODULE_SUITE.passBar,
    results,
    score,
    total,
    passed: requiredOk && score / total >= MODULE_SUITE.passBar,
    ranAt: now.toISOString(),
  };
}
