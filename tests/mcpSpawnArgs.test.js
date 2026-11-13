import { quoteForWindowsShell, spawnParts } from '../server/tools/mcpSpawnArgs.js';

describe('MCP server start on Windows', () => {
  test('a path with a space or an apostrophe stays one argument', () => {
    expect(quoteForWindowsShell("D:\\Claude's Corridor\\server.js")).toBe("\"D:\\Claude's Corridor\\server.js\"");
    expect(quoteForWindowsShell('C:\\Users\\Sam Example\\server.js')).toBe('"C:\\Users\\Sam Example\\server.js"');
  });

  test('plain words and flags are left alone', () => {
    expect(quoteForWindowsShell('node')).toBe('node');
    expect(quoteForWindowsShell('--port=3000')).toBe('--port=3000');
    expect(quoteForWindowsShell('-y')).toBe('-y');
  });

  test('an already quoted part is not quoted twice, and empty stays an argument', () => {
    expect(quoteForWindowsShell('"C:\\a b\\c.js"')).toBe('"C:\\a b\\c.js"');
    expect(quoteForWindowsShell('')).toBe('""');
  });

  test('shell operators are quoted so they are not run', () => {
    expect(quoteForWindowsShell('a&b')).toBe('"a&b"');
  });

  test('only Windows changes anything', () => {
    expect(spawnParts('node', ['a b.js'], 'linux')).toEqual(['node', ['a b.js']]);
    expect(spawnParts('node', ['a b.js'], 'win32')).toEqual(['node', ['"a b.js"']]);
  });
});
