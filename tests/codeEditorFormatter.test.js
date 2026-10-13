import { describe, expect, test } from '@jest/globals';
import { formatDocument, formatSelectionFragment } from '../src/components/codeEditor/codeFormatter.js';
import { buildFixPrompt } from '../src/components/codeEditor/useCodeEditorActions.js';

describe('formatDocument', () => {
  test('formats messy HTML — the paste-back-to-VS-Code case', async () => {
    const res = await formatDocument('<div><p>hi</p><span>yo</span></div>', 'html');
    expect(res.ok).toBe(true);
    expect(res.code).toContain('\n');
    expect(res.code).toContain('<p>hi</p>');
  });
  test('formats javascript', async () => {
    const res = await formatDocument('const x=1;console.log(x)', 'javascript');
    expect(res.ok).toBe(true);
    expect(res.code).toMatch(/const x = 1;/);
  });
  test('formats json', async () => {
    const res = await formatDocument('{"a":1,"b":[1,2]}', 'json');
    expect(res.ok).toBe(true);
    expect(res.code).toContain('\n');
  });
  test('refuses unknown languages with a clear error', async () => {
    const res = await formatDocument('print("hi")', 'python');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/python/i);
  });
  test('refuses empty input', async () => {
    const res = await formatDocument('   ', 'html');
    expect(res.ok).toBe(false);
  });
  test('returns a short error for syntax errors', async () => {
    const res = await formatDocument('<div><p>unclosed', 'html');
    // HTML is forgiving — either outcome is fine, but the shape must hold.
    expect(typeof res.ok).toBe('boolean');
    if (!res.ok) expect(res.error.length).toBeLessThan(240);
  });
});

describe('formatSelectionFragment', () => {
  test('formats a fragment and strips the trailing newline for splicing', async () => {
    const res = await formatSelectionFragment('<div><p>hi</p></div>', 'html');
    expect(res.ok).toBe(true);
    expect(res.code.endsWith('\n')).toBe(false);
  });
});

describe('buildFixPrompt', () => {
  test('builds a fenced prompt with file context', () => {
    const prompt = buildFixPrompt({ fileLabel: 'index.html', language: 'html', selectionText: '<div>' });
    expect(prompt).toContain('index.html');
    expect(prompt).toContain('```html');
    expect(prompt).toContain('<div>');
  });
});
