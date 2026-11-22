// Settings keeps to the house look: amber is the only accent, and a failure
// shows in the window, never in a browser pop-up. The Friends files are left
// out here: they belong to the Friends work.
import fs from 'node:fs';
import path from 'node:path';

test('Settings uses no colour besides amber and never pops a browser alert', () => {
  const dir = path.resolve('src/components/theme');
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.jsx?$/.test(f) && !/friends/i.test(f));
  expect(files.length).toBeGreaterThan(20);
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    expect({ file, colour: /--ps-(green|blue|purple|pink)/.test(text) }).toEqual({ file, colour: false });
    expect({ file, alert: /\balert\(/.test(text) }).toEqual({ file, alert: false });
  }
});
