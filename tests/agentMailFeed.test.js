import { describeMailEvent } from '../src/lib/agentMailFeed.js';

describe('agent mail toast copy', () => {
  test('fresh sends read as message complete', () => {
    expect(describeMailEvent({
      from_name: 'Atlas', to_name: 'Censai', thread_id: null, content: 'Please review the plan.',
    })).toEqual({
      isReply: false,
      ack: false,
      title: 'Atlas → Censai · message complete',
      sub: '“Please review the plan.”',
    });
  });

  test('thread replies read as reply complete', () => {
    const described = describeMailEvent({
      from_name: 'Censai', to_name: 'Atlas', thread_id: 'thread-1',
      content: 'Reviewed — two blockers inside.',
    });
    expect(described.title).toBe('Censai → Atlas · reply complete');
    expect(described.isReply).toBe(true);
    expect(described.ack).toBe(false);
  });

  test('bare acks are flagged as stored quietly', () => {
    const described = describeMailEvent({
      from_name: 'Atlas', to_name: 'Censai', thread_id: 'thread-1', content: 'done, thanks!',
    });
    expect(described.title).toContain('reply complete');
    expect(described.ack).toBe(true);
    expect(described.sub).toContain('no wake');
  });

  test('falls back to ids when names are missing', () => {
    expect(describeMailEvent({
      from_agent: 'atlas', to_agent: null, content: 'hello all',
    }).title).toBe('atlas → everyone · message complete');
  });
});
