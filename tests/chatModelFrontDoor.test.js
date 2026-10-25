// Parts of the server outside the web-address layer reach Chat's model code
// only through server/chatModel/, never by importing server/routes/chat/
// directly, so a change inside Chat can't quietly change them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = ['server/routes/', 'server/boot/', 'server/chatModel/'];
const IMPORT_OF_CHAT = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]*routes\/chat\/[^'"]*)['"]/g;

function listCode(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listCode(rel));
    else if (/\.(m?js|jsx)$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Files (outside the allowed folders) that import server/routes/chat/ directly. */
function findChatBypasses(files, read) {
  const found = [];
  for (const file of files) {
    if (ALLOWED.some((prefix) => file.startsWith(prefix))) continue;
    for (const match of read(file).matchAll(IMPORT_OF_CHAT)) found.push(`${file} -> ${match[1]}`);
  }
  return found;
}

describe('chat model front door', () => {
  test('nothing outside server/routes/ and server/boot/ imports server/routes/chat/', () => {
    const files = ['server', 'src', 'scripts'].flatMap(listCode);
    const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(findChatBypasses(files, read)).toEqual([]);
  });

  test('a made-up file that imports Chat directly is caught', () => {
    // Built from pieces so the tracked-imports check does not read these
    // made-up sources as real imports.
    const from = (spec) => ` from '${spec}';\n`;
    const fake = {
      'server/madeUp/helper.js': 'import { prepareChatContext }' + from('../routes/chat/chatContext.js'),
      'server/madeUp/lazy.js': 'const m = await import(' + `'../routes/chat/shared.js'` + ');\n',
      'server/madeUp/fine.js': 'import { prepareChatContext }' + from('../chatModel/context.js'),
      'server/madeUp/note.js': "// see server/routes/chat/main.js\nconst hint = 'server/routes/chat/main.js';\n",
      'server/routes/other.js': 'import { handleChat }' + from('./chat/main.js') + 'import x' + from('../routes/chat/shared.js'),
    };
    expect(findChatBypasses(Object.keys(fake), (file) => fake[file])).toEqual([
      'server/madeUp/helper.js -> ../routes/chat/chatContext.js',
      'server/madeUp/lazy.js -> ../routes/chat/shared.js',
    ]);
  });

  test('every front-door file points at exactly one Chat file', () => {
    const dir = path.join(ROOT, 'server/chatModel');
    for (const name of fs.readdirSync(dir)) {
      const sources = [...fs.readFileSync(path.join(dir, name), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatch(/^\.\.\/routes\/chat\/[\w]+\.js$/);
    }
  });
});
