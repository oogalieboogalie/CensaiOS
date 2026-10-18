import { queryWords, relatedWords, stem } from '../src/lib/tools/toolMeaning.js';
import { filterToolGroups } from '../src/lib/tools/toolSearch.js';

describe('tool meaning words', () => {
  test('drops filler words and trims endings', () => {
    expect(queryWords('Send a message to the team')).toEqual(['send', 'message', 'team']);
    expect(stem('messages')).toBe('message');
    expect(stem('restarting')).toBe('restart');
    expect(stem('sent')).toBe('send');
  });

  test('knows which words mean the same job', () => {
    expect(relatedWords('send')).toEqual(expect.arrayContaining(['mail', 'slack', 'message']));
    expect(relatedWords('reboot')).toContain('restart');
    expect(relatedWords('zebra')).toEqual([]);
  });

  test('a tool picker keeps kits, best match first, and lists the meanings', () => {
    const groups = [
      { id: 'a', tools: [{ name: 'restart_service', description: 'Restart a service' }] },
      { id: 'b', tools: [{ name: 'local_read_file', description: 'Read a file' }] },
    ];
    const { groups: kept, meanings } = filterToolGroups(groups, 'reboot');
    expect(kept.map(g => g.id)).toEqual(['a']);
    expect(meanings).toEqual(['reboot → restart']);
    expect(filterToolGroups(groups, '  ').groups).toBe(groups);
  });
});
