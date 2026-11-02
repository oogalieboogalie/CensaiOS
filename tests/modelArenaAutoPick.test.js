// Automatic best in the model arena: completeness, then speed. Looks do not count.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArenaCompare } from '../src/components/windows/modelArena/ArenaCompare.jsx';
import {
  applyAutoPick, autoPickArena, autoPickStands, AUTO_REASON_LIMIT, cleanAutoMark, namedThings,
} from '../src/lib/modelArena/autoPick.js';
import { cleanMarks, makeRecord } from '../src/lib/modelArena/benchmarks.js';

const LOGIN = 'can you make me a form that says Username: and Password please';
const lanes = [
  { provider: 'google', model: 'gemini-3.8-flash' },
  { provider: 'anthropic', model: 'claude-haiku-5-5' },
];
const reply = (text, firstTokenMs, totalMs, extra = {}) => ({
  status: 'done', text, firstTokenMs, totalMs, usage: { input: 20, output: 30 }, ...extra,
});
const BOTH = 'username and PASSWORD fields';
const PRETTY = 'A titled page with a background and a blue button. Username and Password.';

test('the login-form race picks the faster complete answer', () => {
  expect(namedThings(LOGIN)).toEqual(['Username', 'Password']);
  const pick = autoPickArena({
    prompt: LOGIN,
    lanes,
    results: [reply(PRETTY, 5900, 9600, { usage: { input: 20, output: 80 } }), reply(BOTH, 673, 1500)],
  });
  expect(pick.best).toBe(1);
  expect(pick.reason).toBe('Picked automatically: it includes Username and Password, and it finished first. Looks are not part of this.');
});

test('a fast answer that omits Password loses to a slower complete one', () => {
  const pick = autoPickArena({
    prompt: LOGIN,
    lanes,
    results: [reply(PRETTY, 5900, 9600), reply('username only, and a submit button', 673, 1500)],
  });
  expect(pick.best).toBe(0);
  expect(pick.reason).toBe('Picked automatically: it includes Username and Password, and no other finished answer did. Looks are not part of this.');
});

test('a cut-off answer never wins, even when it is faster and complete', () => {
  for (const finishReason of ['length', 'max_tokens', 'MAX_TOKENS']) {
    const pick = autoPickArena({
      prompt: LOGIN,
      lanes,
      results: [reply(PRETTY, 5900, 9600), reply(BOTH, 50, 80, { finishReason })],
    });
    expect(pick.best).toBe(0);
  }
  expect(autoPickArena({
    prompt: LOGIN,
    lanes,
    results: [reply('   ', 10, 20), reply(BOTH, 50, 80, { finishReason: 'length' }), { status: 'error', text: BOTH, totalMs: 5 }],
  }).best).toBeNull();
  expect(autoPickArena({
    prompt: LOGIN,
    lanes,
    results: [{ status: 'streaming', text: BOTH, firstTokenMs: 10, totalMs: 10 }],
  })).toEqual({ best: null, reason: 'Nothing finished, so nothing was picked.' });
});

test('named things are quotes, colon words and labels, not filler or a leading verb', () => {
  expect(namedThings('Please make a form')).toEqual([]);
  expect(namedThings('Build a form with Username and Password')).toEqual(['Username', 'Password']);
  expect(namedThings('Username and Password')).toEqual(['Username', 'Password']);
  expect(namedThings('add a "reset link" and a Password field')).toEqual(['reset link', 'Password']);
  expect(namedThings('the box says email: and Name')).toEqual(['email', 'Name']);
  expect(namedThings('see https://example.com and Username')).toEqual(['Username']);
});

test('with nothing concrete to check, the fastest finish wins, then the tie breaks', () => {
  const prompt = 'race the models please';
  expect(namedThings(prompt)).toEqual([]);
  expect(autoPickArena({
    prompt,
    lanes,
    results: [reply('one', 100, 800), reply('two', 400, 300)],
  }).best).toBe(1);

  const tied = [reply(BOTH, 200, 1000), reply(BOTH, 50, 1000)];
  expect(autoPickArena({ prompt: LOGIN, lanes, results: tied }).reason).toMatch(/answered first/);
  expect(autoPickArena({ prompt: LOGIN, lanes, results: tied }).best).toBe(1);

  const sameTime = [reply(BOTH, 50, 1000), reply(BOTH, 50, 1000)];
  expect(autoPickArena({ prompt: LOGIN, lanes, results: sameTime }).best).toBe(1);
  expect(autoPickArena({ prompt: LOGIN, lanes, results: sameTime }).reason).toMatch(/costs less/);

  const local = [{ provider: 'ollama', model: 'a' }, { provider: 'ollama', model: 'b' }];
  expect(autoPickArena({ prompt: LOGIN, lanes: local, results: sameTime }).best).toBe(0);
  expect(autoPickArena({ prompt: LOGIN, lanes: local, results: sameTime }).reason).toMatch(/earlier one/);
});

