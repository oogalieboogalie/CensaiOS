import { describeToolEvent, diffStats, basename, formatMs } from '../src/components/chat/toolActivity.js';

describe('describeToolEvent', () => {
  test('formats a file edit with diff stats, like "Editing Tree.jsx +10 −56"', () => {
    const d = describeToolEvent({
      tool: 'project_edit',
      summary: { path: 'src/components/files/Tree.jsx', added: 10, removed: 56 },
    });
    expect(d.label).toBe('Editing Tree.jsx');
    expect(d.stats).toEqual({ added: 10, removed: 56, label: '+10 −56' });
    expect(d.icon).toBe('Tools');
  });

  test('past tense for completed rows', () => {
    const d = describeToolEvent(
      { tool: 'project_write', summary: { path: 'docs/notes.md', added: 12 }, ms: 340 },
      { past: true },
    );
    expect(d.label).toBe('Wrote notes.md');
    expect(d.stats).toEqual({ added: 12, removed: 0, label: '+12' });
    expect(d.ms).toBe(340);
  });

  test('multi-file edits mention the extra files', () => {
    const d = describeToolEvent({
      tool: 'project_multi_edit',
      summary: { path: 'a.js', files: 3, added: 6, removed: 2 },
    });
    expect(d.label).toBe('Editing a.js (+2 more)');
  });

  test('falls back to args paths when no summary is present', () => {
    const d = describeToolEvent({ tool: 'local_read_file', args: { file_path: 'C:/Homebase/server.js' } });
    expect(d.label).toBe('Reading server.js');
  });

  test('search-style tools quote their target', () => {
    const d = describeToolEvent({ tool: 'web_search', summary: { target: 'postgres healthcheck' } });
    expect(d.label).toBe('Searching the web “postgres healthcheck”');
  });

  test('unknown tools fall back to a generic verb', () => {
    expect(describeToolEvent({ tool: 'mystery_tool' }).label).toBe('Running mystery_tool');
    expect(describeToolEvent({ tool: 'mystery_tool' }, { past: true }).label).toBe('Ran mystery_tool');
  });

  test('threads the harness ok flag; only explicit false is a failure', () => {
    expect(describeToolEvent({ tool: 'web_search', ok: false }).ok).toBe(false);
    expect(describeToolEvent({ tool: 'web_search', ok: true }).ok).toBe(true);
    // calling_tool events and older servers omit ok entirely.
    expect(describeToolEvent({ tool: 'web_search' }).ok).toBe(true);
  });
});

describe('helpers', () => {
  test('diffStats handles missing and zero values', () => {
    expect(diffStats(null)).toBeNull();
    expect(diffStats({ path: 'x' })).toBeNull();
    expect(diffStats({ added: 0, removed: 0 })).toBeNull();
    expect(diffStats({ added: 3 })).toEqual({ added: 3, removed: 0, label: '+3' });
  });

  test('basename handles windows and posix paths', () => {
    expect(basename('src/components/Tree.jsx')).toBe('Tree.jsx');
    expect(basename('C:\\Homebase\\CensaiHub\\server.js')).toBe('server.js');
    expect(basename('plain.txt')).toBe('plain.txt');
  });

  test('formatMs renders ms and seconds', () => {
    expect(formatMs(340)).toBe('340ms');
    expect(formatMs(2160)).toBe('2.2s');
    expect(formatMs(undefined)).toBe('');
  });
});
