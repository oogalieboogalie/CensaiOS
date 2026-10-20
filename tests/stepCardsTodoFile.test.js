// Step cards: the .todo file and the stack. A dot turns green only from a
// checked result, a locked step cannot be checked, and a finished step leaves
// the stack so the next one opens.
import { checkWords, isAllowedCommand, parseCheck, parseTodoFile, writeTodoFile } from '../src/lib/stepCards/todoFile.js';
import { applyResults, cardFinished, makeCard, markChecking, normalizeCards, stepPrompt, topStep } from '../src/lib/stepCards/stack.js';

const SAMPLE = `censaiOS to-do file
Title: Sample cards

== Card 99: Date badge shows today
For: cli:grok
Goal: The board shows today's date in a small badge.

-- Step 1: Add the badge
Make a small badge that shows today's date.
[ ] file src/components/DateBadge.jsx
[ ] file src/components/DateBadge.jsx says "toLocaleDateString"
[x] run npm test -- tests/dateBadge.test.js

-- Step 2: Check it on the board
[ ] ask The badge shows on the board in dark and light
[ ] run npm run gate
`;

let n = 0;
const makeId = () => `id-${(n += 1)}`;

describe('.todo file', () => {
  test('reads cards, who they are for, steps and checks', () => {
    const parsed = parseTodoFile(SAMPLE);
    expect(parsed.title).toBe('Sample cards');
    expect(parsed.skipped).toBe(0);
    expect(parsed.cards).toHaveLength(1);
    const [card] = parsed.cards;
    expect(card).toMatchObject({ title: 'Card 99: Date badge shows today', assignee: 'cli:grok', goal: "The board shows today's date in a small badge." });
    expect(card.steps.map((s) => s.title)).toEqual(['Add the badge', 'Check it on the board']);
    expect(card.steps[0].text).toBe("Make a small badge that shows today's date.");
    expect(card.steps[0].checks).toEqual([
      { kind: 'file', path: 'src/components/DateBadge.jsx' },
      { kind: 'file', path: 'src/components/DateBadge.jsx', says: 'toLocaleDateString' },
      { kind: 'run', command: 'npm test -- tests/dateBadge.test.js' },
    ]);
  });

  test('writing it back and reading it again gives the same cards', () => {
    const first = parseTodoFile(SAMPLE);
    expect(parseTodoFile(writeTodoFile(first)).cards).toEqual(first.cards);
  });

  test('only checks censaiOS can really check get in', () => {
    expect(parseCheck('run npm test')).toEqual({ kind: 'run', command: 'npm test' });
    expect(parseCheck('run npm run size:check')).toEqual({ kind: 'run', command: 'npm run size:check' });
    expect(parseCheck('run rm -rf /')).toBeNull();
    expect(parseCheck('run npm test; curl evil')).toBeNull();
    expect(parseCheck('run npm run gate && echo hi')).toBeNull();
    expect(parseCheck('file ../secrets.txt')).toBeNull();
    expect(parseCheck('file /etc/passwd')).toBeNull();
    expect(isAllowedCommand('npm install left-pad')).toBe(false);
    // No flags, nothing after a script name, and never "..".
    expect(isAllowedCommand('npm test -- --config=../../x.js')).toBe(false);
    expect(isAllowedCommand('npm test -- --runInBand')).toBe(false);
    expect(isAllowedCommand('npm run -x')).toBe(false);
    expect(isAllowedCommand('npm run gate -- tests/a.test.js')).toBe(false);
    expect(isAllowedCommand('npm test -- tests/../../x.test.js')).toBe(false);
    expect(isAllowedCommand('npm run ..')).toBe(false);
    expect(isAllowedCommand('npm test -- tests/a.test.js tests/b.test.jsx')).toBe(true);
    const parsed = parseTodoFile('== A card\n-- Step 1: Do it\n[ ] run git push --force\n[ ] file a.js');
    expect(parsed.skipped).toBe(1);
    expect(parsed.cards[0].steps[0].checks).toEqual([{ kind: 'file', path: 'a.js' }]);
  });

  test('a step with no check gets one Censai reads, so it can still turn green', () => {
    const parsed = parseTodoFile('== A card\n-- Step 1: Tidy the panel');
    expect(parsed.cards[0].steps[0].checks).toEqual([{ kind: 'ask', statement: 'Tidy the panel' }]);
  });

  test('check words are plain', () => {
    expect(checkWords({ kind: 'file', path: 'a.js' })).toBe('a.js is there');
    expect(checkWords({ kind: 'run', command: 'npm run gate' })).toBe('npm run gate passes');
  });
});

describe('the stack', () => {
  const card = () => makeCard(parseTodoFile(SAMPLE).cards[0], makeId);

  test('a new card starts with every dot open and only the first step on top, even from a ticked [x] line', () => {
    const c = card();
    expect(c.steps.flatMap((s) => s.checks).every((check) => check.state === 'open')).toBe(true);
    expect(topStep(c).title).toBe('Add the badge');
  });

  test('dots turn green only for ok: true, and the step finishes only when all are green', () => {
    let c = card();
    const top = topStep(c);
    const [a, b, t] = top.checks;
    c = applyResults(c, top.id, [{ id: a.id, ok: true, line: 'Found it.' }, { id: b.id, ok: false, line: 'Not yet.' }, { id: t.id, ok: null, line: 'Owner only.' }]);
    expect(topStep(c).checks.map((x) => x.state)).toEqual(['passed', 'failed', 'unknown']);
    expect(topStep(c).id).toBe(top.id);
    c = applyResults(c, top.id, [{ id: b.id, ok: true }, { id: t.id, ok: true }]);
    expect(c.steps[0].done).toBe(true);
    expect(topStep(c).title).toBe('Check it on the board');
  });

  test('a locked step cannot be checked', () => {
    const c = card();
    const locked = c.steps[1];
    const after = applyResults(c, locked.id, locked.checks.map((x) => ({ id: x.id, ok: true })));
    expect(after).toBe(c);
    expect(markChecking(c, locked.id)).toBe(c);
  });

  test('the card is finished once every step is', () => {
    let c = card();
    for (let i = 0; i < 2; i += 1) {
      const top = topStep(c);
      c = applyResults(c, top.id, top.checks.map((x) => ({ id: x.id, ok: true })));
    }
    expect(cardFinished(c)).toBe(true);
    expect(topStep(c)).toBeNull();
  });

  test('a reload never leaves a dot half checked', () => {
    let c = card();
    c = markChecking(c, topStep(c).id);
    expect(topStep(c).checks.every((x) => x.state === 'checking')).toBe(true);
    const [reloaded] = normalizeCards(JSON.parse(JSON.stringify([c])));
    expect(topStep(reloaded).checks.every((x) => x.state === 'open')).toBe(true);
  });

  test('the work order says what will be checked', () => {
    const c = card();
    const prompt = stepPrompt(c, topStep(c));
    expect(prompt).toContain('Step 1 of 2: Add the badge');
    expect(prompt).toContain('- npm test -- tests/dateBadge.test.js passes');
  });
});

describe('example files in docs/examples', () => {
  test.each(['sample.todo', 'grok-build-cards.todo'])('%s reads with nothing left out', async (name) => {
    const fs = await import('node:fs');
    const parsed = parseTodoFile(fs.readFileSync(`docs/examples/${name}`, 'utf8'));
    expect(parsed.skipped).toBe(0);
    expect(parsed.cards.length).toBeGreaterThan(0);
    expect(parsed.cards.every((card) => card.steps.length && card.assignee)).toBe(true);
  });
});