test('the answer that covers the most named things wins, then speed', () => {
  const prompt = 'Username, Password and Email';
  expect(namedThings(prompt)).toEqual(['Username', 'Password', 'Email']);
  const pick = autoPickArena({
    prompt,
    lanes,
    results: [reply('username and password', 10, 5000), reply('username only', 10, 100)],
  });
  expect(pick.best).toBe(0);
  expect(pick.reason).toMatch(/includes Username and Password, the most of what was asked/);
});

test('equal coverage falls through to speed, and a stored pick is not replaced', () => {
  const pick = autoPickArena({
    prompt: LOGIN,
    lanes,
    results: [reply('username only', 10, 100), reply('password only', 10, 5000)],
  });
  expect(pick.best).toBe(0);

  const marks = { best: null, lanes: {}, judge: null };
  const stamped = applyAutoPick(marks, { best: 1, reason: 'because' });
  expect(stamped).toMatchObject({ best: 1, auto: { best: 1, reason: 'because' } });
  expect(applyAutoPick({ ...marks, best: 0 }, { best: 1, reason: 'no' })).toBeNull();
  expect(applyAutoPick(stamped, { best: 0, reason: 'again' })).toBeNull();
  expect(autoPickStands(stamped)).toBe(true);
  expect(autoPickStands(stamped, 1)).toBe(true);
  expect(autoPickStands(stamped, 0)).toBe(false);
  expect(autoPickStands({ ...stamped, best: 0 })).toBe(false);
  expect(autoPickStands({ ...stamped, auto: { ...stamped.auto, overridden: true } })).toBe(false);
});

test('clean marks keep a short auto reason and still load old records', () => {
  expect(cleanMarks(null, 2)).toEqual({ best: null, lanes: {}, judge: null });
  const reason = 'Picked automatically: it includes Username and Password, and it finished first. Looks are not part of this.';
  expect(cleanMarks({ best: 1, lanes: { 1: 'right' }, auto: { best: 1, reason } }, 2).auto).toEqual({ best: 1, reason });
  expect(cleanMarks({ auto: { best: 0, reason: 'x'.repeat(500) } }, 1).auto.reason).toHaveLength(AUTO_REASON_LIMIT);
  expect(cleanAutoMark({ best: 9, reason: 'Kept.', overridden: true }, 2)).toEqual({ best: null, reason: 'Kept.', overridden: true });
  expect(cleanAutoMark('nope', 2)).toBeNull();

  const record = makeRecord({
    prompt: LOGIN, system: '', lanes, results: [reply(PRETTY, 5900, 9600), reply(BOTH, 673, 1500)],
    marks: { best: 1, lanes: {}, auto: { best: 1, reason } },
  });
  expect(record.marks.auto).toEqual({ best: 1, reason });
  expect(makeRecord({
    prompt: 'hi', system: '', lanes: [lanes[0]], results: [reply('a', 1, 2)], marks: { best: 0 },
  }).marks.auto).toBeUndefined();
});

test('the compare card is one row per measure, with the number beside the line', () => {
  const html = renderToStaticMarkup(createElement(ArenaCompare, {
    lanes,
    results: [
      reply('a', 100, 400, { usage: { input: 1000, output: 10 } }),
      { status: 'done', text: 'b', firstTokenMs: 400, totalMs: 800 },
      { status: 'error', text: 'nope' },
    ],
    labelOf: (lane) => lane.model,
  }));
  expect(html).toContain('How they compare');
  expect(html).toContain('First word');
  expect(html).toContain('lower is better');
  expect(html).toContain('higher is better');
  expect(html).toContain('100 ms');
  expect(html).toContain('400 ms');
  expect(html).toContain('gemini-3.8-flash');
  expect(html).not.toContain('nope');
  const first = html.split('data-measure="first"')[1].split('data-measure')[0];
  expect(first).toContain('data-lane="0" style="width:25%"');
  expect(first).toContain('data-lane="1" style="width:100%"');
  const cost = html.split('data-measure="cost"')[1];
  expect(cost).toContain('no price on file');
  expect(cost).not.toContain('data-lane="1"');
  expect(renderToStaticMarkup(createElement(ArenaCompare, { lanes, results: [{ status: 'error' }] }))).toBe('');
});
