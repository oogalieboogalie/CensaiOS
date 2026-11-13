import { jest } from '@jest/globals';
import { redditListing } from '../server/redditClient.js';

describe('redditListing', () => {
  test('fetches a public subreddit JSON listing through the injectable fetch', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          children: [
            { data: { id: 'z1', title: 'Orbit', author: 'nasa', subreddit: 'spaceporn', score: 100, permalink: '/r/spaceporn/comments/z1/', over_18: false } },
          ],
        },
      }),
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    const out = await redditListing('spaceporn', 'hot', { fetchImpl, resolve });
    expect(out.posts).toHaveLength(1);
    expect(out.posts[0].title).toBe('Orbit');
    expect(out.url).toContain('/r/spaceporn/');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/r/spaceporn/hot.json');
  });

  test('rejects a bad subreddit name before calling the network', async () => {
    await expect(redditListing('!!', 'hot', { fetchImpl: jest.fn() })).rejects.toMatchObject({
      code: 'REDDIT_BAD_SUBREDDIT',
    });
  });

  test('a blocked unsigned response tells the person to use the desktop app', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => '<html>blocked by network security</html>',
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_BLOCKED',
      statusCode: 403,
      message: 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.',
    });
  });

  test('a page that is not a feed is the same clear block, not a parser error', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html>whoa there, pardner</html>',
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_BLOCKED',
      message: 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.',
    });
  });

  test('a private subreddit stays a refusal, not a server block', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ reason: 'private', error: 403 }),
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_REFUSED',
      message: 'Reddit refused that feed (private, banned or restricted).',
    });
  });

  test('a quarantined subreddit is a refusal, not a server block', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ reason: 'quarantined', error: 403 }),
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_REFUSED',
      statusCode: 403,
      message: 'Reddit refused that feed (private, banned or restricted).',
    });
  });

  test('a reason-less JSON 403 is a server block', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 403 }),
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_BLOCKED',
      statusCode: 403,
      message: 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.',
    });
  });

  test('a JSON 403 with a blank reason is a server block', async () => {
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    for (const reason of ['', '   ']) {
      const fetchImpl = jest.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ reason, error: 403 }),
      }));
      await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
        code: 'REDDIT_BLOCKED',
        statusCode: 403,
        message: 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.',
      });
    }
  });

  test('an HTML 401 is a server block', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => '<html>blocked</html>',
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_BLOCKED',
      statusCode: 401,
      message: 'Reddit blocked the public feed from this server. Open the desktop app to view Reddit.',
    });
  });

  test('a JSON 401 that names a private reason is a refusal', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ reason: 'private', error: 401 }),
    }));
    const resolve = async () => [{ address: '1.2.3.4', family: 4 }];
    await expect(redditListing('pics', 'hot', { fetchImpl, resolve })).rejects.toMatchObject({
      code: 'REDDIT_REFUSED',
      statusCode: 401,
      message: 'Reddit refused that feed (private, banned or restricted).',
    });
  });
});
