import { clipTurnContent } from '../server/memory/prompt.js';
import { clipProjectText } from '../server/workspaces/prewarm.js';

describe('prompt history clipping', () => {
  test('short turns pass through untouched', () => {
    expect(clipTurnContent('hello')).toBe('hello');
  });

  test('long turns cut at a word boundary with an ellipsis', () => {
    const content = `${'word '.repeat(60)}tail`;
    const clipped = clipTurnContent(content);
    expect(clipped.length).toBeLessThanOrEqual(201);
    expect(clipped.endsWith('…')).toBe(true);
    // The cut lands on a space in the original — no word is split.
    expect(content[clipped.length - 1]).toBe(' ');
  });

  test('space-free strings fall back to a hard cut', () => {
    const content = 'x'.repeat(300);
    expect(clipTurnContent(content)).toBe(`${'x'.repeat(200)}…`);
  });
});

describe('project context clipping', () => {
  test('short values pass through untouched', () => {
    expect(clipProjectText('  brief  ', 6000)).toBe('brief');
  });

  test('trees prune at entry level, never mid-filename', () => {
    const tree = ['root/', '├── alpha/', '├── beta-long-name-here/', '├── 2026-06-13T0835-long-entry-name', '└── omega/'].join('\n');
    const clipped = clipProjectText(tree, 70);
    expect(clipped.endsWith('\n[truncated]')).toBe(true);
    expect(clipped).not.toContain('2026-06-13T0835');
    expect(clipped).toContain('beta-long-name-here');
  });

  test('wall-of-text without newlines falls back to a hard cut', () => {
    const text = 'y'.repeat(7000);
    const clipped = clipProjectText(text, 6000);
    expect(clipped).toBe(`${'y'.repeat(6000)}\n[truncated]`);
  });
});
