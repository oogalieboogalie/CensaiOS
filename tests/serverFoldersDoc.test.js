// docs/server-folders.md has one line for every folder under server/, and no
// line for a folder that is gone, so the map a newcomer reads stays true.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('docs/server-folders.md lists exactly the folders under server/', () => {
  const folders = fs.readdirSync(path.join(ROOT, 'server'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const doc = fs.readFileSync(path.join(ROOT, 'docs/server-folders.md'), 'utf8');
  const listed = [...doc.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]).sort();
  expect(listed).toEqual(folders);
});
