import { listToolCatalog } from '../server/tools/catalog.js';
import { searchToolCatalog } from '../server/tools/toolSearch.js';

describe('tool discovery catalog', () => {
  test('adds type, kit, and tags to every tool', () => {
    const catalog = listToolCatalog();

    expect(catalog.kits.length).toBeGreaterThan(0);
    for (const tool of catalog.tools) {
      expect(tool.type).toBeTruthy();
      expect(tool.kit).toBeTruthy();
      expect(Array.isArray(tool.tags)).toBe(true);
      expect(tool.tags.length).toBeGreaterThan(0);
    }
  });

  test('finds file writing by intent and groups it into coding operations', () => {
    const { tools } = listToolCatalog();
    const results = searchToolCatalog(tools, 'write a local file', { limit: 5 });

    expect(results.map(tool => tool.name)).toContain('local_write_file');
    expect(results.find(tool => tool.name === 'local_write_file')).toMatchObject({
      type: 'fileOps',
      kit: 'Coding Operations',
    });
  });

  test('filters server maintenance tools by kit', () => {
    const { tools } = listToolCatalog();
    const results = searchToolCatalog(tools, 'container status', {
      kit: 'Server Maintenance',
      limit: 10,
    });

    expect(results.map(tool => tool.name)).toContain('container_status');
    expect(results.every(tool => tool.kit === 'Server Maintenance')).toBe(true);
  });
});
