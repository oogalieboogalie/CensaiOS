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

describe('tool search by meaning (diagram 10)', () => {
  test('"send a message" finds mail and agent-message tools and says why', () => {
    const { tools } = listToolCatalog();
    const results = searchToolCatalog(tools, 'send a message', { limit: 10 });
    const names = results.map(tool => tool.name);
    expect(names).toContain('message_to');
    expect(names.some(name => name.startsWith('mailcow_'))).toBe(true);
    const mail = results.find(tool => tool.name.startsWith('mailcow_'));
    expect(mail.why).toEqual(expect.arrayContaining(['send → mail']));
  });

  test('"reboot" finds restart_service through its meaning', () => {
    const { tools } = listToolCatalog();
    const [first] = searchToolCatalog(tools, 'reboot the server', { limit: 3 });
    expect(first.name).toBe('restart_service');
    expect(first.why).toEqual(['reboot → restart']);
  });

  test('exact words still beat same-meaning words', () => {
    const { tools } = listToolCatalog();
    const [first] = searchToolCatalog(tools, 'write a local file', { limit: 3 });
    expect(first.name).toBe('local_write_file');
    expect(first.why).toBeUndefined();
  });
});
