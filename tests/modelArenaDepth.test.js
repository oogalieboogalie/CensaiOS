// The UI team marked Model arena's depth 6 of 10: its lanes sat flat on the
// window. The lanes now stand as raised cards on a sunken tray, with a light
// band behind the numbers. This keeps those layers from quietly going away.
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/model-arena.css'), 'utf8');
const rule = (selector) => {
  const line = css.split('\n').find((l) => l.startsWith(`${selector} {`));
  if (!line) throw new Error(`no rule for ${selector}`);
  return line;
};

describe('Model arena depth', () => {
  test('the lanes sit on a sunken tray', () => {
    expect(rule('.hb-arena-lanes')).toMatch(/background: var\(--layer-well\)/);
    expect(rule('.hb-arena-lanes')).toMatch(/box-shadow: var\(--well-shadow\)/);
  });

  test('each lane is a raised card', () => {
    expect(rule('.hb-arena-lane')).toMatch(/background: var\(--layer-panel\)/);
    expect(rule('.hb-arena-lane')).toMatch(/box-shadow: var\(--panel-shadow\)/);
  });

  test('the empty "add a model" slot stays flat and dashed', () => {
    expect(rule('.hb-arena-add')).toMatch(/border-style: dashed/);
    expect(rule('.hb-arena-add')).toMatch(/box-shadow: none/);
  });

  test('the numbers sit on a light band', () => {
    expect(rule('.hb-arena-stats')).toMatch(/background: var\(--layer-bar\)/);
  });
});
