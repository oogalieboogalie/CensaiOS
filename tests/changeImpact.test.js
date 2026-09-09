import {
  analyzeChangeImpact,
  formatChangeImpactForPrompt,
} from '../server/semantic/changeImpact.js';

describe('semantic change-impact middleware', () => {
  test('maps a tool request to all required tool surfaces', () => {
    const impact = analyzeChangeImpact('Add a write tool to the coding toolkit');
    const tool = impact.breadcrumbs.find(item => item.domain === 'agent-tool');

    expect(tool.surfaces).toEqual(expect.arrayContaining([
      'server/tools/definitions/',
      'server/tools/handlers/',
      'server/tools/handlers/index.js',
      'server/tools/catalog.js',
      'server/tools/rbac/',
      'tests/integrity.test.js',
    ]));
  });

  test('combines overlapping domains and raises protected work risk', () => {
    const impact = analyzeChangeImpact('Update the chat middleware to persist context in Postgres');

    expect(impact.breadcrumbs.map(item => item.domain)).toEqual(expect.arrayContaining([
      'chat-runtime',
      'database',
    ]));
    expect(impact.risk).toBe('high');
  });

  test('preserves explicit file paths as anchors', () => {
    const impact = analyzeChangeImpact('Change src/lib/api.js for the new API response');
    expect(impact.anchors).toContain('src/lib/api.js');
    expect(impact.breadcrumbs[0].surfaces).toContain('src/lib/api.js');
  });

  test('does not interfere with ordinary conversation', () => {
    expect(analyzeChangeImpact('How are you doing today?')).toBeNull();
  });

  test('leaves generic relationship breadcrumbs for vague change requests', () => {
    const impact = analyzeChangeImpact('Can you add this to this thing?');
    const coordination = impact.breadcrumbs.find(item => item.domain === 'change-coordination');

    expect(coordination.surfaces).toContain('imports, exports, callers, and downstream consumers');
    expect(coordination.surfaces).toContain('registries, manifests, permissions, and configuration');
  });

  test('formats an actionable prompt receipt', () => {
    const prompt = formatChangeImpactForPrompt(analyzeChangeImpact('Implement a new canvas window'));
    expect(prompt).toContain('Semantic Change-Impact Breadcrumbs');
    expect(prompt).toContain('src/lib/manifest/');
    expect(prompt).toContain('followed, rejected, or discovered');
  });
});
