import { TOOLKITS, toolkitById, toolkitTools, applyToolkit, isBroadLocalScope } from '../src/components/windows/agentDesigner/toolkits.js';

describe('agent designer preset toolkits (idea 2026-08-08)', () => {
  test('ships the core toolkit set with non-empty tool lists', () => {
    const ids = TOOLKITS.map(toolkit => toolkit.id);
    for (const expected of ['default', 'web-researcher', 'code-assistant', 'data-analyst']) {
      expect(ids).toContain(expected);
    }
    for (const toolkit of TOOLKITS) {
      expect(toolkit.tools.length).toBeGreaterThan(0);
      expect(new Set(toolkit.tools).size).toBe(toolkit.tools.length);
    }
  });

  test('applying a toolkit populates the tool list', () => {
    expect(applyToolkit([], 'web-researcher')).toEqual(toolkitTools('web-researcher'));
    expect(applyToolkit(['remember'], 'code-assistant')).toContain('project_write');
    expect(toolkitById('nope')).toBeNull();
    expect(toolkitTools('nope')).toEqual([]);
  });

  test('broad local scopes are flagged for an explicit warning', () => {
    expect(isBroadLocalScope('C:\\*')).toBe(true);
    expect(isBroadLocalScope('C:\\')).toBe(true);
    expect(isBroadLocalScope('src/components, C:\\ProjectX\\*')).toBe(false);
    expect(isBroadLocalScope('')).toBe(false);
  });
});
